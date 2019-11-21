'use strict';

import { NativeEventEmitter, NativeModules } from 'react-native';
const Sockets = NativeModules.TcpSockets;

import Socket from './TcpSocket';
import Server from './TcpServer';

class TCPSockets {
    constructor() {
        this.instances = 0;
        this._eventEmitter = new NativeEventEmitter(Sockets);
    }

    createServer(connectionListener?: void) {
        return new Server(this.instances++, this._eventEmitter, connectionListener);
    }

    createConnection(options: any, callback?: void) {
        const tcpSocket = new Socket(this.instances++, this._eventEmitter);
        return tcpSocket.connect(options, callback);
    }
}

const tcpSockets = new TCPSockets();

export default tcpSockets;
