const { Transform } = require('stream');

const varint = {
  // Write varint-encoded `n` into `target` at `offset`. Returns number of bytes written.
  encodeTo: (target, offset, n) => {
    if (n < 0) throw new RangeError('varint unsigned only');
    let i = 0;
    do {
      let b = n & 0x7f;
      n = Math.floor(n / 128);
      if (n > 0) b |= 0x80;
      target[offset + (i++)] = b;
    } while (n > 0);
    return i;
  },
  encode: (n) => {
    const buf = Buffer.allocUnsafe(10);
    const len = varint.encodeTo(buf, 0, n);
    return buf.slice(0, len);
  },
  decodeFrom: (buf, offset = 0) => {
    let r = 0, s = 0, i = offset;
    for (; i < buf.length; i++) {
      const b = buf[i];
      r |= (b & 0x7f) << s;
      if ((b & 0x80) === 0) return { value: r, bytes: i - offset + 1 };
      s += 7;
      if (s > 53) break;
    }
    return null;
  }
};

class FrameEncoder extends Transform {
  constructor() {
    super({ writableObjectMode: true });
    let drainDeferred = null;
    // per-instance varint buffer to avoid allocating a small header Buffer per frame
    this._varintBuf = Buffer.allocUnsafe(10);
    this.waitForDrain = () => {
      if (!drainDeferred) {
        drainDeferred = {};
        drainDeferred.promise = new Promise((resolve) => {
          drainDeferred.resolve = resolve;
        });
        this.once('drain', () => {
          if (drainDeferred) {
            drainDeferred.resolve();
            drainDeferred = null;
          }
        });
      }
      return drainDeferred.promise;
    };
  }
  _transform(f, e, cb) {
    try {
      if (!Buffer.isBuffer(f)) f = Buffer.from(f);
      // encode varint header into reusable buffer then copy into final frame
      const payloadLen = f.length;
      const hdrLen = varint.encodeTo(this._varintBuf, 0, payloadLen);
      const frame = Buffer.allocUnsafe(hdrLen + payloadLen);
      this._varintBuf.copy(frame, 0, 0, hdrLen);
      f.copy(frame, hdrLen);
      this.push(frame);
      cb();
    } catch (err) {
      cb(err);
    }
  }
}

const createLibp2pStreamFactory = (decoderFactory) => (socket) => {
  const decoder = decoderFactory();
  const encoder = new FrameEncoder();
  socket.pipe(decoder);
  encoder.pipe(socket);
  const stream = {
    source: (async function* () {
      for await (const chunk of decoder) {
        yield chunk;
      }
    })(),
    sink: async (src) => {
      for await (const chunk of src) {
        if (!encoder.write(chunk)) await encoder.waitForDrain();
      }
      encoder.end();
    }
  };
  stream[Symbol.asyncIterator] = () => stream.source[Symbol.asyncIterator]();
  return stream;
};

const encodeFrame = (b) => {
  const buf = Buffer.isBuffer(b) ? b : Buffer.from(b);
  // Avoid Buffer.concat by preallocating exact size and writing header then payload
  const tmp = Buffer.allocUnsafe(10);
  const hdrLen = varint.encodeTo(tmp, 0, buf.length);
  const out = Buffer.allocUnsafe(hdrLen + buf.length);
  tmp.copy(out, 0, 0, hdrLen);
  buf.copy(out, hdrLen);
  return out;
};

module.exports = {
  varint,
  FrameEncoder,
  createLibp2pStreamFactory,
  encodeFrame
};
