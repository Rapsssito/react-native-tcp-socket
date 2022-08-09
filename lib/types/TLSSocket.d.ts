/**
 * @extends {Socket}
 */
export default class TLSSocket extends Socket {
    /**
     * @param {Socket} socket Any instance of `Socket`.
     * @param {object} options Options for the TLS socket.
     */
    constructor(socket: Socket, options: object);
}
import Socket from "./Socket";
