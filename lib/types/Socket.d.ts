/**
 * @typedef {"ascii" | "utf8" | "utf-8" | "utf16le" | "ucs2" | "ucs-2" | "base64" | "latin1" | "binary" | "hex"} BufferEncoding
 *
 * @typedef {import('react-native').NativeEventEmitter} NativeEventEmitter
 *
 * @typedef {{address: string, family: string, port: number}} AddressInfo
 *
 * @typedef {{localAddress: string, localPort: number, remoteAddress: string, remotePort: number, remoteFamily: string}} NativeConnectionInfo
 *
 * @typedef {{
 * port: number;
 * host?: string;
 * localAddress?: string,
 * localPort?: number,
 * interface?: 'wifi' | 'cellular' | 'ethernet',
 * reuseAddress?: boolean,
 * tls?: boolean,
 * tlsCheckValidity?: boolean,
 * tlsCert?: any,
 * connectTimeout?: number,
 * }} ConnectionOptions
 *
 * @typedef {object} ReadableEvents
 * @property {() => void} pause
 * @property {() => void} resume
 * @property {() => void} end
 *
 * @typedef {object} SocketEvents
 * @property {(had_error: boolean) => void} close
 * @property {() => void} connect
 * @property {(data: Buffer | string) => void} data
 * @property {() => void} drain
 * @property {(err: Error) => void} error
 * @property {() => void} timeout
 * @property {() => void} secureConnect
 *
 * @extends {EventEmitter<SocketEvents & ReadableEvents, any>}
 */
export default class Socket extends EventEmitter<SocketEvents & ReadableEvents, any> {
    /** @package */
    _id: number;
    /** @private */
    private _eventEmitter;
    /** @type {EventEmitter<'written', any>} @private */
    private _msgEvtEmitter;
    /** @type {number} @private */
    private _timeoutMsecs;
    /** @type {number | undefined} @private */
    private _timeout;
    /** @private */
    private _encoding;
    /** @private */
    private _msgId;
    /** @private */
    private _lastRcvMsgId;
    /** @private */
    private _lastSentMsgId;
    /** @private */
    private _paused;
    /** @private */
    private _resuming;
    /** @private */
    private _writeBufferSize;
    /** @private */
    private _bytesRead;
    /** @private */
    private _bytesWritten;
    /** @private */
    private _connecting;
    /** @private */
    private _pending;
    /** @private */
    private _destroyed;
    /** @type {'opening' | 'open' | 'readOnly' | 'writeOnly'} @private */
    private _readyState;
    /** @type {{ id: number; data: string; }[]} @private */
    private _pausedDataEvents;
    readableHighWaterMark: number;
    writableHighWaterMark: number;
    writableNeedDrain: boolean;
    localAddress: string | undefined;
    localPort: number | undefined;
    remoteAddress: string | undefined;
    remotePort: number | undefined;
    remoteFamily: string | undefined;
    allowHalfOpen: boolean;
    get readyState(): "opening" | "open" | "readOnly" | "writeOnly";
    get destroyed(): boolean;
    get pending(): boolean;
    get connecting(): boolean;
    get bytesWritten(): number;
    get bytesRead(): number;
    get timeout(): number | undefined;
    /**
     * @package
     * @param {number} id
     */
    _setId(id: number): void;
    /**
     * @package
     * @param {NativeConnectionInfo} connectionInfo
     */
    _setConnected(connectionInfo: NativeConnectionInfo): void;
    /**
     * @param {ConnectionOptions} options
     * @param {() => void} [callback]
     */
    connect(options: ConnectionOptions, callback?: (() => void) | undefined): Socket;
    /**
     * Sets the socket to timeout after `timeout` milliseconds of inactivity on the socket. By default `TcpSocket` do not have a timeout.
     *
     * When an idle timeout is triggered the socket will receive a `'timeout'` event but the connection will not be severed.
     * The user must manually call `socket.end()` or `socket.destroy()` to end the connection.
     *
     * If `timeout` is 0, then the existing idle timeout is disabled.
     *
     * The optional `callback` parameter will be added as a one-time listener for the `'timeout'` event.
     *
     * @param {number} timeout
     * @param {() => void} [callback]
     */
    setTimeout(timeout: number, callback?: (() => void) | undefined): Socket;
    /**
     * @private
     */
    private _resetTimeout;
    /**
     * @private
     */
    private _clearTimeout;
    /**
     * Set the encoding for the socket as a Readable Stream. By default, no encoding is assigned and stream data will be returned as `Buffer` objects.
     * Setting an encoding causes the stream data to be returned as strings of the specified encoding rather than as Buffer objects.
     *
     * For instance, calling `socket.setEncoding('utf8')` will cause the output data to be interpreted as UTF-8 data, and passed as strings.
     * Calling `socket.setEncoding('hex')` will cause the data to be encoded in hexadecimal string format.
     *
     * @param {BufferEncoding} [encoding]
     */
    setEncoding(encoding?: "ascii" | "utf8" | "utf-8" | "utf16le" | "ucs2" | "ucs-2" | "base64" | "latin1" | "binary" | "hex" | undefined): Socket;
    /**
     * Enable/disable the use of Nagle's algorithm. When a TCP connection is created, it will have Nagle's algorithm enabled.
     *
     * Nagle's algorithm delays data before it is sent via the network. It attempts to optimize throughput at the expense of latency.
     *
     * Passing `true` for `noDelay` or not passing an argument will disable Nagle's algorithm for the socket. Passing false for noDelay will enable Nagle's algorithm.
     *
     * @param {boolean} noDelay Default: `true`
     */
    setNoDelay(noDelay?: boolean): Socket;
    /**
     * Enable/disable keep-alive functionality, and optionally set the initial delay before the first keepalive probe is sent on an idle socket.
     *
     * `initialDelay` is ignored.
     *
     * @param {boolean} enable Default: `false`
     * @param {number} initialDelay ***IGNORED**. Default: `0`
     */
    setKeepAlive(enable?: boolean, initialDelay?: number): Socket;
    /**
     * Returns the bound `address`, the address `family` name and `port` of the socket as reported
     * by the operating system: `{ port: 12346, family: 'IPv4', address: '127.0.0.1' }`.
     *
     * @returns {AddressInfo | {}}
     */
    address(): AddressInfo | {};
    /**
     * Half-closes the socket. i.e., it sends a FIN packet. It is possible the server will still send some data.
     *
     * @param {string | Buffer | Uint8Array} [data]
     * @param {BufferEncoding} [encoding]
     */
    end(data?: string | Buffer | Uint8Array | undefined, encoding?: "ascii" | "utf8" | "utf-8" | "utf16le" | "ucs2" | "ucs-2" | "base64" | "latin1" | "binary" | "hex" | undefined): Socket;
    /**
     * Ensures that no more I/O activity happens on this socket. Destroys the stream and closes the connection.
     */
    destroy(): Socket;
    /**
     * Sends data on the socket. The second parameter specifies the encoding in the case of a string — it defaults to UTF8 encoding.
     *
     * Returns `true` if the entire data was flushed successfully to the kernel buffer. Returns `false` if all or part of the data
     * was queued in user memory. `'drain'` will be emitted when the buffer is again free.
     *
     * The optional callback parameter will be executed when the data is finally written out, which may not be immediately.
     *
     * @param {string | Buffer | Uint8Array} buffer
     * @param {BufferEncoding} [encoding]
     * @param {(err?: Error) => void} [cb]
     *
     * @return {boolean}
     */
    write(buffer: string | Buffer | Uint8Array, encoding?: "ascii" | "utf8" | "utf-8" | "utf16le" | "ucs2" | "ucs-2" | "base64" | "latin1" | "binary" | "hex" | undefined, cb?: ((err?: Error | undefined) => void) | undefined): boolean;
    /**
     * Pauses the reading of data. That is, `'data'` events will not be emitted. Useful to throttle back an upload.
     */
    pause(): Socket;
    /**
     * Resumes reading after a call to `socket.pause()`.
     */
    resume(): void;
    ref(): void;
    unref(): void;
    /**
     * @private
     */
    private _recoverDataEventsAfterPause;
    /**
     * @private
     */
    private _onDeviceDataEvt;
    /**
     * @private
     */
    private _registerEvents;
    _dataListener: import("react-native").EmitterSubscription | undefined;
    _errorListener: import("react-native").EmitterSubscription | undefined;
    _closeListener: import("react-native").EmitterSubscription | undefined;
    _endListener: import("react-native").EmitterSubscription | undefined;
    _connectListener: import("react-native").EmitterSubscription | undefined;
    _writtenListener: import("react-native").EmitterSubscription | undefined;
    /**
     * @package
     */
    _unregisterEvents(): void;
    /**
     * @private
     * @param {string | Buffer | Uint8Array} buffer
     * @param {BufferEncoding} [encoding]
     */
    private _generateSendBuffer;
    /**
     * @private
     */
    private _setDisconnected;
}
export type BufferEncoding = "ascii" | "utf8" | "utf-8" | "utf16le" | "ucs2" | "ucs-2" | "base64" | "latin1" | "binary" | "hex";
export type NativeEventEmitter = import("react-native").NativeEventEmitter;
export type AddressInfo = {
    address: string;
    family: string;
    port: number;
};
export type NativeConnectionInfo = {
    localAddress: string;
    localPort: number;
    remoteAddress: string;
    remotePort: number;
    remoteFamily: string;
};
export type ConnectionOptions = {
    port: number;
    host?: string | undefined;
    localAddress?: string | undefined;
    localPort?: number | undefined;
    interface?: "wifi" | "cellular" | "ethernet" | undefined;
    reuseAddress?: boolean | undefined;
    tls?: boolean | undefined;
    tlsCheckValidity?: boolean | undefined;
    tlsCert?: any;
    connectTimeout?: number | undefined;
};
export type ReadableEvents = {
    pause: () => void;
    resume: () => void;
    end: () => void;
};
export type SocketEvents = {
    close: (had_error: boolean) => void;
    connect: () => void;
    data: (data: Buffer | string) => void;
    drain: () => void;
    error: (err: Error) => void;
    timeout: () => void;
    secureConnect: () => void;
};
import EventEmitter from "eventemitter3";
import { Buffer } from "buffer";
