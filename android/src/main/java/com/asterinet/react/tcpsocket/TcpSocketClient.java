package com.asterinet.react.tcpsocket;

import android.content.Context;
import android.net.Network;

import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableArray;

import java.io.BufferedInputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.OutputStream;
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
    private static final int DATA_BUFFER_BYTES = 16384;
    private static final int FILE_BUFFER_BYTES = 65536;
    private final ExecutorService listenExecutor;
    private final ExecutorService writeExecutor;
    private final TcpEventListener receiverListener;
    private TcpReceiverTask receiverTask;
    private Socket socket;
    private boolean closed = true;
    private volatile HttpBodyFileReceiver fileReceiver;

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
        receiverTask = new TcpReceiverTask(this, receiverListener);
        listenExecutor.execute(receiverTask);
    }

    /**
     * Sends data from the socket
     *
     * @param data data to be sent
     */
    public void write(final int msgId, final byte[] data) {
        writeExecutor.execute(new Runnable() {
            @Override
            public void run() {
                final Socket s = socket;
                if (s == null) {
                    receiverListener.onError(getId(), new IOException("Attempted to write to closed socket"));
                    return;
                }
                try {
                    s.getOutputStream().write(data);
                    receiverListener.onWritten(getId(), msgId, null);
                } catch (IOException e) {
                    receiverListener.onWritten(getId(), msgId, e);
                    receiverListener.onError(getId(), e);
                }
            }
        });
    }

    /**
     * Streams `length` bytes of the file at `path`, from `offset`, without passing them through JS.
     * Runs on the write executor, so it stays ordered with `write` calls.
     */
    public void sendFile(final int msgId, final String rawPath, final long offset, final long length) {
        writeExecutor.execute(new Runnable() {
            @Override
            public void run() {
                final Socket s = socket;
                if (s == null) {
                    receiverListener.onWritten(getId(), msgId, new IOException("Attempted to write to closed socket"));
                    return;
                }
                final String path = rawPath.startsWith("file://") ? rawPath.substring("file://".length()) : rawPath;
                try (FileInputStream in = new FileInputStream(path)) {
                    in.getChannel().position(offset);
                    OutputStream out = s.getOutputStream();
                    byte[] buffer = new byte[FILE_BUFFER_BYTES];
                    long sent = 0;
                    long lastProgressAt = 0;
                    while (sent < length) {
                        int read = in.read(buffer, 0, (int) Math.min(buffer.length, length - sent));
                        if (read < 0) throw new IOException("Unexpected end of file after " + sent + " bytes");
                        out.write(buffer, 0, read);
                        sent += read;
                        long now = System.currentTimeMillis();
                        if (now - lastProgressAt >= HttpBodyFileReceiver.PROGRESS_INTERVAL_MS) {
                            lastProgressAt = now;
                            receiverListener.onFileProgress(getId(), sent, length);
                        }
                    }
                    out.flush();
                    receiverListener.onFileProgress(getId(), sent, length);
                    receiverListener.onWritten(getId(), msgId, null);
                } catch (IOException e) {
                    receiverListener.onWritten(getId(), msgId, e);
                    receiverListener.onError(getId(), e);
                }
            }
        });
    }

    /**
     * From now on, incoming bytes are parsed as an HTTP response whose body is written to `path`
     * (`fileProgress` / `fileEnd` events) instead of being emitted as `data` events.
     * Call it before sending the request.
     */
    public void receiveHttpBodyToFile(final String path) {
        fileReceiver = new HttpBodyFileReceiver(getId(), path, receiverListener);
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

            byte[] buffer = new byte[FILE_BUFFER_BYTES];
            try {
                BufferedInputStream in = new BufferedInputStream(socket.getInputStream());
                while (!socket.isClosed()) {
                    // `data` events keep their size, a file is read with larger chunks
                    int maxCount = clientSocket.fileReceiver != null ? FILE_BUFFER_BYTES : DATA_BUFFER_BYTES;
                    int bufferCount = in.read(buffer, 0, maxCount);
                    waitIfPaused();
                    HttpBodyFileReceiver fileReceiver = clientSocket.fileReceiver;
                    if (bufferCount > 0 && fileReceiver != null) {
                        fileReceiver.onData(buffer, bufferCount);
                    } else if (bufferCount > 0) {
                        receiverListener.onData(socketId, Arrays.copyOfRange(buffer, 0, bufferCount));
                    } else if (bufferCount == -1) {
                        if (fileReceiver != null) fileReceiver.onEnd();
                        receiverListener.onEnd(socketId);
                        break;
                    }
                }
            } catch (IOException | InterruptedException ioe) {
                HttpBodyFileReceiver fileReceiver = clientSocket.fileReceiver;
                if (fileReceiver != null) fileReceiver.onError(ioe.getMessage());
                if (receiverListener != null && socket != null && !socket.isClosed() && !clientSocket.closed) {
                    receiverListener.onError(socketId, ioe);
                }
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
