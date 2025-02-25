/**
 * @typedef {object} ServerOptions
 * @property {boolean} [noDelay]
 * @property {boolean} [keepAlive]
 * @property {number} [keepAliveInitialDelay]
 * @property {boolean} [allowHalfOpen]
 * @property {boolean} [pauseOnConnect]
 * 
 * @typedef {import('./TLSSocket').default} TLSSocket
 *
 * @typedef {object} ServerEvents
 * @property {() => void} close
 * @property {(socket: Socket) => void} connection
 * @property {() => void} listening
 * @property {(err: Error) => void} error
 * @property {(tlsSocket: TLSSocket) => void} secureConnection
 *
 * @extends {EventEmitter<ServerEvents, any>}
 */
export default class Server extends EventEmitter<ServerEvents, any> {
    /**
     * @param {ServerOptions | ((socket: Socket) => void)} [options] Server options or connection listener
     * @param {(socket: Socket) => void} [connectionCallback] Automatically set as a listener for the `'connection'` event.
     */
    constructor(options?: ServerOptions | ((socket: Socket) => void), connectionCallback?: (socket: Socket) => void);
    
    /** @protected @readonly */
    protected readonly _id: number;
    /** @protected @readonly */
    protected readonly _eventEmitter: import("react-native").EventEmitter;
    /** @private @type {Set<Socket>} */
    private _connections: Set<Socket>;
    /** @private */
    private _localAddress: string | undefined;
    /** @private */
    private _localPort: number | undefined;
    /** @private */
    private _localFamily: string | undefined;
    /** @private */
    private _serverOptions: ServerOptions;
    listening: boolean;
    
    /**
     * Start a server listening for connections.
     *
     * This function is asynchronous. When the server starts listening, the `'listening'` event will be emitted.
     * The last parameter `callback` will be added as a listener for the `'listening'` event.
     *
     * The `server.listen()` method can be called again if and only if there was an error during the first
     * `server.listen()` call or `server.close()` has been called. Otherwise, an `ERR_SERVER_ALREADY_LISTEN`
     * error will be thrown.
     *
     * @param {{ port: number; host?: string; reuseAddress?: boolean} | number} options
     * @param {string | (() => void)} [callback_or_host]
     * @param {() => void} [callback]
     * @returns {Server}
     */
    listen(options: { port: number; host?: string; reuseAddress?: boolean } | number, 
           callback_or_host?: string | (() => void),
           callback?: () => void): Server;
    
    /**
     * Asynchronously get the number of concurrent connections on the server.
     *
     * Callback should take two arguments `err` and `count`.
     *
     * @param {(err: Error | null, count: number) => void} callback
     * @returns {Server}
     */
    getConnections(callback: (err: Error | null, count: number) => void): Server;
    
    /**
     * Stops the server from accepting new connections and keeps existing connections.
     * This function is asynchronous, the server is finally closed when all connections are ended and the server emits a `'close'` event.
     * The optional callback will be called once the `'close'` event occurs. Unlike that event, it will be called with an `Error` as its
     * only argument if the server was not open when it was closed.
     *
     * @param {(err?: Error) => void} [callback] Called when the server is closed.
     * @returns {Server}
     */
    close(callback?: (err?: Error) => void): Server;
    
    /**
     * Returns the bound `address`, the address `family` name, and `port` of the server as reported by the operating system if listening
     * on an IP socket (useful to find which port was assigned when getting an OS-assigned address):
     * `{ port: 12346, family: 'IPv4', address: '127.0.0.1' }`.
     *
     * @returns {import('./Socket').AddressInfo | null}
     */
    address(): import('./Socket').AddressInfo | null;
    
    ref(): Server;
    unref(): Server;
    
    /**
     * @private
     */
    private _registerEvents(): void;
    
    /**
     * @private
     */
    private _setDisconnected(): void;
    
    /**
     * @protected
     * @param {Socket} socket
     */
    protected _addConnection(socket: Socket): void;
    
    /**
     * @protected
     * @param {{ id: number; connection: import('./Socket').NativeConnectionInfo; }} info
     * @returns {Socket}
     */
    protected _buildSocket(info: {
        id: number;
        connection: import('./Socket').NativeConnectionInfo;
    }): Socket;
    
    /**
     * Apply server socket options to a newly connected socket
     * @param {Socket} socket
     * @private
     */
    private _applySocketOptions(socket: Socket): void;
}

export type ServerOptions = {
    noDelay?: boolean;
    keepAlive?: boolean;
    keepAliveInitialDelay?: number;
    allowHalfOpen?: boolean;
    pauseOnConnect?: boolean;
};

export type TLSSocket = import("./TLSSocket").default;

export type ServerEvents = {
    close: () => void;
    connection: (socket: Socket) => void;
    listening: () => void;
    error: (err: Error) => void;
    secureConnection: (tlsSocket: TLSSocket) => void;
};

import EventEmitter from "eventemitter3";
import Socket from "./Socket";