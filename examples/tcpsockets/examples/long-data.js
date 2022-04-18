const net = require('net');

const server = new net.Server();
const client = new net.Socket();

const hugeData = 'x'.repeat(5*1024*1024)

function init() {
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
                client.end(hugeData, 'utf8');
            }
        );
    });
}

module.exports = { init, server, client };
