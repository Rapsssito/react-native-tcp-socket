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

const client = new tls.TLSSocket(clientSocket);

function init() {
    const port = 443;

    clientSocket.connect(
        {
            port: port,
            host: 'www.google.com',
            reuseAddress: true,
        },
        () => {
            client.write('GET / HTTP/1.1\r\nHost:www.google.com\r\n\r\n');
        }
    );

    client.on('data', (data) => {
        client.destroy(); // kill client after server's response
    });
}

module.exports = { init, server, client };
