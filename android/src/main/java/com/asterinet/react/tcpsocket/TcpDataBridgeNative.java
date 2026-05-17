package com.asterinet.react.tcpsocket;

/**
 * VENHO fork — Phase 1 zero-copy socket data bridge (Java side), BOTH
 * directions.
 *
 * INBOUND: the native socket read thread pushes received bytes straight
 * into the C++ {@code TcpInboundRegistry} via these JNI calls, instead
 * of the legacy {@code Base64.encodeToString} → WritableMap →
 * RCTDeviceEventEmitter path that built a folly::dynamic per chunk and
 * OOM'd the process under libp2p volume (Phase 0).
 *
 * OUTBOUND: the native socket write thread pulls bytes to send from the
 * same C++ registry ({@link #nativeWaitWriteChunk}) — the JSI host
 * {@code write()} enqueued them zero-copy off the JS ArrayBuffer. This
 * replaces the {@code @ReactMethod write(int, String base64, int)} Java
 * TurboModule call whose per-write jsi::dynamicFromValue marshalling was
 * the residual Scudo OOM (Scenario C, after inbound was fixed).
 *
 * Backpressure: {@link #nativePushInbound} returns false when the
 * bounded C++ queue hit its high watermark — the read loop must then
 * stop reading the socket (TCP flow-control backpressures the peer) and
 * poll {@link #nativeCanResume} until the JS side has drained it. The
 * outbound queue is bounded symmetrically; the JSI {@code write()}
 * returns false at its high watermark (JS latches writableNeedDrain).
 *
 * The JNI methods are registered LAZILY from C++ via the implicitly
 * bound {@link #nativeInstallBridge()} (TcpBridgeJni.cpp), called once
 * from {@link #ensureLoaded()}. NOT from JNI_OnLoad: the fork's native
 * code is merged into libappmodules.so, whose single JNI_OnLoad runs
 * pre-bundle with the bootstrap classloader, where FindClass for this
 * class returns null. There is no standalone libreact-native-tcp-socket
 * .so to load — the symbols already live in the loaded libappmodules.so.
 */
final class TcpDataBridgeNative {

    private static boolean bridgeInstalled = false;

    private TcpDataBridgeNative() {}

    static synchronized void ensureLoaded() {
        if (!bridgeInstalled) {
            // Implicitly bound (Java_<class>_nativeInstallBridge) — the
            // JVM resolves it by symbol lookup across already-loaded
            // .so's, so no System.loadLibrary is needed. It RegisterNatives
            // the 7 data-plane methods using THIS call's app-classloader
            // env, which is why it must run from here (not JNI_OnLoad).
            nativeInstallBridge();
            bridgeInstalled = true;
        }
    }

    /**
     * One-time bootstrap: explicitly registers the 7 data-plane native
     * methods below. Implicitly bound (no JNI_OnLoad / no loadLibrary).
     * Must be invoked from Java so the C++ side gets the app classloader
     * and the {@code TcpDataBridgeNative} jclass deterministically.
     */
    private static native void nativeInstallBridge();

    static native void nativeRegisterSocket(int id);

    static native void nativeUnregisterSocket(int id);

    /** @return true to keep reading; false → high watermark, pause. */
    static native boolean nativePushInbound(int id, byte[] data, int len);

    /** @return true once drained to low watermark (safe to resume). */
    static native boolean nativeCanResume(int id);

    /**
     * Block until the socket's OUTBOUND queue (filled zero-copy by the
     * JSI {@code write()} host fn) has a chunk, then return its bytes.
     * The chunk's {@code msgId} is written to {@code msgIdOut[0]} (a
     * reusable single-element array — one JNI call, no TOCTOU, no
     * folly::dynamic). Returns {@code null} when the socket was
     * unregistered: the write thread must then exit.
     *
     * @param id       socket id
     * @param msgIdOut int[1] out-param receiving the chunk's msgId
     * @return the bytes to write, or null to signal thread exit
     */
    static native byte[] nativeWaitWriteChunk(int id, int[] msgIdOut);

    /**
     * "Data available for socket id" — hops to the JS thread via the
     * CallInvoker and invokes the registered JS readable callback. The
     * legacy-bridge-FREE replacement for the old RCTDeviceEventEmitter
     * "readable" emit (which still OOM'd: per-chunk invokeJavaMethod →
     * folly::dynamic backlog, independent of payload size).
     */
    static native void nativeSignalReadable(int id);

    /**
     * Per-write ACK — hops to the JS thread via the CallInvoker and
     * invokes the registered JS {@code written} callback with
     * {@code (id, msgId, err)}. {@code err} is "" on success (pass
     * {@code null} for success — the native side maps it to ""). The
     * legacy-bridge-FREE replacement for the {@code onWritten} →
     * {@code RCTDeviceEventEmitter.emit("written",…)} path, which ran
     * once PER WRITE and accumulated an unbounded folly::dynamic in the
     * bridgeless event-emitter queue under libp2p volume (Scenario-C
     * OOM #2 — same class of bug milestone-1d hit on readable).
     *
     * @param id    socket id
     * @param msgId the write's msgId (echoed to the JS write callback)
     * @param err   error message, or null for success
     */
    static native void nativeSignalWritten(int id, int msgId, String err);
}
