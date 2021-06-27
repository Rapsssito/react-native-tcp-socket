const net = require('net');
const PORT = Number(9 + (Math.random() * 999).toFixed(0));

const server = new net.Server();
const client = new net.Socket();

function init() {
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
            let i = 0;
            const MAX_ITER = 1000000;
            write();
            function write() {
                let ok = true;
                do {
                    i++;
                    if (i === 0) {
                        // Last time!
                        client.write(''+i+',');
                    } else {
                        // See if we should continue, or wait.
                        // Don't pass the callback, because we're not done yet.
                        ok = client.write(''+i+',');
                    }
                } while (i < MAX_ITER && ok);
                if (!ok) {
                    // Had to stop early!
                    // Write some more once it drains.
                    client.once('drain', write);
                } else {
                    client.destroy();
                }
            }
        }
    );
}

module.exports = { init, server, client };
