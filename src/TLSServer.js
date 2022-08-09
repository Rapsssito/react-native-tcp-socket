'use strict';

import { NativeModules } from 'react-native';
import EventEmitter from 'eventemitter3';
const Sockets = NativeModules.TcpSockets;
import Socket from './Socket';
import Server from './Server';
import TLSSocket from './TLSSocket';
import { nativeEventEmitter, getNextId } from './Globals';

/**
 * @typedef {object} TLSServerOptions
 * @property {string} cert
 * @property {string} key
 *
 * @extends {Server}
 */
export default class TLSServer extends Server {
    /**
     * @param {(socket: TLSSocket) => void} [secureConnectionListener] Automatically set as a listener for the `'secureConnection'` event.
     */
    constructor(secureConnectionListener) {
        super();
        if (secureConnectionListener) this.on('secureConnection', secureConnectionListener);
        this._registerTLSEvents();
    }

    /**
     * @param {TLSServerOptions} options TLS server options
     */
    setSecureContext(options) {
        /** @private */
        this._options = options;
    }

    /**
     * Start a server listening for connections.
     *
     * This function is asynchronous. When the server starts listening, the `'listening'` event will be emitted.
     * The last parameter `callback` will be added as a listener for the `'listening'` event.
     *
     * The `server.listen()` method can be called again if and only if there was an error during the first
     * `server.listen()` call or `server.close()` has been called. Otherwise, an `ERR_SERVER_ALREADY_LISTEN`
     * error will be thrown.
     *
     * @param {{ port: number; host: string; reuseAddress?: boolean}} options
     * @param {() => void} [callback]
     * @override
     */
    listen(options, callback) {
        const newOptions = { ...options };
        // @ts-ignore
        newOptions['tls'] = this._options;
        return super.listen(newOptions, callback);
    }

    /**
     * @private
     */
    _registerTLSEvents() {
        this._secureConnectionListener = this._eventEmitter.addListener(
            'secureConnection',
            (evt) => {
                if (evt.id !== this._id) return;
                // this.emit('secureConnection');
            }
        );
    }
}
