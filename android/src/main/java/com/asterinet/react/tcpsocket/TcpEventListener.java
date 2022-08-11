package com.asterinet.react.tcpsocket;

import android.util.Base64;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;

import javax.annotation.Nullable;

public class TcpEventListener {

    private final DeviceEventManagerModule.RCTDeviceEventEmitter rctEvtEmitter;

    public TcpEventListener(final ReactContext reactContext) {
        rctEvtEmitter = reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class);
    }

    public void onConnection(int serverId, int clientId, Socket socket) {
        onSocketConnection("connection", serverId, clientId, socket);
    }

    public void onSecureConnection(int serverId, int clientId, Socket socket) {
        onSocketConnection("secureConnection", serverId, clientId, socket);
    }

    private void onSocketConnection(String connectionType, int serverId, int clientId, Socket socket) {
        WritableMap eventParams = Arguments.createMap();
        eventParams.putInt("id", serverId);

        WritableMap infoParams = Arguments.createMap();
        infoParams.putInt("id", clientId);

        WritableMap connectionParams = Arguments.createMap();
        InetSocketAddress remoteAddress = (InetSocketAddress) socket.getRemoteSocketAddress();

        connectionParams.putString("localAddress", socket.getLocalAddress().getHostAddress());
        connectionParams.putInt("localPort", socket.getLocalPort());
        connectionParams.putString("remoteAddress", remoteAddress.getAddress().getHostAddress());
        connectionParams.putInt("remotePort", socket.getPort());
        connectionParams.putString("remoteFamily", remoteAddress.getAddress() instanceof Inet6Address ? "IPv6" : "IPv4");

        infoParams.putMap("connection", connectionParams);
        eventParams.putMap("info", infoParams);

        sendEvent(connectionType, eventParams);
    }

    public void onConnect(int id, TcpSocketClient client) {
        WritableMap eventParams = Arguments.createMap();
        eventParams.putInt("id", id);
        WritableMap connectionParams = Arguments.createMap();
        Socket socket = client.getSocket();
        InetSocketAddress remoteAddress = (InetSocketAddress) socket.getRemoteSocketAddress();

        connectionParams.putString("localAddress", socket.getLocalAddress().getHostAddress());
        connectionParams.putInt("localPort", socket.getLocalPort());
        connectionParams.putString("remoteAddress", remoteAddress.getAddress().getHostAddress());
        connectionParams.putInt("remotePort", socket.getPort());
        connectionParams.putString("remoteFamily", remoteAddress.getAddress() instanceof Inet6Address ? "IPv6" : "IPv4");
        eventParams.putMap("connection", connectionParams);
        sendEvent("connect", eventParams);
    }

    public void onListen(int id, TcpSocketServer server) {
        WritableMap eventParams = Arguments.createMap();
        eventParams.putInt("id", id);
        WritableMap connectionParams = Arguments.createMap();
        ServerSocket serverSocket = server.getServerSocket();
        InetAddress address = serverSocket.getInetAddress();

        connectionParams.putString("localAddress", serverSocket.getInetAddress().getHostAddress());
        connectionParams.putInt("localPort", serverSocket.getLocalPort());
        connectionParams.putString("localFamily", address instanceof Inet6Address ? "IPv6" : "IPv4");
        eventParams.putMap("connection", connectionParams);
        sendEvent("listening", eventParams);
    }

    public void onData(int id, byte[] data) {
        WritableMap eventParams = Arguments.createMap();
        eventParams.putInt("id", id);
        eventParams.putString("data", Base64.encodeToString(data, Base64.NO_WRAP));

        sendEvent("data", eventParams);
    }

    public void onWritten(int id, int msgId, @Nullable Exception e) {
        String error = null;
        if (e != null) {
            Log.e(TcpSocketModule.TAG, "Exception on socket " + id, e);
            error = e.getMessage();
        }
        WritableMap eventParams = Arguments.createMap();
        eventParams.putInt("id", id);
        eventParams.putInt("msgId", msgId);
        eventParams.putString("err", error);

        sendEvent("written", eventParams);
    }

    public void onClose(int id, Exception e) {
        if (e != null) {
            onError(id, e);
        }
        WritableMap eventParams = Arguments.createMap();
        eventParams.putInt("id", id);
        eventParams.putBoolean("hadError", e != null);

        sendEvent("close", eventParams);
    }

    public void onError(int id, Exception e) {
        Log.e(TcpSocketModule.TAG, "Exception on socket " + id, e);
        String error = e.getMessage();
        WritableMap eventParams = Arguments.createMap();
        eventParams.putInt("id", id);
        eventParams.putString("error", error);

        sendEvent("error", eventParams);
    }

    private void sendEvent(String eventName, WritableMap params) {
        rctEvtEmitter.emit(eventName, params);
    }
}
