/**
 * @typedef {object} TLSSocketOptions
 * @property {any} [ca]
 *
 * @extends {Socket}
 */
export default class TLSSocket extends Socket {
    /**
     * @param {Socket} socket Any instance of `Socket`.
     * @param {TLSSocketOptions} [options] Options for the TLS socket.
     */
    constructor(socket: Socket, options?: TLSSocketOptions | undefined);
    /** @private */
    private _options;
    /** @private */
    private _socket;
    /**
     * @private
     */
    private _initialize;
    /**
     * @private
     */
    private _startTLS;
}
export type TLSSocketOptions = {
    ca?: any;
};
import Socket from "./Socket";
