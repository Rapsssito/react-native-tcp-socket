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
 * @typedef {object} ReadableEvents
 * @property {() => void} pause
 * @property {() => void} resume
 *
 * @typedef {object} SocketEvents
 * @property {(had_error: boolean) => void} close
 * @property {() => void} connect
 * @property {(data: Buffer | string) => void} data
 * @property {() => void} drain
 * @property {(err: Error) => void} error
 * @property {() => void} timeout
 *
 * @extends {EventEmitter<SocketEvents & ReadableEvents, any>}
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
        /** @type {EventEmitter<'written', any>} @private */
        this._msgEvtEmitter = new EventEmitter();
        /** @type {number} @private */
        this._timeoutMsecs = 0;
        /** @private */
        this._timeout = undefined;
        /** @type {number} @private */
        this._state = STATE.DISCONNECTED;
        /** @private */
        this._encoding = undefined;
        /** @private */
        this._msgId = 0;
        /** @private */
        this._lastRcvMsgId = Number.MAX_SAFE_INTEGER - 1;
        /** @private */
        this._lastSentMsgId = 0;
        /** @private */
        this._paused = false;
        /** @private */
        this._resuming = false;
        /** @private */
        this._writeBufferSize = 0;
        /** @type {{ id: number; data: string; }[]} @private */
        this._pausedDataEvents = [];
        this.readableHighWaterMark = 16384;
        this.writableHighWaterMark = 16384;
        this.writableNeedDrain = false;
        this.bytesSent = 0;
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
     * Returns `true` if the entire data was flushed successfully to the kernel buffer. Returns `false` if all or part of the data
     * was queued in user memory. `'drain'` will be emitted when the buffer is again free.
     *
     * The optional callback parameter will be executed when the data is finally written out, which may not be immediately.
     *
     * @param {string | Buffer | Uint8Array} buffer
     * @param {BufferEncoding} [encoding]
     * @param {(err?: Error) => void} [cb]
     *
     * @return {boolean}
     */
    write(buffer, encoding, cb) {
        const self = this;
        if (encoding && typeof encoding === 'function') cb = encoding;
        if (this._state === STATE.DISCONNECTED) throw new Error('Socket is not connected.');

        const generatedBuffer = this._generateSendBuffer(buffer, encoding);
        this._writeBufferSize += generatedBuffer.byteLength;
        const currentMsgId = this._msgId;
        this._msgId = (this._msgId + 1) % Number.MAX_SAFE_INTEGER;
        const msgEvtHandler = (/** @type {{id: number, msgId: number, err?: string}} */ evt) => {
            const { msgId, err } = evt;
            if (msgId === currentMsgId) {
                this._msgEvtEmitter.removeListener('written', msgEvtHandler);
                this._writeBufferSize -= generatedBuffer.byteLength;
                this._lastRcvMsgId = msgId;
                if (self._timeout) self._activateTimer();
                if (this.writableNeedDrain && this._lastSentMsgId == msgId) {
                    this.writableNeedDrain = false;
                    this.emit('drain');
                }
                if (cb) {
                    if (err) cb(new Error(err));
                    else cb();
                }
            }
        };
        // Callback equivalent with better performance
        this._msgEvtEmitter.on('written', msgEvtHandler, this);
        const ok = this._writeBufferSize < this.writableHighWaterMark;
        if (!ok) this.writableNeedDrain = true;
        this._lastSentMsgId = currentMsgId;
        Sockets.write(this._id, generatedBuffer.toString('base64'), currentMsgId);
        return ok;
    }

    /**
     * Pauses the reading of data. That is, `'data'` events will not be emitted. Useful to throttle back an upload.
     */
    pause() {
        if (this._paused) return;
        this._paused = true;
        Sockets.pause(this._id);
        this.emit('pause');
    }

    /**
     * Resumes reading after a call to `socket.pause()`.
     */
    resume() {
        if (!this._paused) return;
        this._paused = false;
        this.emit('resume');
        this._recoverDataEventsAfterPause();
    }

    ref() {
        console.warn('react-native-tcp-socket: Socket.ref() method will have no effect.');
    }

    unref() {
        console.warn('react-native-tcp-socket: Socket.unref() method will have no effect.');
    }

    /**
     * @private
     */
    async _recoverDataEventsAfterPause() {
        if (this._resuming) return;
        this._resuming = true;
        while (this._pausedDataEvents.length > 0) {
            // Concat all buffered events for better performance
            const buffArray = [];
            let readBytes = 0;
            let i = 0;
            for (; i < this._pausedDataEvents.length; i++) {
                const evtData = Buffer.from(this._pausedDataEvents[i].data, 'base64');
                readBytes += evtData.byteLength;
                if (readBytes <= this.readableHighWaterMark) {
                    buffArray.push(evtData);
                } else {
                    const buffOffset = this.readableHighWaterMark - readBytes;
                    buffArray.push(evtData.slice(0, buffOffset));
                    this._pausedDataEvents[i].data = evtData.slice(buffOffset).toString('base64');
                    break;
                }
            }
            // Generate new event with the concatenated events
            const evt = {
                id: this._pausedDataEvents[0].id,
                data: Buffer.concat(buffArray).toString('base64'),
            };
            // Clean the old events
            this._pausedDataEvents = this._pausedDataEvents.slice(i);
            this._onDeviceDataEvt(evt);
            if (this._paused) {
                this._resuming = false;
                return;
            }
        }
        this._resuming = false;
        Sockets.resume(this._id);
    }

    /**
     * @private
     */
    _onDeviceDataEvt = (/** @type {{ id: number; data: string; }} */ evt) => {
        if (evt.id !== this._id) return;
        if (!this._paused) {
            const bufferTest = Buffer.from(evt.data, 'base64');
            const finalData = this._encoding ? bufferTest.toString(this._encoding) : bufferTest;
            this.emit('data', finalData);
        } else {
            // If the socket is paused, save the data events for later
            this._pausedDataEvents.push(evt);
        }
    };

    /**
     * @private
     */
    _registerEvents() {
        this._unregisterEvents();
        this._dataListener = this._eventEmitter.addListener('data', this._onDeviceDataEvt);
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
        this._writtenListener = this._eventEmitter.addListener('written', (evt) => {
            if (evt.id !== this._id) return;
            this._msgEvtEmitter.emit('written', evt);
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
        this._writtenListener?.remove();
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
