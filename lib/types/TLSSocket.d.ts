/**
 * @typedef {object} TLSSocketOptions
 * @property {any} [ca]
 * @property {any} [key]
 * @property {any} [cert]
 * @property {string} [androidKeyStore]
 * @property {string} [certAlias]
 * @property {string} [keyAlias]
 * @property {string[]} [resolvedKeys]
 *
 * @extends {Socket}
 */
export default class TLSSocket extends Socket {
    /**
     * @private
     * Resolves the asset source if necessary and registers the resolved key.
     * @param {TLSSocketOptions} options The options object containing the source to be resolved.
     * @param {'ca' | 'key' | 'cert'} key The key name being resolved.
     */
    private static resolveAssetIfNeeded;
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
    getCertificate(): any;
    getPeerCertificate(): any;
}
export type TLSSocketOptions = {
    ca?: any;
    key?: any;
    cert?: any;
    androidKeyStore?: string | undefined;
    certAlias?: string | undefined;
    keyAlias?: string | undefined;
    resolvedKeys?: string[] | undefined;
};
import Socket from "./Socket";
