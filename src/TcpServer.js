'use strict';

import { NativeModules } from 'react-native';
const Sockets = NativeModules.TcpSockets;
import TcpSocket from './TcpSocket';

export default class TcpServer extends TcpSocket {
    /**
     * @param {number} id
     * @param {import("react-native").NativeEventEmitter} eventEmitter
     * @param {(socket: TcpSocket) => void} connectionCallback
     */
    constructor(id, eventEmitter, connectionCallback) {
        super(id, eventEmitter);
        this.connectionCallback = connectionCallback;
        /** @type {TcpSocket[]} */
        this._connections = [];
        this._eventEmitter = eventEmitter;
    }

    /**
     * @override
     */
    _registerEvents() {
        super._registerEvents();
        this._connectionsListener = this._eventEmitter.addListener('connection', (evt) => {
            if (evt.id !== this._id) return;
            this._onConnection(evt.info);
            this.emit('connection', evt.info);
        });
    }

    /**
     * @override
     */
    _unregisterEvents() {
        super._unregisterEvents();
        this._connectionsListener?.remove();
    }

    /**
     * @param {{ port: number; host: string; reuseAddress?: boolean}} options
     * @param {(arg0: any) => void} [callback]
     * @returns {TcpServer}
     */
    listen(options, callback) {
        const gotOptions = { ...options };
        gotOptions.host = gotOptions.host || '0.0.0.0';
        this.once('connect', (ev) => {
            if (callback) callback(ev.address);
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
        this.destroy();
        this._connections.forEach((clientSocket) => clientSocket.destroy());
    }

    /**
     * @private
     * @param {{ id: number; address: string; }} info
     */
    _onConnection(info) {
        const socket = new TcpSocket(info.id, this._eventEmitter, info.address);
        this._connections.push(socket);
        this.connectionCallback(socket);
    }
}
