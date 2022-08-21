/**
 * @typedef {object} TLSServerOptions
 * @property {any} keystore
 *
 * @extends {Server}
 */
export default class TLSServer extends Server {
    /**
     * @param {(socket: TLSSocket) => void} [secureConnectionListener] Automatically set as a listener for the `'secureConnection'` event.
     */
    constructor(secureConnectionListener?: ((socket: TLSSocket) => void) | undefined);
    /**
     * @param {TLSServerOptions} options TLS server options
     */
    setSecureContext(options: TLSServerOptions): void;
    /** @private */
    private _options;
    /**
     * @private
     */
    private _registerTLSEvents;
    _secureConnectionListener: import("react-native").EmitterSubscription | undefined;
}
export type TLSServerOptions = {
    keystore: any;
};
import Server from "./Server";
import TLSSocket from "./TLSSocket";
