import { expect, test } from '@jest/globals';
import net from '../src/index';

test('create-client', () => {
    const options = {
        port: 1234,
        host: '1.2.3.4',
        localAddress: '127.0.0.1',
        reuseAddress: true,
        // localPort: 20000,
        // interface: "wifi"
    };

    const socket = net.createConnection(options, () => {});
    expect(socket).toBeInstanceOf(net.Socket);
});

test('create-server', () => {
    const server = net.createServer(() => {});
    expect(server).toBeInstanceOf(net.Server);
});
