const tls = require('tls');
const net = require('net');

// @ts-ignore
const runningNode = typeof process !== 'undefined' && process.release?.name === 'node';
if (!runningNode) {
    // @ts-ignore
    tls.Server = tls.TLSServer;
}

const server = new tls.Server();
const clientSocket = new net.Socket();

let ca, /** @type {any} */ serverCert, /** @type {any} */ serverKey;

// ca = require('../tls/server-cert.pem');
// serverKey = require('../tls/server-key.pem');
// serverCert = ca;
// @ts-ignore
ca = require('fs').readFileSync('tls/server-cert.pem');
// @ts-ignore
serverKey = require('fs').readFileSync('tls/server-key.pem');
serverCert = ca;

const client = new tls.TLSSocket(clientSocket, {
    ca,
    rejectUnauthorized: true,
});

function init() {
    server.setSecureContext({
        key: serverKey,
        cert: serverCert,
    });

    server.on('secureConnection', (socket) => {
        socket.on('data', () => {
            socket.write('Echo server\r\n');
        });
    });

    server.listen({ port: 0, host: '127.0.0.1', reuseAddress: true }, () => {
        const port = server.address()?.port;
        if (!port) throw new Error('Server port not found');

        clientSocket.connect({
            port: port,
            host: '127.0.0.1',
            localAddress: '127.0.0.1',
            reuseAddress: true,
            // localPort: 20000,
            // interface: "wifi"
        }, () => {
            console.log('bre')
            console.log(clientSocket.localPort)
            client.renegotiate({
                ca,
                rejectUnauthorized: false,
            }, (err) => {
                if (err) throw err;
                client.write('Hello, server! Love, Client.');
            });
        });
    });

    client.on('data', () => {
        client.destroy(); // kill client after server's response
    });
}

module.exports = { init, server, client };
