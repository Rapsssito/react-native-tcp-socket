package com.asterinet.react.tcpsocket;


import android.util.SparseArray;
import android.util.Base64;

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


public class TcpSocketModule extends ReactContextBaseJavaModule implements TcpReceiverTask.OnDataReceivedListener {

    private final ReactApplicationContext reactContext;
    private SparseArray<TcpSocketClient> socketClients = new SparseArray<>();
    private boolean shuttingDown = false;

    public static final String TAG = "TcpSockets";

    public TcpSocketModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return TAG;
    }

    private void sendEvent(String eventName, WritableMap params) {
        reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, params);
    }

    /**
     * Creates a TCP Socket and establish a connection with the given host
     *
     * @param cId
     * @param host
     * @param port
     * @param options
     */
    @ReactMethod
    public void connect(final Integer cId, final String host, final Integer port, final ReadableMap options) {
        new GuardedAsyncTask<Void, Void>(getReactApplicationContext().getExceptionHandler()) {
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
                    client = new TcpSocketClient(getReactApplicationContext(), TcpSocketModule.this, cId, host, port, localAddress, localPort, iface);
                    socketClients.put(cId, client);
                    onConnect(cId, host, port);
                } catch (IOException e) {
                    onError(cId, e.getMessage());
                } catch (InterruptedException e){
                    onError(cId, e.getMessage());
                }
                return;
            }
        }.execute();
    }

    @ReactMethod
    public void write(final Integer cId, final String base64String, final Callback callback) {
        new GuardedAsyncTask<Void, Void>(getReactApplicationContext().getExceptionHandler()) {
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
                return;
            }
        }.execute();
    }

    @ReactMethod
    public void end(final Integer cId) {
        new GuardedAsyncTask<Void, Void>(getReactApplicationContext().getExceptionHandler()) {
            @Override
            protected void doInBackgroundGuarded(Void... params) {
                try {
                    TcpSocketClient socketClient = socketClients.get(cId);
                    if (socketClient == null){
                        return;
                    }
                    socketClient.close();
                    onClose(cId, null);
                } catch (IOException e) {
                    onClose(cId, e.getMessage());
                }
                return;
            }
        }.execute();
    }

    @ReactMethod
    public void destroy(final Integer cId) {
        end(cId);
    }

    // TcpReceiverTask.OnDataReceivedListener

    @Override
    public void onConnect(Integer id, String host, int port) {
        if (shuttingDown) {
            return;
        }
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
        if (shuttingDown) {
            return;
        }
        WritableMap eventParams = Arguments.createMap();
        eventParams.putInt("id", id);
        eventParams.putString("data", Base64.encodeToString(data, Base64.NO_WRAP));

        sendEvent("data", eventParams);
    }

    @Override
    public void onClose(Integer id, String error) {
        if (shuttingDown) {
            return;
        }
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
        if (shuttingDown) {
            return;
        }
        WritableMap eventParams = Arguments.createMap();
        eventParams.putInt("id", id);
        eventParams.putString("error", error);

        sendEvent("error", eventParams);
    }
}
