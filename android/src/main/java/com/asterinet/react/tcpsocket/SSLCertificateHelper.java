package com.asterinet.react.tcpsocket;

import android.annotation.SuppressLint;
import android.content.Context;

import androidx.annotation.NonNull;
import androidx.annotation.RawRes;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyStore;
import java.security.KeyStoreException;
import java.security.NoSuchAlgorithmException;
import java.security.PrivateKey;
import java.security.SecureRandom;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.cert.X509Certificate;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLServerSocketFactory;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

import org.bouncycastle.util.io.pem.PemObject;
import org.bouncycastle.util.io.pem.PemReader;

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

            InputStream certInput = getResolvableinputStream(context, optionResCert);
            Certificate cert = CertificateFactory.getInstance("X.509").generateCertificate(certInput);
            keyStore.setCertificateEntry(keystoreInfo.getCertAlias(), cert);

            InputStream keyInput = getResolvableinputStream(context, optionResKey);
            PrivateKey privateKey = getPrivateKeyFromPEM(keyInput);
            keyStore.setKeyEntry(keystoreInfo.getKeyAlias(), privateKey, null, new Certificate[]{cert});

            if (optionResCa != null) {
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
}
