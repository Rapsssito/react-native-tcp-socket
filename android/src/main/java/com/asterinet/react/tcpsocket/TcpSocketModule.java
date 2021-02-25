package com.asterinet.react.tcpsocket;


import android.annotation.SuppressLint;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.util.Base64;
import android.net.Network;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Callback;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.IOException;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

public class TcpSocketModule extends ReactContextBaseJavaModule implements TcpReceiverTask.OnDataReceivedListener {
    private static final String TAG = "TcpSockets";
    private static final int N_THREADS = 2;
    private final ReactApplicationContext mReactContext;
    private final ConcurrentHashMap<Integer, TcpSocket> socketMap = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Network> mNetworkMap = new ConcurrentHashMap<>();
    private final CurrentNetwork currentNetwork = new CurrentNetwork();
    private final ExecutorService executorService = Executors.newFixedThreadPool(N_THREADS);

    public TcpSocketModule(ReactApplicationContext reactContext) {
        super(reactContext);
        mReactContext = reactContext;
    }

    @Override
    public @NonNull
    String getName() {
        return TAG;
    }

    private void sendEvent(String eventName, WritableMap params) {
        mReactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, params);
    }

    /**
     * Creates a TCP Socket and establish a connection with the given host
     *
     * @param cId     socket ID
     * @param host    socket IP address
     * @param port    socket port to be bound
     * @param options extra options
     */
    @SuppressLint("StaticFieldLeak")
    @SuppressWarnings("unused")
    @ReactMethod
    public void connect(@NonNull final Integer cId, @NonNull final String host, @NonNull final Integer port, @NonNull final ReadableMap options) {
        executorService.execute(new Thread(new Runnable() {
            @Override
            public void run() {
                if (socketMap.get(cId) != null) {
                    onError(cId, TAG + "createSocket called twice with the same id.");
                    return;
                }
                try {
                    // Get the network interface
                    final String localAddress = options.hasKey("localAddress") ? options.getString("localAddress") : null;
                    final String iface = options.hasKey("interface") ? options.getString("interface") : null;
                    selectNetwork(iface, localAddress);
                    TcpSocketClient client = new TcpSocketClient(TcpSocketModule.this, cId, null);
                    socketMap.put(cId, client);
                    client.connect(mReactContext, host, port, options, currentNetwork.getNetwork());
                    onConnect(cId, client);
                } catch (Exception e) {
                    onError(cId, e.getMessage());
                }
            }
        }));
    }

    @SuppressLint("StaticFieldLeak")
    @SuppressWarnings("unused")
    @ReactMethod
    public void write(@NonNull final Integer cId, @NonNull final String base64String, @Nullable final Callback callback) {
        executorService.execute(new Thread(new Runnable() {
            @Override
            public void run() {
                TcpSocketClient socketClient = getTcpClient(cId);
                try {
                    socketClient.write(Base64.decode(base64String, Base64.NO_WRAP));
                    if (callback != null) {
                        callback.invoke();
                    }
                } catch (IOException e) {
                    if (callback != null) {
                        callback.invoke(e.toString());
                    }
                    onError(cId, e.toString());
                }
            }
        }));
    }

    @SuppressLint("StaticFieldLeak")
    @SuppressWarnings("unused")
    @ReactMethod
    public void end(final Integer cId) {
        executorService.execute(new Thread(new Runnable() {
            @Override
            public void run() {
                TcpSocketClient socketClient = getTcpClient(cId);
                socketClient.destroy();
                socketMap.remove(cId);
            }
        }));
    }

    @SuppressWarnings("unused")
    @ReactMethod
    public void destroy(final Integer cId) {
        end(cId);
    }

    @SuppressWarnings("unused")
    @ReactMethod
    public void close(final Integer cId) {
        executorService.execute(new Thread(new Runnable() {
            @Override
            public void run() {
                TcpSocketServer socketServer = getTcpServer(cId);
                socketServer.close();
                socketMap.remove(cId);
            }
        }));
    }

    @SuppressLint("StaticFieldLeak")
    @SuppressWarnings("unused")
    @ReactMethod
    public void listen(final Integer cId, final ReadableMap options) {
        executorService.execute(new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    TcpSocketServer server = new TcpSocketServer(socketMap, TcpSocketModule.this, cId, options);
                    socketMap.put(cId, server);
                    int port = server.getListeningPort();
                    String host = options.getString("host");
                    onListen(cId, server);
                } catch (Exception uhe) {
                    onError(cId, uhe.getMessage());
                }
            }
        }));
    }

    @SuppressWarnings("unused")
    @ReactMethod
    public void setNoDelay(@NonNull final Integer cId, final boolean noDelay) {
        final TcpSocketClient client = getTcpClient(cId);
        try {
            client.setNoDelay(noDelay);
        } catch (IOException e) {
            onError(cId, e.getMessage());
        }
    }

    @SuppressWarnings("unused")
    @ReactMethod
    public void setKeepAlive(@NonNull final Integer cId, final boolean enable, final int initialDelay) {
        final TcpSocketClient client = getTcpClient(cId);
        try {
            client.setKeepAlive(enable, initialDelay);
        } catch (IOException e) {
            onError(cId, e.getMessage());
        }
    }

    private void requestNetwork(final int transportType) throws InterruptedException {
        final NetworkRequest.Builder requestBuilder = new NetworkRequest.Builder();
        requestBuilder.addTransportType(transportType);
        final CountDownLatch awaitingNetwork = new CountDownLatch(1); // only needs to be counted down once to release waiting threads
        final ConnectivityManager cm = (ConnectivityManager) mReactContext.getSystemService(Context.CONNECTIVITY_SERVICE);
        cm.requestNetwork(requestBuilder.build(), new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                currentNetwork.setNetwork(network);
                awaitingNetwork.countDown(); // Stop waiting
            }

            @Override
            public void onUnavailable() {
                awaitingNetwork.countDown(); // Stop waiting
            }
        });
        // Timeout if there the network is unreachable
        ScheduledThreadPoolExecutor exec = new ScheduledThreadPoolExecutor(1);
        exec.schedule(new Runnable() {
            public void run() {
                awaitingNetwork.countDown(); // Stop waiting
            }
        }, 5, TimeUnit.SECONDS);
        awaitingNetwork.await();
    }

    // REQUEST NETWORK

    /**
     * Returns a network given its interface name:
     * "wifi" -> WIFI
     * "cellular" -> Cellular
     * etc...
     */
    private void selectNetwork(@Nullable final String iface, @Nullable final String ipAddress) throws InterruptedException, IOException {
        currentNetwork.setNetwork(null);
        if (iface == null) return;
        if (ipAddress != null) {
            final Network cachedNetwork = mNetworkMap.get(iface + ipAddress);
            if (cachedNetwork != null) {
                currentNetwork.setNetwork(cachedNetwork);
                return;
            }
        }
        switch (iface) {
            case "wifi":
                requestNetwork(NetworkCapabilities.TRANSPORT_WIFI);
                break;
            case "cellular":
                requestNetwork(NetworkCapabilities.TRANSPORT_CELLULAR);
                break;
            case "ethernet":
                requestNetwork(NetworkCapabilities.TRANSPORT_ETHERNET);
                break;
        }
        if (currentNetwork.getNetwork() == null) {
            throw new IOException("Interface " + iface + " unreachable");
        } else if (ipAddress != null && !ipAddress.equals("0.0.0.0"))
            mNetworkMap.put(iface + ipAddress, currentNetwork.getNetwork());
    }

    // TcpReceiverTask.OnDataReceivedListener

    @Override
    public void onConnect(Integer id, TcpSocketClient client) {
        WritableMap eventParams = Arguments.createMap();
        eventParams.putInt("id", id);
        WritableMap connectionParams = Arguments.createMap();
        final Socket socket = client.getSocket();
        final InetSocketAddress remoteAddress = (InetSocketAddress) socket.getRemoteSocketAddress();

        connectionParams.putString("localAddress", socket.getLocalAddress().getHostAddress());
        connectionParams.putInt("localPort", socket.getLocalPort());
        connectionParams.putString("remoteAddress", remoteAddress.getHostName());
        connectionParams.putInt("remotePort", socket.getPort());
        connectionParams.putString("remoteFamily", remoteAddress.getAddress() instanceof Inet6Address ? "IPv6" : "IPv4");
        eventParams.putMap("connection", connectionParams);
        sendEvent("connect", eventParams);
    }

    @Override
    public void onListen(Integer id, TcpSocketServer server) {
        WritableMap eventParams = Arguments.createMap();
        eventParams.putInt("id", id);
        WritableMap connectionParams = Arguments.createMap();
        final ServerSocket serverSocket = server.getServerSocket();
        final InetAddress address = serverSocket.getInetAddress();

        connectionParams.putString("localAddress", serverSocket.getInetAddress().getHostAddress());
        connectionParams.putInt("localPort", serverSocket.getLocalPort());
        connectionParams.putString("localFamily", address instanceof Inet6Address ? "IPv6" : "IPv4");
        eventParams.putMap("connection", connectionParams);
        sendEvent("listening", eventParams);
    }

    @Override
    public void onData(Integer id, byte[] data) {
        WritableMap eventParams = Arguments.createMap();
        eventParams.putInt("id", id);
        eventParams.putString("data", Base64.encodeToString(data, Base64.NO_WRAP));

        sendEvent("data", eventParams);
    }

    @Override
    public void onClose(Integer id, String error) {
        if (error != null) {
            onError(id, error);
        }
        WritableMap eventParams = Arguments.createMap();
        eventParams.putInt("id", id);
        eventParams.putBoolean("hadError", error != null);

        sendEvent("close", eventParams);
    }

    @Override
    public void onError(Integer id, String error) {
        WritableMap eventParams = Arguments.createMap();
        eventParams.putInt("id", id);
        eventParams.putString("error", error);

        sendEvent("error", eventParams);
    }

    @Override
    public void onConnection(Integer serverId, Integer clientId, Socket socket) {
        WritableMap eventParams = Arguments.createMap();
        eventParams.putInt("id", serverId);

        WritableMap infoParams = Arguments.createMap();
        infoParams.putInt("id", clientId);

        WritableMap connectionParams = Arguments.createMap();
        final InetSocketAddress remoteAddress = (InetSocketAddress) socket.getRemoteSocketAddress();

        connectionParams.putString("localAddress", socket.getLocalAddress().getHostAddress());
        connectionParams.putInt("localPort", socket.getLocalPort());
        connectionParams.putString("remoteAddress", remoteAddress.getHostName());
        connectionParams.putInt("remotePort", socket.getPort());
        connectionParams.putString("remoteFamily", remoteAddress.getAddress() instanceof Inet6Address ? "IPv6" : "IPv4");

        infoParams.putMap("connection", connectionParams);
        eventParams.putMap("info", infoParams);

        sendEvent("connection", eventParams);
    }

    private TcpSocketClient getTcpClient(final int id) {
        TcpSocket socket = socketMap.get(id);
        if (socket == null) {
            throw new IllegalArgumentException(TAG + "No socket with id " + id);
        }
        if (!(socket instanceof TcpSocketClient)) {
            throw new IllegalArgumentException(TAG + "Socket with id " + id + " is not a client");
        }
        return (TcpSocketClient) socket;
    }

    private TcpSocketServer getTcpServer(final int id) {
        TcpSocket socket = socketMap.get(id);
        if (socket == null) {
            throw new IllegalArgumentException(TAG + "No socket with id " + id);
        }
        if (!(socket instanceof TcpSocketServer)) {
            throw new IllegalArgumentException(TAG + "Socket with id " + id + " is not a server");
        }
        return (TcpSocketServer) socket;
    }

    private static class CurrentNetwork {
        @Nullable
        Network network = null;

        private CurrentNetwork() {
        }

        @Nullable
        private Network getNetwork() {
            return network;
        }

        private void setNetwork(@Nullable final Network network) {
            this.network = network;
        }
    }
}
