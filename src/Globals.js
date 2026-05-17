import { NativeEventEmitter, NativeModules } from 'react-native';
const Sockets = NativeModules.TcpSockets;

let instanceNumber = 0;

function getNextId() {
    return instanceNumber++;
}

const nativeEventEmitter = new NativeEventEmitter(Sockets);

/**
 * VENHO fork — Phase 1 zero-copy inbound data path.
 *
 * Installs `global.__TcpDataBridge` (a JSI host object) once, via the
 * RNTcpDataBridge cxxTurboModule. Inbound socket bytes are pulled from
 * it as zero-copy ArrayBuffers (`read(id)`), and the "data available"
 * signal arrives through a single JSI callback (`setReadable`) hopped
 * onto the JS thread by the C++ CallInvoker — NOT the legacy
 * RCTDeviceEventEmitter. Milestone 1d proved ANY per-chunk legacy-bridge
 * crossing OOMs (invokeJavaMethod → folly::dynamic backlog), even a tiny
 * {id} payload — so both the bytes and the signal stay off that bridge.
 *
 * The Jest env mocks this whole module, so the native bits are absent
 * there; Socket.js degrades to a no-op drain and the regression suite is
 * unaffected.
 */
let _dataBridge;
let _dataBridgeTried = false;

// socket id -> () => void  (the per-Socket inbound drain handler)
const _readableHandlers = new Map();

// socket id -> () => void  (the per-Socket outbound write-drain handler;
// fired when the native write loop drained the C++ outbound queue below
// its low watermark — symmetric to the readable handler).
const _writeDrainHandlers = new Map();

// socket id -> (msgId:number, err:string) => void  (the per-Socket
// write-ACK handler; fired once per write by the native write loop.
// Replaces the legacy `written` RCTDeviceEventEmitter event — that
// per-write emit accumulated an unbounded folly::dynamic, Scenario-C
// OOM #2). err === '' means success.
const _writtenHandlers = new Map();

// "callback already installed" guards. These MUST live in module JS
// state, NOT as properties on the bridge: `bridge` is a JSI HostObject
// with a C++ default setter, and Hermes throws
// `TypeError: Cannot assign to property '<x>' on HostObject with
// default setter` for any arbitrary-property write on it. Stashing the
// guard flag on the host object (the original approach) threw inside
// getTcpDataBridge()'s try, was swallowed → _dataBridge=null → every
// libp2p noise write failed → dials abandoned → conns=0 (root cause,
// device-proven 2026-05-17). `__TcpDataBridge` is a process-global
// singleton, so module-level booleans are the exact equivalent of the
// per-bridge flags with no behavior change.
let _readableInstalled = false;
let _writeDrainableInstalled = false;
let _writtenInstalled = false;

function _ensureReadableInstalled(bridge) {
    if (_readableInstalled) return;
    _readableInstalled = true;
    // ONE JS callback for all sockets; C++ invokes it (via CallInvoker)
    // with the socket id whenever bytes were queued for that id.
    bridge.setReadable((id) => {
        const h = _readableHandlers.get(id);
        if (h) h();
    });
}

function _ensureWriteDrainableInstalled(bridge) {
    if (_writeDrainableInstalled) return;
    if (typeof bridge.setWriteDrainable !== 'function') return;
    _writeDrainableInstalled = true;
    // ONE JS callback for all sockets; C++ invokes it (via CallInvoker)
    // with the socket id when that socket's outbound queue drained below
    // the low watermark, so Socket.js can clear writableNeedDrain/emit
    // 'drain'.
    bridge.setWriteDrainable((id) => {
        const h = _writeDrainHandlers.get(id);
        if (h) h();
    });
}

function _ensureWrittenInstalled(bridge) {
    if (_writtenInstalled) return;
    if (typeof bridge.setWritten !== 'function') return;
    _writtenInstalled = true;
    // ONE JS callback for all sockets; C++ invokes it (via CallInvoker)
    // once per write with (id, msgId, err) — err === '' on success.
    bridge.setWritten((id, msgId, err) => {
        const h = _writtenHandlers.get(id);
        if (h) h(msgId, err);
    });
}

function getTcpDataBridge() {
    if (_dataBridgeTried) return _dataBridge || null;
    _dataBridgeTried = true;
    try {
        // Lazy require: the spec calls TurboModuleRegistry.getEnforcing,
        // which throws if the native module isn't present. Never let
        // that crash the JS app — degrade to a no-op (Jest / unexpected).
        const mod = require('./NativeTcpDataBridge').default;
        if (mod && typeof mod.install === 'function') {
            mod.install();
            const g = typeof global !== 'undefined' ? global : /* istanbul ignore next */ undefined;
            _dataBridge = g && g.__TcpDataBridge ? g.__TcpDataBridge : null;
            if (_dataBridge && typeof _dataBridge.setReadable === 'function') {
                _ensureReadableInstalled(_dataBridge);
            }
            if (_dataBridge && typeof _dataBridge.setWriteDrainable === 'function') {
                _ensureWriteDrainableInstalled(_dataBridge);
            }
            if (_dataBridge && typeof _dataBridge.setWritten === 'function') {
                _ensureWrittenInstalled(_dataBridge);
            }
        }
    } catch (e) {
        // A wiring failure here is fatal to the data path (every socket
        // write throws downstream). Do NOT silently swallow — surface it
        // loudly so it can never again masquerade as a mystery conns=0.
        // The Jest env mocks this whole module, so this path is device-only.
        _dataBridge = null;
        // eslint-disable-next-line no-console
        console.error(
            '[react-native-tcp-socket] TcpDataBridge install failed: ' +
                String(e && e.message ? e.message : e)
        );
    }
    return _dataBridge || null;
}

/** Register a socket's inbound drain handler (called on its id signal). */
function registerReadableHandler(id, handler) {
    _readableHandlers.set(id, handler);
}

function unregisterReadableHandler(id) {
    _readableHandlers.delete(id);
}

/** Register a socket's outbound write-drain handler (id signal). */
function registerWriteDrainHandler(id, handler) {
    _writeDrainHandlers.set(id, handler);
}

function unregisterWriteDrainHandler(id) {
    _writeDrainHandlers.delete(id);
}

/** Register a socket's per-write ACK handler: (msgId, err) => void. */
function registerWrittenHandler(id, handler) {
    _writtenHandlers.set(id, handler);
}

function unregisterWrittenHandler(id) {
    _writtenHandlers.delete(id);
}

export {
    nativeEventEmitter,
    getNextId,
    getTcpDataBridge,
    registerReadableHandler,
    unregisterReadableHandler,
    registerWriteDrainHandler,
    unregisterWriteDrainHandler,
    registerWrittenHandler,
    unregisterWrittenHandler,
};
