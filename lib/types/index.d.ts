declare namespace _default {
    export { createConnection as connect };
    export { createServer };
    export { createConnection };
    export { createTLSServer };
    export { connectTLS };
    export { isIP };
    export { isIPv4 };
    export { isIPv6 };
    export { Server };
    export { Socket };
    export { TLSServer };
    export { TLSSocket };
    export const hasIdentity: typeof import("./TLSSocket").default.hasIdentity;
}
export default _default;
export type ServerOptions = {
    noDelay?: boolean | undefined;
    keepAlive?: boolean | undefined;
    keepAliveInitialDelay?: number | undefined;
    allowHalfOpen?: boolean | undefined;
    pauseOnConnect?: boolean | undefined;
};
/**
 * @param {import('./Socket').ConnectionOptions} options
 * @param {() => void} callback
 * @returns {Socket}
 */
declare function createConnection(options: import('./Socket').ConnectionOptions, callback: () => void): Socket;
/**
 * @typedef {object} ServerOptions
 * @property {boolean} [noDelay]
 * @property {boolean} [keepAlive]
 * @property {number} [keepAliveInitialDelay]
 * @property {boolean} [allowHalfOpen]
 * @property {boolean} [pauseOnConnect]
 */
/**
 * Creates a new TCP server.
 *
 * @param {ServerOptions | ((socket: Socket) => void)} [options] An options object or a connection listener
 * @param {(socket: Socket) => void} [connectionListener] A listener for the 'connection' event
 * @returns {Server}
 */
declare function createServer(options?: ServerOptions | ((socket: Socket) => void) | undefined, connectionListener?: ((socket: Socket) => void) | undefined): Server;
/**
 * @param {import('./TLSServer').TLSServerOptions} options
 * @param {(socket: TLSSocket) => void} connectionListener
 * @returns {TLSServer}
 */
declare function createTLSServer(options: import('./TLSServer').TLSServerOptions, connectionListener: (socket: TLSSocket) => void): TLSServer;
/**
 * The `callback` function, if specified, will be added as a listener for the `'secureConnect'` event.
 *
 * @param {import('./TLSSocket').TLSSocketOptions & import('./Socket').ConnectionOptions} options
 * @param {() => void} [callback]
 * @returns {TLSSocket}
 */
declare function connectTLS(options: import('./TLSSocket').TLSSocketOptions & import('./Socket').ConnectionOptions, callback?: (() => void) | undefined): TLSSocket;
/**
 * Tests if input is an IP address. Returns `0` for invalid strings, returns `4` for IP version 4 addresses, and returns `6` for IP version 6 addresses.
 *
 * @param {string} input
 */
declare function isIP(input: string): 0 | 4 | 6;
/**
 * Returns `true` if input is a version 4 IP address, otherwise returns `false`.
 *
 * @param {string} input
 */
declare function isIPv4(input: string): boolean;
/**
 * Returns `true` if input is a version 6 IP address, otherwise returns `false`.
 *
 * @param {string} input
 */
declare function isIPv6(input: string): boolean;
import Server from "./Server";
import Socket from "./Socket";
import TLSServer from "./TLSServer";
import TLSSocket from "./TLSSocket";
