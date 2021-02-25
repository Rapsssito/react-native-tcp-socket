'use strict';

import { NativeModules } from 'react-native';
import EventEmitter from 'eventemitter3';
const Sockets = NativeModules.TcpSockets;
import TcpSocket from './TcpSocket';

/**
 * @typedef {import('react-native').NativeEventEmitter} NativeEventEmitter
 *
 * @extends {EventEmitter<'connection' | 'listening' | 'error' | 'close', any>}
 */
export default class TcpServer extends EventEmitter {
    /**
     * @param {number} id
     * @param {NativeEventEmitter} eventEmitter
     * @param {(socket: TcpSocket) => void} connectionCallback
     */
    constructor(id, eventEmitter, connectionCallback) {
        super();
        /** @private */
        this._id = id;
        /** @private */
        this._eventEmitter = eventEmitter;
        this.connectionCallback = connectionCallback;
        /** @type {TcpSocket[]} */
        this._connections = [];
        /** @private */
        this._eventEmitter = eventEmitter;
        /** @private */
        this._localAddress = undefined;
        /** @private */
        this._localPort = undefined;
        /** @private */
        this._localFamily = undefined;
        this._registerEvents();
    }

    /**
     * @param {{ port: number; host: string; reuseAddress?: boolean}} options
     * @param {() => void} [callback]
     * @returns {TcpServer}
     */
    listen(options, callback) {
        const gotOptions = { ...options };
        gotOptions.host = gotOptions.host || '0.0.0.0';
        this.once('listening', () => {
            if (callback) callback();
        });
        Sockets.listen(this._id, gotOptions);
        return this;
    }

    /**
     * @param {(arg0: number) => void} callback
     */
    getConnections(callback) {
        callback(this._connections.length);
    }

    close() {
        Sockets.close(this._id);
        this._connections.forEach((clientSocket) => clientSocket.destroy());
    }

    /**
     * @returns {import('./TcpSocket').AddressInfo | null}
     */
    address() {
        if (!this._localAddress) return null;
        return { address: this._localAddress, port: this._localPort, family: this._localFamily };
    }

    ref() {
        console.warn('react-native-tcp-socket: TcpServer.ref() method will have no effect.');
    }

    unref() {
        console.warn('react-native-tcp-socket: TcpServer.unref() method will have no effect.');
    }

    /**
     * @private
     */
    _registerEvents() {
        this._errorListener = this._eventEmitter.addListener('listening', (evt) => {
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
        this._closeListener = this._eventEmitter.addListener('close', (evt) => {
            if (evt.id !== this._id) return;
            this._setDisconnected();
            this.emit('close', evt.error);
        });
        this._connectionsListener = this._eventEmitter.addListener('connection', (evt) => {
            if (evt.id !== this._id) return;
            this._onConnection(evt.info);
            this.emit('connection', evt.info);
        });
    }

    /**
     * @private
     */
    _unregisterEvents() {
        this._errorListener?.remove();
        this._closeListener?.remove();
        this._connectionsListener?.remove();
    }

    /**
     * @private
     */
    _setDisconnected() {
        this._unregisterEvents();
        this._localAddress = undefined;
        this._localPort = undefined;
        this._localFamily = undefined;
    }

    /**
     * @private
     * @param {{ id: number; connection: import('./TcpSocket').NativeConnectionInfo; }} info
     */
    _onConnection(info) {
        const socket = new TcpSocket(info.id, this._eventEmitter, info.connection);
        this._connections.push(socket);
        this.connectionCallback(socket);
    }
}
