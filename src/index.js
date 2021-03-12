'use strict';

import Socket from './Socket';
import Server from './Server';

/**
 * @param {(socket: Socket) => void} connectionListener
 * @returns {Server}
 */
function createServer(connectionListener) {
    return new Server(connectionListener);
}

/**
 * @param {import('./Socket').ConnectionOptions} options
 * @param {() => void} callback
 * @returns {Socket}
 */
function createConnection(options, callback) {
    const tcpSocket = new Socket();
    return tcpSocket.connect(options, callback);
}

export default { createServer, createConnection, Server, Socket };

// @ts-ignore
module.exports = { createServer, createConnection, Server, Socket };
