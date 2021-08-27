const net = require('net');

const server = new net.Server();
const client = new net.Socket();

function init() {
    server.on('connection', (socket) => {
        socket.on('data', (chunk) => {
            console.log(`Received ${chunk.length} bytes of data.`);
            console.log('Server client chunk start: ' + chunk.slice(0, 30));
            console.log('Server client chunk end: ' + chunk.slice(chunk.length - 30, chunk.length));
            socket.pause();
            console.log('There will be no additional data for 1 second.');
            setTimeout(() => {
                console.log('Now data will start flowing again.');
                socket.resume();
            }, 1000);
        });
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
                let i = 0;
                const MAX_ITER = 300000;
                write();
                async function write() {
                    let ok = true;
                    while (i < MAX_ITER && ok) {
                        i++;
                        const buff = ' ->' + i + '<- ';
                        ok = client.write(buff);
                        // await new Promise((resolve) => setTimeout(resolve, 50));
                        // console.log('Bytes sent', ok, buff, client.bytesSent);
                    }
                    if (i >= MAX_ITER) {
                        client.destroy();
                    } else if (!ok) {
                        // Had to stop early!
                        // Write some more once it drains.
                        client.once('drain', write);
                    }
                }
            }
        );
    });
}

module.exports = { init, server, client };
