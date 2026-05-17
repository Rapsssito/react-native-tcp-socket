/**
 * VENHO fork — Phase 1 zero-copy data-plane spec.
 *
 * This is the codegen contract for the C++ cxxTurboModule. It has ONE
 * job: install the `global.__TcpDataBridge` JSI host object into the
 * runtime (the quick-base64 install trick). All actual byte movement —
 * BOTH directions — happens through that host object's zero-copy
 * methods, NEVER through this TurboModule's call path (which would still
 * marshal through folly::dynamic, the exact Phase-0/Scenario-C OOM).
 *
 * The legacy `TcpSockets` NativeModule keeps ONLY the one-shot control
 * plane (connect/end/destroy/pause/resume/setNoDelay/setKeepAlive) —
 * those are per-socket-lifecycle, not per-byte, so they don't drive the
 * dynamicFromValue OOM. The hot `write` data path was MOVED off it onto
 * the JSI host object's write() (Phase 1).
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
    /**
     * Installs `global.__TcpDataBridge` (a JSI HostObject) into the JS
     * runtime. Idempotent. Returns true on success. Must be called once
     * before any socket reads are consumed (Globals.js drives this).
     *
     * The installed host object exposes (untyped here — JSI host object,
     * not codegen, so its bytes never transit folly::dynamic):
     *   read(id): ArrayBuffer | null            // next inbound chunk
     *   setReadable((id)=>void): void           // inbound-ready signal
     *   write(id, ArrayBuffer, msgId): boolean  // zero-copy outbound;
     *                                           // false at high watermark
     *   setWriteDrainable((id)=>void): void     // outbound-drained signal
     */
    install(): boolean;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RNTcpDataBridge');
