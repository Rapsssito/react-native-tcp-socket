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

if (require.main === module) {
    server.on('connection', (socket) => {
        console.log('Client connected to server on ' + JSON.stringify(socket.address()));

        socket.on('data', (data) => {
            console.log('Server client received: ' + data);
        });

        socket.on('error', (error) => {
            console.log('Server client error ' + error);
        });

        socket.on('close', (error) => {
            console.log('Server client closed ' + (error ? error : ''));
        });
    });

    server.on('error', (error) => {
        console.log('Server error ' + error);
    });

    server.on('close', () => {
        console.log('Server closed');
    });

    client.on('connect', () => {
        console.log('Opened client on ' + JSON.stringify(client.address()));
    });

    client.on('data', (data) => {
        console.log('Client received: ' + data);
    });

    client.on('error', (error) => {
        console.log('Client error ' + error);
    });

    client.on('close', (error) => {
        console.log('Client closed ' + (error ? error : ''));
    });

    init();
}
