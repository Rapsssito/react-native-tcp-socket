import { expect, test } from '@jest/globals';
import TcpSockets from '../src/index';
import TcpServer from '../src/TcpServer';
import TcpSocket from '../src/TcpSocket';

test('create-client', () => {
    const options = {
        port: 1234,
        host: '1.2.3.4',
        localAddress: '127.0.0.1',
        reuseAddress: true,
        // localPort: 20000,
        // interface: "wifi"
    };

    const socket = TcpSockets.createConnection(options, () => {});
    expect(socket).toBeInstanceOf(TcpSocket);
});

test('create-server', () => {
    const server = TcpSockets.createServer(() => {});
    expect(server).toBeInstanceOf(TcpServer);
});
