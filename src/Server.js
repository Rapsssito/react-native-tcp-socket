'use strict';

import { NativeModules } from 'react-native';
import EventEmitter from 'eventemitter3';
const Sockets = NativeModules.TcpSockets;
import Socket from './Socket';
import { nativeEventEmitter, getNextId } from './Globals';

/**
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
     * @param {(socket: Socket) => void} [connectionCallback] Automatically set as a listener for the `'connection'` event.
     */
    constructor(connectionCallback) {
        super();
        /** @protected @readonly */
        this._id = getNextId();
        /** @protected @readonly */
        this._eventEmitter = nativeEventEmitter;
        /** @private @type {Set<Socket>} */
        this._connections = new Set();
        /** @private */
        this._localAddress = undefined;
        /** @private */
        this._localPort = undefined;
        /** @private */
        this._localFamily = undefined;
        this.listening = false;
        this._registerEvents();
        if (connectionCallback) this.on('connection', connectionCallback);
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
     * @param {{ port: number; host: string; reuseAddress?: boolean}} options
     * @param {() => void} [callback]
     * @returns {Server}
     */
    listen(options, callback) {
        if (this._localAddress !== undefined) throw new Error('ERR_SERVER_ALREADY_LISTEN');
        const gotOptions = { ...options };
        gotOptions.host = gotOptions.host || '0.0.0.0';
        this.once('listening', () => {
            this.listening = true;
            if (callback) callback();
        });
        Sockets.listen(this._id, gotOptions);
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
        return newSocket;
    }
}
