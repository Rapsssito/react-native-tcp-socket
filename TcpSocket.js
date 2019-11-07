'use strict';

if (!(global.process && global.process.nextTick)) global.process = require('process'); // needed to make stream-browserify happy

const Buffer = (global.Buffer = global.Buffer || require('buffer').Buffer);

const stream = require('stream-browserify');
const { NativeEventEmitter, NativeModules } = require('react-native');
const Sockets = NativeModules.TcpSockets;
const Base64Str = require('./base64-str');
const noop = function() {};
let instances = 0;
const STATE = {
    DISCONNECTED: 0,
    CONNECTING: 1,
    CONNECTED: 2,
};

export default class TcpSocket extends stream.Duplex {
    constructor(options) {
        super(options);
        if (options && options.id) {
            // e.g. incoming server connections
            this._id = Number(options.id);
            if (this._id <= instances) throw new Error(`Socket id ${this._id}already in use`);
        } else {
            // javascript generated sockets range from 1-1000
            this._id = instances++;
        }
        this._eventEmitter = new NativeEventEmitter(Sockets);
        stream.Duplex.call(this, {});

        // ensure compatibility with node's EventEmitter
        if (!this.on) this.on = this.addListener.bind(this);
        // these will be set once there is a connection
        this.writable = this.readable = false;
        this._state = STATE.DISCONNECTED;
        this.read(0);
    }

    // TODO : determine how to properly overload this with flow
    connect(options, callback) {
        this._registerEvents();
        // Normalize args
        options.host = options.host || 'localhost';
        options.port = Number(options.port) || 0;
        options.localPort = Number(options.localPort) || 0;
        options.localAddress = options.localAddress || '0.0.0.0';
        options.interface = options.interface || '';

        // Perform some checks
        if (typeof callback === 'function') this.once('connect', callback);

        if (!isLegalPort(options.port))
            throw new RangeError(`"port" option should be >= 0 and < 65536: ${options.port}`);

        if (!isLegalPort(options.localPort))
            throw new RangeError(
                `"localPort" option should be >= 0 and < 65536: ${options.localPort}`
            );

        if (options.timeout) this.setTimeout(options.timeout);
        else if (this._timeout) this._activeTimer(this._timeout.msecs);

        this._state = STATE.CONNECTING;

        this._destroyed = false;
        Sockets.connect(this._id, options.host, options.port, options);

        return this;
    }

    read(n) {
        if (n === 0) return stream.Readable.prototype.read.call(this, n);

        this.read = stream.Readable.prototype.read;
        this._consuming = true;
        return this.read(n);
    }

    // Just call handle.readStart until we have enough in the buffer
    _read(n) {
        if (this._state === STATE.CONNECTING) {
            this.once('connect', () => this._read(n));
        } else if (!this._reading) {
            // not already reading, start the flow
            this._reading = true;
            this.resume();
        }
    }

    _activeTimer(msecs, wrapper) {
        if (this._timeout && this._timeout.handle) clearTimeout(this._timeout.handle);

        if (!wrapper) {
            const self = this;
            wrapper = function() {
                self._timeout = null;
                self.emit('timeout');
            };
        }

        this._timeout = {
            handle: setTimeout(wrapper, msecs),
            wrapper: wrapper,
            msecs: msecs,
        };
    }

    _clearTimeout() {
        if (this._timeout) {
            clearTimeout(this._timeout.handle);
            this._timeout = null;
        }
    }

    setTimeout(msecs, callback) {
        if (msecs === 0) {
            this._clearTimeout();
            if (callback) this.removeListener('timeout', callback);
        } else {
            if (callback) this.once('timeout', callback);

            this._activeTimer(msecs);
        }

        return this;
    }

    address() {
        return this._address;
    }

    end(data, encoding) {
        stream.Duplex.prototype.end.call(this, data, encoding);
        this.writable = false;

        if (this._destroyed) return;

        if (data) this.write(data, encoding);

        if (this.readable) {
            this.read(0);
            this.readable = false;
        }

        this._destroyed = true;
        Sockets.end(this._id);
    }

    destroy() {
        if (!this._destroyed) {
            this._destroyed = true;
            this._clearTimeout();

            Sockets.destroy(this._id);
        }
    }

    _registerEvents() {
        if (this._subs && this._subs.length > 0) return;

        this._subs = [
            this._eventEmitter.addListener('connect', (ev) => {
                if (this._id !== ev.id) return;

                this._onConnect(ev.address);
            }),
            this._eventEmitter.addListener('connection', (ev) => {
                if (this._id !== ev.id) return;

                this._onConnection(ev.info);
            }),
            this._eventEmitter.addListener('data', (ev) => {
                if (this._id !== ev.id) return;

                this._onData(ev.data);
            }),
            this._eventEmitter.addListener('close', (ev) => {
                if (this._id !== ev.id) return;

                this._onClose(ev.hadError);
            }),
            this._eventEmitter.addListener('error', (ev) => {
                if (this._id !== ev.id) return;

                this._onError(ev.error);
            }),
        ];
    }

    _unregisterEvents() {
        this._subs.forEach((e) => e.remove());
        this._subs = [];
    }

    _onConnect(address) {
        this.setConnected(this, address);
        this.emit('connect');

        this.read(0);
    }

    _onConnection(info) {
        const socket = new TcpSocket({ id: info.id });

        socket._registerEvents();
        this.setConnected(socket, info.address);
        socket.emit('connection', socket);
    }

    _onData(data) {
        if (this._timeout) this._activeTimer(this._timeout.msecs);

        if (data && data.length > 0) {
            // debug('got data');

            // read success.
            // In theory (and in practice) calling readStop right now
            // will prevent this from being called again until _read() gets
            // called again.

            const ret = this.push(new Buffer(data, 'base64'));
            if (this._reading && !ret) {
                this._reading = false;
                this.pause();
            }

            return;
        }
    }

    _onClose(hadError) {
        this.setDisconnected(this, hadError);
    }

    _onError(error) {
        this.emit('error', normalizeError(error));
        this.destroy();
    }

    // eslint-disable-next-line no-unused-vars
    write(chunk, encoding, cb) {
        if (typeof chunk !== 'string' && !Buffer.isBuffer(chunk))
            throw new TypeError(
                `Invalid data, chunk must be a string or buffer, not ${typeof chunk}`
            );

        return stream.Duplex.prototype.write.apply(this, arguments);
    }

    _write(buffer, encoding, callback) {
        const self = this;

        if (this._state === STATE.DISCONNECTED) throw new Error('Socket is not connected.');

        callback = callback || noop;
        let str;
        if (typeof buffer === 'string') str = Base64Str.encode(buffer);
        else if (Buffer.isBuffer(buffer)) str = buffer.toString('base64');
        else
            throw new TypeError(
                `Invalid data, chunk must be a string or buffer, not ${typeof buffer}`
            );

        Sockets.write(this._id, str, function(err) {
            if (self._timeout) self._activeTimer(self._timeout.msecs);

            err = normalizeError(err);
            if (err) return callback(err);

            callback();
        });

        return true;
    }

    // Returns an array [options] or [options, cb]
    // It is the same as the argument of Socket.prototype.connect().
    _normalizeConnectArgs(args) {
        let options = {};

        if (args[0] !== null && typeof args[0] === 'object') {
            // connect(options, [cb])
            options = args[0];
        } else {
            // connect(port, [host], [cb])
            options.port = args[0];
            if (typeof args[1] === 'string') options.host = args[1];
        }

        const cb = args[args.length - 1];
        return typeof cb === 'function' ? [options, cb] : [options];
    }

    // unimplemented net.Socket apis
    ref() {}
    unref() {}
    setNoDelay() {}
    setKeepAlive() {}
    setEncoding() {}

    setConnected(socket, address) {
        socket.writable = socket.readable = true;
        socket._state = STATE.CONNECTED;
        socket._address = address;
    }

    setDisconnected(socket, hadError) {
        if (socket._state === STATE.DISCONNECTED) return;

        socket._unregisterEvents();
        socket._state = STATE.DISCONNECTED;
        socket.emit('close', hadError);
    }
}

// Check that the port number is not NaN when coerced to a number,
// is an integer and that it falls within the legal range of port numbers.
function isLegalPort(port) {
    if (typeof port === 'string' && port.trim() === '') return false;

    return +port === port >>> 0 && port >= 0 && port <= 0xffff;
}

function normalizeError(err) {
    if (err) {
        if (typeof err === 'string') err = new Error(err);

        return err;
    }
}
