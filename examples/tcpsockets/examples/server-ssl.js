const tls = require('tls');
const net = require('net');

// @ts-ignore
const runningNode = typeof process !== 'undefined' && process.release?.name === 'node';
if (!runningNode) {
    // @ts-ignore
    tls.Server = tls.TLSServer;
}

const clientSocket = new net.Socket();
const server = new tls.Server();
const client = new tls.TLSSocket(clientSocket);

let ca, /** @type {any} */ serverCert, /** @type {any} */ serverKey, /** @type {any} */ keystore;

ca = require('../tls/server-cert.pem');
serverKey = require('../tls/server-key.pem');
keystore = require('../tls/server-keystore.p12');
// serverCert = ca;
// // @ts-ignore
// ca = require('fs').readFileSync('tls/server-cert.pem');
// // @ts-ignore
// serverKey = require('fs').readFileSync('tls/server-key.pem');
// serverCert = ca;
// keystore = undefined;

function init() {
    server.setSecureContext({
        key: serverKey,
        cert: serverCert,
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
