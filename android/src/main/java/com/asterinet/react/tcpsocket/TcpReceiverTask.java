package com.asterinet.react.tcpsocket;

import android.os.AsyncTask;
import android.util.Pair;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.util.Arrays;
import java.net.Socket;

/**
 * This is a specialized Runnable that receives data from a socket in the background, and
 * notifies it's listener when data is received.  This is not threadsafe, the listener
 * should handle synchronicity.
 */
public class TcpReceiverTask implements Runnable {

    private final TcpSocketClient clientSocket;
    private final TcpEventListener receiverListener;

    public TcpReceiverTask(TcpSocketClient clientSocket, TcpEventListener receiverListener) {
        this.clientSocket = clientSocket;
        this.receiverListener = receiverListener;
    }

    /**
     * An infinite loop to block and read data from the socket.
     */
    @Override
    public void run() {
        int socketId = clientSocket.getId();
        Socket socket = clientSocket.getSocket();
        byte[] buffer = new byte[8192];
        try {
            BufferedInputStream in = new BufferedInputStream(socket.getInputStream());
            while (!socket.isClosed()) {
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
        }
    }
}