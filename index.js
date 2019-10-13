'use strict';

import ipRegex from 'ip-regex';

import Socket from './TcpSocket';
import Server from './TcpServer';

function createServer(connectionListener) {
    return new Server(connectionListener);
};

// TODO : determine how to properly overload this with flow
function createConnection() {
    var tcpSocket = new Socket();
    return Socket.prototype.connect.apply(tcpSocket, tcpSocket._normalizeConnectArgs(arguments));
}

function isIP(input) {
    var result = 0;
    if (ipRegex.v4({ exact: true }).test(input)) {
        result = 4;
    } else if (ipRegex.v6({ exact: true }).test(input)) {
        result = 6;
    }
    return result;
};

function isIPv4(input) {
    return isIP(input) === 4;
};

function isIPv6(input) {
    return isIP(input) === 6;
};

module.exports = {
    Socket: Socket,
    Server: Server,
    isIPv4: isIPv4,
    isIPv4: isIPv6,
    isIP: isIP,
    connect: createConnection,
    createConnection: createConnection,
    createServer: createServer,
}