'use strict';

import nativeEventEmitter from './NativeEventEmitter';
import Socket from './TcpSocket';
import Server from './Server';

class TCPSockets {
    constructor() {
        this.instances = 0;
        this._eventEmitter = nativeEventEmitter;
    }

    /**
     * @param {(socket: Socket) => void} connectionListener
     * @returns {Server}
     */
    createServer(connectionListener) {
        return new Server(this.instances++, connectionListener);
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
