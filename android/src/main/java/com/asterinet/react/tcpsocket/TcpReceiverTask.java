package com.asterinet.react.tcpsocket;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.net.Socket;
import java.util.Arrays;

/**
 * This is a specialized Runnable that receives data from a socket in the background, and
 * notifies it's listener when data is received.  This is not threadsafe, the listener
 * should handle synchronicity.
 */
public class TcpReceiverTask implements Runnable {

    private final TcpSocketClient clientSocket;
    private final TcpEventListener receiverListener;
    private boolean paused = false;

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
        byte[] buffer = new byte[16384];
        try {
            BufferedInputStream in = new BufferedInputStream(socket.getInputStream());
            while (!socket.isClosed()) {
                int bufferCount = in.read(buffer);
                waitIfPaused();
                if (bufferCount > 0) {
                    receiverListener.onData(socketId, Arrays.copyOfRange(buffer, 0, bufferCount));
                } else if (bufferCount == -1) {
                    clientSocket.destroy();
                }
            }
        } catch (IOException | InterruptedException ioe) {
            if (receiverListener != null && !socket.isClosed()) {
                receiverListener.onError(socketId, ioe.getMessage());
            }
        }
    }

    public synchronized void pause() {
        paused = true;
    }

    public synchronized void resume() {
        paused = false;
        notify();
    }

    private synchronized void waitIfPaused() throws InterruptedException {
        while (paused) {
            wait();
        }
    }
}