package com.asterinet.react.tcpsocket;

import com.facebook.react.bridge.ReadableMap;

import java.io.IOException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class TcpSocketServer extends TcpSocket {
    private final TcpEventListener mReceiverListener;
    private final ExecutorService listenExecutor;
    private final ConcurrentHashMap<Integer, TcpSocket> socketClients;
    private ServerSocket serverSocket;
    private int clientSocketIds;

    public TcpSocketServer(final ConcurrentHashMap<Integer, TcpSocket> socketClients, final TcpEventListener receiverListener, final Integer id,
                           final ReadableMap options) throws IOException {
        super(id);
        listenExecutor = Executors.newSingleThreadExecutor();
        // Get data from options
        int port = options.getInt("port");
        String address = options.getString("host");
        this.socketClients = socketClients;
        clientSocketIds = (1 + getId()) * 1000;
        // Get the addresses
        InetAddress localInetAddress = InetAddress.getByName(address);
        // Create the socket
        serverSocket = new ServerSocket(port, 50, localInetAddress);

        // setReuseAddress
        try {
            boolean reuseAddress = options.getBoolean("reuseAddress");
            serverSocket.setReuseAddress(reuseAddress);
        } catch (Exception e) {
            // Default to true
            serverSocket.setReuseAddress(true);
        }
        mReceiverListener = receiverListener;
        listen();
    }

    public ServerSocket getServerSocket() {
        return serverSocket;
    }

    private void addClient(Socket socket) {
        int clientId = getClientId();
        TcpSocketClient socketClient = new TcpSocketClient(mReceiverListener, clientId, socket);
        socketClients.put(clientId, socketClient);
        mReceiverListener.onConnection(getId(), clientId, socket);
        socketClient.startListening();
    }

    /**
     * Next ID for a client socket
     *
     * @return The next ID for a client socket
     */
    private int getClientId() {
        return clientSocketIds++;
    }

    private void listen() {
        TcpListenTask tcpListenTask = new TcpListenTask(this, mReceiverListener);
        listenExecutor.execute(tcpListenTask);
    }

    public void close() {
        try {
            // close the socket
            if (serverSocket != null && !serverSocket.isClosed()) {
                serverSocket.close();
                mReceiverListener.onClose(getId(), null);
                serverSocket = null;
            }
        } catch (IOException e) {
            mReceiverListener.onClose(getId(), e.getMessage());
        }
    }

    private static class TcpListenTask implements Runnable {
        private final TcpEventListener receiverListener;
        private final TcpSocketServer server;

        private TcpListenTask(TcpSocketServer server, TcpEventListener receiverListener) {
            this.server = server;
            this.receiverListener = receiverListener;
        }

        @Override
        public void run() {
            ServerSocket serverSocket = server.getServerSocket();
            try {
                while (!serverSocket.isClosed()) {
                    Socket socket = serverSocket.accept();
                    server.addClient(socket);
                }
            } catch (IOException e) {
                if (!serverSocket.isClosed()) {
                    receiverListener.onError(server.getId(), e.getMessage());
                }
            }
        }
    }
}
