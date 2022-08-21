const tls = require('tls');
const net = require('net');
// @ts-ignore
const fs = require('fs');

// @ts-ignore
const runningNode = typeof process !== 'undefined' && process.release?.name === 'node';
if (!runningNode) {
    // @ts-ignore
    tls.Server = tls.TLSServer;
    fs.readFileSync = () => {};
}

const ca = !runningNode
    ? // @ts-ignore
      require('../tls/server-cert.pem')
    : fs.readFileSync('tls/server-cert.pem');
const serverKey = !runningNode
    ? // @ts-ignore
      require('../tls/server-key.pem')
    : fs.readFileSync('tls/server-key.pem');
// @ts-ignore
const keystore = !runningNode ? require('../tls/server-keystore.p12') : undefined;

const server = new tls.Server();
const clientSocket = new net.Socket();
const client = new tls.TLSSocket(clientSocket);

function init() {
    server.setSecureContext({
        // @ts-ignore
        key: serverKey,
        cert: ca,
        keystore: keystore,
    });

    server.on('secureConnection', (socket) => {
        socket.on('data', () => {
            socket.write('Echo server\r\n');
        });
    });

    server.listen({ port: 9999, host: '127.0.0.1', reuseAddress: true });
}

module.exports = { init, server, client };
