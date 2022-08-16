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
const client = new tls.TLSSocket(clientSocket, { ca });

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

    client.on('data', () => {
        client.destroy(); // kill client after server's response
    });

    server.listen({ port: 0, host: '127.0.0.1', reuseAddress: true }, () => {
        const port = server.address()?.port;
        if (!port) throw new Error('Server port not found');

        clientSocket.on('data', (data) => {
            console.log('AUX socket data ' + data);
        });

        clientSocket
            .on('error', (error) => {
                console.log('AUX socket error ' + error);
            })
            .on('close', (error) => {
                console.log('AUX socket closed ' + (error ? error : ''));
            })
            .on('connect', () => {
                console.log('AUX socket connected');
            });

        clientSocket.connect(
            {
                port: port,
                host: '127.0.0.1',
                localAddress: '127.0.0.1',
                reuseAddress: true,
                // localPort: 20000,
                // interface: "wifi",
            },
            () => {
                client.write('Hello, server! Love, Client.');
            }
        );
    });
}

module.exports = { init, server, client };
