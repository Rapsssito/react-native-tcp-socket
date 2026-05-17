package com.asterinet.react.tcpsocket;

import android.content.Context;
import android.net.Network;

import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableArray;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.security.GeneralSecurityException;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

class TcpSocketClient extends TcpSocket {
    private final ExecutorService listenExecutor;
    // VENHO Phase 1: outbound is no longer a per-call @ReactMethod
    // Runnable (that base64 String arg crossed the Java TurboModule's
    // jsi::dynamicFromValue — the residual Scenario-C OOM). A dedicated
    // write LOOP thread blocks on the C++ outbound queue (fed zero-copy
    // by the JSI write() host fn) and writes to the socket — symmetric
    // to the inbound TcpReceiverTask.
    private final ExecutorService writeExecutor;
    private final TcpEventListener receiverListener;
    private TcpReceiverTask receiverTask;
    private TcpSenderTask senderTask;
    private Socket socket;
    private boolean closed = true;
    // VENHO Phase 1: true once this socket's C++ queues were registered
    // (startListening → nativeRegisterSocket). destroy()'s finally must
    // NOT call nativeUnregisterSocket otherwise: a connect() that throws
    // before startListening (e.g. an unreachable peer) never registered,
    // and an unconditional unregister would (a) double-handle an unknown
    // id and (b) — until JNI is first installed via ensureLoaded — throw
    // UnsatisfiedLinkError from the cleanup path, masking the real
    // connect failure. Registration always precedes any teardown.
    private volatile boolean nativeRegistered = false;

    TcpSocketClient(TcpEventListener receiverListener, Integer id, Socket socket) {
        super(id);
        listenExecutor = Executors.newSingleThreadExecutor();
        writeExecutor = Executors.newSingleThreadExecutor();
        this.socket = socket;
        this.receiverListener = receiverListener;
    }

    public Socket getSocket() {
        return socket;
    }

    public void connect(Context context, String address, final Integer port, ReadableMap options, Network network, ReadableMap tlsOptions) throws IOException, GeneralSecurityException {
        if (socket != null) throw new IOException("Already connected");
        if (tlsOptions != null) {
            SSLSocketFactory ssf = getSSLSocketFactory(context, tlsOptions);
            socket = ssf.createSocket();
            ((SSLSocket) socket).setUseClientMode(true);
        } else {
            socket = new Socket();
        }
        // Get the addresses
        final String localAddress = options.hasKey("localAddress") ? options.getString("localAddress") : "0.0.0.0";
        final InetAddress localInetAddress = InetAddress.getByName(localAddress);
        final InetAddress remoteInetAddress = InetAddress.getByName(address);
        if (network != null)
            network.bindSocket(socket);
        // setReuseAddress
        if (options.hasKey("reuseAddress")) {
            boolean reuseAddress = options.getBoolean("reuseAddress");
            socket.setReuseAddress(reuseAddress);
        } else {
            // Default to true
            socket.setReuseAddress(true);
        }
        final int localPort = options.hasKey("localPort") ? options.getInt("localPort") : 0;
        // bind
        socket.bind(new InetSocketAddress(localInetAddress, localPort));
        final int connectTimeout = options.hasKey("connectTimeout") ? options.getInt("connectTimeout") : 0; 
        socket.connect(new InetSocketAddress(remoteInetAddress, port), connectTimeout);
        if (socket instanceof SSLSocket) ((SSLSocket) socket).startHandshake();
        startListening();
    }

    public void startTLS(Context context, ReadableMap tlsOptions) throws IOException, GeneralSecurityException {
        if (socket instanceof SSLSocket) return;
        SSLSocketFactory ssf = getSSLSocketFactory(context, tlsOptions);
        SSLSocket sslSocket = (SSLSocket) ssf.createSocket(socket, socket.getInetAddress().getHostAddress(), socket.getPort(), true);
        sslSocket.setUseClientMode(true);
        sslSocket.startHandshake();
        socket = sslSocket;
    }

    private boolean containsKey(ReadableArray array, String key) {
        for (int i = 0; i < array.size(); i++) {
            if (array.getString(i).equals(key)) {
                return true;
            }
        }
        return false;
    }

    private ResolvableOption getResolvableOption(ReadableMap tlsOptions, String key) {
        if (tlsOptions.hasKey(key)) {
            String value = tlsOptions.getString(key);
            if (value == null || value.isEmpty()) {
                return null;
            }
            ReadableArray resolvedKeys = tlsOptions.hasKey("resolvedKeys") ? tlsOptions.getArray("resolvedKeys") : null;
            boolean needsResolution = resolvedKeys != null && containsKey(resolvedKeys, key);
            return new ResolvableOption(value, needsResolution);
        }
        return null;
    }

    private SSLSocketFactory getSSLSocketFactory(Context context, ReadableMap tlsOptions) throws GeneralSecurityException, IOException {
        SSLSocketFactory ssf = null;

        final ResolvableOption customTlsCa = getResolvableOption(tlsOptions, "ca");
        final ResolvableOption customTlsKey = getResolvableOption(tlsOptions, "key");
        final ResolvableOption customTlsCert = getResolvableOption(tlsOptions, "cert");
        final String keystoreName = tlsOptions.hasKey("androidKeyStore") ? tlsOptions.getString("androidKeyStore") : "";
        final String caAlias = tlsOptions.hasKey("caAlias") ? tlsOptions.getString("caAlias") : "";
        final String keyAlias = tlsOptions.hasKey("keyAlias") ? tlsOptions.getString("keyAlias") : "";
        final String certAlias = tlsOptions.hasKey("certAlias") ? tlsOptions.getString("certAlias") : "";
        final KeystoreInfo keystoreInfo = new KeystoreInfo(keystoreName, caAlias, certAlias, keyAlias);

        if (tlsOptions.hasKey("rejectUnauthorized") && !tlsOptions.getBoolean("rejectUnauthorized")) {
            if ((customTlsKey != null && customTlsCert != null) ||
                    (keyAlias != null && !keyAlias.isEmpty() && customTlsKey == null) ) {
                ssf = SSLCertificateHelper.createCustomTrustedSocketFactory(
                        context,
                        customTlsCa,
                        customTlsKey,
                        customTlsCert,
                        keystoreInfo
                );
            } else {
                ssf = SSLCertificateHelper.createBlindSocketFactory();
            }
        } else {
            ssf = (customTlsCa != null)
                    ? SSLCertificateHelper.createCustomTrustedSocketFactory(
                            context,
                            customTlsCa,
                            customTlsKey,
                            customTlsCert,
                            keystoreInfo
                    )
                    : (SSLSocketFactory) SSLSocketFactory.getDefault();
        }
        return ssf;
    }

    public void startListening() {
        // VENHO Phase 1: register this socket's bounded inbound+outbound
        // queues in the C++ registry before the loops start using them,
        // then start BOTH the read loop and the dedicated write loop.
        TcpDataBridgeNative.ensureLoaded();
        TcpDataBridgeNative.nativeRegisterSocket(getId());
        nativeRegistered = true;
        receiverTask = new TcpReceiverTask(this, receiverListener);
        listenExecutor.execute(receiverTask);
        senderTask = new TcpSenderTask(this, receiverListener);
        writeExecutor.execute(senderTask);
    }

    // VENHO Phase 1: the old per-call write(int, byte[]) Runnable (driven
    // by the @ReactMethod write(int, String base64, int) Java
    // TurboModule call) is GONE — that base64 String arg crossed
    // jsi::dynamicFromValue per write and was the residual Scenario-C
    // Scudo OOM. Outbound now flows: JS Buffer → JSI write() host fn
    // (one copy off the ArrayBuffer into the bounded C++ queue, no
    // base64/folly) → TcpSenderTask drains it here and writes to the
    // socket. The `written` ack still goes through receiverListener (one
    // tiny {id,msgId,err} map, NOT per-payload — acceptable; only the
    // bulk data path was the leak).

    /**
     * VENHO Phase 1 outbound write loop. Blocks on the C++ outbound
     * queue (fed zero-copy by the JSI write() host fn), writes each
     * chunk to the socket OutputStream, and ACKs each write via the JSI
     * CallInvoker ({@code nativeSignalWritten}) — NOT the legacy
     * {@code receiverListener.onWritten} → RCTDeviceEventEmitter path,
     * which ran once PER WRITE and accumulated an unbounded
     * folly::dynamic in the bridgeless event-emitter queue under libp2p
     * volume (Scenario-C OOM #2). Terminal {@code onError} stays on the
     * legacy bridge: it fires AT MOST ONCE per socket lifetime (every
     * error path here returns immediately), so it is not a per-chunk
     * crossing — same rationale as close/end/connect. Exits when
     * nativeWaitWriteChunk returns null (socket unregistered in
     * destroy()). Symmetric to TcpReceiverTask.
     */
    private static class TcpSenderTask implements Runnable {
        private final TcpSocketClient clientSocket;
        private final TcpEventListener receiverListener;

        TcpSenderTask(TcpSocketClient clientSocket, TcpEventListener receiverListener) {
            this.clientSocket = clientSocket;
            this.receiverListener = receiverListener;
        }

        @Override
        public void run() {
            final int socketId = clientSocket.getId();
            // Reused single-element out-param for the chunk's msgId — one
            // JNI call per chunk, no per-write allocation beyond the
            // unavoidable payload byte[].
            final int[] msgIdOut = new int[1];
            try {
                while (true) {
                    byte[] data = TcpDataBridgeNative.nativeWaitWriteChunk(socketId, msgIdOut);
                    if (data == null) {
                        // Socket unregistered (destroy()) — exit the loop.
                        return;
                    }
                    final int msgId = msgIdOut[0];
                    Socket socket = clientSocket.getSocket();
                    if (socket == null) {
                        // ACK the failure via JSI (per-write path), then
                        // the terminal onError once (legacy, one-shot).
                        TcpDataBridgeNative.nativeSignalWritten(socketId, msgId,
                                "Attempted to write to closed socket");
                        receiverListener.onError(socketId,
                                new IOException("Attempted to write to closed socket"));
                        return;
                    }
                    try {
                        socket.getOutputStream().write(data);
                        // Per-write ACK over the JSI CallInvoker (null
                        // err → "" success). NOT onWritten/legacy bridge.
                        TcpDataBridgeNative.nativeSignalWritten(socketId, msgId, null);
                    } catch (IOException e) {
                        TcpDataBridgeNative.nativeSignalWritten(socketId, msgId,
                                e.getMessage() != null ? e.getMessage() : "write failed");
                        if (!clientSocket.closed) {
                            receiverListener.onError(socketId, e);
                        }
                        return;
                    }
                }
            } catch (Exception e) {
                if (!clientSocket.closed) {
                    receiverListener.onError(socketId, e);
                }
            }
        }
    }

    public ReadableMap getPeerCertificate() {
        return SSLCertificateHelper.getCertificateInfo(socket, true);
    }

    public ReadableMap getCertificate() {
        return SSLCertificateHelper.getCertificateInfo(socket, false);
    }

    /**
     * Shuts down the receiver task, closing the socket.
     */
    public void destroy() {
        try {
            // close the socket
            if (socket != null && !socket.isClosed()) {
                closed = true;
                socket.close();
                receiverListener.onClose(getId(), null);
                socket = null;
            }
        } catch (IOException e) {
            receiverListener.onClose(getId(), e);
        } finally {
            // VENHO Phase 1: free this socket's C++ inbound queue — but
            // ONLY if startListening actually registered it. A connect()
            // that threw before startListening (unreachable peer) never
            // registered, so unregistering here would be a no-op at best
            // and, before the first ensureLoaded, an UnsatisfiedLinkError
            // that masks the real connect failure.
            if (nativeRegistered) {
                nativeRegistered = false;
                TcpDataBridgeNative.nativeUnregisterSocket(getId());
            }
        }
    }

    /**
     * @param noDelay `true` will disable Nagle's algorithm for the socket (enable TCP_NODELAY)
     */
    public void setNoDelay(final boolean noDelay) throws IOException {
        if (socket == null) {
            throw new IOException("Socket is not connected.");
        }
        socket.setTcpNoDelay(noDelay);
    }

    /**
     * @param enable `true` to enable keep-alive functionality
     */
    public void setKeepAlive(final boolean enable, final int initialDelay) throws IOException {
        if (socket == null) {
            throw new IOException("Socket is not connected.");
        }
        // `initialDelay` is ignored
        socket.setKeepAlive(enable);
    }

    public void pause() {
        if (receiverTask != null) {
            receiverTask.pause();
        }
    }

    public void resume() {
        if (receiverTask != null) {
            receiverTask.resume();
        }
    }

    /**
     * This is a specialized Runnable that receives data from a socket in the background, and
     * notifies it's listener when data is received.  This is not threadsafe, the listener
     * should handle synchronicity.
     */
    private static class TcpReceiverTask implements Runnable {

        private final TcpSocketClient clientSocket;
        private final TcpEventListener receiverListener;
        private boolean paused = false;

        public TcpReceiverTask(TcpSocketClient clientSocket, TcpEventListener receiverListener) {
            this.clientSocket = clientSocket;
            this.receiverListener = receiverListener;
        }

        /**
         * An infinite loop to block and read data from the socket.
         */
        @Override
        public void run() {
            int socketId = clientSocket.getId();
            Socket socket = clientSocket.getSocket();

            // Guard against null socket - can happen if destroy() is called
            // before the receiver task starts, or if socket creation failed
            if (socket == null) {
                return;
            }

            byte[] buffer = new byte[16384];
            try {
                BufferedInputStream in = new BufferedInputStream(socket.getInputStream());
                while (!socket.isClosed()) {
                    // VENHO Phase 1: throttle BEFORE the read (was after).
                    // If the C++ queue is at the high watermark, do not
                    // read more from the socket — TCP flow control then
                    // backpressures the peer (the structural fix for the
                    // Phase-0 unbounded folly::dynamic backlog). Honour an
                    // explicit JS pause() too.
                    waitIfPaused();
                    waitForNativeDrain(socketId);
                    int bufferCount = in.read(buffer);
                    if (bufferCount > 0) {
                        // Zero legacy bridge: push raw bytes into the C++
                        // registry (no base64, no WritableMap, no
                        // RCTDeviceEventEmitter). Return false => high
                        // watermark; loop back and waitForNativeDrain
                        // gates the next read.
                        TcpDataBridgeNative.nativePushInbound(
                                socketId,
                                Arrays.copyOfRange(buffer, 0, bufferCount),
                                bufferCount);
                        // Readable signal via the JSI CallInvoker (NOT
                        // the legacy RCTDeviceEventEmitter — that still
                        // OOM'd in 1d: per-chunk invokeJavaMethod →
                        // folly::dynamic backlog regardless of payload).
                        // C++ hops to the JS thread and calls the JS
                        // readable cb with just the id; bytes are pulled
                        // zero-copy via the JSI read(id).
                        TcpDataBridgeNative.nativeSignalReadable(socketId);
                    } else if (bufferCount == -1) {
                        receiverListener.onEnd(socketId);
                        break;
                    }
                }
            } catch (IOException | InterruptedException ioe) {
                if (receiverListener != null && socket != null && !socket.isClosed() && !clientSocket.closed) {
                    receiverListener.onError(socketId, ioe);
                }
            }
        }

        /**
         * Block the read loop while the C++ inbound queue is over its
         * high watermark, polling until JS has drained it below the low
         * watermark. Short sleep poll (vs a JNI upcall) keeps the native
         * glue minimal; the peer's TCP window stalls meanwhile.
         */
        private void waitForNativeDrain(int socketId) throws InterruptedException {
            while (!TcpDataBridgeNative.nativeCanResume(socketId)) {
                Thread.sleep(4);
            }
        }

        public synchronized void pause() {
            paused = true;
        }

        public synchronized void resume() {
            paused = false;
            notify();
        }

        private synchronized void waitIfPaused() throws InterruptedException {
            while (paused) {
                wait();
            }
        }
    }
}
