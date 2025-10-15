const { Transform } = require('stream');
const {
  FrameEncoder,
  createLibp2pStreamFactory,
  encodeFrame
} = require('./FrameCodecShared');

const DEBUG_FRAME_DECODER = process.env.FRAME_DECODER_DEBUG === '1';

class FrameDecoderCirc extends Transform {
  constructor(bufferSize = 16384) {
    super({ readableObjectMode: true });
    this._buf = Buffer.allocUnsafe(bufferSize);
    this._head = 0;
    this._tail = 0;
    this._size = bufferSize;
    this._e = null;
    this._vlen = 0;
    this._id = FrameDecoderCirc._nextId++;
  }

  _log(event, details) {
    if (!DEBUG_FRAME_DECODER) return;
    const prefix = `FrameDecoderCirc#${this._id}`;
    if (details) {
      console.log(`${prefix} ${event}`, details);
    } else {
      console.log(`${prefix} ${event}`);
    }
  }

  _available() {
    return (this._tail - this._head + this._size) % this._size;
  }

  _transform(chunk, encoding, cb) {
    try {
      if (!Buffer.isBuffer(chunk)) chunk = Buffer.from(chunk);

      const avail = this._available();
      const needed = chunk.length;

      if (needed > this._size - avail - 1) {
        const newSize = Math.max(this._size * 2, this._size + needed);
        const newBuf = Buffer.allocUnsafe(newSize);
        const used = avail;

        if (this._head <= this._tail) {
          this._buf.copy(newBuf, 0, this._head, this._tail);
        } else {
          const firstPart = this._size - this._head;
          this._buf.copy(newBuf, 0, this._head, this._size);
          this._buf.copy(newBuf, firstPart, 0, this._tail);
        }

        this._buf = newBuf;
        this._head = 0;
        this._tail = used;
        this._size = newSize;
      }

      let written = 0;
      while (written < chunk.length) {
        const contiguous = this._tail < this._head
          ? this._head - this._tail - 1
          : this._size - this._tail - (this._head === 0 ? 1 : 0);
        const toWrite = Math.min(chunk.length - written, contiguous);
        chunk.copy(this._buf, this._tail, written, written + toWrite);
        this._tail = (this._tail + toWrite) % this._size;
        written += toWrite;
      }

      this._log('chunk', { chunkLength: chunk.length, buffered: this._available() });

      while (this._available() > 0) {
        this._log('loop', { buffered: this._available(), expectedPayload: this._e, varintBytes: this._vlen });

        if (this._e === null) {
          const decoded = this._dv();
          if (!decoded) {
            this._log('await_varint', { buffered: this._available() });
            break;
          }
          this._e = decoded.value;
          this._vlen = decoded.bytes;
          this._log('varint_ready', { payloadLength: this._e, headerBytes: this._vlen, buffered: this._available() });
        }

        if (this._e !== null) {
          const need = this._vlen + this._e;
          if (this._available() < need) {
            this._log('await_payload', { need, buffered: this._available() });
            break;
          }
          this._consume(this._vlen);
          const payload = this._take(this._e);
          this._log('frame_emitted', { payloadLength: this._e, buffered: this._available() });
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
    let r = 0, s = 0, p = 0;
    const avail = this._available();
    let pos = this._head;

    while (p < avail) {
      const v = this._buf[pos];
      pos = (pos + 1) % this._size;
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
    this._log('varint_incomplete', { bytesScanned: p, buffered: avail });
    return null;
  }

  _consume(n) {
    this._head = (this._head + n) % this._size;
  }

  _take(n) {
    const f = Buffer.allocUnsafe(n);
    let w = 0;
    this._log('take_start', { bytes: n, buffered: this._available() });

    while (w < n) {
      const contiguous = this._head < this._tail
        ? this._tail - this._head
        : this._size - this._head;
      const toCopy = Math.min(n - w, contiguous);
      this._buf.copy(f, w, this._head, this._head + toCopy);
      this._head = (this._head + toCopy) % this._size;
      w += toCopy;
      this._log('take_progress', { copied: toCopy, written: w, buffered: this._available() });
    }

    this._log('take_complete', { bytes: n, buffered: this._available() });
    return f;
  }
}

FrameDecoderCirc._nextId = 1;

module.exports = {
  FrameEncoder,
  FrameDecoderCirc,
  createLibp2pStream: createLibp2pStreamFactory(() => new FrameDecoderCirc()),
  encodeFrame
};
