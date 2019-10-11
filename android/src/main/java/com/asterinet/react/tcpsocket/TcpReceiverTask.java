package com.asterinet.react.tcpsocket;

import android.os.AsyncTask;
import android.util.Pair;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.util.Arrays;
import java.net.Socket;

/**
 * This is a specialized AsyncTask that receives data from a socket in the background, and
 * notifies it's listener when data is received.  This is not threadsafe, the listener
 * should handle synchronicity.
 */
public class TcpReceiverTask extends AsyncTask<Pair<TcpSocketClient, TcpReceiverTask.OnDataReceivedListener>, Void, Void> {
    /**
     * An infinite loop to block and read data from the socket.
     */
    @Override
    protected Void doInBackground(Pair<TcpSocketClient, TcpReceiverTask.OnDataReceivedListener>... params) {
        if (params.length > 1) {
            throw new IllegalArgumentException("This task is only for a single socket/listener pair.");
        }

        TcpSocketClient clientSocket = params[0].first;
        OnDataReceivedListener receiverListener = params[0].second;
        int socketId = clientSocket.getId();
        Socket socket = clientSocket.getSocket();
        byte[] buffer = new byte[8192];
        int bufferCount;
        try {
            BufferedInputStream in = new BufferedInputStream(socket.getInputStream());
            while (!isCancelled()) {
                bufferCount = in.read(buffer);
                if (bufferCount > 0) {
                    receiverListener.onData(socketId, Arrays.copyOfRange(buffer, 0, bufferCount));
                }
            }
        } catch (IOException ioe) {
            if (receiverListener != null) {
                receiverListener.onError(socketId, ioe.getMessage());
            }
            this.cancel(false);
        }
        return null;
    }

    /**
     * Listener interface for receive events.
     */
    public interface OnDataReceivedListener {
        void onConnection(Integer serverId, Integer clientId, InetSocketAddress socketAddress);

        void onConnect(Integer id, String host, int port);

        void onData(Integer id, byte[] data);

        void onClose(Integer id, String error);

        void onError(Integer id, String error);
    }
}
