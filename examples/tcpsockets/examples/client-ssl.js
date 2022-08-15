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

let ca;

// ca = require('../tls/server-cert.pem');
ca = require('fs').readFileSync('tls/server-cert.pem');

const client = new tls.TLSSocket(clientSocket, {
    ca: ca,
});

function init() {
    const port = 9999;

    clientSocket.on('error', (error) => {
        console.log('Client extra error', error);
    })

    clientSocket.on('close', (hadError) => {
        console.log('Client extra close ' + hadError);
    })

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
