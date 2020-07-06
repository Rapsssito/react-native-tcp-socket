'use strict';

import { NativeModules, Image } from 'react-native';
import { EventEmitter } from 'events';
const Buffer = (global.Buffer = global.Buffer || require('buffer').Buffer);
const Sockets = NativeModules.TcpSockets;

const STATE = {
    DISCONNECTED: 0,
    CONNECTING: 1,
    CONNECTED: 2,
};

/**
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
 */
export default class TcpSocket extends EventEmitter {
    /**
     * Initialices a TcpSocket.
     *
     * @param {number} id
     * @param {import('react-native').NativeEventEmitter} eventEmitter
     * @param {string} [address]
     */
    constructor(id, eventEmitter, address) {
        super();
        this._id = id;
        this._eventEmitter = eventEmitter;
        /** @type {number} */
        this._timeoutMsecs = 0;
        this._timeout = undefined;
        /** @type {number} */
        this._state = STATE.DISCONNECTED;
        this._registerEvents();
        if (address != undefined) this._setConnected(address);
    }

    /**
     * @protected
     */
    _registerEvents() {
        this._unregisterEvents();
        this._dataListener = this._eventEmitter.addListener('data', (evt) => {
            if (evt.id !== this._id) return;
            const bufferTest = Buffer.from(evt.data, 'base64');
            this.emit('data', bufferTest);
        });
        this._errorListener = this._eventEmitter.addListener('error', (evt) => {
            if (evt.id !== this._id) return;
            this._onError();
            this.emit('error', evt.error);
        });
        this._closeListener = this._eventEmitter.addListener('close', (evt) => {
            if (evt.id !== this._id) return;
            this._onClose();
            this.emit('close', evt.error);
        });
        this._connectListener = this._eventEmitter.addListener('connect', (evt) => {
            if (evt.id !== this._id) return;
            this._onConnect(evt.address);
            this.emit('connect', evt.address);
        });
    }

    /**
     * @protected
     */
    _unregisterEvents() {
        this._dataListener?.remove();
        this._errorListener?.remove();
        this._closeListener?.remove();
        this._connectListener?.remove();
    }

    /**
     * @param {ConnectionOptions} options
     * @param {(address: string) => void} [callback]
     */
    connect(options, callback) {
        const customOptions = { ...options };
        // Normalize args
        customOptions.host = customOptions.host || 'localhost';
        customOptions.port = Number(customOptions.port) || 0;
        this.once('connect', (ev) => {
            if (callback) callback(ev.address);
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

    address() {
        return this._address;
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
     * @private
     * @param {string} address
     */
    _onConnect(address) {
        this._setConnected(address);
    }

    /**
     * @private
     */
    _onClose() {
        this._setDisconnected();
    }

    /**
     * @private
     */
    _onError() {
        this.destroy();
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
     * @param {string} address
     */
    _setConnected(address) {
        this._state = STATE.CONNECTED;
        this._address = address;
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
