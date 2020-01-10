package com.asterinet.react.tcpsocket;

import android.net.Network;
import android.os.AsyncTask;
import android.util.Pair;

import java.io.OutputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;

public class TcpSocketClient {
    private TcpReceiverTask receiverTask;
    private Socket socket;
    private TcpReceiverTask.OnDataReceivedListener mReceiverListener;

    protected Integer id;

    public TcpSocketClient() {

    }

    /**
     * TcpSocketClient constructor
     *
     * @param address      server address
     * @param port         server port
     * @param localAddress local address to bound to
     * @param localPort    local port to bound to
     */
    public TcpSocketClient(final TcpReceiverTask.OnDataReceivedListener receiverListener, final Integer id,
                           final String address, final Integer port, final String localAddress, final int localPort, final Network network)
            throws IOException {
        this.id = id;
        // Get the addresses
        InetAddress localInetAddress = InetAddress.getByName(localAddress);
        InetAddress remoteInetAddress = InetAddress.getByName(address);
        // Create the socket
        socket = new Socket();
        if (network != null)
            network.bindSocket(socket);
        socket.setReuseAddress(true);
        socket.bind(new InetSocketAddress(localInetAddress, localPort));
        socket.connect(new InetSocketAddress(remoteInetAddress, port));
        receiverTask = new TcpReceiverTask();
        mReceiverListener = receiverListener;
        receiverTask.executeOnExecutor(AsyncTask.THREAD_POOL_EXECUTOR, new Pair<>(this, receiverListener));
    }

    public TcpSocketClient(final TcpReceiverTask.OnDataReceivedListener receiverListener, final Integer id, final Socket socket) {
        this.id = id;
        this.socket = socket;
        receiverTask = new TcpReceiverTask();
        mReceiverListener = receiverListener;
        receiverTask.executeOnExecutor(AsyncTask.THREAD_POOL_EXECUTOR, new Pair<>(this, receiverListener));
    }


    public int getId() {
        return id;
    }

    public Socket getSocket() {
        return socket;
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
