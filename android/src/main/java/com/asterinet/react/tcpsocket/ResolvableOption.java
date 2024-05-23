package com.asterinet.react.tcpsocket;

public class ResolvableOption {
    private final String value;
    private final boolean needsResolution;

    public ResolvableOption(String value, boolean needsResolution) {
        this.value = value;
        this.needsResolution = needsResolution;
    }

    public String getValue() {
        return value;
    }

    public boolean needsResolution() {
        return needsResolution;
    }
}

