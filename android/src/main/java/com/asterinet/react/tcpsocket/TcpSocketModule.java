package com.asterinet.react.tcpsocket;


import android.annotation.SuppressLint;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.util.Base64;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Promise;

import java.io.IOException;
import java.net.Inet4Address;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

public class TcpSocketModule extends ReactContextBaseJavaModule {
    public static final String TAG = "TcpSockets";
    private static final int N_THREADS = 2;
    private final ReactApplicationContext mReactContext;
    private final ConcurrentHashMap<Integer, TcpSocket> socketMap = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, ReadableMap> pendingTLS = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Network> mNetworkMap = new ConcurrentHashMap<>();
    private final CurrentNetwork currentNetwork = new CurrentNetwork();
    private final ExecutorService executorService = Executors.newFixedThreadPool(N_THREADS);
    private TcpEventListener tcpEvtListener;

    public TcpSocketModule(ReactApplicationContext reactContext) {
        super(reactContext);
        mReactContext = reactContext;
    }

    @Override
    public void initialize() {
        super.initialize();
        tcpEvtListener = new TcpEventListener(mReactContext);
    }

    @Override
    public @NonNull
    String getName() {
        return TAG;
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
        executorService.execute(new Runnable() {
            @Override
            public void run() {
                if (socketMap.get(cId) != null) {
                    tcpEvtListener.onError(cId, new Exception("connect() called twice with the same id."));
                    return;
                }
                try {
                    // Get the network interface
                    final String localAddress = options.hasKey("localAddress") ? options.getString("localAddress") : null;
                    final String iface = options.hasKey("interface") ? options.getString("interface") : null;
                    // Get ioT device host to retreive correct network in android concurrent connections
                    final String iotDeviceHost = options.hasKey("host") ? options.getString("host") : null;
                    selectNetwork(iface, localAddress, iotDeviceHost);
                    TcpSocketClient client = new TcpSocketClient(tcpEvtListener, cId, null);
                    socketMap.put(cId, client);
                    ReadableMap tlsOptions = pendingTLS.get(cId);
                    client.connect(mReactContext, host, port, options, currentNetwork.getNetwork(), tlsOptions);
                    tcpEvtListener.onConnect(cId, client);
                } catch (Exception e) {
                    tcpEvtListener.onError(cId, e);
                }
            }
        });
    }

    @SuppressLint("StaticFieldLeak")
    @SuppressWarnings("unused")
    @ReactMethod
    public void startTLS(final int cId, @NonNull final ReadableMap tlsOptions) {
        TcpSocketClient socketClient = (TcpSocketClient) socketMap.get(cId);
        // Not yet connected
        if (socketClient == null) {
            pendingTLS.put(cId, tlsOptions);
        } else {
            try {
                socketClient.startTLS(mReactContext, tlsOptions);
            } catch (Exception e) {
                tcpEvtListener.onError(cId, e);
            }
        }
    }

    @SuppressLint("StaticFieldLeak")
    @SuppressWarnings("unused")
    @ReactMethod
    public void write(final int cId, @NonNull final String base64String, final int msgId) {
        TcpSocketClient socketClient = getTcpClient(cId);
        byte[] data = Base64.decode(base64String, Base64.NO_WRAP);
        socketClient.write(msgId, data);
    }

    @SuppressLint("StaticFieldLeak")
    @SuppressWarnings("unused")
    @ReactMethod
    public void end(final Integer cId) {
        executorService.execute(new Runnable() {
            @Override
            public void run() {
                TcpSocketClient socketClient = getTcpClient(cId);
                socketClient.destroy();
            }
        });
    }

    @SuppressWarnings("unused")
    @ReactMethod
    public void destroy(final Integer cId) {
        end(cId);
    }

    @SuppressWarnings("unused")
    @ReactMethod
    public void close(final Integer cId) {
        executorService.execute(new Runnable() {
            @Override
            public void run() {
                TcpSocketServer socketServer = getTcpServer(cId);
                socketServer.close();
                socketMap.remove(cId);
            }
        });
    }

    @SuppressLint("StaticFieldLeak")
    @SuppressWarnings("unused")
    @ReactMethod
    public void listen(final Integer cId, final ReadableMap options) {
        executorService.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    TcpSocketServer server = new TcpSocketServer(mReactContext, socketMap, tcpEvtListener, cId, options);
                    socketMap.put(cId, server);
                    tcpEvtListener.onListen(cId, server);
                } catch (Exception uhe) {
                    tcpEvtListener.onError(cId, uhe);
                }
            }
        });
    }

    @SuppressWarnings("unused")
    @ReactMethod
    public void setNoDelay(@NonNull final Integer cId, final boolean noDelay) {
        final TcpSocketClient client = getTcpClient(cId);
        try {
            client.setNoDelay(noDelay);
        } catch (IOException e) {
            tcpEvtListener.onError(cId, e);
        }
    }

    @SuppressWarnings("unused")
    @ReactMethod
    public void setKeepAlive(@NonNull final Integer cId, final boolean enable, final int initialDelay) {
        final TcpSocketClient client = getTcpClient(cId);
        try {
            client.setKeepAlive(enable, initialDelay);
        } catch (IOException e) {
            tcpEvtListener.onError(cId, e);
        }
    }

    @SuppressWarnings("unused")
    @ReactMethod
    public void pause(final int cId) {
        TcpSocketClient client = getTcpClient(cId);
        client.pause();
    }

    @SuppressWarnings("unused")
    @ReactMethod
    public void resume(final int cId) {
        TcpSocketClient client = getTcpClient(cId);
        client.resume();
    }

    @SuppressWarnings("unused")
    @ReactMethod
    public void addListener(String eventName) {
        // Keep: Required for RN built in Event Emitter Calls.
    }

    @SuppressWarnings("unused")
    @ReactMethod
    public void removeListeners(Integer count) {
        // Keep: Required for RN built in Event Emitter Calls.
    }

    private void requestNetwork(final int transportType, @Nullable final String iotDeviceHost) throws InterruptedException {
        final NetworkRequest.Builder requestBuilder = new NetworkRequest.Builder();
        requestBuilder.addTransportType(transportType);
        final CountDownLatch awaitingNetwork = new CountDownLatch(1); // only needs to be counted down once to release waiting threads
        final ConnectivityManager cm = (ConnectivityManager) mReactContext.getSystemService(Context.CONNECTIVITY_SERVICE);

        if(iotDeviceHost==null || Objects.equals(iotDeviceHost, "localhost")) {
            // Use old behavior if "host" param not specified on configuration array - default value "localhost" used
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
        } else {
            // smartmedev - add support for for concurrent-connections:
            // Route all data to the ioT device network interface if exist more than one concurrent network
            // See: https://developer.android.com/about/versions/12/behavior-changes-12#concurrent-connections
            if (cm != null) {
                // Get all connected networks
                Network[] allNetworks = cm.getAllNetworks();
                List<Network> wifiNetworks = new ArrayList<>();

                // Check exist at least one newtwork
                if (allNetworks != null && allNetworks.length > 0) {
                    // Filter for retreive only networks based on selected transport type
                    for (Network network : allNetworks) {
                        NetworkCapabilities nc = cm.getNetworkCapabilities(network);
                        if (nc != null && nc.hasTransport(transportType)) {
                            wifiNetworks.add(network);
                        }
                    }

                    // Check exist at least one newtwork based on selected transport type
                    if (!wifiNetworks.isEmpty()) {
                        boolean networkFound = false;
                        for (Network network : wifiNetworks) {
                            LinkProperties linkProperties = cm.getLinkProperties(network);
                            // Ensure linkProperties is not null
                            if (linkProperties == null)
                                continue;

                            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                                Inet4Address foundServerAddress = linkProperties.getDhcpServerAddress();
                                if(iotDeviceHost.equals(foundServerAddress.getHostAddress())) {
                                    // found ioT device network
                                    currentNetwork.setNetwork(network);
                                    cm.bindProcessToNetwork(network);
                                    networkFound = true;
                                    awaitingNetwork.countDown(); // Stop waiting
                                    break;
                                }
                            } else {
                                List<LinkAddress> linkAddressList = linkProperties.getLinkAddresses();
                                if(linkAddressList != null && !linkAddressList.isEmpty()) {
                                    for (LinkAddress address : linkAddressList) {
                                        int lastDotIndex = iotDeviceHost.lastIndexOf('.');
                                        String iotSubnetAddress = iotDeviceHost;
                                        if(lastDotIndex>=0)
                                            iotSubnetAddress = iotDeviceHost.substring(0, lastDotIndex);
                                        if(address.getAddress().getHostAddress().startsWith(iotSubnetAddress)) {
                                            // found ioT device network
                                            currentNetwork.setNetwork(network);
                                            cm.bindProcessToNetwork(network);
                                            networkFound = true;
                                            awaitingNetwork.countDown(); // Stop waiting
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        if (!networkFound) {
                            awaitingNetwork.countDown(); // Stop waiting if no network was found
                        }
                    } else {
                        awaitingNetwork.countDown(); // Stop waiting
                    }
                } else {
                    awaitingNetwork.countDown(); // Stop waiting
                }
            } else {
                awaitingNetwork.countDown(); // Stop waiting
            }
            // smartmedev - end
        }

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
    private void selectNetwork(@Nullable final String iface, @Nullable final String ipAddress, @Nullable final String iotDeviceHost) throws InterruptedException, IOException {
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
                requestNetwork(NetworkCapabilities.TRANSPORT_WIFI, iotDeviceHost);
                break;
            case "cellular":
                requestNetwork(NetworkCapabilities.TRANSPORT_CELLULAR, iotDeviceHost);
                break;
            case "ethernet":
                requestNetwork(NetworkCapabilities.TRANSPORT_ETHERNET, iotDeviceHost);
                break;
        }
        if (currentNetwork.getNetwork() == null) {
            throw new IOException("Interface " + iface + " unreachable");
        } else if (ipAddress != null && !ipAddress.equals("0.0.0.0"))
            mNetworkMap.put(iface + ipAddress, currentNetwork.getNetwork());
    }

    private TcpSocketClient getTcpClient(final int id) {
        TcpSocket socket = socketMap.get(id);
        if (socket == null) {
            throw new IllegalArgumentException("No socket with id " + id);
        }
        if (!(socket instanceof TcpSocketClient)) {
            throw new IllegalArgumentException("Socket with id " + id + " is not a client");
        }
        return (TcpSocketClient) socket;
    }

    private TcpSocketServer getTcpServer(final int id) {
        TcpSocket socket = socketMap.get(id);
        if (socket == null) {
            throw new IllegalArgumentException("No server socket with id " + id);
        }
        if (!(socket instanceof TcpSocketServer)) {
            throw new IllegalArgumentException("Server socket with id " + id + " is not a server");
        }
        return (TcpSocketServer) socket;
    }

    @SuppressWarnings("unused")
    @ReactMethod
    public void getPeerCertificate(final int cId, Promise promise) {
        try {
            final TcpSocketClient client = getTcpClient(cId);
            promise.resolve(client.getPeerCertificate());
        } catch (Exception e) {
            promise.reject(e);
        }
    }

    @SuppressWarnings("unused")
    @ReactMethod
    public void getCertificate(final int cId, Promise promise) {
        try {
            final TcpSocketClient client = getTcpClient(cId);
            promise.resolve(client.getCertificate());
        } catch (Exception e) {
            promise.reject(e);
        }
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
