'use strict';

import { NativeModules } from 'react-native';
const Sockets = NativeModules.TcpSockets;
import TcpSocket from './TcpSocket';

export default class TcpServer extends TcpSocket {
    constructor(id, eventEmitter, connectionCallback) {
        super(id, eventEmitter);
        this.connectionCallback = connectionCallback;
        this._connections = [];
    }

    close() {
        this.destroy();
        this._connections.forEach((clientSocket) => clientSocket.destroy());
    }

    getConnections(callback) {
        callback(this._connections.length);
    }

    listen(port, host, callback) {
        host = host || '0.0.0.0';
        const connectListener = this._eventEmitter.addListener('connect', (ev) => {
            if (this._id !== ev.id) return;
            connectListener.remove();
            if (callback) callback(ev.address);
        });
        this._registerEvents();
        this._eventEmitter.addListener('connection', (ev) => {
            if (this._id !== ev.id) return;
            this._onConnection(ev.info);
        });
        Sockets.listen(this._id, host, port);
        return this;
    }

    _onConnection(info) {
        const socket = new TcpSocket(info.id, this._eventEmitter);
        socket._registerEvents();
        socket.setConnected(info.address);
        this._connections.push(socket);
        this.connectionCallback(socket);
    }
}
