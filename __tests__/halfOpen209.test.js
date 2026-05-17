import { expect, test, jest, beforeEach } from '@jest/globals';
import net from '../src/index';
import { nativeEventEmitter } from '../src/Globals';
import { NativeModules } from 'react-native';

const Sockets = NativeModules.TcpSockets;

// Mirror the Globals mock used by allowHalfOpen.test.js so socket ids
// and the native event emitter behave deterministically.
jest.mock('../src/Globals', () => {
    const { EventEmitter } = require('events');
    const emitter = new EventEmitter();
    const originalAddListener = emitter.addListener.bind(emitter);
    // @ts-ignore
    emitter.addListener = (event, listener) => {
        originalAddListener(event, listener);
        return { remove: () => emitter.removeListener(event, listener) };
    };
    let idCounter = 2000;
    return {
        __esModule: true,
        nativeEventEmitter: emitter,
        getNextId: () => idCounter++,
        // Socket.js guards every JSI call with `typeof fn === 'function'`,
        // so omitting these here exercises the no-bridge degrade path.
    };
});

beforeEach(() => {
    Sockets.connect.mockClear();
    Sockets.end.mockClear();
    Sockets.destroy.mockClear();
    Sockets.write.mockClear();
});

/**
 * #209 / #183 Node `net.Socket` parity. `@libp2p/tcp` requires these
 * exact APIs: it passes `allowHalfOpen` through `net.connect(cOpts)`,
 * calls `socket.destroySoon()` on every graceful close, calls
 * `socket.resetAndDestroy()` for resets, and reads a BOOLEAN `hadError`
 * from the `'close'` event.
 */

test('connect() reads allowHalfOpen from the options object (libp2p passes it through net.connect)', () => {
    const socket = new net.Socket();
    expect(socket.allowHalfOpen).toBe(false);
    socket.connect({ port: 1234, host: '127.0.0.1', allowHalfOpen: true });
    expect(socket.allowHalfOpen).toBe(true);
    // It must NOT be forwarded to the native connect args (JS lifecycle
    // flag only — and arbitrary caller objects must never cross).
    const customOptions = Sockets.connect.mock.calls[0][3];
    expect(customOptions.allowHalfOpen).toBeUndefined();
});

test('destroySoon() exists and, when nothing is buffered after end(), destroys immediately', () => {
    const socket = new net.Socket();
    socket.connect({ port: 1, host: 'h' });
    // simulate native connect ack
    socket._setConnected({
        localAddress: '127.0.0.1',
        localPort: 1,
        remoteAddress: 'h',
        remotePort: 1,
        remoteFamily: 'IPv4',
    });
    expect(typeof socket.destroySoon).toBe('function');
    socket.end(); // writable finished, no buffered bytes
    socket.destroySoon();
    expect(Sockets.destroy).toHaveBeenCalled();
});

test('destroySoon() with unflushed write defers destroy until close', () => {
    const socket = new net.Socket();
    socket.connect({ port: 1, host: 'h' });
    socket._setConnected({
        localAddress: '127.0.0.1',
        localPort: 1,
        remoteAddress: 'h',
        remotePort: 1,
        remoteFamily: 'IPv4',
    });
    // Simulate unflushed outbound bytes. (Going through write() would hit
    // the intentional loud throw — the Jest env has no JSI bridge — so
    // set the buffered-size accumulator directly: destroySoon's decision
    // is exactly `_writableEnded && _writeBufferSize === 0`.)
    socket._writeBufferSize = 13;
    socket.destroySoon();
    // FIN sent, but destroy deferred until 'close'
    expect(Sockets.end).toHaveBeenCalled();
    expect(Sockets.destroy).not.toHaveBeenCalled();
    // native reports the socket closed → now it tears down
    nativeEventEmitter.emit('close', { id: socket._id });
    expect(Sockets.destroy).toHaveBeenCalled();
});

test('resetAndDestroy() exists and destroys the socket', () => {
    const socket = new net.Socket();
    socket.connect({ port: 1, host: 'h' });
    socket._setConnected({
        localAddress: '127.0.0.1',
        localPort: 1,
        remoteAddress: 'h',
        remotePort: 1,
        remoteFamily: 'IPv4',
    });
    expect(typeof socket.resetAndDestroy).toBe('function');
    socket.resetAndDestroy();
    expect(Sockets.destroy).toHaveBeenCalled();
    expect(socket.destroyed).toBe(true);
});

test("'close' emits a BOOLEAN hadError (Node net.Socket spec), not the error object", () => {
    // A socket emits 'close' exactly once and detaches its native
    // listeners on disconnect, so each case needs its own socket.
    const clean = new net.Socket();
    clean.connect({ port: 1, host: 'h' });
    let cleanArg;
    clean.on('close', (hadError) => {
        cleanArg = hadError;
    });
    nativeEventEmitter.emit('close', { id: clean._id });

    const errored = new net.Socket();
    errored.connect({ port: 2, host: 'h' });
    let erroredArg;
    errored.on('close', (hadError) => {
        erroredArg = hadError;
    });
    nativeEventEmitter.emit('close', { id: errored._id, error: new Error('boom') });

    expect(cleanArg).toBe(false);
    expect(erroredArg).toBe(true);
    expect(typeof cleanArg).toBe('boolean');
    expect(typeof erroredArg).toBe('boolean');
});

test('destroy(error) emits the error then marks destroyed', () => {
    const socket = new net.Socket();
    socket.connect({ port: 1, host: 'h' });
    const errs = [];
    socket.on('error', (e) => errs.push(e));
    const boom = new Error('reset');
    socket.destroy(boom);
    expect(errs).toEqual([boom]);
    expect(socket.destroyed).toBe(true);
});
