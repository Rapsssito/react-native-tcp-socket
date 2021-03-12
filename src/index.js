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
 * @param {() => void} success
 * @param {(e: Error) => void} error
 * @returns {Socket}
 */
function createConnection(options, success, error) {
    const tcpSocket = new Socket(getInstanceNumber(), nativeEventEmitter);
    return tcpSocket.connect(options, success, error);
}

export default { createServer, createConnection, Server };
