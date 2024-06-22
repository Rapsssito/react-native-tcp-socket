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
    private final ExecutorService writeExecutor;
    private final TcpEventListener receiverListener;
    private TcpReceiverTask receiverTask;
    private Socket socket;
    private boolean closed = true;

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
        socket.connect(new InetSocketAddress(remoteInetAddress, port));
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
            if (customTlsKey != null && customTlsCert != null ) {
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
                if (socket == null) {
                    receiverListener.onError(getId(), new IOException("Attempted to write to closed socket"));
                    return;
                }
                try {
                    socket.getOutputStream().write(data);
                    receiverListener.onWritten(getId(), msgId, null);
                } catch (IOException e) {
                    receiverListener.onWritten(getId(), msgId, e);
                    receiverListener.onError(getId(), e);
                }
            }
        });
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
        receiverTask.pause();
    }

    public void resume() {
        receiverTask.resume();
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
            byte[] buffer = new byte[16384];
            try {
                BufferedInputStream in = new BufferedInputStream(socket.getInputStream());
                while (!socket.isClosed()) {
                    int bufferCount = in.read(buffer);
                    waitIfPaused();
                    if (bufferCount > 0) {
                        receiverListener.onData(socketId, Arrays.copyOfRange(buffer, 0, bufferCount));
                    } else if (bufferCount == -1) {
                        clientSocket.destroy();
                    }
                }
            } catch (IOException | InterruptedException ioe) {
                if (receiverListener != null && !socket.isClosed() && !clientSocket.closed) {
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
