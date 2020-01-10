package com.asterinet.react.tcpsocket;


import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.util.SparseArray;
import android.util.Base64;
import android.net.Network;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.GuardedAsyncTask;
import com.facebook.react.bridge.Callback;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.IOException;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.util.concurrent.CountDownLatch;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

public class TcpSocketModule extends ReactContextBaseJavaModule implements TcpReceiverTask.OnDataReceivedListener {

    private final ReactApplicationContext mReactContext;
    private final SparseArray<TcpSocketClient> socketClients = new SparseArray<>();
    private final SparseArray<Network> mNetworkMap = new SparseArray<>();
    private Network mSelectedNetwork;

    public static final String TAG = "TcpSockets";

    public TcpSocketModule(ReactApplicationContext reactContext) {
        super(reactContext);
        mReactContext = reactContext;
    }

    @Override
    public @NonNull String getName() {
        return TAG;
    }

    private void sendEvent(String eventName, WritableMap params) {
        mReactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, params);
    }

    /**
     * Returns a network given its interface name:
     * "wifi" -> WIFI
     * "cellular" -> Cellular
     * etc...
     */
    private void selectNetwork(@Nullable final String iface, @Nullable final String ipAddress) throws InterruptedException {
        if (iface == null) return;
        mSelectedNetwork = null;
        if (ipAddress != null){
            Network cachedNetwork = mNetworkMap.get(ipAddress.hashCode());
            if (cachedNetwork != null){
                mSelectedNetwork = cachedNetwork;
                return;
            }
        }
        final CountDownLatch awaitingNetwork = new CountDownLatch(1); // only needs to be counted down once to release waiting threads
        final ConnectivityManager cm = (ConnectivityManager) mReactContext.getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkRequest.Builder requestBuilder = new NetworkRequest.Builder();
        switch (iface) {
            case "wifi":
                requestBuilder.addTransportType(NetworkCapabilities.TRANSPORT_WIFI);
                cm.requestNetwork(requestBuilder.build(), new ConnectivityManager.NetworkCallback() {
                    @Override
                    public void onAvailable(Network network) {
                        mSelectedNetwork = network;
                        if (ipAddress != null && !ipAddress.equals("0.0.0.0"))
                            mNetworkMap.put(ipAddress.hashCode(), mSelectedNetwork);
                        awaitingNetwork.countDown(); // Stop waiting
                    }

                    @Override
                    public void onUnavailable() {
                        awaitingNetwork.countDown(); // Stop waiting
                    }
                });
                awaitingNetwork.await();
                break;
            case "cellular": // TODO
            default:
                mSelectedNetwork = null;
                break;
        }
        if (mSelectedNetwork!= null && ipAddress != null && !ipAddress.equals("0.0.0.0"))
            mNetworkMap.put(ipAddress.hashCode(), mSelectedNetwork);
    }

    /**
     * Creates a TCP Socket and establish a connection with the given host
     *
     * @param cId socket ID
     * @param host socket IP address
     * @param port socket port to be bound
     * @param options extra options
     */
    @ReactMethod
    public void connect(final Integer cId, final String host, final Integer port, final ReadableMap options) {
        new GuardedAsyncTask<Void, Void>(mReactContext.getExceptionHandler()) {
            @Override
            protected void doInBackgroundGuarded(Void... params) {
                // Check for cID
                if (cId == null) {
                    onError(cId, TAG + "createSocket called with nil id parameter.");
                    return;
                }
                TcpSocketClient client = socketClients.get(cId);
                if (client != null) {
                    onError(cId, TAG + "createSocket called twice with the same id.");
                    return;
                }
                String localAddress = options.getString("localAddress");
                String iface = options.getString("interface");
                int localPort = options.getInt("localPort");
                try {
                    // Get the network interface
                    selectNetwork(iface, localAddress);
                    client = new TcpSocketClient(TcpSocketModule.this, cId, host, port, localAddress, localPort, mSelectedNetwork);
                    socketClients.put(cId, client);
                    onConnect(cId, host, port);
                } catch (Exception e) {
                    onError(cId, e.getMessage());
                }
            }
        }.execute();
    }

    @ReactMethod
    public void write(final Integer cId, final String base64String, final Callback callback) {
        new GuardedAsyncTask<Void, Void>(mReactContext.getExceptionHandler()) {
            @Override
            protected void doInBackgroundGuarded(Void... params) {
                TcpSocketClient socketClient = socketClients.get(cId);
                if (socketClient == null){
                    return;
                }
                try {
                    socketClient.write(Base64.decode(base64String, Base64.NO_WRAP));
                } catch (IOException e) {
                    if (callback != null) {
                        callback.invoke(e);
                        return;
                    }
                }
                if (callback != null) {
                    callback.invoke();
                }
            }
        }.execute();
    }

    @ReactMethod
    public void end(final Integer cId) {
        new GuardedAsyncTask<Void, Void>(mReactContext.getExceptionHandler()) {
            @Override
            protected void doInBackgroundGuarded(Void... params) {
                TcpSocketClient socketClient = socketClients.get(cId);
                if (socketClient == null) {
                    return;
                }
                socketClient.close();
                socketClients.remove(cId);
            }
        }.execute();
    }

    @ReactMethod
    public void destroy(final Integer cId) {
        end(cId);
    }

    @ReactMethod
    public void listen(final Integer cId, final String host, final Integer port) {
        new GuardedAsyncTask<Void, Void>(mReactContext.getExceptionHandler()) {
            @Override
            protected void doInBackgroundGuarded(Void... params) {
                try {
                    TcpSocketServer server = new TcpSocketServer(socketClients, TcpSocketModule.this, cId, host, port);
                    socketClients.put(cId, server);
                    onConnect(cId, host, port);
                } catch (Exception uhe) {
                    onError(cId, uhe.getMessage());
                }
            }
        }.execute();
    }

    // TcpReceiverTask.OnDataReceivedListener

    @Override
    public void onConnect(Integer id, String host, int port) {
        WritableMap eventParams = Arguments.createMap();
        eventParams.putInt("id", id);
        WritableMap addressParams = Arguments.createMap();
        addressParams.putString("address", host);
        addressParams.putInt("port", port);
        eventParams.putMap("address", addressParams);

        sendEvent("connect", eventParams);
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
    public void onConnection(Integer serverId, Integer clientId, InetSocketAddress socketAddress){
        WritableMap eventParams = Arguments.createMap();
        eventParams.putInt("id", serverId);

        WritableMap infoParams = Arguments.createMap();
        infoParams.putInt("id", clientId);

        final InetAddress address = socketAddress.getAddress();

        WritableMap addressParams = Arguments.createMap();
        addressParams.putString("address", address.getHostAddress());
        addressParams.putInt("port", socketAddress.getPort());
        addressParams.putString("family", address instanceof Inet6Address ? "IPv6" : "IPv4");

        infoParams.putMap("address", addressParams);
        eventParams.putMap("info", infoParams);

        sendEvent("connection", eventParams);
    }
}
