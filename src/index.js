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

    /**
     * @param {(socket: Socket) => void} connectionListener
     * @returns {Server}
     */
    createServer(connectionListener) {
        return new Server(this.instances++, this._eventEmitter, connectionListener);
    }

    /**
     * @param {import('./TcpSocket').ConnectionOptions} options
     * @param {() => void} callback
     * @returns {Socket}
     */
    createConnection(options, callback) {
        const tcpSocket = new Socket(this.instances++, this._eventEmitter);
        return tcpSocket.connect(options, callback);
    }
}

const tcpSockets = new TCPSockets();

export default tcpSockets;
