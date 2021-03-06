declare namespace _default {
    export { createServer };
    export { createConnection };
    export { Server };
}
export default _default;
/**
 * @param {(socket: Socket) => void} connectionListener
 * @returns {Server}
 */
declare function createServer(connectionListener: (socket: Socket) => void): Server;
/**
 * @param {import('./TcpSocket').ConnectionOptions} options
 * @param {() => void} callback
 * @returns {Socket}
 */
declare function createConnection(options: import('./TcpSocket').ConnectionOptions, callback: () => void): Socket;
import Server from "./Server";
import Socket from "./TcpSocket";
