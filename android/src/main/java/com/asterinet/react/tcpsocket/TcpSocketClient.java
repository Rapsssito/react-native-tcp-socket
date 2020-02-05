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

import androidx.annotation.Nullable;

class TcpSocketClient {
    private TcpReceiverTask receiverTask;
    private Socket socket;
    private TcpReceiverTask.OnDataReceivedListener mReceiverListener;

    private final int id;

    TcpSocketClient(final int id) {
        this.id = id;
    }

    TcpSocketClient(final TcpReceiverTask.OnDataReceivedListener receiverListener, final Integer id, @Nullable final Socket socket) {
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

    public void connect(final String address, final Integer port, final ReadableMap options, final Network network) throws IOException {
        if (socket != null) throw new IOException("Already connected");
        socket = new Socket();
        // Get the addresses
        String localAddress = options.getString("localAddress");
        InetAddress localInetAddress = InetAddress.getByName(localAddress);
        InetAddress remoteInetAddress = InetAddress.getByName(address);
        if (network != null)
            network.bindSocket(socket);
        // setReuseAddress
        try {
            boolean reuseAddress = options.getBoolean("reuseAddress");
            socket.setReuseAddress(reuseAddress);
        } catch (Exception e) {
            // Default to true
            socket.setReuseAddress(true);
        }
        // bind
        int localPort = options.getInt("localPort");
        socket.bind(new InetSocketAddress(localInetAddress, localPort));
        socket.connect(new InetSocketAddress(remoteInetAddress, port));
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
        if (socket != null && !socket.isClosed()) {
            OutputStream output = socket.getOutputStream();
            output.write(data);
        }
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
