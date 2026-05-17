'use strict';

import { NativeModules } from 'react-native';
import EventEmitter from 'eventemitter3';
import { Buffer } from 'buffer';
import {
    nativeEventEmitter,
    getNextId,
    getTcpDataBridge,
    registerReadableHandler,
    unregisterReadableHandler,
    registerWriteDrainHandler,
    unregisterWriteDrainHandler,
    registerWrittenHandler,
    unregisterWrittenHandler,
} from './Globals';

/**
 * @typedef {"ascii" | "utf8" | "utf-8" | "utf16le" | "ucs2" | "ucs-2" | "base64" | "latin1" | "binary" | "hex"} BufferEncoding
 *
 * @typedef {import('react-native').NativeEventEmitter} NativeEventEmitter
 *
 * @typedef {{address: string, family: string, port: number}} AddressInfo
 *
 * @typedef {{localAddress: string, localPort: number, remoteAddress: string, remotePort: number, remoteFamily: string}} NativeConnectionInfo
 *
 * @typedef {{
 * port: number;
 * host?: string;
 * localAddress?: string,
 * localPort?: number,
 * interface?: 'wifi' | 'cellular' | 'ethernet',
 * reuseAddress?: boolean,
 * tls?: boolean,
 * tlsCheckValidity?: boolean,
 * tlsCert?: any,
 * connectTimeout?: number,
 * }} ConnectionOptions
 *
 * @typedef {object} ReadableEvents
 * @property {() => void} pause
 * @property {() => void} resume
 * @property {() => void} end
 *
 * @typedef {object} SocketEvents
 * @property {(had_error: boolean) => void} close
 * @property {() => void} connect
 * @property {(data: Buffer | string) => void} data
 * @property {() => void} drain
 * @property {(err: Error) => void} error
 * @property {() => void} timeout
 * @property {() => void} secureConnect
 *
 * @extends {EventEmitter<SocketEvents & ReadableEvents, any>}
 */
export default class Socket extends EventEmitter {
    /**
     * Creates a new socket object.
     */
    constructor() {
        super();
        /** @package */
        this._id = getNextId();
        /** @private */
        this._eventEmitter = nativeEventEmitter;
        /** @type {EventEmitter<'written', any>} @private */
        this._msgEvtEmitter = new EventEmitter();
        /** @type {number} @private */
        this._timeoutMsecs = 0;
        /** @type {number | undefined} @private */
        this._timeout = undefined;
        /** @private */
        this._encoding = undefined;
        /** @private */
        this._msgId = 0;
        /** @private */
        this._lastRcvMsgId = Number.MAX_SAFE_INTEGER - 1;
        /** @private */
        this._lastSentMsgId = 0;
        /** @private */
        this._paused = false;
        /** @private */
        this._resuming = false;
        /** @private */
        this._writeBufferSize = 0;
        /** @private */
        this._bytesRead = 0;
        /** @private */
        this._bytesWritten = 0;
        /** @private */
        this._connecting = false;
        /** @private */
        this._pending = true;
        /** @private */
        this._destroyed = false;
        // Set once the local write side has been finished via end()/FIN.
        // Drives destroySoon()'s "already flushed?" decision (Node parity).
        /** @private */
        this._writableEnded = false;
        // TODO: Add readOnly and writeOnly states
        /** @type {'opening' | 'open' | 'readOnly' | 'writeOnly'} @private */
        this._readyState = 'open'; // Incorrect, but matches NodeJS behavior
        // VENHO Phase 1: the old unbounded JS pause buffer is gone. Inbound
        // bytes live in the bounded native C++ queue; pausing just stops
        // draining it (real TCP backpressure via the native high watermark).
        this.readableHighWaterMark = 16384;
        this.writableHighWaterMark = 16384;
        this.writableNeedDrain = false;
        this.localAddress = undefined;
        this.localPort = undefined;
        this.remoteAddress = undefined;
        this.remotePort = undefined;
        this.remoteFamily = undefined;
        this.allowHalfOpen = false;
        this._registerEvents();
    }

    get readyState() {
        return this._readyState;
    }

    get destroyed() {
        return this._destroyed;
    }

    get pending() {
        return this._pending;
    }

    get connecting() {
        return this._connecting;
    }

    get bytesWritten() {
        return this._bytesWritten;
    }

    get bytesRead() {
        return this._bytesRead;
    }

    get timeout() {
        return this._timeout;
    }

    /**
     * @package
     * @param {number} id
     */
    _setId(id) {
        // VENHO Phase 1: the readable handler is keyed by socket id. Drop
        // the old id's registration BEFORE the id changes, else it leaks in
        // the Globals handler map (server-accepted sockets re-id here).
        this._unregisterEvents();
        this._id = id;
        this._registerEvents();
    }

    /**
     * @package
     * @param {NativeConnectionInfo} connectionInfo
     */
    _setConnected(connectionInfo) {
        this._connecting = false;
        this._readyState = 'open';
        this._pending = false;
        this._writableEnded = false;
        this.localAddress = connectionInfo.localAddress;
        this.localPort = connectionInfo.localPort;
        this.remoteAddress = connectionInfo.remoteAddress;
        this.remoteFamily = connectionInfo.remoteFamily;
        this.remotePort = connectionInfo.remotePort;
    }

    /**
     * @param {ConnectionOptions} options
     * @param {() => void} [callback]
     */
    connect(options, callback) {
        // VENHO Phase 1 — Scenario-C OOM ROOT-CAUSE FIX.
        //
        // The upstream code did `const customOptions = { ...options }` and
        // forwarded that whole object as the 4th arg of the
        // `TcpSockets.connect` (codegen) TurboModule. Callers like
        // `@libp2p/tcp` spread their ENTIRE dial-options object into the
        // `net.connect()` argument — including `signal` (an AbortSignal),
        // `upgrader` (which references the entire libp2p components/registry
        // graph), `onProgress`, etc. RN's `jsi::dynamicFromValue` then
        // recursively walks that deeply-nested, partially CYCLIC object
        // graph into nested `folly::dynamic`, exploding into millions of
        // unfreed `<dynamic,dynamic>` map nodes in seconds (the entire
        // Scenario-C Scudo OOM / recursive `folly::dynamic::destroy`
        // stack-overflow — proven by direct primitive-counter measurement:
        // no JS primitive fired, ~4M folly/5s from ONE connect() on a
        // blackhole dial). The native side (`TcpSocketClient.connect` /
        // `TcpSocketModule`) only ever reads a fixed set of SCALAR option
        // keys and a `tls`/`tlsOptions` map — it never touches `signal`,
        // `upgrader`, or any caller internals. So we cross ONLY those
        // allow-listed primitives; arbitrary caller objects never reach the
        // bridge. (Upstream-worthy hardening — part of the #209 fork PR.)
        const host = options?.host || 'localhost';
        const port = Number(options?.port) || 0;
        /** @type {Record<string, string|number|boolean|object>} */
        const customOptions = { host, port };
        // Exactly the keys the native connect path consumes (scalars +
        // the tls sub-config map). Copied individually with type coercion;
        // never a blanket spread of the caller's object.
        if (typeof options?.localAddress === 'string')
            customOptions.localAddress = options.localAddress;
        if (options?.localPort != null) customOptions.localPort = Number(options.localPort);
        if (typeof options?.interface === 'string') customOptions.interface = options.interface;
        if (typeof options?.reuseAddress === 'boolean')
            customOptions.reuseAddress = options.reuseAddress;
        if (options?.connectTimeout != null)
            customOptions.connectTimeout = Number(options.connectTimeout);
        if (typeof options?.tls === 'boolean') customOptions.tls = options.tls;
        if (typeof options?.tlsCheckValidity === 'boolean')
            customOptions.tlsCheckValidity = options.tlsCheckValidity;
        // tlsCert may be a string (PEM) or a small RN-asset descriptor
        // object; pass through only if present (it is bounded, not a
        // caller-internals graph).
        if (options?.tlsCert != null) customOptions.tlsCert = options.tlsCert;
        // `allowHalfOpen` is a connect/constructor option in Node's net API
        // and `@libp2p/tcp` passes it straight through `net.connect(cOpts)`
        // (it sets `options.allowHalfOpen ?? false` then spreads it). It is
        // a JS-side socket-lifecycle flag (governs whether an inbound FIN
        // auto-ends our side) — it must NOT cross to native, so it is read
        // here, not added to `customOptions`. (#209 / #183 parity.)
        if (typeof options?.allowHalfOpen === 'boolean') this.allowHalfOpen = options.allowHalfOpen;
        this.once('connect', () => {
            if (callback) callback();
        });
        this._connecting = true;
        this._readyState = 'opening';
        NativeModules.TcpSockets.connect(this._id, host, port, customOptions);
        return this;
    }

    /**
     * Sets the socket to timeout after `timeout` milliseconds of inactivity on the socket. By default `TcpSocket` do not have a timeout.
     *
     * When an idle timeout is triggered the socket will receive a `'timeout'` event but the connection will not be severed.
     * The user must manually call `socket.end()` or `socket.destroy()` to end the connection.
     *
     * If `timeout` is 0, then the existing idle timeout is disabled.
     *
     * The optional `callback` parameter will be added as a one-time listener for the `'timeout'` event.
     *
     * @param {number} timeout
     * @param {() => void} [callback]
     */
    setTimeout(timeout, callback) {
        this._timeoutMsecs = timeout;
        if (this._timeoutMsecs === 0) {
            this._clearTimeout();
        } else {
            this._resetTimeout();
        }
        if (callback) this.once('timeout', callback);
        return this;
    }

    /**
     * @private
     */
    _resetTimeout() {
        if (this._timeoutMsecs !== 0) {
            this._clearTimeout();
            this._timeout = setTimeout(() => {
                this._clearTimeout();
                this.emit('timeout');
            }, this._timeoutMsecs);
        }
    }

    /**
     * @private
     */
    _clearTimeout() {
        if (this._timeout !== undefined) {
            clearTimeout(this._timeout);
            this._timeout = undefined;
        }
    }

    /**
     * Set the encoding for the socket as a Readable Stream. By default, no encoding is assigned and stream data will be returned as `Buffer` objects.
     * Setting an encoding causes the stream data to be returned as strings of the specified encoding rather than as Buffer objects.
     *
     * For instance, calling `socket.setEncoding('utf8')` will cause the output data to be interpreted as UTF-8 data, and passed as strings.
     * Calling `socket.setEncoding('hex')` will cause the data to be encoded in hexadecimal string format.
     *
     * @param {BufferEncoding} [encoding]
     */
    setEncoding(encoding) {
        this._encoding = encoding;
        return this;
    }

    /**
     * Enable/disable the use of Nagle's algorithm. When a TCP connection is created, it will have Nagle's algorithm enabled.
     *
     * Nagle's algorithm delays data before it is sent via the network. It attempts to optimize throughput at the expense of latency.
     *
     * Passing `true` for `noDelay` or not passing an argument will disable Nagle's algorithm for the socket. Passing false for noDelay will enable Nagle's algorithm.
     *
     * @param {boolean} noDelay Default: `true`
     */
    setNoDelay(noDelay = true) {
        if (this._pending) {
            this.once('connect', () => this.setNoDelay(noDelay));
            return this;
        }
        NativeModules.TcpSockets.setNoDelay(this._id, noDelay);
        return this;
    }

    /**
     * Enable/disable keep-alive functionality, and optionally set the initial delay before the first keepalive probe is sent on an idle socket.
     *
     * `initialDelay` is ignored.
     *
     * @param {boolean} enable Default: `false`
     * @param {number} initialDelay ***IGNORED**. Default: `0`
     */
    setKeepAlive(enable = false, initialDelay = 0) {
        if (this._pending) {
            this.once('connect', () => this.setKeepAlive(enable, initialDelay));
            return this;
        }

        if (initialDelay !== 0) {
            console.warn(
                'react-native-tcp-socket: initialDelay param in socket.setKeepAlive() is ignored'
            );
        }

        NativeModules.TcpSockets.setKeepAlive(this._id, enable, Math.floor(initialDelay));
        return this;
    }

    /**
     * Returns the bound `address`, the address `family` name and `port` of the socket as reported
     * by the operating system: `{ port: 12346, family: 'IPv4', address: '127.0.0.1' }`.
     *
     * @returns {AddressInfo | {}}
     */
    address() {
        if (!this.localAddress) return {};
        return { address: this.localAddress, family: this.remoteFamily, port: this.localPort };
    }

    /**
     * Half-closes the socket. i.e., it sends a FIN packet. It is possible the server will still send some data.
     *
     * @param {string | Buffer | Uint8Array} [data]
     * @param {BufferEncoding} [encoding]
     */
    end(data, encoding) {
        if (this._pending || this._destroyed) return this;
        if (data) {
            this._writableEnded = true;
            this.write(data, encoding, () => {
                NativeModules.TcpSockets.end(this._id);
            });
            return this;
        }

        this._clearTimeout();
        this._writableEnded = true;
        NativeModules.TcpSockets.end(this._id);
        return this;
    }

    /**
     * Ensures that no more I/O activity happens on this socket. Destroys the stream and closes the connection.
     *
     * @param {Error} [error] Optional error; if given, emitted as an `'error'` event before `'close'`.
     */
    destroy(error) {
        if (this._destroyed) return this;
        this._destroyed = true;
        this._clearTimeout();
        NativeModules.TcpSockets.destroy(this._id);
        if (error) this.emit('error', error);
        return this;
    }

    /**
     * Half-closes the socket (sends FIN) and destroys it once the write
     * side has finished flushing. Mirrors Node's `net.Socket.destroySoon`:
     * if the socket is already finished writing it is destroyed at once,
     * otherwise it is `end()`-ed and torn down on `'finish'`/`'close'`.
     *
     * `@libp2p/tcp` calls this on every graceful connection close
     * (`sendClose` → `socket.destroySoon()` then awaits `'close'`); the
     * method MUST exist or every libp2p connection teardown throws
     * `TypeError: socket.destroySoon is not a function`. (#209)
     *
     * @returns {this}
     */
    destroySoon() {
        if (this._destroyed) return this;
        // Already flushed (writable finished) → tear down immediately.
        if (this._writableEnded && this._writeBufferSize === 0) {
            this.destroy();
            return this;
        }
        // Otherwise FIN now, then destroy when the OS reports the socket
        // closed (native emits 'close' after the FIN/peer-close completes).
        this.once('close', () => this.destroy());
        this.end();
        return this;
    }

    /**
     * Closes the TCP connection by sending an RST packet and destroying
     * the stream. The underlying native module exposes only a graceful
     * close, so this maps to `destroy()` — the closest available teardown
     * (an abortive RST is not separately expressible on the native side).
     * Present for Node `net.Socket` API parity: `@libp2p/tcp`'s
     * `sendReset` calls `socket.resetAndDestroy()`. (#209)
     *
     * @returns {this}
     */
    resetAndDestroy() {
        if (this._destroyed) return this;
        return this.destroy();
    }

    /**
     * Sends data on the socket. The second parameter specifies the encoding in the case of a string — it defaults to UTF8 encoding.
     *
     * Returns `true` if the entire data was flushed successfully to the kernel buffer. Returns `false` if all or part of the data
     * was queued in user memory. `'drain'` will be emitted when the buffer is again free.
     *
     * The optional callback parameter will be executed when the data is finally written out, which may not be immediately.
     *
     * @param {string | Buffer | Uint8Array} buffer
     * @param {BufferEncoding} [encoding]
     * @param {(err?: Error) => void} [cb]
     *
     * @return {boolean}
     */
    write(buffer, encoding, cb) {
        if (this._pending || this._destroyed) throw new Error('Socket is closed.');

        const generatedBuffer = this._generateSendBuffer(buffer, encoding);
        this._writeBufferSize += generatedBuffer.byteLength;
        const currentMsgId = this._msgId;
        this._msgId = (this._msgId + 1) % Number.MAX_SAFE_INTEGER;
        const msgEvtHandler = (/** @type {{id: number, msgId: number, err?: string}} */ evt) => {
            const { msgId, err } = evt;
            if (msgId === currentMsgId) {
                this._msgEvtEmitter.removeListener('written', msgEvtHandler);
                this._writeBufferSize -= generatedBuffer.byteLength;
                this._lastRcvMsgId = msgId;
                this._resetTimeout();
                if (this.writableNeedDrain && this._lastSentMsgId === msgId) {
                    this.writableNeedDrain = false;
                    this.emit('drain');
                }
                if (cb) {
                    if (err) cb(new Error(err));
                    else cb();
                }
            }
        };
        // Callback equivalent with better performance
        this._msgEvtEmitter.on('written', msgEvtHandler, this);
        let ok = this._writeBufferSize < this.writableHighWaterMark;
        this._lastSentMsgId = currentMsgId;
        this._bytesWritten += generatedBuffer.byteLength;
        // VENHO Phase 1: zero-(legacy-)copy outbound. Push the bytes through
        // the JSI data bridge instead of NativeModules.TcpSockets.write(id,
        // base64, msgId) — that base64 String arg crossed the Java
        // TurboModule's jsi::dynamicFromValue per write and was the residual
        // Scenario-C Scudo OOM. The host fn copies the bytes ONCE off this
        // ArrayBuffer into the bounded C++ outbound queue (no base64, no
        // folly::dynamic); it returns false at the queue's high watermark,
        // which (in addition to the JS-side _writeBufferSize check) latches
        // backpressure until the native write loop drains and the
        // write-drain handler clears it.
        const bridge = typeof getTcpDataBridge === 'function' ? getTcpDataBridge() : null;
        if (bridge && typeof bridge.write === 'function') {
            // Hermes Buffer is a Uint8Array view; hand the exact byte range as
            // its own ArrayBuffer (sliced — the host copies synchronously, so
            // a tight buffer is correct and avoids leaking the pool).
            const ab = generatedBuffer.buffer.slice(
                generatedBuffer.byteOffset,
                generatedBuffer.byteOffset + generatedBuffer.byteLength
            );
            const nativeOk = bridge.write(this._id, ab, currentMsgId);
            if (nativeOk === false) ok = false;
        } else {
            // No JSI data bridge means the native install() did not run — a
            // hard wiring error, not a recoverable state. Fail loud rather
            // than silently dropping outbound bytes (which previously
            // masqueraded as a mystery leak).
            throw new Error(
                '[react-native-tcp-socket] JSI TcpDataBridge unavailable — ' +
                    'native install() did not run (clean rebuild needed?)'
            );
        }
        if (!ok) this.writableNeedDrain = true;
        return ok;
    }

    /**
     * Pauses the reading of data. That is, `'data'` events will not be emitted. Useful to throttle back an upload.
     */
    pause() {
        if (this._paused) return this;
        this._paused = true;
        NativeModules.TcpSockets.pause(this._id);
        this.emit('pause');
        return this;
    }

    /**
     * Resumes reading after a call to `socket.pause()`.
     */
    resume() {
        if (!this._paused) return;
        this._paused = false;
        this.emit('resume');
        // VENHO Phase 1: nothing buffered in JS anymore. Tell native to
        // resume its read loop, then drain whatever the C++ queue holds.
        NativeModules.TcpSockets.resume(this._id);
        this._drainInbound();
    }

    ref() {
        console.warn('react-native-tcp-socket: Socket.ref() method will have no effect.');
    }

    unref() {
        console.warn('react-native-tcp-socket: Socket.unref() method will have no effect.');
    }

    /**
     * VENHO Phase 1 — zero-copy inbound drain.
     *
     * Invoked (by socket id) from the single JSI readable callback that
     * the C++ TcpDataBridge hops onto the JS thread via the CallInvoker —
     * NOT a device event. Native pushed the bytes into the bounded C++
     * TcpInboundRegistry; here we pull them zero-copy: each `read(id)`
     * returns an ArrayBuffer whose storage IS the received bytes (no
     * base64, no folly::dynamic, no per-chunk legacy-bridge crossing —
     * milestone 1d proved any such crossing OOMs). Buffer.from(ab) wraps
     * without copying (@craftzdog/react-native-buffer).
     *
     * Backpressure: while `_paused` we STOP draining; bytes stay in the
     * bounded native queue, which pauses the socket read at its high
     * watermark (real TCP backpressure). The old unbounded
     * `_pausedDataEvents` array is gone.
     *
     * @private
     */
    _drainInbound() {
        if (this._paused || this._destroyed) return;
        const bridge = getTcpDataBridge();
        if (!bridge) return;
        this._resetTimeout();
        // Drain everything currently queued for this socket id.
        for (;;) {
            if (this._paused || this._destroyed) return;
            const ab = bridge.read(this._id);
            if (ab == null) return;
            const bufferData = Buffer.from(ab);
            this._bytesRead += bufferData.byteLength;
            const finalData = this._encoding ? bufferData.toString(this._encoding) : bufferData;
            this.emit('data', finalData);
        }
    }

    /**
     * @private
     */
    _registerEvents() {
        this._unregisterEvents();
        // VENHO Phase 1: the readable signal arrives via the JSI bridge (a
        // single C++→JS CallInvoker callback dispatched by socket id), NOT a
        // device event — milestone 1d proved any per-chunk legacy-bridge
        // crossing OOMs. Register this socket's drain handler; bytes are
        // then pulled zero-copy via the JSI read(id) in _drainInbound.
        // Ensures the bridge (and its single setReadable cb) is installed.
        // Guarded: the Jest env mocks ./Globals with only a subset of
        // exports — degrade to a no-op there (the suite asserts control
        // plane, not the JSI data path).
        if (typeof getTcpDataBridge === 'function') getTcpDataBridge();
        if (typeof registerReadableHandler === 'function') {
            registerReadableHandler(this._id, () => this._drainInbound());
        }
        // VENHO Phase 1: the native write loop fires this (via the JSI
        // CallInvoker, NOT a device event) when the C++ outbound queue
        // drained below its low watermark. Release backpressure: clear the
        // need-drain latch and emit `drain` so libp2p/Node streams resume
        // writing. (The per-write `written` ack still flows through the
        // event path below — that's a tiny {id,msgId} map, not the leak.)
        if (typeof registerWriteDrainHandler === 'function') {
            registerWriteDrainHandler(this._id, () => {
                if (this.writableNeedDrain) {
                    this.writableNeedDrain = false;
                    this.emit('drain');
                }
            });
        }
        this._errorListener = this._eventEmitter.addListener('error', (evt) => {
            if (evt.id !== this._id) return;
            this.destroy();
            this.emit('error', evt.error);
        });
        this._closeListener = this._eventEmitter.addListener('close', (evt) => {
            if (evt.id !== this._id) return;
            this._setDisconnected();
            // Node's net.Socket 'close' passes a BOOLEAN `hadError`, not the
            // error object (the error itself is delivered via 'error', emitted
            // first). `@libp2p/tcp` relies on this exact shape:
            // `socket.once('close', hadError => { if (hadError) abort(...) })`.
            // Previously this emitted the raw error and only worked by
            // truthiness — now spec-correct. (#209 Node-parity)
            this.emit('close', Boolean(evt.error));
        });
        this._endListener = this._eventEmitter.addListener('end', (evt) => {
            if (evt.id !== this._id) return;
            if (!this.allowHalfOpen) {
                this.end();
            }
            this.emit('end');
        });
        this._connectListener = this._eventEmitter.addListener('connect', (evt) => {
            if (evt.id !== this._id) return;
            this._setConnected(evt.connection);
            this.emit('connect');
        });
        // VENHO Phase 1: the per-write `written` ACK now arrives via the JSI
        // CallInvoker (single C++→JS callback keyed by socket id), NOT the
        // legacy RCTDeviceEventEmitter `written` device event — that
        // per-write emit accumulated an unbounded folly::dynamic in the
        // bridgeless event-emitter queue (Scenario-C OOM #2). The handler
        // feeds the SAME in-JS `_msgEvtEmitter` the per-write `msgEvtHandler`
        // already listens on, so all the existing ack/drain/callback
        // accounting is unchanged. Guarded for the Jest mock env.
        if (typeof registerWrittenHandler === 'function') {
            registerWrittenHandler(this._id, (msgId, err) => {
                this._msgEvtEmitter.emit('written', {
                    id: this._id,
                    msgId,
                    // C++ passes '' for success; normalise to undefined so the
                    // existing `if (err)` checks behave exactly as before.
                    err: err ? err : undefined,
                });
            });
        }
    }

    /**
     * @package
     */
    _unregisterEvents() {
        // VENHO Phase 1: readable is a JSI handler keyed by socket id, not a
        // device-event subscription. Guarded for the Jest mock env.
        if (typeof unregisterReadableHandler === 'function') {
            unregisterReadableHandler(this._id);
        }
        if (typeof unregisterWriteDrainHandler === 'function') {
            unregisterWriteDrainHandler(this._id);
        }
        // VENHO Phase 1: `written` is a JSI handler keyed by socket id, not
        // a device-event subscription. Guarded for the Jest mock env.
        if (typeof unregisterWrittenHandler === 'function') {
            unregisterWrittenHandler(this._id);
        }
        this._errorListener?.remove();
        this._closeListener?.remove();
        this._endListener?.remove();
        this._connectListener?.remove();
    }

    /**
     * @private
     * @param {string | Buffer | Uint8Array} buffer
     * @param {BufferEncoding} [encoding]
     */
    _generateSendBuffer(buffer, encoding) {
        if (typeof buffer === 'string') {
            return Buffer.from(buffer, encoding);
        } else if (Buffer.isBuffer(buffer)) {
            return buffer;
        } else if (buffer instanceof Uint8Array || Array.isArray(buffer)) {
            return Buffer.from(buffer);
        } else {
            throw new TypeError(
                `Invalid data, chunk must be a string or buffer, not ${typeof buffer}`
            );
        }
    }

    /**
     * @private
     */
    _setDisconnected() {
        this._unregisterEvents();
    }
}
