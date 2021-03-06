'use strict';

import { nativeEventEmitter, getInstanceNumber } from './Globals';
import Socket from './TcpSocket';
import Server from './Server';

/**
 * @param {(socket: Socket) => void} connectionListener
 * @returns {Server}
 */
function createServer(connectionListener) {
    return new Server(connectionListener);
}

/**
 * @param {import('./TcpSocket').ConnectionOptions} options
 * @param {() => void} callback
 * @returns {Socket}
 */
function createConnection(options, callback) {
    const tcpSocket = new Socket(getInstanceNumber(), nativeEventEmitter);
    return tcpSocket.connect(options, callback);
}

export default { createServer, createConnection, Server };
