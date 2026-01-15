
import { expect, test, jest } from '@jest/globals';

jest.mock('../src/Globals', () => {
    const { EventEmitter } = require('events');
    const emitter = new EventEmitter();
    const originalAddListener = emitter.addListener.bind(emitter);
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

test('server option pauseOnConnect should pause the socket', (done) => {
    const server = net.createServer({ pauseOnConnect: true });
    
    server.listen(12345);
    
    server.on('connection', (socket) => {
        try {
            // Check if socket is paused
            expect(socket._paused).toBe(true);
            done();
        } catch (error) {
            done(error);
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
                remoteFamily: 'IPv4'
            }
        }
    });
});
