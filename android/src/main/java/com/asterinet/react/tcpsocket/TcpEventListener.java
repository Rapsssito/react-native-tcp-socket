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

    // VENHO Phase 1: the read loop no longer calls onData OR a legacy
    // "readable" emit. Bytes go into the C++ TcpInboundRegistry via JNI;
    // the readable signal is delivered through the JSI CallInvoker
    // (TcpDataBridge::signalReadable), NOT this RCTDeviceEventEmitter.
    // Milestone-1d proved ANY per-chunk legacy-bridge crossing OOMs
    // (invokeJavaMethod → folly::dynamic backlog), even a tiny {id} map.

    public void onEnd(int id) {
        WritableMap eventParams = Arguments.createMap();
        eventParams.putInt("id", id);
        sendEvent("end", eventParams);
    }

    // VENHO Phase 1: onWritten() is REMOVED. It ran once PER WRITE and
    // built a WritableMap → RCTDeviceEventEmitter.emit("written",…),
    // accumulating an unbounded nested folly::dynamic in the bridgeless
    // event-emitter queue under libp2p volume — Scenario-C OOM #2 (same
    // class of bug milestone-1d hit on the readable side). The per-write
    // ACK now goes through the JSI CallInvoker
    // (TcpDataBridge::signalWritten via TcpSenderTask), never this
    // legacy bridge. pre-Alpha = clean break, not a stub.

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
