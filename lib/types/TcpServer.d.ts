/**
 * @typedef {import('react-native').NativeEventEmitter} NativeEventEmitter
 */
export default class TcpServer extends TcpSocket {
    /**
     * @param {number} id
     * @param {NativeEventEmitter} eventEmitter
     * @param {(socket: TcpSocket) => void} connectionCallback
     */
    constructor(id: number, eventEmitter: NativeEventEmitter, connectionCallback: (socket: TcpSocket) => void);
    connectionCallback: (socket: TcpSocket) => void;
    /** @type {TcpSocket[]} */
    _connections: TcpSocket[];
    _connectionsListener: import("react-native").EmitterSubscription | undefined;
    /**
     * @param {{ port: number; host: string; reuseAddress?: boolean}} options
     * @param {(arg0: any) => void} [callback]
     * @returns {TcpServer}
     */
    listen(options: {
        port: number;
        host: string;
        reuseAddress?: boolean;
    }, callback?: ((arg0: any) => void) | undefined): TcpServer;
    /**
     * @param {(arg0: number) => void} callback
     */
    getConnections(callback: (arg0: number) => void): void;
    close(): void;
    /**
     * @private
     * @param {{ id: number; address: string; }} info
     */
    private _onConnection;
}
export type NativeEventEmitter = import("react-native").NativeEventEmitter;
import TcpSocket from "./TcpSocket";
