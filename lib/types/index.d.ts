export default tcpSockets;
declare const tcpSockets: TCPSockets;
declare class TCPSockets {
    instances: number;
    _eventEmitter: import("react-native").EventEmitter;
    /**
     * @param {(socket: Socket) => void} connectionListener
     * @returns {Server}
     */
    createServer(connectionListener: (socket: Socket) => void): Server;
    /**
     * @param {import('./TcpSocket').ConnectionOptions} options
     * @param {(address: string) => void} callback
     * @returns {Socket}
     */
    createConnection(options: {
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
    }, callback: (address: string) => void): Socket;
}
import Socket from "./TcpSocket";
import Server from "./TcpServer";
