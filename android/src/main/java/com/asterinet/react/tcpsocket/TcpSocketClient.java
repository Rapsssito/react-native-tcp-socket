package com.asterinet.react.tcpsocket;

import android.content.Context;
import android.net.Network;
import android.os.Build;

import androidx.annotation.RequiresApi;

import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableArray;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.security.GeneralSecurityException;
import java.util.Arrays;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SNIHostName;
import javax.net.ssl.SNIServerName;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLPeerUnverifiedException;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

class TcpSocketClient extends TcpSocket {
    private final ExecutorService listenExecutor;
    private final ExecutorService writeExecutor;
    private final TcpEventListener receiverListener;
    private TcpReceiverTask receiverTask;
    private Socket socket;
    private boolean closed = true;
    /** The host the caller asked for, so that a later startTLS() can verify against it. */
    private String requestedHost;

    TcpSocketClient(TcpEventListener receiverListener, Integer id, Socket socket) {
        super(id);
        listenExecutor = Executors.newSingleThreadExecutor();
        writeExecutor = Executors.newSingleThreadExecutor();
        this.socket = socket;
        this.receiverListener = receiverListener;
    }

    public Socket getSocket() {
        return socket;
    }

    public void connect(Context context, String address, final Integer port, ReadableMap options, Network network, ReadableMap tlsOptions) throws IOException, GeneralSecurityException {
        if (socket != null) throw new IOException("Already connected");
        requestedHost = address;
        // Always a plain socket first, even for TLS: the bind, the Network binding and the
        // connect belong to the TCP socket, and the SSLSocket is then layered over the connected
        // one so that it can be given the peer name. See upgradeToTls().
        final Socket plainSocket = new Socket();
        // Get the addresses
        final String localAddress = options.hasKey("localAddress") ? options.getString("localAddress") : "0.0.0.0";
        final InetAddress localInetAddress = InetAddress.getByName(localAddress);
        final InetAddress remoteInetAddress = InetAddress.getByName(address);
        if (network != null)
            network.bindSocket(plainSocket);
        // setReuseAddress
        if (options.hasKey("reuseAddress")) {
            boolean reuseAddress = options.getBoolean("reuseAddress");
            plainSocket.setReuseAddress(reuseAddress);
        } else {
            // Default to true
            plainSocket.setReuseAddress(true);
        }
        final int localPort = options.hasKey("localPort") ? options.getInt("localPort") : 0;
        // bind
        plainSocket.bind(new InetSocketAddress(localInetAddress, localPort));
        final int connectTimeout = options.hasKey("connectTimeout") ? options.getInt("connectTimeout") : 0; 
        plainSocket.connect(new InetSocketAddress(remoteInetAddress, port), connectTimeout);
        socket = (tlsOptions != null)
                ? upgradeToTls(context, plainSocket, address, port, tlsOptions)
                : plainSocket;
        startListening();
    }

    public void startTLS(Context context, ReadableMap tlsOptions) throws IOException, GeneralSecurityException {
        if (socket instanceof SSLSocket) return;
        // requestedHost, not socket.getInetAddress().getHostAddress(): the second is the resolved
        // IP literal, and a certificate that names the server does not name its address.
        final String fallbackHost = (requestedHost != null)
                ? requestedHost
                : socket.getInetAddress().getHostAddress();
        socket = upgradeToTls(context, socket, fallbackHost, socket.getPort(), tlsOptions);
    }

    /**
     * Layer TLS over a connected socket, verifying that the certificate belongs to the host that
     * was asked for.
     *
     * createSocket(socket, host, port, autoClose) is the form that carries the peer NAME onto the
     * SSLSocket. The no-argument createSocket() used before carries none, and an SSLSocket with
     * no peer name neither sends SNI nor has anything to identify the endpoint against - the
     * handshake validated the certificate chain and nothing else, so any certificate from any
     * trusted CA was accepted for any host. JSSE does not verify hostnames on a bare SSLSocket by
     * default (that is HttpsURLConnection's job), so it has to be asked for, which is what
     * SSLParameters.setEndpointIdentificationAlgorithm("HTTPS") does.
     *
     * Skipped only when the caller has said it does not want the check: `rejectUnauthorized:
     * false`, which in Node turns off chain and name alike, or an explicit `checkServerIdentity:
     * false` for a self-signed certificate whose subject does not name the address it is reached
     * at (see #190).
     *
     * `tlsOptions` is the map TLSSocket sent to startTLS. connectTLS() passes one options object
     * to both `new TLSSocket(socket, options)` and `socket.connect(options)` and TLSSocket
     * spreads it whole, so `servername` and `checkServerIdentity` arrive here even though they
     * read like connect options.
     */
    private SSLSocket upgradeToTls(Context context, Socket connected, String fallbackHost, int port, ReadableMap tlsOptions) throws IOException, GeneralSecurityException {
        final String peerName = serverNameFor(tlsOptions, fallbackHost);
        final SSLSocketFactory ssf = getSSLSocketFactory(context, tlsOptions);
        final SSLSocket sslSocket = (SSLSocket) ssf.createSocket(connected, peerName, port, true);
        sslSocket.setUseClientMode(true);
        final boolean verifyIdentity = shouldVerifyServerIdentity(tlsOptions);
        if (verifyIdentity && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            applyEndpointIdentification(sslSocket, peerName);
        }
        sslSocket.startHandshake();
        if (verifyIdentity && Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            // No SSLParameters.setEndpointIdentificationAlgorithm before API 24, so the same
            // check runs after the handshake with the platform's own verifier - later, but still
            // before any application byte has been written. Needed because android/build.gradle
            // still falls back to minSdkVersion 21.
            final HostnameVerifier verifier = HttpsURLConnection.getDefaultHostnameVerifier();
            if (!verifier.verify(peerName, sslSocket.getSession())) {
                try {
                    sslSocket.close();
                } catch (IOException ignored) {
                    // Refusing is the point; how the refused socket closed is not.
                }
                throw new SSLPeerUnverifiedException("Certificate presented for " + peerName + " does not name it");
            }
        }
        return sslSocket;
    }

    @RequiresApi(api = Build.VERSION_CODES.N)
    private static void applyEndpointIdentification(SSLSocket sslSocket, String peerName) {
        final SSLParameters params = sslSocket.getSSLParameters();
        params.setEndpointIdentificationAlgorithm("HTTPS");
        if (!isInetAddressLiteral(peerName)) {
            // Conscrypt derives SNI from the peer name on its own, but setting it explicitly also
            // covers a caller that overrode the name with `servername`. An IP literal is excluded
            // because RFC 6066 3 forbids one in server_name.
            final SNIServerName sni = new SNIHostName(peerName);
            params.setServerNames(Collections.singletonList(sni));
        }
        sslSocket.setSSLParameters(params);
    }

    /** Node's `servername`: the name to verify and to send in SNI, when it is not the host. */
    private static String serverNameFor(ReadableMap tlsOptions, String fallbackHost) {
        if (tlsOptions != null && tlsOptions.hasKey("servername")) {
            final String servername = tlsOptions.getString("servername");
            if (servername != null && !servername.isEmpty()) return servername;
        }
        return fallbackHost;
    }

    private static boolean shouldVerifyServerIdentity(ReadableMap tlsOptions) {
        if (tlsOptions == null) return true;
        if (tlsOptions.hasKey("rejectUnauthorized") && !tlsOptions.getBoolean("rejectUnauthorized")) return false;
        return !tlsOptions.hasKey("checkServerIdentity") || tlsOptions.getBoolean("checkServerIdentity");
    }

    /** IPv4/IPv6 literal test; `1and1.com` is a hostname, `1.2.3.4` is not. */
    private static final Pattern INET_ADDRESS_LITERAL =
            Pattern.compile("([0-9a-fA-F]*:[0-9a-fA-F:.]*)|([\\d.]+)");

    private static boolean isInetAddressLiteral(String host) {
        return host != null && INET_ADDRESS_LITERAL.matcher(host).matches();
    }

    private boolean containsKey(ReadableArray array, String key) {
        for (int i = 0; i < array.size(); i++) {
            if (array.getString(i).equals(key)) {
                return true;
            }
        }
        return false;
    }

    private ResolvableOption getResolvableOption(ReadableMap tlsOptions, String key) {
        if (tlsOptions.hasKey(key)) {
            String value = tlsOptions.getString(key);
            if (value == null || value.isEmpty()) {
                return null;
            }
            ReadableArray resolvedKeys = tlsOptions.hasKey("resolvedKeys") ? tlsOptions.getArray("resolvedKeys") : null;
            boolean needsResolution = resolvedKeys != null && containsKey(resolvedKeys, key);
            return new ResolvableOption(value, needsResolution);
        }
        return null;
    }

    private SSLSocketFactory getSSLSocketFactory(Context context, ReadableMap tlsOptions) throws GeneralSecurityException, IOException {
        SSLSocketFactory ssf = null;

        final ResolvableOption customTlsCa = getResolvableOption(tlsOptions, "ca");
        final ResolvableOption customTlsKey = getResolvableOption(tlsOptions, "key");
        final ResolvableOption customTlsCert = getResolvableOption(tlsOptions, "cert");
        final String keystoreName = tlsOptions.hasKey("androidKeyStore") ? tlsOptions.getString("androidKeyStore") : "";
        final String caAlias = tlsOptions.hasKey("caAlias") ? tlsOptions.getString("caAlias") : "";
        final String keyAlias = tlsOptions.hasKey("keyAlias") ? tlsOptions.getString("keyAlias") : "";
        final String certAlias = tlsOptions.hasKey("certAlias") ? tlsOptions.getString("certAlias") : "";
        final KeystoreInfo keystoreInfo = new KeystoreInfo(keystoreName, caAlias, certAlias, keyAlias);

        if (tlsOptions.hasKey("rejectUnauthorized") && !tlsOptions.getBoolean("rejectUnauthorized")) {
            if ((customTlsKey != null && customTlsCert != null) ||
                    (keyAlias != null && !keyAlias.isEmpty() && customTlsKey == null) ) {
                ssf = SSLCertificateHelper.createCustomTrustedSocketFactory(
                        context,
                        customTlsCa,
                        customTlsKey,
                        customTlsCert,
                        keystoreInfo
                );
            } else {
                ssf = SSLCertificateHelper.createBlindSocketFactory();
            }
        } else {
            ssf = (customTlsCa != null)
                    ? SSLCertificateHelper.createCustomTrustedSocketFactory(
                            context,
                            customTlsCa,
                            customTlsKey,
                            customTlsCert,
                            keystoreInfo
                    )
                    : (SSLSocketFactory) SSLSocketFactory.getDefault();
        }
        return ssf;
    }

    public void startListening() {
        receiverTask = new TcpReceiverTask(this, receiverListener);
        listenExecutor.execute(receiverTask);
    }

    /**
     * Sends data from the socket
     *
     * @param data data to be sent
     */
    public void write(final int msgId, final byte[] data) {
        writeExecutor.execute(new Runnable() {
            @Override
            public void run() {
                final Socket s = socket;
                if (s == null) {
                    receiverListener.onError(getId(), new IOException("Attempted to write to closed socket"));
                    return;
                }
                try {
                    s.getOutputStream().write(data);
                    receiverListener.onWritten(getId(), msgId, null);
                } catch (IOException e) {
                    receiverListener.onWritten(getId(), msgId, e);
                    receiverListener.onError(getId(), e);
                }
            }
        });
    }

    public ReadableMap getPeerCertificate() {
        return SSLCertificateHelper.getCertificateInfo(socket, true);
    }

    public ReadableMap getCertificate() {
        return SSLCertificateHelper.getCertificateInfo(socket, false);
    }

    /**
     * Shuts down the receiver task, closing the socket.
     */
    public void destroy() {
        try {
            // close the socket
            if (socket != null && !socket.isClosed()) {
                closed = true;
                socket.close();
                receiverListener.onClose(getId(), null);
                socket = null;
            }
        } catch (IOException e) {
            receiverListener.onClose(getId(), e);
        }
    }

    /**
     * @param noDelay `true` will disable Nagle's algorithm for the socket (enable TCP_NODELAY)
     */
    public void setNoDelay(final boolean noDelay) throws IOException {
        if (socket == null) {
            throw new IOException("Socket is not connected.");
        }
        socket.setTcpNoDelay(noDelay);
    }

    /**
     * @param enable `true` to enable keep-alive functionality
     */
    public void setKeepAlive(final boolean enable, final int initialDelay) throws IOException {
        if (socket == null) {
            throw new IOException("Socket is not connected.");
        }
        // `initialDelay` is ignored
        socket.setKeepAlive(enable);
    }

    public void pause() {
        if (receiverTask != null) {
            receiverTask.pause();
        }
    }

    public void resume() {
        if (receiverTask != null) {
            receiverTask.resume();
        }
    }

    /**
     * This is a specialized Runnable that receives data from a socket in the background, and
     * notifies it's listener when data is received.  This is not threadsafe, the listener
     * should handle synchronicity.
     */
    private static class TcpReceiverTask implements Runnable {

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

            // Guard against null socket - can happen if destroy() is called
            // before the receiver task starts, or if socket creation failed
            if (socket == null) {
                return;
            }

            byte[] buffer = new byte[16384];
            try {
                BufferedInputStream in = new BufferedInputStream(socket.getInputStream());
                while (!socket.isClosed()) {
                    int bufferCount = in.read(buffer);
                    waitIfPaused();
                    if (bufferCount > 0) {
                        receiverListener.onData(socketId, Arrays.copyOfRange(buffer, 0, bufferCount));
                    } else if (bufferCount == -1) {
                        receiverListener.onEnd(socketId);
                        break;
                    }
                }
            } catch (IOException | InterruptedException ioe) {
                if (receiverListener != null && socket != null && !socket.isClosed() && !clientSocket.closed) {
                    receiverListener.onError(socketId, ioe);
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
}
