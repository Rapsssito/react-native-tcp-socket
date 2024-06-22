package com.asterinet.react.tcpsocket;

public class KeystoreInfo {
    private String keystoreName;
    private String caAlias;
    private String certAlias;
    private String keyAlias;

    public KeystoreInfo(String keystoreName, String caAlias, String certAlias, String keyAlias) {
        this.keystoreName = keystoreName;
        this.caAlias = (caAlias == null || caAlias.isEmpty()) ? "ca" : caAlias;
        this.certAlias = (certAlias == null || certAlias.isEmpty()) ? "cert" : certAlias;
        this.keyAlias = (keyAlias == null || keyAlias.isEmpty()) ? "key" : keyAlias;
    }

    public String getKeystoreName() {
        return this.keystoreName;
    }

    public void setKeystoreName(String keystoreName) {
        this.keystoreName = keystoreName;
    }

    public String getCaAlias() {
        return this.caAlias;
    }

    public void setCaAlias(String caAlias) {
        this.caAlias = caAlias;
    }

    public String getCertAlias() {
        return this.certAlias;
    }

    public void setCertAlias(String certAlias) {
        this.certAlias = certAlias;
    }

    public String getKeyAlias() {
        return this.keyAlias;
    }

    public void setKeyAlias(String keyAlias) {
        this.keyAlias = keyAlias;
    }

    @Override
    public String toString() {
        return "KeystoreInfo{" +
                "keystoreName='" + this.keystoreName + '\'' +
                ", caAlias='" + this.caAlias + '\'' +
                ", certAlias='" + this.certAlias + '\'' +
                ", keyAlias='" + this.keyAlias + '\'' +
                '}';
    }
}

