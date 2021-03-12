const net = require('net');
const PORT = Number(9 + (Math.random() * 999).toFixed(0));

const server = new net.Server();
const client = new net.Socket();

function init() {
    server.on('connection', (socket) => {
        socket.write('Echo server\r\n');
    });

    server.listen({ port: PORT, host: '127.0.0.1', reuseAddress: true });

    client.connect(
        // @ts-ignore
        {
            port: PORT,
            host: '127.0.0.1',
            localAddress: '127.0.0.1',
            reuseAddress: true,
            // localPort: 20000,
            // interface: "wifi",
            // tls: true
        },
        () => {
            client.write('Hello, server! Love, Client.');
        }
    );

    client.on('data', () => {
        client.destroy(); // kill client after server's response
    });
}

module.exports = { init, server, client };
