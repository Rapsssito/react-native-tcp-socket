package com.asterinet.react.tcpsocket;

import android.annotation.SuppressLint;
import android.content.Context;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.annotation.RawRes;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.ByteArrayInputStream;
import java.math.BigInteger;
import java.net.Socket;
import java.net.URI;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.SecureRandom;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPublicKey;
import java.text.SimpleDateFormat;
import java.util.Base64;
import java.util.Date;
import java.util.Locale;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLPeerUnverifiedException;
import javax.net.ssl.SSLServerSocketFactory;
import javax.net.ssl.SSLSession;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;


import org.bouncycastle.util.io.pem.PemObject;
import org.bouncycastle.util.io.pem.PemReader;
import org.json.JSONObject;


final class SSLCertificateHelper {

    /**
     * Creates an SSLSocketFactory instance for use with all CAs provided.
     *
     * @return An SSLSocketFactory which trusts all CAs when provided to network clients
     */
    static SSLSocketFactory createBlindSocketFactory() throws GeneralSecurityException {
        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(null, new TrustManager[]{new BlindTrustManager()}, null);
        return ctx.getSocketFactory();
    }

    static SSLServerSocketFactory createServerSocketFactory(Context context, @NonNull final String keyStoreResourceUri) throws GeneralSecurityException, IOException {
        char[] password = "".toCharArray();

        InputStream keyStoreInput = getRawResourceStream(context, keyStoreResourceUri);
        KeyStore keyStore = KeyStore.getInstance("PKCS12");
        keyStore.load(keyStoreInput, password);
        keyStoreInput.close();

        KeyManagerFactory keyManagerFactory = KeyManagerFactory.getInstance("X509");
        keyManagerFactory.init(keyStore, password);

        SSLContext sslContext = SSLContext.getInstance("TLS");
        sslContext.init(keyManagerFactory.getKeyManagers(), new TrustManager[]{new BlindTrustManager()}, null);

        return sslContext.getServerSocketFactory();
    }

    public static PrivateKey getPrivateKeyFromPEM(InputStream keyStream) {
        try (PemReader pemReader = new PemReader(new InputStreamReader(keyStream))) {
            PemObject pemObject = pemReader.readPemObject();
            byte[] pemContent = pemObject.getContent();
            PKCS8EncodedKeySpec keySpec = new PKCS8EncodedKeySpec(pemContent);
            KeyFactory keyFactory = KeyFactory.getInstance("RSA");
            return keyFactory.generatePrivate(keySpec);
        } catch (Exception e) {
            throw new RuntimeException("Failed to parse private key from PEM", e);
        }
    }

    /**
     * Creates an InpuStream either from a getRawResourceStream or from raw string
     *
     * @param context        Context used to retrieve resource
     * @param optionRes      ResolvableOption
     * @return An InputStream
     */
    public static InputStream getResolvableinputStream(
            @NonNull final Context context,
            ResolvableOption optionRes) throws IOException {
        if (optionRes.needsResolution()) {
            return getRawResourceStream(context, optionRes.getValue());
        } else {
            return new ByteArrayInputStream(optionRes.getValue().getBytes());
        }
    }

    /**
     * Creates an SSLSocketFactory instance for use with the CA provided in the resource file.
     *
     * @param context       Context used to open up the CA file
     * @param optionResCa   Raw resource file or string to the CA (in .crt or .cer format, for instance)
     * @param optionResKey  Optional raw resource file or string to the Key (in .crt or .cer format, for instance)
     * @param optionResCert Optional raw resource file or string to the Cert (in .crt or .cer format, for instance)
     * @param keystoreInfo  Information about keystore name and key/cert alias
     * @return An SSLSocketFactory which trusts the provided CA when provided to network clients
     */
    static SSLSocketFactory createCustomTrustedSocketFactory(
            @NonNull final Context context,
            final ResolvableOption optionResCa,
            final ResolvableOption optionResKey,
            final ResolvableOption optionResCert,
            final KeystoreInfo keystoreInfo) throws IOException, GeneralSecurityException {

        SSLSocketFactory ssf = null;
        if (optionResCert != null && optionResKey != null) {
            final String keyStoreName = keystoreInfo.getKeystoreName().isEmpty() ?
                    KeyStore.getDefaultType() :
                    keystoreInfo.getKeystoreName();
            KeyStore keyStore = KeyStore.getInstance(keyStoreName);
            keyStore.load(null, null);

            // Check if cert and key if already registered inside our keystore
            // If one is missing we insert again
            boolean hasCertInStore = keyStore.isCertificateEntry(keystoreInfo.getCertAlias());
            boolean hasKeyInStore = keyStore.isKeyEntry(keystoreInfo.getKeyAlias());
            if (!hasCertInStore || !hasKeyInStore) {
                InputStream certInput = getResolvableinputStream(context, optionResCert);
                Certificate cert = CertificateFactory.getInstance("X.509").generateCertificate(certInput);
                keyStore.setCertificateEntry(keystoreInfo.getCertAlias(), cert);

                InputStream keyInput = getResolvableinputStream(context, optionResKey);
                PrivateKey privateKey = getPrivateKeyFromPEM(keyInput);
                keyStore.setKeyEntry(keystoreInfo.getKeyAlias(), privateKey, null, new Certificate[]{cert});
            }

            boolean hasCaInStore = keyStore.isCertificateEntry(keystoreInfo.getCaAlias());
            if (optionResCa != null && !hasCaInStore) {
                InputStream caInput = getResolvableinputStream(context, optionResCa);
                // Generate the CA Certificate from the raw resource file
                Certificate ca = CertificateFactory.getInstance("X.509").generateCertificate(caInput);
                caInput.close();
                // Load the key store using the CA
                keyStore.setCertificateEntry(keystoreInfo.getCaAlias(), ca);
            }

            // Initialize the KeyManagerFactory with this cert
            KeyManagerFactory keyManagerFactory = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
            keyManagerFactory.init(keyStore, new char[0]);

            // Create an SSL context that uses the created trust manager
            SSLContext sslContext = SSLContext.getInstance("TLS");
            sslContext.init(keyManagerFactory.getKeyManagers(), new TrustManager[]{new BlindTrustManager()}, null);
            return sslContext.getSocketFactory();

        } else {
            // Keep old behavior
            InputStream caInput = getResolvableinputStream(context, optionResCa);
            // Generate the CA Certificate from the raw resource file
            Certificate ca = CertificateFactory.getInstance("X.509").generateCertificate(caInput);
            caInput.close();
            // Load the key store using the CA
            KeyStore keyStore = KeyStore.getInstance(KeyStore.getDefaultType());
            keyStore.load(null, null);
            keyStore.setCertificateEntry("ca", ca);

            // Initialize the TrustManager with this CA
            TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            tmf.init(keyStore);

            // Create an SSL context that uses the created trust manager
            SSLContext sslContext = SSLContext.getInstance("TLS");
            sslContext.init(null, tmf.getTrustManagers(), new SecureRandom());
            return sslContext.getSocketFactory();
        }
    }

    private static InputStream getRawResourceStream(@NonNull final Context context, @NonNull final String resourceUri) throws IOException {
        final int resId = getResourceId(context, resourceUri);
        if (resId == 0)
            return URI.create(resourceUri).toURL().openStream(); // From metro on development
        else return context.getResources().openRawResource(resId); // From bundle in production
    }

    @RawRes
    private static int getResourceId(@NonNull final Context context, @NonNull final String resourceUri) {
        String name = resourceUri.toLowerCase().replace("-", "_");
        try {
            return Integer.parseInt(name);
        } catch (NumberFormatException ex) {
            return context.getResources().getIdentifier(name, "raw", context.getPackageName());
        }
    }

    private static class BlindTrustManager implements X509TrustManager {
        public X509Certificate[] getAcceptedIssuers() {
            return null;
        }

        @SuppressLint("TrustAllX509TrustManager")
        public void checkClientTrusted(X509Certificate[] chain, String authType) {
        }

        @SuppressLint("TrustAllX509TrustManager")
        public void checkServerTrusted(X509Certificate[] chain, String authType) {
        }
    }

    public static ReadableMap getCertificateInfo(Socket socket, boolean wantPeerCert) {
        WritableMap certInfo = Arguments.createMap();

        if (socket instanceof SSLSocket) {
            SSLSocket sslSocket = (SSLSocket) socket;
            try {
                SSLSession sslSession = sslSocket.getSession();
                Certificate[] certificates = wantPeerCert ? sslSession.getPeerCertificates() : sslSession.getLocalCertificates();
                if (certificates != null && certificates.length > 0 && certificates[0] instanceof X509Certificate) {
                    X509Certificate cert = (X509Certificate) certificates[0];
                    WritableMap certDetails = Arguments.createMap();
                    certDetails.putMap("subject", parseDN(cert.getSubjectDN().getName()));
                    certDetails.putMap("issuer", parseDN(cert.getIssuerDN().getName()));
                    certDetails.putBoolean("ca", cert.getBasicConstraints() != -1);
                    certDetails.putString("modulus", getModulus(cert));
                    certDetails.putInt("bits", getModulusBitLength(cert));
                    certDetails.putString("exponent", "0x" + getExponent(cert));
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        certDetails.putString("pubkey", Base64.getEncoder().encodeToString(cert.getPublicKey().getEncoded()));
                    }
                    certDetails.putString("valid_from", formatDate(cert.getNotBefore()));
                    certDetails.putString("valid_to", formatDate(cert.getNotAfter()));
                    certDetails.putString("fingerprint", getFingerprint(cert, "SHA-1"));
                    certDetails.putString("fingerprint256", getFingerprint(cert, "SHA-256"));
                    certDetails.putString("fingerprint512", getFingerprint(cert, "SHA-512"));
                    certDetails.putString("serialNumber", getSerialNumber(cert));

                    certInfo = certDetails;
                }
            } catch (SSLPeerUnverifiedException e) {
                throw new RuntimeException(e);
            } catch (Exception e) {
                throw new RuntimeException("Error processing certificate", e);
            }
        }

        return certInfo;
    }

    // LdapName don't seem to be available on android ....
    // So very very dummy implementation
    // I can see inside android/platform/libcore an implementation but don't even know if we
    // can import it...
    //https://android.googlesource.com/platform/libcore/+/0ebbfbdbca73d6261a77183f68e1f3e56c339f9f/ojluni/src/main/java/javax/naming/

    private static WritableMap parseDN(String dn) {
        WritableMap details = Arguments.createMap();
        String[] components = dn.split(",(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)"); // Split by comma, but not inside quotes
        for (String component : components) {
            String[] keyValue = component.split("=", 2);
            if (keyValue.length == 2) {
                String key = keyValue[0].trim();
                String value = keyValue[1].trim();
                if ("2.5.4.46".equals(key)) { // OID for dnQualifier
                    if (value.startsWith("#")) {
                        String dnQualifier = decodeHexString(value.substring(1));
                        details.putString("dnQualifier", dnQualifier);
                    } else {
                        details.putString("dnQualifier", value);
                    }
                } else if ("CN".equals(key)) {
                    details.putString("CN", value);
                }
            }
        }
        return details;
    }

    private static String decodeHexString(String hex) {
        StringBuilder output = new StringBuilder();
        for (int i = 0; i < hex.length(); i += 2) {
            String str = hex.substring(i, i + 2);
            output.append((char) Integer.parseInt(str, 16));
        }
        // Remove leading control characters if they exist
        return output.toString().replaceAll("^\\p{Cntrl}", "").trim();
    }

    private static String getSerialNumber(X509Certificate cert) {
        BigInteger serialNumber = cert.getSerialNumber();
        return serialNumber.toString(16).toUpperCase(); // Convert to hex string and uppercase
    }
    private static String getModulus(X509Certificate cert) throws Exception {
        RSAPublicKey rsaPubKey = (RSAPublicKey) cert.getPublicKey();
        return rsaPubKey.getModulus().toString(16).toUpperCase();
    }

    private static int getModulusBitLength(X509Certificate cert) throws Exception {
        RSAPublicKey rsaPubKey = (RSAPublicKey) cert.getPublicKey();
        return rsaPubKey.getModulus().bitLength();
    }
    private static String getExponent(X509Certificate cert) throws Exception {
        RSAPublicKey rsaPubKey = (RSAPublicKey) cert.getPublicKey();
        return rsaPubKey.getPublicExponent().toString(16).toUpperCase();
    }

    private static String getFingerprint(X509Certificate cert, String algorithm) throws Exception {
        byte[] encoded = cert.getEncoded();
        java.security.MessageDigest md = java.security.MessageDigest.getInstance(algorithm);
        byte[] digest = md.digest(encoded);
        StringBuilder sb = new StringBuilder();
        for (byte b : digest) {
            sb.append(String.format("%02X:", b));
        }
        return sb.substring(0, sb.length() - 1); // Remove the trailing colon
    }

    private static String formatDate(Date date) {
        SimpleDateFormat sdf = new SimpleDateFormat("MMM dd HH:mm:ss yyyy 'GMT'", Locale.US);
        sdf.setTimeZone(java.util.TimeZone.getTimeZone("GMT"));
        return sdf.format(date);
    }
}
