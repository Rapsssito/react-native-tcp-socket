package com.asterinet.react.tcpsocket;

import android.net.Network;
import android.os.AsyncTask;
import android.util.Pair;

import com.facebook.react.bridge.ReadableMap;

import java.io.OutputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;

import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

class TcpSocketClient {
    private TcpReceiverTask receiverTask;
    private Socket socket;
    private TcpReceiverTask.OnDataReceivedListener mReceiverListener;

    private final int id;

    TcpSocketClient(final int id) {
        this.id = id;
    }

    TcpSocketClient(@NonNull final TcpReceiverTask.OnDataReceivedListener receiverListener, @NonNull final Integer id, @Nullable final Socket socket) {
        this(id);
        this.socket = socket;
        receiverTask = new TcpReceiverTask();
        mReceiverListener = receiverListener;
    }


    public int getId() {
        return id;
    }

    public Socket getSocket() {
        return socket;
    }

    public void connect(@NonNull final String address, @NonNull final Integer port, @NonNull final ReadableMap options, @Nullable final Network network) throws IOException {
        if (socket != null) throw new IOException("Already connected");
        final boolean isTls = options.hasKey("tls") && options.getBoolean("tls");
        if (isTls) {
            final SSLSocket sslSocket = (SSLSocket) SSLSocketFactory.getDefault().createSocket();
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
        //noinspection unchecked
        receiverTask.executeOnExecutor(AsyncTask.THREAD_POOL_EXECUTOR, new Pair<>(this, mReceiverListener));
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
    public void close() {
        try {
            if (receiverTask != null && !receiverTask.isCancelled()) {
                // stop the receiving task
                receiverTask.cancel(true);
            }
            // close the socket
            if (socket != null && !socket.isClosed()) {
                socket.close();
                mReceiverListener.onClose(getId(), null);
                socket = null;
            }
        } catch (IOException e) {
            mReceiverListener.onClose(getId(), e.getMessage());
        }
    }
}
