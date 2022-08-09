const tls = require('tls');
const net = require('net');

// @ts-ignore
const runningNode = typeof process !== 'undefined' && process.release.name === 'node';
if (!runningNode) {
    // @ts-ignore
    tls.Server = tls.TLSServer;
}

const server = new tls.Server();
const clientSocket = new net.Socket();
// @ts-ignore
const ca = runningNode ? require('fs').readFileSync('tls/server-cert.pem') : 'tls/ca-cert.pem';
// @ts-ignore
const serverKey = runningNode ? require('fs').readFileSync('tls/server-key.pem') : 'tls/server-key.pem';
const serverCert = ca;

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
        socket.write('Echo server\r\n');
    });

    server.listen({ port: 0, host: '127.0.0.1', reuseAddress: true }, () => {
        const port = server.address()?.port;
        if (!port) throw new Error('Server port not found');

        clientSocket.connect(
            {
                port: port,
                host: '127.0.0.1',
                localAddress: '127.0.0.1',
                reuseAddress: true,
                // localPort: 20000,
                // interface: "wifi"
            },
            () => {
                client.write('Hello, server! Love, Client.');
            }
        );
    });

    client.on('data', () => {
        client.destroy(); // kill client after server's response
    });
}

module.exports = { init, server, client };
