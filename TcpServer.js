'use strict';

const { NativeModules } = require('react-native');
const Sockets = NativeModules.TcpSockets;

import Socket from './TcpSocket';

export default class TcpServer extends Socket {
    constructor(connectionListener) {
        super(connectionListener);
        this.connectionListener = connectionListener;
        this._connections = 0;
    }

    _onConnect(address) {
        this.setConnected(this, address);
        this.emit('connect');
        this.emit('listening');

        this.read(0);
    }

    _onConnection(info) {
        this._connections++;

        const socket = new Socket({ id: info.id });

        socket._registerEvents();
        this.setConnected(socket, info.address);
        this.connectionListener(socket);
        this.emit('connection', socket);
    }

    listen() {
        const args = this._normalizeConnectArgs(arguments);
        const options = args[0];
        const callback = args[1];

        const port = options.port;
        const host = options.host || '0.0.0.0';

        if (callback) this.once('listening', callback);

        this._registerEvents();
        Sockets.listen(this._id, host, port);
        return this;
    }

    getConnections(callback) {
        if (typeof callback === 'function') callback.invoke(null, this._connections);
    }

    close(callback) {
        if (callback) this.once('close', callback);

        this.destroy();
    }

    ref() {}
    unref() {
        /* nop */
    }
}
