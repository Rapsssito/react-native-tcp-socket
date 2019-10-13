'use strict';

if (!(global.process && global.process.nextTick)) {
    global.process = require('process'); // needed to make stream-browserify happy
}

var Buffer = global.Buffer = global.Buffer || require('buffer').Buffer;

var util = require('util');
var stream = require('stream-browserify');
// var EventEmitter = require('events').EventEmitter;
var ipRegex = require('ip-regex');
var {
    NativeEventEmitter,
    NativeModules
} = require('react-native');
var Sockets = NativeModules.TcpSockets;
var Base64Str = require('./base64-str');
var noop = function () { };
var instances = 0;
var STATE = {
    DISCONNECTED: 0,
    CONNECTING: 1,
    CONNECTED: 2
};

class TcpSocket extends stream.Duplex {
    constructor(options) {
        super(options);
        if (options && options.id) {
            // e.g. incoming server connections
            this._id = Number(options.id);

            if (this._id <= instances) {
                throw new Error('Socket id ' + this._id + 'already in use');
            }
        } else {
            // javascript generated sockets range from 1-1000
            this._id = instances++;
        }

        this._eventEmitter = new NativeEventEmitter(Sockets);
        stream.Duplex.call(this, {});

        // ensure compatibility with node's EventEmitter
        if (!this.on) {
            this.on = this.addListener.bind(this);
        }

        // these will be set once there is a connection
        this.writable = this.readable = false;

        this._state = STATE.DISCONNECTED;

        this.read(0);
    }

    _debug() {
        if (__DEV__) {
            var args = [].slice.call(arguments);
            args.unshift('socket-' + this._id);
            console.log.apply(console, args);
        }
    };

    // TODO : determine how to properly overload this with flow
    connect(options, callback) {
        this._registerEvents();

        // Normalize args
        options.host = options.host || 'localhost';
        options.port = Number(options.port) || 0;
        options.localPort = Number(options.localPort) || 0;
        options.localAddress = options.localAddress || "0.0.0.0";
        options.interface = options.interface || "";

        // Perform some checks
        if (typeof callback === 'function') {
            this.once('connect', callback);
        }

        if (!isLegalPort(options.port)) {
            throw new RangeError('"port" option should be >= 0 and < 65536: ' + options.port);
        }

        if (!isLegalPort(options.localPort)) {
            throw new RangeError('"localPort" option should be >= 0 and < 65536: ' + options.localPort);
        }

        if (!ipRegex({ exact: true }).test(options.localAddress)) {
            throw new TypeError('"localAddress" option must be a valid IP: ' + options.localAddress);
        }

        if (options.timeout) {
            this.setTimeout(options.timeout);
        } else if (this._timeout) {
            this._activeTimer(this._timeout.msecs);
        }

        this._state = STATE.CONNECTING;
        this._debug('connecting to host ', options.host, ' on port ', options.port);

        this._destroyed = false;
        Sockets.connect(this._id, options.host, options.port, options);

        return this;
    };

    read(n) {
        if (n === 0) {
            return stream.Readable.prototype.read.call(this, n);
        }

        this.read = stream.Readable.prototype.read;
        this._consuming = true;
        return this.read(n);
    };

    // Just call handle.readStart until we have enough in the buffer
    _read(n) {
        if (this._state === STATE.CONNECTING) {
            this._debug('_read wait for connection');
            this.once('connect', () => this._read(n));
        } else if (!this._reading) {
            // not already reading, start the flow
            this._debug('Socket._read resume');
            this._reading = true;
            this.resume();
        }
    };

    _activeTimer(msecs, wrapper) {
        if (this._timeout && this._timeout.handle) {
            clearTimeout(this._timeout.handle);
        }

        if (!wrapper) {
            var self = this;
            wrapper = function () {
                self._timeout = null;
                self.emit('timeout');
            };
        }

        this._timeout = {
            handle: setTimeout(wrapper, msecs),
            wrapper: wrapper,
            msecs: msecs
        };
    };

    _clearTimeout() {
        if (this._timeout) {
            clearTimeout(this._timeout.handle);
            this._timeout = null;
        }
    };

    setTimeout(msecs, callback) {
        if (msecs === 0) {
            this._clearTimeout();
            if (callback) {
                this.removeListener('timeout', callback);
            }
        } else {
            if (callback) {
                this.once('timeout', callback);
            }

            this._activeTimer(msecs);
        }

        return this;
    };

    address() {
        return this._address;
    };

    end(data, encoding) {
        stream.Duplex.prototype.end.call(this, data, encoding);
        this.writable = false;

        if (this._destroyed) {
            return;
        }

        if (data) {
            this.write(data, encoding);
        }

        if (this.readable) {
            this.read(0);
            this.readable = false;
        }

        this._destroyed = true;
        this._debug('ending');

        Sockets.end(this._id);
    };

    destroy() {
        if (!this._destroyed) {
            this._destroyed = true;
            this._debug('destroying');
            this._clearTimeout();

            Sockets.destroy(this._id);
        }
    };

    _registerEvents() {
        if (this._subs && this._subs.length > 0) {
            return;
        }

        this._subs = [
            this._eventEmitter.addListener('connect', ev => {
                if (this._id !== ev.id) {
                    return;
                }
                this._onConnect(ev.address);
            }),
            this._eventEmitter.addListener('connection', ev => {
                if (this._id !== ev.id) {
                    return;
                }
                this._onConnection(ev.info);
            }),
            this._eventEmitter.addListener('data', ev => {
                if (this._id !== ev.id) {
                    return;
                }
                this._onData(ev.data);
            }),
            this._eventEmitter.addListener('close', ev => {
                if (this._id !== ev.id) {
                    return;
                }
                this._onClose(ev.hadError);
            }),
            this._eventEmitter.addListener('error', ev => {
                if (this._id !== ev.id) {
                    return;
                }
                this._onError(ev.error);
            })
        ];
    };

    _unregisterEvents() {
        this._subs.forEach(e => e.remove());
        this._subs = [];
    };

    _onConnect(address) {
        this._debug('received', 'connect');

        this.setConnected(this, address);
        this.emit('connect');

        this.read(0);
    };

    _onConnection(info) {
        this._debug('received', 'connection');

        let socket = new TcpSocket({ id: info.id });

        this.socket._registerEvents();
        this.setConnected(socket, info.address);
        this.emit('connection', this.socket);
    };

    _onData(data) {
        this._debug('received', 'data');

        if (this._timeout) {
            this._activeTimer(this._timeout.msecs);
        }

        if (data && data.length > 0) {
            // debug('got data');

            // read success.
            // In theory (and in practice) calling readStop right now
            // will prevent this from being called again until _read() gets
            // called again.

            var ret = this.push(new Buffer(data, 'base64'));
            if (this._reading && !ret) {
                this._reading = false;
                this.pause();
            }

            return;
        }
    };

    _onClose(hadError) {
        this._debug('received', 'close');
        this.setDisconnected(this, hadError);
    };

    _onError(error) {
        this._debug('received', 'error');

        this.emit('error', normalizeError(error));
        this.destroy();
    };

    write(chunk, encoding, cb) {
        if (typeof chunk !== 'string' && !(Buffer.isBuffer(chunk))) {
            throw new TypeError(
                'Invalid data, chunk must be a string or buffer, not ' + typeof chunk);
        }

        return stream.Duplex.prototype.write.apply(this, arguments);
    };

    _write(buffer, encoding, callback) {
        var self = this;

        if (this._state === STATE.DISCONNECTED) {
            throw new Error('Socket is not connected.');
        } else if (this._state === STATE.CONNECTING) {
            // we're ok, GCDAsyncSocket handles queueing internally
        }

        callback = callback || noop;
        var str;
        if (typeof buffer === 'string') {
            self._debug('socket.WRITE(): encoding as base64');
            str = Base64Str.encode(buffer);
        } else if (Buffer.isBuffer(buffer)) {
            str = buffer.toString('base64');
        } else {
            throw new TypeError(
                'Invalid data, chunk must be a string or buffer, not ' + typeof buffer);
        }

        Sockets.write(this._id, str, function (err) {
            if (self._timeout) {
                self._activeTimer(self._timeout.msecs);
            }

            err = normalizeError(err);
            if (err) {
                self._debug('write failed', err);
                return callback(err);
            }

            callback();
        });

        return true;
    };

    // Returns an array [options] or [options, cb]
    // It is the same as the argument of Socket.prototype.connect().
    _normalizeConnectArgs(args) {
        var options = {};

        if (args[0] !== null && typeof args[0] === 'object') {
            // connect(options, [cb])
            options = args[0];
        } else {
            // connect(port, [host], [cb])
            options.port = args[0];
            if (typeof args[1] === 'string') {
                options.host = args[1];
            }
        }

        var cb = args[args.length - 1];
        return typeof cb === 'function' ? [options, cb] : [options];
    };

    // unimplemented net.Socket apis
    ref() { }
    unref() { }
    setNoDelay() { }
    setKeepAlive() { }
    setEncoding() { };

    setConnected(socket, address) {
        socket.writable = socket.readable = true;
        socket._state = STATE.CONNECTED;
        socket._address = address;
    }

    setDisconnected(socket, hadError) {
        if (socket._state === STATE.DISCONNECTED) {
            return;
        }

        socket._unregisterEvents();
        socket._state = STATE.DISCONNECTED;
        socket.emit('close', hadError);
    }
}

// Check that the port number is not NaN when coerced to a number,
// is an integer and that it falls within the legal range of port numbers.
function isLegalPort(port) {
    if (typeof port === 'string' && port.trim() === '') {
        return false;
    }
    return +port === (port >>> 0) && port >= 0 && port <= 0xFFFF;
};

function normalizeError(err) {
    if (err) {
        if (typeof err === 'string') {
            err = new Error(err);
        }

        return err;
    }
}

module.exports = TcpSocket;