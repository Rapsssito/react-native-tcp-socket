'use strict';

import Socket from './TcpSocket';
import Server from './TcpServer';

export default class TCPSockets {
    static createServer(connectionListener?: void) {
        return new Server(connectionListener);
    }

    static createConnection(options: any, callback?: void) {
        const tcpSocket = new Socket();
        return tcpSocket.connect(options, callback);
    }
}