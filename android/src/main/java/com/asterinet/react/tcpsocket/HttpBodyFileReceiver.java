package com.asterinet.react.tcpsocket;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

import javax.annotation.Nullable;

/**
 * Parses an HTTP response header, then streams the body straight to a file, without passing the
 * bytes through JS. A 200 response truncates the file, a 206 response appends to it (resume).
 * Reports progress and completion through the TcpEventListener.
 */
class HttpBodyFileReceiver {
    static final long PROGRESS_INTERVAL_MS = 250;
    private static final int MAX_HEADER_BYTES = 64 * 1024;
    private static final int FILE_BUFFER_BYTES = 256 * 1024;

    private final int socketId;
    private final String path;
    private final TcpEventListener listener;
    private final ByteArrayOutputStream header = new ByteArrayOutputStream();
    @Nullable
    private OutputStream out;
    private long expected = -1;
    private long received = 0;
    private long lastProgressAt = 0;
    private boolean done = false;
    private boolean isPartialContent = false;

    HttpBodyFileReceiver(int socketId, String path, TcpEventListener listener) {
        this.socketId = socketId;
        this.path = path.startsWith("file://") ? path.substring("file://".length()) : path;
        this.listener = listener;
    }

    void onData(byte[] buffer, int count) {
        if (done) return;
        try {
            if (out != null) {
                writeBody(buffer, 0, count);
                return;
            }
            header.write(buffer, 0, count);
            byte[] head = header.toByteArray();
            int headerEnd = indexOfHeaderEnd(head);
            if (headerEnd < 0) {
                if (head.length > MAX_HEADER_BYTES) finish("HTTP header too large");
                return;
            }
            if (!parseHeader(new String(head, 0, headerEnd, StandardCharsets.ISO_8859_1))) return;
            // 206 Partial Content answers a Range request: resume by appending to the partial file
            out = new BufferedOutputStream(new FileOutputStream(path, isPartialContent), FILE_BUFFER_BYTES);
            int bodyStart = headerEnd + 4;
            writeBody(head, bodyStart, head.length - bodyStart);
        } catch (IOException e) {
            finish(e.getMessage());
        }
    }

    void onEnd() {
        if (done) return;
        if (out == null) {
            finish("Connection closed before the HTTP header");
        } else if (expected >= 0 && received < expected) {
            finish("Incomplete: " + received + "/" + expected + " bytes");
        } else {
            finish(null);
        }
    }

    void onError(@Nullable String message) {
        if (!done) finish(message == null ? "Socket error" : message);
    }

    private void writeBody(byte[] buffer, int offset, int length) throws IOException {
        int toWrite = expected >= 0 ? (int) Math.min(length, expected - received) : length;
        if (toWrite > 0 && out != null) {
            out.write(buffer, offset, toWrite);
            received += toWrite;
        }
        long now = System.currentTimeMillis();
        if (now - lastProgressAt >= PROGRESS_INTERVAL_MS) {
            lastProgressAt = now;
            listener.onFileProgress(socketId, received, expected);
        }
        if (expected >= 0 && received >= expected) finish(null);
    }

    private boolean parseHeader(String head) {
        String[] lines = head.split("\r\n");
        String[] statusParts = lines[0].split(" ");
        int status = statusParts.length > 1 ? parseIntOr(statusParts[1], -1) : -1;
        if (status != 200 && status != 206) {
            finish("HTTP " + status);
            return false;
        }
        isPartialContent = status == 206;
        for (String line : lines) {
            if (line.toLowerCase().startsWith("content-length:")) {
                expected = parseLongOr(line.substring("content-length:".length()).trim(), -1);
            }
        }
        return true;
    }

    private void finish(@Nullable String error) {
        done = true;
        if (out != null) {
            try {
                out.close();
            } catch (IOException e) {
                if (error == null) error = e.getMessage();
            }
        }
        listener.onFileEnd(socketId, received, error);
    }

    private static int indexOfHeaderEnd(byte[] data) {
        for (int i = 0; i + 3 < data.length; i++) {
            if (data[i] == '\r' && data[i + 1] == '\n' && data[i + 2] == '\r' && data[i + 3] == '\n') return i;
        }
        return -1;
    }

    private static int parseIntOr(String value, int fallback) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static long parseLongOr(String value, long fallback) {
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException e) {
            return fallback;
        }
    }
}
