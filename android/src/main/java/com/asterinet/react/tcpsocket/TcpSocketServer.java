package com.asterinet.react.tcpsocket;

import android.os.AsyncTask;
import android.util.SparseArray;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;

public class TcpSocketServer extends TcpSocketClient {
    private ServerSocket serverSocket;
    private TcpReceiverTask.OnDataReceivedListener receiverListener;
    private int clientSocketIds;
    private SparseArray<TcpSocketClient> socketClients;
    private SparseArray<TcpSocketClient> serverSocketClients = new SparseArray<>();

    private AsyncTask listening = new AsyncTask() {
        @Override
        protected Void doInBackground(Object[] objects) {
            try {
                while (!isCancelled() && !serverSocket.isClosed()) {
                    Socket socket = serverSocket.accept();
                    Integer clientId = getClientId();
                    TcpSocketClient socketClient = new TcpSocketClient(receiverListener, clientId, socket);
                    serverSocketClients.put(clientId, socketClient);
                    socketClients.put(clientId, socketClient);
                    receiverListener.onConnection(getId(), clientId, new InetSocketAddress(socket.getInetAddress(), socket.getPort()));
                }
            } catch (IOException e) {
                if (!serverSocket.isClosed()){
                    receiverListener.onError(getId(), e.getMessage());
                }                
            }
            return null;
        }
    };


    public TcpSocketServer(final SparseArray<TcpSocketClient> socketClients, final TcpReceiverTask.OnDataReceivedListener receiverListener, final Integer id,
                           final String address, final Integer port) throws IOException {
        this.id = id;
        this.socketClients = socketClients;
        clientSocketIds = this.id * 1000;
        // Get the addresses
        InetAddress localInetAddress = InetAddress.getByName(address);
        // Create the socket
        serverSocket = new ServerSocket(port, 50, localInetAddress);
        this.receiverListener = receiverListener;
        listen();
    }

    /**
     * Next id for a client socket
     *
     * @return
     */
    private int getClientId() {
        return clientSocketIds++;
    }

    private void listen() {
        listening.executeOnExecutor(AsyncTask.THREAD_POOL_EXECUTOR);
    }

    @Override
    public void write(final byte[] data) {
        receiverListener.onError(getId(), "SERVER CANNOT WRITE");
    }

    @Override
    public void close() throws IOException {
        if (listening != null && !listening.isCancelled()) {
            // stop the receiving task
            listening.cancel(true);
        }

        // close the socket
        if (serverSocket != null && !serverSocket.isClosed()) {
            closeAllClients();
            serverSocket.close();
            serverSocket = null;
        }
    }

    private void closeAllClients() throws IOException {
        /**
         * Closes all the sockets connected to the server
         */
        for (int i = 0; i < serverSocketClients.size(); i++) {
            int key = serverSocketClients.keyAt(i);
            TcpSocketClient socket = serverSocketClients.get(key);
            socket.close();
        }
        serverSocketClients.clear();
    }
}
