export default class TcpServer extends TcpSocket {
    /**
     * @param {number} id
     * @param {import("react-native").NativeEventEmitter} eventEmitter
     * @param {(socket: TcpSocket) => void} connectionCallback
     */
    constructor(id: number, eventEmitter: import("react-native").NativeEventEmitter, connectionCallback: (socket: TcpSocket) => void);
    connectionCallback: (socket: TcpSocket) => void;
    /** @type {TcpSocket[]} */
    _connections: TcpSocket[];
    close(): void;
    /**
     * @param {(arg0: number) => void} callback
     */
    getConnections(callback: (arg0: number) => void): void;
    /**
     * @param {{ port: number; host: any; }} options
     * @param {(arg0: any) => void} callback
     * @returns {TcpServer}
     */
    listen(options: {
        port: number;
        host: any;
    }, callback: (arg0: any) => void, ...args: any[]): TcpServer;
    /**
     * @private
     * @param {{ id: number; address: string; }} info
     */
    private _onConnection;
    connect(options: {
        port: number;
        host?: string | undefined;
        timeout?: number | undefined;
        localAddress?: string | undefined;
        localPort?: number | undefined;
        interface?: "wifi" | undefined; /**
         * @param {{ port: number; host: any; }} options
         * @param {(arg0: any) => void} callback
         * @returns {TcpServer}
         */
        reuseAddress?: boolean | undefined;
    }, callback?: ((address: string) => void) | undefined): TcpServer;
    setTimeout(msecs: number, callback?: ((...args: any[]) => void) | undefined): TcpServer;
}
import TcpSocket from "./TcpSocket";
