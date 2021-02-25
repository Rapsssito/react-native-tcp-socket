const TcpSocket = require('net');

const serverPort = Number(9 + (Math.random() * 999).toFixed(0));
const serverHost = '0.0.0.0';
const server = TcpSocket.createServer((socket) => {
    console.log(`client connected to server on ${JSON.stringify(socket.address())}`);
    console.log(
        'Server client',
        client.localAddress,
        client.localPort,
        client.remoteAddress,
        client.remotePort,
        client.remoteFamily
    );

    socket.on('data', (data) => {
        console.log(`Server Received: ${data}`);
        socket.write('Echo server\r\n');
    });

    socket.on('error', (error) => {
        console.log(`server client error ${error}`);
    });

    socket.on('close', (error) => {
        console.log(`server client closed ${error ? error : ''}`);
    });
}).listen({ port: serverPort, host: serverHost, reuseAddress: true }, () => {
    console.log(`opened server on ${JSON.stringify(server.address())}`);
});

server.on('error', (error) => {
    console.log(`Server error ${error}`);
});

server.on('close', () => {
    console.log('server close');
});

const client = TcpSocket.createConnection(
    {
        port: serverPort,
        host: serverHost,
        localAddress: '127.0.0.1',
        // reuseAddress: true,
        // localPort: 20000,
        // interface: "wifi",
        // tls: true
    },
    () => {
        console.log(`opened client on ${JSON.stringify(client.address())}`);
        client.write('Hello, server! Love, Client.');
    }
);

client.on('data', (data) => {
    console.log(`Client Received: ${data}`);
    console.log(
        'Initial client',
        client.localAddress,
        client.localPort,
        client.remoteAddress,
        client.remotePort,
        client.remoteFamily
    );
    client.destroy(); // kill client after server's response
    server.close();
});

client.on('error', (error) => {
    console.log(`client error ${error}`);
});

client.on('close', () => {
    console.log('client close');
});
