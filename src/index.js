'use strict';

import Socket from './Socket';
import Server from './Server';

/**
 * @param {(socket: Socket) => void} connectionListener
 * @returns {Server}
 */
function createServer(connectionListener) {
    return new Server(connectionListener);
}

/**
 * @param {import('./Socket').ConnectionOptions} options
 * @param {() => void} callback
 * @returns {Socket}
 */
function createConnection(options, callback) {
    const tcpSocket = new Socket();
    return tcpSocket.connect(options, callback);
}

// IPv4 Segment
const v4Seg = '(?:[0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])';
const v4Str = `(${v4Seg}[.]){3}${v4Seg}`;
const IPv4Reg = new RegExp(`^${v4Str}$`);

// IPv6 Segment
const v6Seg = '(?:[0-9a-fA-F]{1,4})';
const IPv6Reg = new RegExp(
    '^(' +
        `(?:${v6Seg}:){7}(?:${v6Seg}|:)|` +
        `(?:${v6Seg}:){6}(?:${v4Str}|:${v6Seg}|:)|` +
        `(?:${v6Seg}:){5}(?::${v4Str}|(:${v6Seg}){1,2}|:)|` +
        `(?:${v6Seg}:){4}(?:(:${v6Seg}){0,1}:${v4Str}|(:${v6Seg}){1,3}|:)|` +
        `(?:${v6Seg}:){3}(?:(:${v6Seg}){0,2}:${v4Str}|(:${v6Seg}){1,4}|:)|` +
        `(?:${v6Seg}:){2}(?:(:${v6Seg}){0,3}:${v4Str}|(:${v6Seg}){1,5}|:)|` +
        `(?:${v6Seg}:){1}(?:(:${v6Seg}){0,4}:${v4Str}|(:${v6Seg}){1,6}|:)|` +
        `(?::((?::${v6Seg}){0,5}:${v4Str}|(?::${v6Seg}){1,7}|:))` +
        ')(%[0-9a-zA-Z-.:]{1,})?$'
);

/**
 * Returns `true` if input is a version 4 IP address, otherwise returns `false`.
 *
 * @param {string} input
 */
function isIPv4(input) {
    return IPv4Reg.test(input);
}

/**
 * Returns `true` if input is a version 6 IP address, otherwise returns `false`.
 *
 * @param {string} input
 */
function isIPv6(input) {
    return IPv6Reg.test(input);
}

/**
 * Tests if input is an IP address. Returns `0` for invalid strings, returns `4` for IP version 4 addresses, and returns `6` for IP version 6 addresses.
 *
 * @param {string} input
 */
function isIP(input) {
    if (isIPv4(input)) return 4;
    else if (isIPv6(input)) return 6;
    return 0;
}

export default { createServer, createConnection, isIP, isIPv4, isIPv6, Server, Socket };

// @ts-ignore
module.exports = { createServer, createConnection, isIP, isIPv4, isIPv6, Server, Socket };
