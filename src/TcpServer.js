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

    close() {
        this.destroy();
        this._connections.forEach((clientSocket) => clientSocket.destroy());
    }

    /**
     * @param {(arg0: number) => void} callback
     */
    getConnections(callback) {
        callback(this._connections.length);
    }

    /**
     * @param {{ port: number; host: any; }} options
     * @param {(arg0: any) => void} callback
     * @returns {TcpServer}
     */
    listen(options, callback) {
        let gotOptions = {};
        // Normalize args
        if (typeof arguments[0] === 'number') {
            // Deprecated old version: listen(port[, host][, callback])
            console.warn(
                'TcpServer.listen(port[, host][, callback]) is deprecated and has been moved to TcpServer.listen(options[, callback]). It will be removed in react-native-tcp-socket@4.0.0'
            );
            gotOptions.port = arguments[0];
            /** @type {string} */
            gotOptions.host = arguments[1];
            callback = arguments[2];
        } else {
            gotOptions = options;
        }
        gotOptions.host = gotOptions.host || '0.0.0.0';
        const connectListener = this.on('connect', (ev) => {
            connectListener.remove();
            if (callback) callback(ev.address);
        });
        this._registerEvents();
        this.on('connection', (ev) => this._onConnection(ev.info));
        Sockets.listen(this._id, gotOptions);
        return this;
    }

    /**
     * @private
     * @param {{ id: number; address: string; }} info
     */
    _onConnection(info) {
        const socket = new TcpSocket(info.id, this._eventEmitter);
        socket.setAsAlreadyConnected(info.address);
        this._connections.push(socket);
        this.connectionCallback(socket);
    }
}
