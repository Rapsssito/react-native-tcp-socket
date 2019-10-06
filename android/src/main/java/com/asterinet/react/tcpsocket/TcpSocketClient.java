package com.asterinet.react.tcpsocket;

import androidx.annotation.Nullable;
import android.os.AsyncTask;
import android.util.Pair;

import java.io.OutputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.net.Socket;

public final class TcpSocketClient{
    private final TcpReceiverTask.OnDataReceivedListener receiverListener;
    private TcpReceiverTask receiverTask;
    private Integer id;
    private Socket socket;

    public static final String TAG = "TcpSocketClient";

    /**
     * TcpSocketClient constructor
     *
     * @param address      server address
     * @param port         server port
     * @param localAddress local address to bound to
     * @param localPort    local port to bound to
     */
    public TcpSocketClient(TcpReceiverTask.OnDataReceivedListener receiverListener, final Integer id, final @Nullable String address, final Integer port, final @Nullable String localAddress, final int localPort) throws IOException {
        // Normalize arguments
        InetAddress localInetAddress;
        localInetAddress = InetAddress.getByName(localAddress);
        // Create the socket
        socket = new Socket(address, port, localInetAddress, localPort);
        this.id = id;
        this.receiverListener = receiverListener;
        receiverTask.executeOnExecutor(AsyncTask.THREAD_POOL_EXECUTOR, new Pair<>(this, receiverListener));
    }

    public int getId(){
        return id;
    }

    public Socket getSocket(){
        return socket;
    }

    /**
     * Sends data from the socket
     *
     * @param data
     */
    public void write(final byte[] data) throws IOException {
        OutputStream output = socket.getOutputStream();
        output.write(data);
    }

    /**
     * Shuts down the receiver task, closing the socket.
     */
    public void close() throws IOException {
        if (receiverTask != null && !receiverTask.isCancelled()) {
            // stop the receiving task
            receiverTask.cancel(true);
        }

        // close the socket
        if (socket != null && !socket.isClosed()) {
            socket.close();
            socket = null;
        }
    }
}
