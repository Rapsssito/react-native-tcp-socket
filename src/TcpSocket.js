'use strict';

import { NativeModules, Image } from 'react-native';
const Buffer = (global.Buffer = global.Buffer || require('buffer').Buffer);
const Sockets = NativeModules.TcpSockets;

const STATE = {
    DISCONNECTED: 0,
    CONNECTING: 1,
    CONNECTED: 2,
};

class RemovableListener {
    /**
     * @param {import("react-native").EmitterSubscription} listener
     * @param {import("react-native").NativeEventEmitter} eventEmitter
     */
    constructor(listener, eventEmitter) {
        this._listener = listener;
        this._eventEmitter = eventEmitter;
        this._removed = false;
    }

    isRemoved() {
        return this._removed;
    }

    remove() {
        this._eventEmitter.removeSubscription(this._listener);
        this._removed = true;
    }
}

/**
 * @typedef {{
 * port: number;
 * host?: string;
 * timeout?: number;
 * localAddress?: string,
 * localPort?: number,
 * tls?: boolean,
 * tlsCert?: any,
 * interface?: 'wifi' | 'cellular' | 'ethernet',
 * reuseAddress?: boolean
 * }} ConnectionOptions
 */
export default class TcpSocket {
    /**
     * Initialices a TcpSocket.
     *
     * @param {number} id
     * @param {import('react-native').NativeEventEmitter} eventEmitter
     */
    constructor(id, eventEmitter) {
        this._id = id;
        this._eventEmitter = eventEmitter;
        /** @type {number} */
        this._state = STATE.DISCONNECTED;
        /** @type {RemovableListener[]} */
        this._listeners = [];
    }

    /**
     * Adds a listener to be invoked when events of the specified type are emitted by the `TcpSocket`.
     * An optional calling `context` may be provided.
     * The data arguments emitted will be passed to the listener callback.
     *
     * @param {string} event  Name of the event to listen to
     * @param {(arg0: any) => void} callback Function to invoke when the specified event is emitted
     * @param {any} [context] Optional context object to use when invoking the listener
     * @returns {RemovableListener}
     */
    on(event, callback, context) {
        const newListener = this._selectListener(event, callback, context);
        const removableListener = new RemovableListener(newListener, this._eventEmitter);
        this._listeners.push(removableListener);
        return removableListener;
    }

    /**
     * @private
     * @param {string} event
     * @param {function(any):void} callback
     * @param {any} [context]
     */
    _selectListener(event, callback, context) {
        switch (event) {
            case 'data':
                return this._eventEmitter.addListener(
                    'data',
                    (evt) => {
                        if (evt.id !== this._id) return;
                        const bufferTest = Buffer.from(evt.data, 'base64');
                        callback(bufferTest);
                    },
                    context
                );
            case 'error':
                return this._eventEmitter.addListener(
                    'error',
                    (evt) => {
                        if (evt.id !== this._id) return;
                        callback(evt.error);
                    },
                    context
                );
            default:
                return this._eventEmitter.addListener(
                    event,
                    (evt) => {
                        if (evt.id !== this._id) return;
                        callback(evt);
                    },
                    context
                );
        }
    }

    /**
     * @deprecated
     */
    off() {
        console.warn(
            'TCPSocket.off() is deprecated and produces no effect, please use the listener remove() method instead.'
        );
    }

    /**
     * @param {ConnectionOptions} options
     * @param {(address: string) => void} [callback]
     */
    connect(options, callback) {
        this._registerEvents();
        const customOptions = { ...options };
        // Normalize args
        customOptions.host = customOptions.host || 'localhost';
        customOptions.port = Number(customOptions.port) || 0;
        const connectListener = this.on('connect', (ev) => {
            connectListener.remove();
            if (callback) callback(ev.address);
        });
        // Timeout
        if (customOptions.timeout) this.setTimeout(customOptions.timeout);
        else if (this._timeout) this._activeTimer(this._timeout.msecs);
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
     * @private
     * @param {number} msecs
     * @param {() => void} [wrapper]
     */
    _activeTimer(msecs, wrapper) {
        if (this._timeout && this._timeout.handle) clearTimeout(this._timeout.handle);

        if (!wrapper) {
            const self = this;
            wrapper = function() {
                self._timeout = null;
                self._eventEmitter.emit('timeout');
            };
        }

        this._timeout = {
            handle: setTimeout(wrapper, msecs),
            wrapper: wrapper,
            msecs: msecs,
        };
    }

    /**
     * @private
     */
    _clearTimeout() {
        if (this._timeout) {
            clearTimeout(this._timeout.handle);
            this._timeout = null;
        }
    }

    /**
     * @deprecated
     * @param {number} msecs
     * @param {(...args: any[]) => void } [callback]
     */
    setTimeout(msecs, callback) {
        if (msecs === 0) {
            this._clearTimeout();
            if (callback) this._eventEmitter.removeListener('timeout', callback);
        } else {
            if (callback) this._eventEmitter.once('timeout', callback, this);

            this._activeTimer(msecs);
        }
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
        if (data) this.write(data, encoding);
        this._destroyed = true;
        Sockets.end(this._id);
    }

    destroy() {
        if (!this._destroyed) {
            this._destroyed = true;
            this._clearTimeout();
            Sockets.destroy(this._id);
        }
    }

    /**
     * @protected
     */
    _registerEvents() {
        this.on('connect', (ev) => this._onConnect(ev.address));
        this.on('close', () => this._onClose());
        this.on('error', () => this._onError());
    }

    /**
     * @private
     */
    _unregisterEvents() {
        this._listeners.forEach((listener) => (listener.isRemoved() ? listener.remove() : null));
        this._listeners = [];
    }

    /**
     * @private
     * @param {string} address
     */
    _onConnect(address) {
        this.setConnected(address);
    }

    /**
     * @private
     */
    _onClose() {
        this.setDisconnected();
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
                if (self._timeout) self._activeTimer(self._timeout.msecs);
                if (callback) {
                    if (err) return callback(err);
                    callback(null);
                }
            }
        );
    }

    /**
     * @param {string} address
     */
    setAsAlreadyConnected(address) {
        this._registerEvents();
        this.setConnected(address);
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
    setConnected(address) {
        this._state = STATE.CONNECTED;
        this._address = address;
    }

    /**
     * @private
     */
    setDisconnected() {
        if (this._state === STATE.DISCONNECTED) return;
        this._unregisterEvents();
        this._state = STATE.DISCONNECTED;
    }
}
