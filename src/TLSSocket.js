'use strict';

import { Image, NativeModules } from 'react-native';
const Sockets = NativeModules.TcpSockets;
import Socket from './Socket';

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
     * @param {Socket} socket Any instance of `Socket`.
     * @param {TLSSocketOptions} [options] Options for the TLS socket.
     */
    constructor(socket, options = {}) {
        super();
        /** @private */
        this._options = { ...options };
        TLSSocket.resolveAssetIfNeeded(this._options, 'ca');
        TLSSocket.resolveAssetIfNeeded(this._options, 'key');
        TLSSocket.resolveAssetIfNeeded(this._options, 'cert');

        /** @private */
        this._socket = socket;
        // @ts-ignore
        this._setId(this._socket._id);
        this._startTLS();
        if (socket.pending || socket.connecting) socket.once('connect', () => this._initialize());
        else this._initialize();
    }

    /**
     * @private
     */
    _initialize() {
        // Avoid calling twice destroy() if an error occurs
        this._socket._errorListener?.remove();
        this.on('error', (error) => this._socket.emit('error', error));
        this._setConnected({
            // @ts-ignore
            localAddress: this._socket.localAddress,
            // @ts-ignore
            localPort: this._socket.localPort,
            // @ts-ignore
            remoteAddress: this._socket.remoteAddress,
            // @ts-ignore
            remotePort: this._socket.remotePort,
            // @ts-ignore
            remoteFamily: this._socket.remoteFamily,
        });
    }

    /**
     * @private
     */
    _startTLS() {
        Sockets.startTLS(this._id, this._options);
    }

    /**
     * Checks if a certificate identity exists in the keychain
     * @param {object} options Object containing the identity aliases
     * @param {string} [options.androidKeyStore] The android keystore type
     * @param {string} [options.certAlias] The certificate alias
     * @param {string} [options.keyAlias] The key alias
     * @returns {Promise<boolean>} Promise resolving to true if identity exists
     */
    static hasIdentity(options = {}) {
        return Sockets.hasIdentity({
            androidKeyStore: options.androidKeyStore,
            certAlias: options.certAlias,
            keyAlias: options.keyAlias,
        });
    }

    getCertificate() {
        return Sockets.getCertificate(this._id);
    }

    getPeerCertificate() {
        return Sockets.getPeerCertificate(this._id);
    }

    /**
     * @private
     * Resolves the asset source if necessary and registers the resolved key.
     * @param {TLSSocketOptions} options The options object containing the source to be resolved.
     * @param {'ca' | 'key' | 'cert'} key The key name being resolved.
     */
    static resolveAssetIfNeeded(options, key) {
        const source = options[key];
        if (source && typeof source !== 'string') {
            if (!options.resolvedKeys) {
                options.resolvedKeys = [];
            }
            options.resolvedKeys.push(key);
            options[key] = Image.resolveAssetSource(source).uri;
        }
    }
}
