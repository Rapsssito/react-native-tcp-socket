'use strict';

import Socket from './TcpSocket';
import Server from './TcpServer';

function createServer(connectionListener) {
    return new Server(connectionListener);
}

// TODO : determine how to properly overload this with flow
function createConnection() {
    const tcpSocket = new Socket();
    return Socket.prototype.connect.apply(tcpSocket, tcpSocket._normalizeConnectArgs(arguments));
}

// eslint-disable-next-line no-undef
module.exports = {
    Socket: Socket,
    Server: Server,
    connect: createConnection,
    createConnection: createConnection,
    createServer: createServer,
};
