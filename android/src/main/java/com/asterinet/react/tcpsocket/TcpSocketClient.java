package com.asterinet.react.tcpsocket;

import android.content.Context;
import android.net.Network;

import com.facebook.react.bridge.ReadableMap;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.security.GeneralSecurityException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import javax.net.SocketFactory;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

class TcpSocketClient extends TcpSocket {
    private final ExecutorService executorService;
    private final TcpEventListener receiverListener;
    private Future<?> receiverFuture;
    private Socket socket;

    TcpSocketClient(@NonNull final TcpEventListener receiverListener, @NonNull final Integer id, @Nullable final Socket socket) {
        super(id);
        executorService = Executors.newFixedThreadPool(1);
        this.socket = socket;
        this.receiverListener = receiverListener;
    }

    public Socket getSocket() {
        return socket;
    }

    public void connect(@NonNull final Context context, @NonNull final String address, @NonNull final Integer port, @NonNull final ReadableMap options, @Nullable final Network network) throws IOException, GeneralSecurityException {
        if (socket != null) throw new IOException("Already connected");
        final boolean isTls = options.hasKey("tls") && options.getBoolean("tls");
        if (isTls) {
            SocketFactory sf;
            if (options.hasKey("tlsCheckValidity") && !options.getBoolean("tlsCheckValidity")) {
                sf = SSLCertificateHelper.createBlindSocketFactory();
            } else {
                final String customTlsCert = options.hasKey("tlsCert") ? options.getString("tlsCert") : null;
                sf = customTlsCert != null ? SSLCertificateHelper.createCustomTrustedSocketFactory(context, customTlsCert) : SSLSocketFactory.getDefault();
            }
            final SSLSocket sslSocket = (SSLSocket) sf.createSocket();
            sslSocket.setUseClientMode(true);
            socket = sslSocket;
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
        if (isTls) ((SSLSocket) socket).startHandshake();
        startListening();
    }

    public void startListening() {
        Runnable receiverTask = new TcpReceiverTask(this, receiverListener);
        receiverFuture = executorService.submit(receiverTask);
    }

    /**
     * Sends data from the socket
     *
     * @param data data to be sent
     */
    public void write(final byte[] data) throws IOException {
        if (socket == null) {
            throw new IOException("Socket is not connected.");
        }
        OutputStream output = socket.getOutputStream();
        output.write(data);
    }

    /**
     * Shuts down the receiver task, closing the socket.
     */
    public void destroy() {
        try {
            if (receiverFuture != null && !receiverFuture.isCancelled()) {
                // stop the receiving task
                receiverFuture.cancel(true);
                executorService.shutdown();
                receiverFuture = null;
            }
            // close the socket
            if (socket != null && !socket.isClosed()) {
                socket.close();
                receiverListener.onClose(getId(), null);
                socket = null;
            }
        } catch (IOException e) {
            receiverListener.onClose(getId(), e.getMessage());
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

    }

    public void resume() {

    }
}
