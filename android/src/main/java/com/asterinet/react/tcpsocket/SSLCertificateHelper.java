package com.asterinet.react.tcpsocket;

import android.annotation.SuppressLint;
import android.content.Context;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

import androidx.annotation.NonNull;
import androidx.annotation.RawRes;

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

    /**
     * Creates an SSLSocketFactory instance for use with the CA provided in the resource file.
     *
     * @param context        Context used to open up the CA file
     * @param rawResourceUri Raw resource file to the CA (in .crt or .cer format, for instance)
     * @return An SSLSocketFactory which trusts the provided CA when provided to network clients
     */
    static SSLSocketFactory createCustomTrustedSocketFactory(@NonNull final Context context, @NonNull final String rawResourceUri) throws IOException, GeneralSecurityException {
        InputStream caInput = getRawResourceStream(context, rawResourceUri);
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
