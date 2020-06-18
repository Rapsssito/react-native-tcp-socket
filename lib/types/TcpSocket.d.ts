/**
 * @typedef {{
 * port: number;
 * host?: string;
 * timeout?: number,
 * localAddress?: string,
 * localPort?: number,
 * interface?: 'wifi' | 'cellular' | 'ethernet',
 * reuseAddress?: boolean,
 * tls?: boolean,
 * tlsCheckValidity?: boolean,
 * tlsCert?: any,
 * }} ConnectionOptions
 */
export default class TcpSocket extends EventEmitter {
    /**
     * Initialices a TcpSocket.
     *
     * @param {number} id
     * @param {import('react-native').NativeEventEmitter} eventEmitter
     * @param {string} [address]
     */
    constructor(id: number, eventEmitter: import("react-native").NativeEventEmitter, address?: string | undefined);
    _id: number;
    _eventEmitter: import("react-native").NativeEventEmitter;
    /** @type {number} */
    _timeoutMsecs: number;
    _timeout: NodeJS.Timeout | undefined;
    /** @type {number} */
    _state: number;
    /**
     * @protected
     */
    protected _registerEvents(): void;
    _dataListener: import("react-native").EmitterSubscription | undefined;
    _errorListener: import("react-native").EmitterSubscription | undefined;
    _closeListener: import("react-native").EmitterSubscription | undefined;
    _connectListener: import("react-native").EmitterSubscription | undefined;
    /**
     * @protected
     */
    protected _unregisterEvents(): void;
    /**
     * @param {ConnectionOptions} options
     * @param {(address: string) => void} [callback]
     */
    connect(options: {
        port: number;
        host?: string | undefined;
        timeout?: number | undefined;
        localAddress?: string | undefined;
        localPort?: number | undefined;
        interface?: "wifi" | "cellular" | "ethernet" | undefined;
        reuseAddress?: boolean | undefined;
        tls?: boolean | undefined;
        tlsCheckValidity?: boolean | undefined;
        tlsCert?: any;
    }, callback?: ((address: string) => void) | undefined): TcpSocket;
    _destroyed: boolean | undefined;
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
    setTimeout(timeout: number, callback?: (() => void) | undefined): TcpSocket;
    /**
     * @private
     * @param {number} [timeout]
     */
    private _activateTimer;
    /**
     * @private
     */
    private _clearTimeout;
    /**
     * Enable/disable the use of Nagle's algorithm. When a TCP connection is created, it will have Nagle's algorithm enabled.
     *
     * Nagle's algorithm delays data before it is sent via the network. It attempts to optimize throughput at the expense of latency.
     *
     * Passing `true` for `noDelay` or not passing an argument will disable Nagle's algorithm for the socket. Passing false for noDelay will enable Nagle's algorithm.
     *
     * @param {boolean} noDelay
     */
    setNoDelay(noDelay?: boolean): void;
    address(): string | undefined;
    /**
     * @param {string | Buffer | Uint8Array} data
     * @param {BufferEncoding} [encoding]
     */
    end(data: string | Buffer | Uint8Array, encoding?: "ascii" | "utf8" | "utf-8" | "utf16le" | "ucs2" | "ucs-2" | "base64" | "latin1" | "binary" | "hex" | undefined): void;
    destroy(): void;
    /**
     * @private
     * @param {string} address
     */
    private _onConnect;
    /**
     * @private
     */
    private _onClose;
    /**
     * @private
     */
    private _onError;
    /**
     * Sends data on the socket. The second parameter specifies the encoding in the case of a string — it defaults to UTF8 encoding.
     *
     * The optional callback parameter will be executed when the data is finally written out, which may not be immediately.
     *
     * @param {string | Buffer | Uint8Array} buffer
     * @param {BufferEncoding} [encoding]
     * @param {(error: string | null) => void} [callback]
     */
    write(buffer: string | Buffer | Uint8Array, encoding?: "ascii" | "utf8" | "utf-8" | "utf16le" | "ucs2" | "ucs-2" | "base64" | "latin1" | "binary" | "hex" | undefined, callback?: ((error: string | null) => void) | undefined): void;
    /**
     * @private
     * @param {string | Buffer | Uint8Array} buffer
     * @param {BufferEncoding} [encoding]
     */
    private _generateSendBuffer;
    /**
     * @private
     * @param {string} address
     */
    private _setConnected;
    _address: string | undefined;
    /**
     * @private
     */
    private _setDisconnected;
    addListener(event: string | symbol, listener: (...args: any[]) => void): TcpSocket;
    on(event: string | symbol, listener: (...args: any[]) => void): TcpSocket;
    once(event: string | symbol, listener: (...args: any[]) => void): TcpSocket;
    removeListener(event: string | symbol, listener: (...args: any[]) => void): TcpSocket;
    off(event: string | symbol, listener: (...args: any[]) => void): TcpSocket;
    removeAllListeners(event?: string | symbol | undefined): TcpSocket;
    setMaxListeners(n: number): TcpSocket;
    prependListener(event: string | symbol, listener: (...args: any[]) => void): TcpSocket;
    prependOnceListener(event: string | symbol, listener: (...args: any[]) => void): TcpSocket;
}
export type ConnectionOptions = {
    port: number;
    host?: string | undefined;
    timeout?: number | undefined;
    localAddress?: string | undefined;
    localPort?: number | undefined;
    interface?: "wifi" | "cellular" | "ethernet" | undefined;
    reuseAddress?: boolean | undefined;
    tls?: boolean | undefined;
    tlsCheckValidity?: boolean | undefined;
    tlsCert?: any;
};
import { EventEmitter } from "node/events";
