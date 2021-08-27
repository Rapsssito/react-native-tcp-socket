const net = require('net');

const server = new net.Server();
const client = new net.Socket();

function init() {
    server.on('connection', (socket) => {
        socket.write('Echo server\r\n');
    });

    server.listen({ port: 0, host: '127.0.0.1', reuseAddress: true }, () => {
        const port = server.address()?.port;
        if (!port) throw new Error('Server port not found');
        client.connect(
            {
                port: port,
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
    });

    client.on('data', () => {
        client.destroy(); // kill client after server's response
    });
}

module.exports = { init, server, client };
