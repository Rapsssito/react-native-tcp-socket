
import { expect, test, jest } from '@jest/globals';
import net from '../src/index';
import { nativeEventEmitter } from '../src/Globals';
import { NativeModules } from 'react-native';

const Sockets = NativeModules.TcpSockets;

jest.mock('../src/Globals', () => {
    const { EventEmitter } = require('events');
    const emitter = new EventEmitter();
    const originalAddListener = emitter.addListener.bind(emitter);
    emitter.addListener = (event, listener) => {
        originalAddListener(event, listener);
        return { remove: () => emitter.removeListener(event, listener) };
    };
    
    let idCounter = 1000;
    return {
        __esModule: true,
        nativeEventEmitter: emitter,
        getNextId: () => idCounter++,
    };
});

test('allowHalfOpen: false (default) should call Sockets.end() on end event', (done) => {
    // Reset mocks
    Sockets.end.mockClear();

    const server = net.createServer(); // allowHalfOpen default false
    const serverId = server._id;
    server.listen(12345);
    
    server.on('connection', (socket) => {
        socket.on('end', () => {
            try {
                // When we receive 'end', if allowHalfOpen is false, socket.end() should be called
                // which calls Sockets.end(id)
                expect(Sockets.end).toHaveBeenCalled();
                done();
            } catch (e) {
                done(e);
            }
        });
    });

    // Simulate connection
    nativeEventEmitter.emit('connection', {
        id: serverId,
        info: {
            id: 456,
            connection: {
                localAddress: '127.0.0.1',
                localPort: 12345,
                remoteAddress: '127.0.0.1',
                remotePort: 54321,
                remoteFamily: 'IPv4'
            }
        }
    });

    // Simulate 'end' event from native for socket 456
    nativeEventEmitter.emit('end', { id: 456 });
});

test('allowHalfOpen: true should NOT call Sockets.end() on end event', (done) => {
    // Reset mocks
    Sockets.end.mockClear();

    const server = net.createServer({ allowHalfOpen: true });
    const serverId = server._id;
    server.listen(12346);
    
    server.on('connection', (socket) => {
        socket.on('end', () => {
            try {
                // When we receive 'end', if allowHalfOpen is true, socket.end() should NOT be called
                expect(Sockets.end).not.toHaveBeenCalled();
                done();
            } catch (e) {
                done(e);
            }
        });
    });

    // Simulate connection
    nativeEventEmitter.emit('connection', {
        id: serverId,
        info: {
            id: 457,
            connection: {
                localAddress: '127.0.0.1',
                localPort: 12346,
                remoteAddress: '127.0.0.1',
                remotePort: 54321,
                remoteFamily: 'IPv4'
            }
        }
    });

    // Simulate 'end' event from native for socket 457
    nativeEventEmitter.emit('end', { id: 457 });
});
