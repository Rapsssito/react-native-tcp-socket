package com.asterinet.react.tcpsocket;

import android.content.Context;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.AsyncTask;
import android.util.Pair;
import android.net.ConnectivityManager;

import java.util.concurrent.CountDownLatch;
import java.io.OutputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;

public class TcpSocketClient {
    private TcpReceiverTask receiverTask;
    private Socket socket;

    protected Integer id;
    protected Network selectedNetwork;

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
    public TcpSocketClient(final Context context, final TcpReceiverTask.OnDataReceivedListener receiverListener, final Integer id,
                           final String address, final Integer port, final String localAddress, final int localPort, final String iface)
            throws IOException, InterruptedException {
        this.id = id;
        // Get the network interface
        selectNetwork(context, iface);
        // Get the addresses
        InetAddress localInetAddress = InetAddress.getByName(localAddress);
        InetAddress remoteInetAddress = InetAddress.getByName(address);
        // Create the socket
        socket = new Socket();
        selectedNetwork.bindSocket(socket);
        socket.setReuseAddress(true);
        socket.bind(new InetSocketAddress(localInetAddress, localPort));
        socket.connect(new InetSocketAddress(remoteInetAddress, port));
        receiverTask = new TcpReceiverTask();
        receiverTask.executeOnExecutor(AsyncTask.THREAD_POOL_EXECUTOR, new Pair<>(this, receiverListener));
    }

    public TcpSocketClient(final TcpReceiverTask.OnDataReceivedListener receiverListener, final Integer id, final Socket socket) {
        this.id = id;
        this.socket = socket;
        receiverTask = new TcpReceiverTask();
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
     * @param data
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

    private void selectNetwork(final Context context, final String iface) throws InterruptedException {
        /**
         * Returns a network given its interface name:
         * "wifi" -> WIFI
         * "cellular" -> Cellular
         * etc...
         */
        final CountDownLatch awaitingNetwork = new CountDownLatch(1); // only needs to be counted down once to release waiting threads
        final ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkRequest.Builder requestBuilder = new NetworkRequest.Builder();

        switch (iface) {
            case "wifi":
                requestBuilder.addTransportType(NetworkCapabilities.TRANSPORT_WIFI);
                cm.requestNetwork(requestBuilder.build(), new ConnectivityManager.NetworkCallback() {
                    @Override
                    public void onAvailable(Network network) {
                        selectedNetwork = network;
                        awaitingNetwork.countDown(); // Stop waiting
                    }

                    @Override
                    public void onUnavailable() {
                        awaitingNetwork.countDown(); // Stop waiting
                    }
                });
                awaitingNetwork.await();
                break;
            default:
                selectedNetwork = cm.getActiveNetwork();
                break;
        }

    }
}
