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

const server = new tls.Server();
const clientSocket = new net.Socket();
const client = new tls.TLSSocket(clientSocket, { ca });

function init() {
    const port = 9999;

    clientSocket.on('error', (error) => {
        console.log('Client extra error', error);
    });

    clientSocket.on('close', (hadError) => {
        console.log('Client extra close ' + hadError);
    });

    clientSocket.connect(
        {
            port: port,
            host: '127.0.0.1',
            reuseAddress: true,
        },
        () => {
            console.log('Connected client');
            client.write('GET / HTTP/1.1\r\nHost:www.google.com\r\n\r\n');
        }
    );
}

module.exports = { init, server, client };
