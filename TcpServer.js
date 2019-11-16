'use strict';

const { NativeModules } = require('react-native');
const Sockets = NativeModules.TcpSockets;
import TcpSocket from './TcpSocket';

export default class TcpServer extends TcpSocket {
    constructor(connectionCallback) {
        super();
        this.connectionCallback = connectionCallback;
        this._connections = 0;
    }

    _onConnection(info) {
        this._connections++;
        const socket = new TcpSocket(info.id);
        socket._registerEvents();
        socket.setConnected(info.address);
        this.connectionCallback(socket);
    }

    listen(port, host, callback) {
        host = host || '0.0.0.0';
        const listenEvent = this._eventEmitter.addListener('listening', () => {
            this._eventEmitter.removeSubscription(listenEvent);
            if (callback) callback();
        });

        this._registerEvents();
        this._eventEmitter.addListener('connection', (ev) => {
            if (this._id !== ev.id) return;
            this._onConnection(ev.info);
        });
        Sockets.listen(this._id, host, port);
        return this;
    }

    getConnections(callback) {
        callback(this._connections);
    }

    ref() {}
    unref() {}
}
