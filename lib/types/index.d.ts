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
}
export default _default;
/**
 * @param {import('./Socket').ConnectionOptions} options
 * @param {() => void} callback
 * @returns {Socket}
 */
declare function createConnection(options: import('./Socket').ConnectionOptions, callback: () => void): Socket;
/**
 * @param {(socket: Socket) => void} connectionListener
 * @returns {Server}
 */
declare function createServer(connectionListener: (socket: Socket) => void): Server;
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
