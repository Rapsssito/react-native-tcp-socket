'use strict';

import { NativeModules } from 'react-native';
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
     * @param {function(object): void} callback Function to invoke when the specified event is emitted
     * @param {any} [context] Optional context object to use when invoking the listener
     */
    on(event, callback, context) {
        const newListener = this._selectListener(event, callback, context);
        const removableListener = new RemovableListener(newListener, this._eventEmitter);
        this._listeners.push(removableListener);
        return removableListener;
    }

    /**
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

    off() {
        console.warn(
            'TCPSocket.off() is deprecated and produces no effect, please use the listener remove() method instead.'
        );
    }

    /**
     * @param {{ host: string; port: number; timeout: number; }} options
     * @param {(address: string) => void} [callback]
     */
    connect(options, callback) {
        this._registerEvents();
        // Normalize args
        options.host = options.host || 'localhost';
        options.port = Number(options.port) || 0;
        const connectListener = this.on('connect', (ev) => {
            connectListener.remove();
            if (callback) callback(ev.address);
        });
        if (options.timeout) this.setTimeout(options.timeout);
        else if (this._timeout) this._activeTimer(this._timeout.msecs);
        this._state = STATE.CONNECTING;
        this._destroyed = false;
        Sockets.connect(this._id, options.host, options.port, options);
        return this;
    }

    /**
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

    _clearTimeout() {
        if (this._timeout) {
            clearTimeout(this._timeout.handle);
            this._timeout = null;
        }
    }

    /**
     * @param {number} msecs
     * @param {{ (...args: any[]): any; (...args: any[]): any; }} [callback]
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

    _registerEvents() {
        this.on('connect', (ev) => this._onConnect(ev.address));
        this.on('close', () => this._onClose());
        this.on('error', () => this._onError());
    }

    _unregisterEvents() {
        this._listeners.forEach((listener) => (listener.isRemoved() ? listener.remove() : null));
        this._listeners = [];
    }

    /**
     * @param {string} address
     */
    _onConnect(address) {
        this.setConnected(address);
    }

    _onClose() {
        this.setDisconnected();
    }

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
     * @param {(error?: string) => void} [callback]
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
                if (err) return callback(err);
                callback();
            }
        );
    }

    /**
     * @param {string | Buffer | Uint8Array} buffer
     * @param {BufferEncoding} [encoding]
     */
    _generateSendBuffer(buffer, encoding) {
        if (typeof buffer === 'string') return Buffer.from(buffer, encoding);
        else if (Buffer.isBuffer(buffer)) return buffer;
        else if (buffer instanceof Uint8Array || Array.isArray(buffer)) return Buffer.from(buffer);
        else
            throw new TypeError(
                `Invalid data, chunk must be a string or buffer, not ${typeof buffer}`
            );
    }

    /**
     * @param {string} address
     */
    setConnected(address) {
        this._state = STATE.CONNECTED;
        this._address = address;
    }

    setDisconnected() {
        if (this._state === STATE.DISCONNECTED) return;
        this._unregisterEvents();
        this._state = STATE.DISCONNECTED;
    }
}
