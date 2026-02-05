import { expect, test, jest } from '@jest/globals';

jest.mock('../src/Globals', () => {
    const { EventEmitter } = require('events');
    const emitter = new EventEmitter();
    const originalAddListener = emitter.addListener.bind(emitter);
    // @ts-ignore
    emitter.addListener = (event, listener) => {
        originalAddListener(event, listener);
        return { remove: () => emitter.removeListener(event, listener) };
    };
    return {
        __esModule: true,
        nativeEventEmitter: emitter,
        getNextId: () => 123,
    };
});

import net from '../src/index';
import { nativeEventEmitter } from '../src/Globals';

test('server option pauseOnConnect should pause the socket', () => {
    return new Promise((resolve, reject) => {
        const server = net.createServer({ pauseOnConnect: true });

        server.listen(12345);

        server.on('connection', (socket) => {
            try {
                // Check if socket is paused
                // @ts-ignore
                expect(socket._paused).toBe(true);
                resolve(undefined);
            } catch (error) {
                reject(error);
            }
        });

        nativeEventEmitter.emit('connection', {
            id: 123,
            info: {
                id: 456,
                connection: {
                    localAddress: '127.0.0.1',
                    localPort: 12345,
                    remoteAddress: '127.0.0.1',
                    remotePort: 54321,
                    remoteFamily: 'IPv4',
                },
            },
        });
    });
});
