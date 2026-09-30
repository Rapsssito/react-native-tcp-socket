import { expect, test, jest, beforeEach } from '@jest/globals';
import net from '../src/index';
import { nativeEventEmitter } from '../src/Globals';
import { NativeModules } from 'react-native';

const Sockets = NativeModules.TcpSockets;

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
    };
});

const FILE_PATH = '/data/model.bin';

function createConnectedSocket() {
    const socket = new net.Socket();
    socket.connect({ port: 8080, host: '192.168.1.20' });
    // @ts-ignore
    const id = socket._id;
    nativeEventEmitter.emit('connect', {
        id,
        connection: {
            localAddress: '192.168.1.10',
            localPort: 54321,
            remoteAddress: '192.168.1.20',
            remotePort: 8080,
            remoteFamily: 'IPv4',
        },
    });
    return { socket, id };
}

beforeEach(() => {
    Sockets.sendFile.mockClear();
    Sockets.receiveHttpBodyToFile.mockClear();
});

test('sendFile: rejects when the socket is not connected', async () => {
    const socket = new net.Socket();

    await expect(socket.sendFile(FILE_PATH, 0, 10)).rejects.toThrow('Socket is closed.');
    expect(Sockets.sendFile).not.toHaveBeenCalled();
});

test('sendFile: resolves once the native side reports the file as written', async () => {
    const { socket, id } = createConnectedSocket();

    const sent = socket.sendFile(FILE_PATH, 100, 900);

    expect(Sockets.sendFile).toHaveBeenCalledWith(id, FILE_PATH, 100, 900, 0);
    expect(socket.bytesWritten).toBe(900);
    nativeEventEmitter.emit('written', { id, msgId: 0 });
    await expect(sent).resolves.toBeUndefined();
});

test('sendFile: stays ordered with write()', async () => {
    const { socket, id } = createConnectedSocket();

    socket.write('HTTP/1.1 200 OK\r\n\r\n');
    const sent = socket.sendFile(FILE_PATH, 0, 10);

    expect(Sockets.write).toHaveBeenLastCalledWith(id, expect.any(String), 0);
    expect(Sockets.sendFile).toHaveBeenCalledWith(id, FILE_PATH, 0, 10, 1);
    nativeEventEmitter.emit('written', { id, msgId: 0 });
    nativeEventEmitter.emit('written', { id, msgId: 1 });
    await expect(sent).resolves.toBeUndefined();
});

test('sendFile: rejects with the error of the written event', async () => {
    const { socket, id } = createConnectedSocket();

    const sent = socket.sendFile(FILE_PATH, 0, 10);
    nativeEventEmitter.emit('written', { id, msgId: 0, err: 'Broken pipe' });

    await expect(sent).rejects.toThrow('Broken pipe');
});

test('sendFile: rejects when the socket reports an error', async () => {
    const { socket, id } = createConnectedSocket();

    const sent = socket.sendFile(FILE_PATH, 0, 10);
    nativeEventEmitter.emit('error', { id, error: 'Cannot open the file to send' });

    await expect(sent).rejects.toThrow('Cannot open the file to send');
});

test('sendFile: rejects when the socket closes before the end', async () => {
    const { socket, id } = createConnectedSocket();

    const sent = socket.sendFile(FILE_PATH, 0, 10);
    nativeEventEmitter.emit('close', { id, error: false });

    await expect(sent).rejects.toThrow('Socket closed before the file was sent.');
});

test('sendFile: emits fileProgress for its own socket only', () => {
    const { socket, id } = createConnectedSocket();
    const onProgress = jest.fn();
    socket.on('fileProgress', onProgress);

    socket.sendFile(FILE_PATH, 0, 1000).catch(() => {});
    nativeEventEmitter.emit('fileProgress', { id: id + 1, bytes: 1, total: 2 });
    nativeEventEmitter.emit('fileProgress', { id, bytes: 250, total: 1000 });

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(250, 1000);
});

test('receiveHttpBodyToFile: throws when the socket is not connected', () => {
    const socket = new net.Socket();

    expect(() => socket.receiveHttpBodyToFile(FILE_PATH)).toThrow('Socket is closed.');
    expect(Sockets.receiveHttpBodyToFile).not.toHaveBeenCalled();
});

test('receiveHttpBodyToFile: emits fileProgress then fileEnd without error', () => {
    const { socket, id } = createConnectedSocket();
    const onProgress = jest.fn();
    const onEnd = jest.fn();
    socket.on('fileProgress', onProgress);
    socket.on('fileEnd', onEnd);

    expect(socket.receiveHttpBodyToFile(FILE_PATH)).toBe(socket);
    nativeEventEmitter.emit('fileProgress', { id, bytes: 500, total: 1000 });
    nativeEventEmitter.emit('fileEnd', { id, bytes: 1000, error: null });

    expect(Sockets.receiveHttpBodyToFile).toHaveBeenCalledWith(id, FILE_PATH);
    expect(onProgress).toHaveBeenCalledWith(500, 1000);
    expect(onEnd).toHaveBeenCalledWith(1000, null);
});

test('receiveHttpBodyToFile: reports the failure in fileEnd', () => {
    const { socket, id } = createConnectedSocket();
    const onEnd = jest.fn();
    socket.on('fileEnd', onEnd);

    socket.receiveHttpBodyToFile(FILE_PATH);
    nativeEventEmitter.emit('fileEnd', { id, bytes: 0, error: 'HTTP 404' });

    expect(onEnd).toHaveBeenCalledWith(0, 'HTTP 404');
});
