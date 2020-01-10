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
    private TcpReceiverTask.OnDataReceivedListener mReceiverListener;
    private int clientSocketIds;
    private SparseArray<TcpSocketClient> socketClients;
    private final SparseArray<TcpSocketClient> serverSocketClients = new SparseArray<>();

    private final AsyncTask listening = new AsyncTask() {
        @Override
        protected Void doInBackground(Object[] objects) {
            try {
                while (!isCancelled() && !serverSocket.isClosed()) {
                    Socket socket = serverSocket.accept();
                    int clientId = getClientId();
                    TcpSocketClient socketClient = new TcpSocketClient(mReceiverListener, clientId, socket);
                    serverSocketClients.put(clientId, socketClient);
                    socketClients.put(clientId, socketClient);
                    mReceiverListener.onConnection(getId(), clientId, new InetSocketAddress(socket.getInetAddress(), socket.getPort()));
                }
            } catch (IOException e) {
                if (!serverSocket.isClosed()) {
                    mReceiverListener.onError(getId(), e.getMessage());
                }
            }
            return null;
        }
    };


    public TcpSocketServer(final SparseArray<TcpSocketClient> socketClients, final TcpReceiverTask.OnDataReceivedListener receiverListener, final Integer id,
                           final String address, final Integer port) throws IOException {
        super(id);
        this.socketClients = socketClients;
        clientSocketIds = (1 + getId()) * 1000;
        // Get the addresses
        InetAddress localInetAddress = InetAddress.getByName(address);
        // Create the socket
        serverSocket = new ServerSocket(port, 50, localInetAddress);
        mReceiverListener = receiverListener;
        listen();
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
        listening.executeOnExecutor(AsyncTask.THREAD_POOL_EXECUTOR);
    }

    @Override
    public void write(final byte[] data) {
        mReceiverListener.onError(getId(), "SERVER CANNOT WRITE");
    }

    @Override
    public void close() {
        try {
            if (listening != null && !listening.isCancelled()) {
                // stop the receiving task
                listening.cancel(true);
            }

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
}
