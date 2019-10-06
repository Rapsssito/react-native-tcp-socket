'use strict';

if(!(global.process && global.process.nextTick)){
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
// var base64 = require('base64-js');
var Base64Str = require('./base64-str');
var noop = function () {};
var instances = 0;
var STATE = {
  DISCONNECTED: 0,
  CONNECTING: 1,
  CONNECTED: 2
};

function TcpSocket(options: ?{ id: ?number }) {
  if (!(this instanceof TcpSocket)) {
    return new TcpSocket(options);
  }

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

util.inherits(TcpSocket, stream.Duplex);

TcpSocket.prototype._debug = function() {
  if (__DEV__) {
    var args = [].slice.call(arguments);
    args.unshift('socket-' + this._id);
    console.log.apply(console, args);
  }
};

// TODO : determine how to properly overload this with flow
TcpSocket.prototype.connect = function(options, callback) : TcpSocket {
  this._registerEvents();

  if (options === null || typeof options !== 'object') {
    // Old API:
    // connect(port, [host], [cb])
    var args = this._normalizeConnectArgs(arguments);
    return TcpSocket.prototype.connect.apply(this, args);
  }

  if (typeof callback === 'function') {
    this.once('connect', callback);
  }

  var host = options.host || 'localhost';
  var port = options.port || 0;
  var localAddress = options.localAddress;
  var localPort = options.localPort;

  if (localAddress && !ipRegex({exact: true}).test(localAddress)) {
    throw new TypeError('"localAddress" option must be a valid IP: ' + localAddress);
  }

  if (localPort && typeof localPort !== 'number') {
    throw new TypeError('"localPort" option should be a number: ' + localPort);
  }

  if (typeof port !== 'undefined') {
    if (typeof port !== 'number' && typeof port !== 'string') {
      throw new TypeError('"port" option should be a number or string: ' + port);
    }

    port = +port;

    if (!isLegalPort(port)) {
      throw new RangeError('"port" option should be >= 0 and < 65536: ' + port);
    }
  }

  if (options.timeout) {
    this.setTimeout(options.timeout);
  } else if (this._timeout) {
    this._activeTimer(this._timeout.msecs);
  }

  this._state = STATE.CONNECTING;
  this._debug('connecting, host:', host, 'port:', port);

  this._destroyed = false;
  Sockets.connect(this._id, host, Number(port), options);

  return this;
};

// Check that the port number is not NaN when coerced to a number,
// is an integer and that it falls within the legal range of port numbers.
function isLegalPort(port: number) : boolean {
  if (typeof port === 'string' && port.trim() === '') {
    return false;
  }
  return +port === (port >>> 0) && port >= 0 && port <= 0xFFFF;
};

TcpSocket.prototype.read = function(n) {
  if (n === 0) {
    return stream.Readable.prototype.read.call(this, n);
  }

  this.read = stream.Readable.prototype.read;
  this._consuming = true;
  return this.read(n);
};

// Just call handle.readStart until we have enough in the buffer
TcpSocket.prototype._read = function(n) {
  this._debug('_read');

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

TcpSocket.prototype._activeTimer = function(msecs, wrapper) {
  if (this._timeout && this._timeout.handle) {
    clearTimeout(this._timeout.handle);
  }

  if (!wrapper) {
    var self = this;
    wrapper = function() {
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

TcpSocket.prototype._clearTimeout = function() {
  if (this._timeout) {
    clearTimeout(this._timeout.handle);
    this._timeout = null;
  }
};

TcpSocket.prototype.setTimeout = function(msecs: number, callback: () => void) {
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

TcpSocket.prototype.address = function() : { port: number, address: string, family: string } {
  return this._address;
};

TcpSocket.prototype.end = function(data, encoding) {
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

TcpSocket.prototype.destroy = function() {
  if (!this._destroyed) {
    this._destroyed = true;
    this._debug('destroying');
    this._clearTimeout();

    Sockets.destroy(this._id);
  }
};

TcpSocket.prototype._registerEvents = function(): void {
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

TcpSocket.prototype._unregisterEvents = function(): void {
  this._subs.forEach(e => e.remove());
  this._subs = [];
};

TcpSocket.prototype._onConnect = function(address: { port: number, address: string, family: string }): void {
  this._debug('received', 'connect');

  setConnected(this, address);
  this.emit('connect');

  this.read(0);
};

TcpSocket.prototype._onConnection = function(info: { id: number, address: { port: number, address: string, family: string } }): void {
  this._debug('received', 'connection');

  var socket = new TcpSocket({ id: info.id });

  socket._registerEvents();
  setConnected(socket, info.address);
  this.emit('connection', socket);
};

TcpSocket.prototype._onData = function(data: string): void {
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

TcpSocket.prototype._onClose = function(hadError: boolean): void {
  this._debug('received', 'close');

  setDisconnected(this, hadError);
};

TcpSocket.prototype._onError = function(error: string): void {
  this._debug('received', 'error');

  this.emit('error', normalizeError(error));
  this.destroy();
};

TcpSocket.prototype.write = function(chunk, encoding, cb) {
  if (typeof chunk !== 'string' && !(Buffer.isBuffer(chunk))) {
    throw new TypeError(
      'Invalid data, chunk must be a string or buffer, not ' + typeof chunk);
  }

  return stream.Duplex.prototype.write.apply(this, arguments);
};

TcpSocket.prototype._write = function(buffer: any, encoding: ?String, callback: ?(err: ?Error) => void) : boolean {
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

  Sockets.write(this._id, str, function(err) {
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

function setConnected(socket: TcpSocket, address: { port: number, address: string, family: string } ) {
  socket.writable = socket.readable = true;
  socket._state = STATE.CONNECTED;
  socket._address = address;
}

function setDisconnected(socket: TcpSocket, hadError: boolean): void {
  if (socket._state === STATE.DISCONNECTED) {
    return;
  }

  socket._unregisterEvents();
  socket._state = STATE.DISCONNECTED;
  socket.emit('close', hadError);
}

function normalizeError(err) {
  if (err) {
    if (typeof err === 'string') {
      err = new Error(err);
    }

    return err;
  }
}

// Returns an array [options] or [options, cb]
// It is the same as the argument of Socket.prototype.connect().
TcpSocket.prototype._normalizeConnectArgs = function(args) {
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
TcpSocket.prototype.ref =
TcpSocket.prototype.unref =
TcpSocket.prototype.setNoDelay =
TcpSocket.prototype.setKeepAlive =
TcpSocket.prototype.setEncoding = function() { /* nop */ };

module.exports = TcpSocket;