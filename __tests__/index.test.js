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

test('isIP', () => {
    expect(net.isIP('127.9.8.9')).toBe(4);
    expect(net.isIP('127.9.8..')).toBe(0);
    expect(net.isIP('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(6);
});

test('isIPv4', () => {
    expect(net.isIPv4('127.9.8.9')).toBeTruthy();
    expect(net.isIPv4('127.9.8.9999')).toBeFalsy();
});

test('isIPv6', () => {
    expect(net.isIPv6('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBeTruthy();
    expect(net.isIPv6('2001:0db8:85a3:hhhh:0000:8a2e:0370:7334')).toBeFalsy();
});
