'use strict';

import { NativeModules, Image } from 'react-native';
import EventEmitter from 'eventemitter3';
import { Buffer } from 'buffer';
const Sockets = NativeModules.TcpSockets;
import { nativeEventEmitter, getNextId } from './Globals';

const STATE = {
    DISCONNECTED: 0,
    CONNECTING: 1,
    CONNECTED: 2,
};

/**
 * @typedef {"ascii" | "utf8" | "utf-8" | "utf16le" | "ucs2" | "ucs-2" | "base64" | "latin1" | "binary" | "hex"} BufferEncoding
 *
 * @typedef {import('react-native').NativeEventEmitter} NativeEventEmitter
 *
 * @typedef {{address: string, family: string, port: number}} AddressInfo
 *
 * @typedef {{localAddress: string, localPort: number, remoteAddress: string, remotePort: number, remoteFamily: string}} NativeConnectionInfo
 *
 * @typedef {{
 * port: number;
 * host?: string;
 * timeout?: number,
 * localAddress?: string,
 * localPort?: number,
 * interface?: 'wifi' | 'cellular' | 'ethernet',
 * reuseAddress?: boolean,
 * tls?: boolean,
 * tlsCheckValidity?: boolean,
 * tlsCert?: any,
 * }} ConnectionOptions
 *
 * @extends {EventEmitter<'connect' | 'timeout' | 'data' | 'error' | 'close', any>}
 */
export default class Socket extends EventEmitter {
    /**
     * Creates a new socket object.
     */
    constructor() {
        super();
        /** @private */
        this._id = undefined;
        /** @private */
        this._eventEmitter = nativeEventEmitter;
        /** @type {number} @private */
        this._timeoutMsecs = 0;
        /** @private */
        this._timeout = undefined;
        /** @type {number} @private */
        this._state = STATE.DISCONNECTED;
        /** @private */
        this._encoding = undefined;
        this.localAddress = undefined;
        this.localPort = undefined;
        this.remoteAddress = undefined;
        this.remotePort = undefined;
        this.remoteFamily = undefined;
        this._registerEvents();
    }

    /**
     * @package
     * @param {number} id
     */
    _setId(id) {
        this._id = id;
        this._registerEvents();
    }

    /**
     * @package
     * @param {NativeConnectionInfo} connectionInfo
     */
    _setConnected(connectionInfo) {
        this._state = STATE.CONNECTED;
        this.localAddress = connectionInfo.localAddress;
        this.localPort = connectionInfo.localPort;
        this.remoteAddress = connectionInfo.remoteAddress;
        this.remoteFamily = connectionInfo.remoteFamily;
        this.remotePort = connectionInfo.remotePort;
    }

    /**
     * @param {ConnectionOptions} options
     * @param {() => void} [callback]
     */
    connect(options, callback) {
        if (this._id === undefined) this._setId(getNextId());

        const customOptions = { ...options };
        // Normalize args
        customOptions.host = customOptions.host || 'localhost';
        customOptions.port = Number(customOptions.port) || 0;
        this.once('connect', () => {
            if (callback) callback();
        });
        // Timeout
        if (customOptions.timeout) this.setTimeout(customOptions.timeout);
        else if (this._timeout) this._activateTimer();
        // TLS Cert
        if (customOptions.tlsCert) {
            customOptions.tlsCert = Image.resolveAssetSource(customOptions.tlsCert).uri;
        }
        // console.log(getAndroidResourceIdentifier(customOptions.tlsCert));
        this._state = STATE.CONNECTING;
        this._destroyed = false;
        Sockets.connect(this._id, customOptions.host, customOptions.port, customOptions);
        return this;
    }

    /**
     * Sets the socket to timeout after `timeout` milliseconds of inactivity on the socket. By default `TcpSocket` do not have a timeout.
     *
     * When an idle timeout is triggered the socket will receive a `'timeout'` event but the connection will not be severed.
     * The user must manually call `socket.end()` or `socket.destroy()` to end the connection.
     *
     * If `timeout` is 0, then the existing idle timeout is disabled.
     *
     * The optional `callback` parameter will be added as a one-time listener for the `'timeout'` event.
     *
     * @param {number} timeout
     * @param {() => void} [callback]
     */
    setTimeout(timeout, callback) {
        if (timeout === 0) {
            this._clearTimeout();
        } else {
            this._activateTimer(timeout);
        }
        if (callback) this.once('timeout', callback);
        return this;
    }

    /**
     * @private
     * @param {number} [timeout]
     */
    _activateTimer(timeout) {
        if (timeout !== undefined) this._timeoutMsecs = timeout;
        this._clearTimeout();
        this._timeout = setTimeout(() => {
            this._clearTimeout();
            this.emit('timeout');
        }, this._timeoutMsecs);
    }

    /**
     * @private
     */
    _clearTimeout() {
        if (this._timeout !== undefined) {
            clearTimeout(this._timeout);
            this._timeout = undefined;
        }
    }

    /**
     * Set the encoding for the socket as a Readable Stream. By default, no encoding is assigned and stream data will be returned as `Buffer` objects.
     * Setting an encoding causes the stream data to be returned as strings of the specified encoding rather than as Buffer objects.
     *
     * For instance, calling `socket.setEncoding('utf8')` will cause the output data to be interpreted as UTF-8 data, and passed as strings.
     * Calling `socket.setEncoding('hex')` will cause the data to be encoded in hexadecimal string format.
     *
     * @param {BufferEncoding} [encoding]
     */
    setEncoding(encoding) {
        this._encoding = encoding;
        return this;
    }

    /**
     * Enable/disable the use of Nagle's algorithm. When a TCP connection is created, it will have Nagle's algorithm enabled.
     *
     * Nagle's algorithm delays data before it is sent via the network. It attempts to optimize throughput at the expense of latency.
     *
     * Passing `true` for `noDelay` or not passing an argument will disable Nagle's algorithm for the socket. Passing false for noDelay will enable Nagle's algorithm.
     *
     * @param {boolean} noDelay Default: `true`
     */
    setNoDelay(noDelay = true) {
        if (this._state != STATE.CONNECTED) {
            this.once('connect', () => this.setNoDelay(noDelay));
            return this;
        }
        Sockets.setNoDelay(this._id, noDelay);
        return this;
    }

    /**
     * Enable/disable keep-alive functionality, and optionally set the initial delay before the first keepalive probe is sent on an idle socket.
     *
     * `initialDelay` is ignored.
     *
     * @param {boolean} enable Default: `false`
     * @param {number} initialDelay ***IGNORED**. Default: `0`
     */
    setKeepAlive(enable = false, initialDelay = 0) {
        if (this._state != STATE.CONNECTED) {
            this.once('connect', () => this.setKeepAlive(enable, initialDelay));
            return this;
        }

        if (initialDelay !== 0) {
            console.warn(
                'react-native-tcp-socket: initialDelay param in socket.setKeepAlive() is ignored'
            );
        }

        Sockets.setKeepAlive(this._id, enable, Math.floor(initialDelay));
        return this;
    }

    /**
     * Returns the bound `address`, the address `family` name and `port` of the socket as reported
     * by the operating system: `{ port: 12346, family: 'IPv4', address: '127.0.0.1' }`.
     *
     * @returns {AddressInfo | {}}
     */
    address() {
        if (!this.localAddress) return {};
        return { address: this.localAddress, family: this.remoteFamily, port: this.localPort };
    }

    /**
     * @param {string | Buffer | Uint8Array} data
     * @param {BufferEncoding} [encoding]
     */
    end(data, encoding) {
        if (this._destroyed) return;
        if (data) {
            this.write(data, encoding, () => {
                this._destroyed = true;
                Sockets.end(this._id);
            });
        } else {
            this._destroyed = true;
            this._clearTimeout();
            Sockets.end(this._id);
        }
    }

    destroy() {
        if (!this._destroyed) {
            this._destroyed = true;
            this._clearTimeout();
            Sockets.destroy(this._id);
        }
    }

    /**
     * Sends data on the socket. The second parameter specifies the encoding in the case of a string — it defaults to UTF8 encoding.
     *
     * The optional callback parameter will be executed when the data is finally written out, which may not be immediately.
     *
     * @param {string | Buffer | Uint8Array} buffer
     * @param {BufferEncoding} [encoding]
     * @param {(error: string | null) => void} [callback]
     */
    write(buffer, encoding, callback) {
        const self = this;
        if (this._state === STATE.DISCONNECTED) throw new Error('Socket is not connected.');

        callback = callback || (() => {});
        const generatedBuffer = this._generateSendBuffer(buffer, encoding);
        Sockets.write(
            this._id,
            generatedBuffer.toString('base64'),
            /**
             * @param {string} err
             */
            function(err) {
                if (self._timeout) self._activateTimer();
                if (callback) {
                    if (err) return callback(err);
                    callback(null);
                }
            }
        );
    }

    ref() {
        console.warn('react-native-tcp-socket: TcpSocket.ref() method will have no effect.');
    }

    unref() {
        console.warn('react-native-tcp-socket: TcpSocket.unref() method will have no effect.');
    }

    /**
     * @private
     */
    _registerEvents() {
        this._unregisterEvents();
        this._dataListener = this._eventEmitter.addListener('data', (evt) => {
            if (evt.id !== this._id) return;
            const bufferTest = Buffer.from(evt.data, 'base64');
            const finalData = this._encoding ? bufferTest.toString(this._encoding) : bufferTest;
            this.emit('data', finalData);
        });
        this._errorListener = this._eventEmitter.addListener('error', (evt) => {
            if (evt.id !== this._id) return;
            this.destroy();
            this.emit('error', evt.error);
        });
        this._closeListener = this._eventEmitter.addListener('close', (evt) => {
            if (evt.id !== this._id) return;
            this._setDisconnected();
            this.emit('close', evt.error);
        });
        this._connectListener = this._eventEmitter.addListener('connect', (evt) => {
            if (evt.id !== this._id) return;
            this._setConnected(evt.connection);
            this.emit('connect');
        });
    }

    /**
     * @private
     */
    _unregisterEvents() {
        this._dataListener?.remove();
        this._errorListener?.remove();
        this._closeListener?.remove();
        this._connectListener?.remove();
    }

    /**
     * @private
     * @param {string | Buffer | Uint8Array} buffer
     * @param {BufferEncoding} [encoding]
     */
    _generateSendBuffer(buffer, encoding) {
        if (typeof buffer === 'string') {
            return Buffer.from(buffer, encoding);
        } else if (Buffer.isBuffer(buffer)) {
            return buffer;
        } else if (buffer instanceof Uint8Array || Array.isArray(buffer)) {
            return Buffer.from(buffer);
        } else {
            throw new TypeError(
                `Invalid data, chunk must be a string or buffer, not ${typeof buffer}`
            );
        }
    }

    /**
     * @private
     */
    _setDisconnected() {
        if (this._state === STATE.DISCONNECTED) return;
        this._unregisterEvents();
        this._state = STATE.DISCONNECTED;
    }
}
