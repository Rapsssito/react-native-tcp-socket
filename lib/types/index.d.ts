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
    createConnection(options: import('./TcpSocket').ConnectionOptions, callback: (address: string) => void): Socket;
}
import Socket from "./TcpSocket";
import Server from "./TcpServer";
