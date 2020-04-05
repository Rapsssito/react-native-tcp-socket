/**
 * @typedef {{ port: number; host?: string; timeout?: number; localAddress?: string, localPort?: number, interface?: 'wifi' | 'cellular' | 'ethernet', reuseAddress?: boolean}} ConnectionOptions
 */
export default class TcpSocket {
    /**
     * Initialices a TcpSocket.
     *
     * @param {number} id
     * @param {import('react-native').NativeEventEmitter} eventEmitter
     */
    constructor(id: number, eventEmitter: import("react-native").NativeEventEmitter);
    _id: number;
    _eventEmitter: import("react-native").NativeEventEmitter;
    /** @type {number} */
    _state: number;
    /** @type {RemovableListener[]} */
    _listeners: RemovableListener[];
    /**
     * Adds a listener to be invoked when events of the specified type are emitted by the `TcpSocket`.
     * An optional calling `context` may be provided.
     * The data arguments emitted will be passed to the listener callback.
     *
     * @param {string} event  Name of the event to listen to
     * @param {(arg0: any) => void} callback Function to invoke when the specified event is emitted
     * @param {any} [context] Optional context object to use when invoking the listener
     * @returns {RemovableListener}
     */
    on(event: string, callback: (arg0: any) => void, context?: any): RemovableListener;
    /**
     * @private
     * @param {string} event
     * @param {function(any):void} callback
     * @param {any} [context]
     */
    private _selectListener;
    /**
     * @deprecated
     */
    off(): void;
    /**
     * @param {ConnectionOptions} options
     * @param {(address: string) => void} [callback]
     */
    connect(options: {
        port: number;
        host?: string | undefined;
        timeout?: number | undefined;
        localAddress?: string | undefined;
        localPort?: number | undefined;
        interface?: "wifi" | "cellular" | "ethernet" | undefined;
        reuseAddress?: boolean | undefined;
    }, callback?: ((address: string) => void) | undefined): TcpSocket;
    _destroyed: boolean | undefined;
    /**
     * @private
     * @param {number} msecs
     * @param {() => void} [wrapper]
     */
    private _activeTimer;
    _timeout: {
        handle: NodeJS.Timeout;
        wrapper: () => void;
        msecs: number;
    } | null | undefined;
    /**
     * @private
     */
    private _clearTimeout;
    /**
     * @deprecated
     * @param {number} msecs
     * @param {(...args: any[]) => void } [callback]
     */
    setTimeout(msecs: number, callback?: ((...args: any[]) => void) | undefined): TcpSocket;
    address(): string | undefined;
    /**
     * @param {string | Buffer | Uint8Array} data
     * @param {BufferEncoding} [encoding]
     */
    end(data: string | Buffer | Uint8Array, encoding?: "ascii" | "utf8" | "utf-8" | "utf16le" | "ucs2" | "ucs-2" | "base64" | "latin1" | "binary" | "hex" | undefined): void;
    destroy(): void;
    /**
     * @protected
     */
    protected _registerEvents(): void;
    /**
     * @private
     */
    private _unregisterEvents;
    /**
     * @private
     * @param {string} address
     */
    private _onConnect;
    /**
     * @private
     */
    private _onClose;
    /**
     * @private
     */
    private _onError;
    /**
     * Sends data on the socket. The second parameter specifies the encoding in the case of a string — it defaults to UTF8 encoding.
     *
     * The optional callback parameter will be executed when the data is finally written out, which may not be immediately.
     *
     * @param {string | Buffer | Uint8Array} buffer
     * @param {BufferEncoding} [encoding]
     * @param {(error: string | null) => void} [callback]
     */
    write(buffer: string | Buffer | Uint8Array, encoding?: "ascii" | "utf8" | "utf-8" | "utf16le" | "ucs2" | "ucs-2" | "base64" | "latin1" | "binary" | "hex" | undefined, callback?: ((error: string | null) => void) | undefined): void;
    /**
     * @param {string} address
     */
    setAsAlreadyConnected(address: string): void;
    /**
     * @private
     * @param {string | Buffer | Uint8Array} buffer
     * @param {BufferEncoding} [encoding]
     */
    private _generateSendBuffer;
    /**
     * @private
     * @param {string} address
     */
    private setConnected;
    _address: string | undefined;
    /**
     * @private
     */
    private setDisconnected;
}
export type ConnectionOptions = {
    port: number;
    host?: string | undefined;
    timeout?: number | undefined;
    localAddress?: string | undefined;
    localPort?: number | undefined;
    interface?: "wifi" | "cellular" | "ethernet" | undefined;
    reuseAddress?: boolean | undefined;
};
declare class RemovableListener {
    /**
     * @param {import("react-native").EmitterSubscription} listener
     * @param {import("react-native").NativeEventEmitter} eventEmitter
     */
    constructor(listener: import("react-native").EmitterSubscription, eventEmitter: import("react-native").NativeEventEmitter);
    _listener: import("react-native").EmitterSubscription;
    _eventEmitter: import("react-native").NativeEventEmitter;
    _removed: boolean;
    isRemoved(): boolean;
    remove(): void;
}
export {};
