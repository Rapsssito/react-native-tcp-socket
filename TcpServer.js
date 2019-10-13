'use strict';

var {
    NativeModules
} = require('react-native');
var Sockets = NativeModules.TcpSockets;

import Socket from './TcpSocket';

export default class TcpServer extends Socket {
    constructor(connectionListener) {
        super(connectionListener);
        this.connectionListener = connectionListener;
        this._connections = 0;
    }

    _onConnect(address) {
        this._debug('received', 'connect');

        this.setConnected(this, address);
        this.emit('connect');
        this.emit('listening');

        this.read(0);
    };

    _onConnection(info) {
        this._debug('received', 'connection');
        this._connections++;

        let socket = new Socket({ id: info.id });

        socket._registerEvents();
        this.setConnected(socket, info.address);
        this.connectionListener(socket);
        this.emit('connection', socket);
    }

    _debug() {
        if (__DEV__) {
            var args = [].slice.call(arguments);
            console.log.apply(console, args);
        }
    }

    // TODO : determine how to properly overload this with flow
    listen() {
        var args = this._normalizeConnectArgs(arguments);
        var options = args[0];
        var callback = args[1];

        var port = options.port;
        var host = options.host || '0.0.0.0';

        if (callback) {
            this.once('listening', callback);
        }

        this._registerEvents();
        Sockets.listen(this._id, host, port);
        return this;
    }

    getConnections(callback) {
        if (typeof callback === 'function') {
            callback.invoke(null, this._connections);
        }
    }

    close(callback) {
        if (callback){
            this.once('close', callback);
        }        
        this.destroy();
    }

    ref() { }
    unref() { /* nop */ };
}