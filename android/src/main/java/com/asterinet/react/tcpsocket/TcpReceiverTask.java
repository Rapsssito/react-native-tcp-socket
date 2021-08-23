package com.asterinet.react.tcpsocket;

import android.os.AsyncTask;
import android.util.Pair;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.util.Arrays;
import java.net.Socket;

/**
 * This is a specialized AsyncTask that receives data from a socket in the background, and
 * notifies it's listener when data is received.  This is not threadsafe, the listener
 * should handle synchronicity.
 */
class TcpReceiverTask extends AsyncTask<Pair<TcpSocketClient, TcpEventListener>, Void, Void> {
    /**
     * An infinite loop to block and read data from the socket.
     */
    @SafeVarargs
    @Override
    protected final Void doInBackground(Pair<TcpSocketClient, TcpEventListener>... params) {
        if (params.length > 1) {
            throw new IllegalArgumentException("This task is only for a single socket/listener pair.");
        }

        TcpSocketClient clientSocket = params[0].first;
        TcpEventListener receiverListener = params[0].second;
        int socketId = clientSocket.getId();
        Socket socket = clientSocket.getSocket();
        byte[] buffer = new byte[8192];
        try {
            BufferedInputStream in = new BufferedInputStream(socket.getInputStream());
            while (!isCancelled() && !socket.isClosed()) {
                int bufferCount = in.read(buffer);
                if (bufferCount > 0) {
                    receiverListener.onData(socketId, Arrays.copyOfRange(buffer, 0, bufferCount));
                } else if (bufferCount == -1) {
                    clientSocket.destroy();
                }
            }
        } catch (IOException ioe) {
            if (receiverListener != null && !socket.isClosed()) {
                receiverListener.onError(socketId, ioe.getMessage());
            }
            this.cancel(false);
        }
        return null;
    }
}