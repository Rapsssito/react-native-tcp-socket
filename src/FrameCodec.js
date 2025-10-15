const { Transform } = require('stream');
const {
  FrameEncoder,
  createLibp2pStreamFactory,
  encodeFrame
} = require('./FrameCodecShared');

const DEBUG_FRAME_DECODER = process.env.FRAME_DECODER_DEBUG === '1';

class FrameDecoder extends Transform {
  constructor() {
    super({ readableObjectMode: true }); // object mode ensures zero-length payloads surface as readable chunks
    this._q = [];
    this._l = 0;
    this._e = null;
    this._vlen = 0;
    this._id = FrameDecoder._nextId++;
  }

  _log(event, details) {
    if (!DEBUG_FRAME_DECODER) return;
    const prefix = `FrameDecoder#${this._id}`;
    if (details) {
      console.log(`${prefix} ${event}`, details);
    } else {
      console.log(`${prefix} ${event}`);
    }
  }

  _transform(chunk, encoding, cb) {
    try {
      if (!Buffer.isBuffer(chunk)) chunk = Buffer.from(chunk);
      this._q.push(chunk);
      this._l += chunk.length;
      this._log('chunk', { chunkLength: chunk.length, buffered: this._l });

      while (this._l > 0) {
        this._log('loop', { buffered: this._l, expectedPayload: this._e, varintBytes: this._vlen });
        if (this._e === null) {
          const decoded = this._dv();
          if (!decoded) {
            this._log('await_varint', { buffered: this._l });
            break;
          }
          this._e = decoded.value;
          this._vlen = decoded.bytes;
          this._log('varint_ready', { payloadLength: this._e, headerBytes: this._vlen, buffered: this._l });
        }

        if (this._e !== null) {
          const need = this._vlen + this._e;
          if (this._l < need) {
            this._log('await_payload', { need, buffered: this._l });
            break;
          }
          this._take(this._vlen, 'varint');
          const payload = this._take(this._e, 'payload');
          this._log('frame_emitted', { payloadLength: this._e, buffered: this._l });
          this._e = null;
          this._vlen = 0;
          this.push(payload);
        }
      }

      cb();
    } catch (err) {
      cb(err);
    }
  }

  _dv() {
    let r = 0, s = 0, p = 0, i = 0, o = 0;
    while (p < this._l) {
      if (i >= this._q.length) break;
      const buf = this._q[i];
      if (o >= buf.length) {
        i++;
        o = 0;
        continue;
      }
      const v = buf[o++];
      r |= (v & 0x7f) << s;
      p++;
      this._log('varint_byte', { byte: v, shift: s, partialValue: r, bytesRead: p });
      if ((v & 0x80) === 0) {
        this._log('varint_complete', { value: r, bytes: p });
        return { value: r, bytes: p };
      }
      s += 7;
      if (s > 53) break;
    }
    this._log('varint_incomplete', { bytesScanned: p, buffered: this._l });
    return null;
  }

  _take(n, label = 'bytes') {
    this._log('take_start', { label, bytes: n, buffered: this._l });

    // Zero-copy fast path: single chunk contains all needed bytes
    if (this._q.length > 0 && this._q[0].length >= n) {
      const head = this._q[0];
      const slice = head.slice(0, n);
      this._l -= n;
      if (n === head.length) {
        this._q.shift();
      } else {
        this._q[0] = head.slice(n);
      }
      this._log('take_complete', { label, bytes: n, buffered: this._l, zeroCopy: true });
      return slice;
    }

    // Multi-chunk path: allocate and copy
    const f = Buffer.allocUnsafe(n);
    let w = 0;
    while (w < n && this._q.length > 0) {
      const next = this._q[0];
      const t = Math.min(next.length, n - w);
      next.copy(f, w, 0, t);
      w += t;
      this._l -= t;
      if (t === next.length) {
        this._q.shift();
      } else {
        this._q[0] = next.slice(t);
      }
      this._log('take_progress', { label, copied: t, written: w, buffered: this._l });
    }
    this._log('take_complete', { label, bytes: n, buffered: this._l, zeroCopy: false });
    return f;
  }
}

FrameDecoder._nextId = 1;

module.exports = {
  FrameEncoder,
  FrameDecoder,
  createLibp2pStream: createLibp2pStreamFactory(() => new FrameDecoder()),
  encodeFrame
};
