'use strict';

import { NativeModules } from 'react-native';
import EventEmitter from 'eventemitter3';
const Sockets = NativeModules.TcpSockets;
import Socket from './Socket';
import { nativeEventEmitter, getNextId } from './Globals';

/**
 * @extends {Socket}
 */
export default class TLSSocket extends Socket {
    /**
     * @param {Socket} socket Any instance of `Socket`.
     * @param {object} options Options for the TLS socket.
     */
    constructor(socket, options) {
        super();
        Object.assign(this, socket);
    }
}
