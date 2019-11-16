'use strict';

import Socket from './TcpSocket';
import Server from './TcpServer';

export default class TCPSockets {
    static createServer(connectionListener) {
        return new Server(connectionListener);
    }

    static createConnection(options, callback) {
        const tcpSocket = new Socket();
        return tcpSocket.connect(options, callback);
    }
}
