'use strict';

import { getNextId, nativeEventEmitter } from './Globals';

import EventEmitter from 'eventemitter3';
import { NativeModules } from 'react-native';
import Socket from './Socket';

const Sockets = NativeModules.TcpSockets;

/**
 * @typedef {object} ServerOptions
 * @property {boolean} [noDelay]
 * @property {boolean} [keepAlive]
 * @property {number} [keepAliveInitialDelay]
 * @property {boolean} [allowHalfOpen]
 * @property {boolean} [pauseOnConnect]
 *
 * @typedef {import('./TLSSocket').default} TLSSocket
 *
 * @typedef {object} ServerEvents
 * @property {() => void} close
 * @property {(socket: Socket) => void} connection
 * @property {() => void} listening
 * @property {(err: Error) => void} error
 * @property {(tlsSocket: TLSSocket) => void} secureConnection
 *
 * @extends {EventEmitter<ServerEvents, any>}
 */
export default class Server extends EventEmitter {
    /**
     * @param {ServerOptions | ((socket: Socket) => void)} [options] Server options or connection listener
     * @param {(socket: Socket) => void} [connectionCallback] Automatically set as a listener for the `'connection'` event.
     */
    constructor(options, connectionCallback) {
        super();
        /** @protected @readonly */
        this._id = getNextId();
        /** @protected @readonly */
        this._eventEmitter = nativeEventEmitter;
        // console.log('Server eventEmitter:', this._eventEmitter);
        /** @private @type {Set<Socket>} */
        this._connections = new Set();
        /** @private */
        this._localAddress = undefined;
        /** @private */
        this._localPort = undefined;
        /** @private */
        this._localFamily = undefined;
        /** @private @type {ServerOptions} */
        this._serverOptions = {};
        this.listening = false;

        // Handle optional options argument
        if (typeof options === 'function') {
            /** @type {(socket: Socket) => void} */
            const callback = options;
            this.on('connection', callback);
            options = {};
        } else if (options && typeof options === 'object') {
            this._serverOptions = { ...options };
            if (typeof connectionCallback === 'function') {
                this.on('connection', connectionCallback);
            }
        }

        this._registerEvents();
        this.on('close', this._setDisconnected, this);
    }

    /**
     * Start a server listening for connections.
     *
     * This function is asynchronous. When the server starts listening, the `'listening'` event will be emitted.
     * The last parameter `callback` will be added as a listener for the `'listening'` event.
     *
     * The `server.listen()` method can be called again if and only if there was an error during the first
     * `server.listen()` call or `server.close()` has been called. Otherwise, an `ERR_SERVER_ALREADY_LISTEN`
     * error will be thrown.
     *
     * @param {{ port: number; host?: string; reuseAddress?: boolean} | number} options Options or port
     * @param {string | (() => void)} [callback_or_host] Callback or host string
     * @param {() => void} [callback] Callback function
     * @returns {Server}
     */
    listen(options, callback_or_host, callback) {
        if (this._localAddress !== undefined) throw new Error('ERR_SERVER_ALREADY_LISTEN');

        /** @type {{ port: number; host: string; reuseAddress?: boolean }} */
        let listenOptions = { port: 0, host: '0.0.0.0' };
        /** @type {(() => void) | undefined} */
        let cb;

        // Handle different argument patterns
        if (typeof options === 'number') {
            // listen(port, [host], [callback])
            listenOptions.port = options;
            if (typeof callback_or_host === 'string') {
                listenOptions.host = callback_or_host;
                cb = callback;
            } else if (typeof callback_or_host === 'function') {
                cb = callback_or_host;
            }
        } else if (typeof options === 'object') {
            // listen(options, [callback])
            listenOptions = {
                port: options.port,
                host: options.host || '0.0.0.0',
                reuseAddress: options.reuseAddress,
            };
            if (typeof callback_or_host === 'function') {
                cb = callback_or_host;
            }
        } else {
            throw new TypeError('options must be an object or a number');
        }

        // Add callback as a listener for the listening event
        if (typeof cb === 'function') {
            this.once('listening', cb);
        }

        this.once('listening', () => {
            this.listening = true;
        });

        Sockets.listen(this._id, listenOptions);
        return this;
    }

    /**
     * Asynchronously get the number of concurrent connections on the server.
     *
     * Callback should take two arguments `err` and `count`.
     *
     * @param {(err: Error | null, count: number) => void} callback
     * @returns {Server}
     */
    getConnections(callback) {
        callback(null, this._connections.size);
        return this;
    }

    /**
     * Stops the server from accepting new connections and keeps existing connections.
     * This function is asynchronous, the server is finally closed when all connections are ended and the server emits a `'close'` event.
     * The optional callback will be called once the `'close'` event occurs. Unlike that event, it will be called with an `Error` as its
     * only argument if the server was not open when it was closed.
     *
     * @param {(err?: Error) => void} [callback] Called when the server is closed.
     * @returns {Server}
     */
    close(callback) {
        if (!this._localAddress) {
            callback?.(new Error('ERR_SERVER_NOT_RUNNING'));
            return this;
        }
        if (callback) this.once('close', callback);
        this.listening = false;
        Sockets.close(this._id);
        if (this._connections.size === 0) this.emit('close');
        return this;
    }

    /**
     * Returns the bound `address`, the address `family` name, and `port` of the server as reported by the operating system if listening
     * on an IP socket (useful to find which port was assigned when getting an OS-assigned address):
     * `{ port: 12346, family: 'IPv4', address: '127.0.0.1' }`.
     *
     * @returns {import('./Socket').AddressInfo | null}
     */
    address() {
        if (!this._localAddress) return null;
        return { address: this._localAddress, port: this._localPort, family: this._localFamily };
    }

    ref() {
        console.warn('react-native-tcp-socket: Server.ref() method will have no effect.');
        return this;
    }

    unref() {
        console.warn('react-native-tcp-socket: Server.unref() method will have no effect.');
        return this;
    }

    /**
     * @private
     */
    _registerEvents() {
        this._listeningListener = this._eventEmitter.addListener('listening', (evt) => {
            if (evt.id !== this._id) return;
            this._localAddress = evt.connection.localAddress;
            this._localPort = evt.connection.localPort;
            this._localFamily = evt.connection.localFamily;
            this.emit('listening');
        });
        this._errorListener = this._eventEmitter.addListener('error', (evt) => {
            if (evt.id !== this._id) return;
            this.close();
            this.emit('error', evt.error);
        });
        this._connectionsListener = this._eventEmitter.addListener('connection', (evt) => {
            if (evt.id !== this._id) return;
            const newSocket = this._buildSocket(evt.info);
            this._addConnection(newSocket);
            this.emit('connection', newSocket);
        });
    }

    /**
     * @private
     */
    _setDisconnected() {
        this._localAddress = undefined;
        this._localPort = undefined;
        this._localFamily = undefined;
    }

    /**
     * @protected
     * @param {Socket} socket
     */
    _addConnection(socket) {
        // Emit 'close' when all connection closed
        socket.on('close', () => {
            this._connections.delete(socket);
            if (!this.listening && this._connections.size === 0) this.emit('close');
        });
        this._connections.add(socket);
    }

    /**
     * @protected
     * @param {{ id: number; connection: import('./Socket').NativeConnectionInfo; }} info
     * @returns {Socket}
     */
    _buildSocket(info) {
        const newSocket = new Socket();
        newSocket._setId(info.id);
        newSocket._setConnected(info.connection);

        // Apply server options to the socket if they exist
        if (this._serverOptions) {
            if (this._serverOptions.noDelay !== undefined) {
                newSocket.setNoDelay(this._serverOptions.noDelay);
            }

            if (this._serverOptions.keepAlive !== undefined) {
                const keepAliveDelay = this._serverOptions.keepAliveInitialDelay || 0;
                newSocket.setKeepAlive(this._serverOptions.keepAlive, keepAliveDelay);
            }

            if (this._serverOptions.allowHalfOpen !== undefined) {
                newSocket.allowHalfOpen = this._serverOptions.allowHalfOpen;
            }

            if (this._serverOptions.pauseOnConnect) {
                newSocket.pause();
            }
        }

        return newSocket;
    }

    /**
     * Apply server socket options to a newly connected socket
     * @param {Socket} socket
     * @private
     */
    _applySocketOptions(socket) {
        if (this._serverOptions.noDelay !== undefined) {
            socket.setNoDelay(this._serverOptions.noDelay);
        }

        if (this._serverOptions.keepAlive !== undefined) {
            const keepAliveDelay = this._serverOptions.keepAliveInitialDelay || 0;
            socket.setKeepAlive(this._serverOptions.keepAlive, keepAliveDelay);
        }
    }
}
