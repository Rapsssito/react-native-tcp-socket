declare namespace _default {
    export { createServer };
    export { createConnection };
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
 * @param {(socket: Socket) => void} connectionListener
 * @returns {Server}
 */
declare function createServer(connectionListener: (socket: Socket) => void): Server;
/**
 * @param {import('./Socket').ConnectionOptions} options
 * @param {() => void} callback
 * @returns {Socket}
 */
declare function createConnection(options: import('./Socket').ConnectionOptions, callback: () => void): Socket;
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
