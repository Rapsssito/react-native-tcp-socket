package com.asterinet.react.tcpsocket;


import androidx.annotation.Nullable;
import android.util.SparseArray;
import android.util.Base64;
import android.os.AsyncTask;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Callback;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.IOException;


public class TcpSocketModule extends ReactContextBaseJavaModule implements TcpReceiverTask.OnDataReceivedListener {

    private final ReactApplicationContext reactContext;
    private SparseArray<TcpSocketClient> socketClients = new SparseArray<>();
    private boolean shuttingDown = false;

    public static final String TAG = "TcpSocket";

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
    public void connect(final Integer cId, final @Nullable String host, final Integer port, final ReadableMap options) {
        new AsyncTask<Void, Void, Void>() {
            @Override
            protected Void doInBackground(Void... params) {
                // Check for cID
                if (cId == null) {
                    onError(cId, TAG + "createSocket called with nil id parameter.");
                    return null;
                }
                TcpSocketClient client = socketClients.get(cId);
                if (client != null) {
                    onError(cId, TAG + "createSocket called twice with the same id.");
                    return null;
                }
                int localPort = options.hasKey("localPort") ? 0 : options.getInt("localPort");
                try {
                    client = new TcpSocketClient(TcpSocketModule.this, cId, host, port, options.getString("localAddress"), localPort);
                    socketClients.put(cId, client);
                    onConnect(cId, host, port);
                } catch (IOException e) {
                    onError(cId, TAG + "error creating socket.");
                }
                return null;
            }
        }.execute();
    }

    @ReactMethod
    public void write(final Integer cId, final String base64String, final Callback callback) {
        new AsyncTask<Void, Void, Void>() {
            @Override
            protected Void doInBackground(Void... params) {
                TcpSocketClient socket = socketClients.get(cId);
                try {
                    socket.write(Base64.decode(base64String, Base64.NO_WRAP));
                } catch (IOException e) {
                    if (callback != null) {
                        callback.invoke(e);
                        return null;
                    }
                }
                if (callback != null) {
                    callback.invoke();
                }
                return null;
            }
        }.execute();
    }

    @ReactMethod
    public void end(final Integer cId) {
        new AsyncTask<Void, Void, Void>() {
            @Override
            protected Void doInBackground(Void... params) {
                try{
                    TcpSocketClient socketClient = socketClients.get(cId);
                    socketClient.close();
                    onClose(cId, null);
                } catch (IOException e){
                    onClose(cId, e.getMessage());
                }
                return null;
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
