'use strict';

import { NativeModules } from 'react-native';
const Sockets = NativeModules.TcpSockets;
import Socket from './Socket';

/**
 * @extends {Socket}
 */
export default class TLSSocket extends Socket {
    /**
     * @param {Socket} socket Any instance of `Socket`.
     * @param {object} [options] Options for the TLS socket.
     */
    constructor(socket, options = {}) {
        super();
        this._options = { ...options };
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
}
