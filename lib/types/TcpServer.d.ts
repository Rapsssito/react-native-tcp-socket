/**
 * @typedef {import('react-native').NativeEventEmitter} NativeEventEmitter
 *
 * @extends {EventEmitter<'connection' | 'listening' | 'error' | 'close', any>}
 */
export default class TcpServer extends EventEmitter<"error" | "close" | "connection" | "listening", any> {
    /**
     * @param {number} id
     * @param {NativeEventEmitter} eventEmitter
     * @param {(socket: TcpSocket) => void} connectionCallback
     */
    constructor(id: number, eventEmitter: NativeEventEmitter, connectionCallback: (socket: TcpSocket) => void);
    /** @private */
    private _id;
    /** @private */
    private _eventEmitter;
    connectionCallback: (socket: TcpSocket) => void;
    /** @type {TcpSocket[]} */
    _connections: TcpSocket[];
    /** @private */
    private _localAddress;
    /** @private */
    private _localPort;
    /** @private */
    private _localFamily;
    /**
     * @param {{ port: number; host: string; reuseAddress?: boolean}} options
     * @param {() => void} [callback]
     * @returns {TcpServer}
     */
    listen(options: {
        port: number;
        host: string;
        reuseAddress?: boolean;
    }, callback?: (() => void) | undefined): TcpServer;
    /**
     * @param {(arg0: number) => void} callback
     */
    getConnections(callback: (arg0: number) => void): void;
    close(): void;
    /**
     * @returns {import('./TcpSocket').AddressInfo | null}
     */
    address(): import('./TcpSocket').AddressInfo | null;
    ref(): void;
    unref(): void;
    /**
     * @private
     */
    private _registerEvents;
    _errorListener: import("react-native").EmitterSubscription | undefined;
    _closeListener: import("react-native").EmitterSubscription | undefined;
    _connectionsListener: import("react-native").EmitterSubscription | undefined;
    /**
     * @private
     */
    private _unregisterEvents;
    /**
     * @private
     */
    private _setDisconnected;
    /**
     * @private
     * @param {{ id: number; connection: import('./TcpSocket').NativeConnectionInfo; }} info
     */
    private _onConnection;
}
export type NativeEventEmitter = import("react-native").NativeEventEmitter;
import EventEmitter from "eventemitter3";
import TcpSocket from "./TcpSocket";
