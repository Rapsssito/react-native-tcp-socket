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
    _connectionsListener: import("react-native").EmitterSubscription | undefined;
    /**
     * @param {{ port: number; host: string; reuseAddress?: boolean}} options
     * @param {(arg0: any) => void} [callback]
     * @returns {TcpServer}
     */
    listen(options: {
        port: number;
        host: string;
        reuseAddress?: boolean | undefined;
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
    }, callback?: ((address: string) => void) | undefined): TcpServer;
    setTimeout(timeout: number, callback?: (() => void) | undefined): TcpServer;
    setNoDelay(noDelay?: boolean): TcpServer;
    setKeepAlive(enable?: boolean, initialDelay?: number): TcpServer;
    addListener(event: string | symbol, listener: (...args: any[]) => void): TcpServer;
    on(event: string | symbol, listener: (...args: any[]) => void): TcpServer;
    once(event: string | symbol, listener: (...args: any[]) => void): TcpServer;
    removeListener(event: string | symbol, listener: (...args: any[]) => void): TcpServer;
    off(event: string | symbol, listener: (...args: any[]) => void): TcpServer;
    removeAllListeners(event?: string | symbol | undefined): TcpServer;
    setMaxListeners(n: number): TcpServer;
    prependListener(event: string | symbol, listener: (...args: any[]) => void): TcpServer;
    prependOnceListener(event: string | symbol, listener: (...args: any[]) => void): TcpServer;
}
import TcpSocket from "./TcpSocket";
