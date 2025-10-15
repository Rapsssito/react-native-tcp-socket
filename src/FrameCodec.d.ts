import { Transform } from 'stream';
import { Buffer } from 'buffer';

export class FrameEncoder extends Transform {
  constructor();
  _transform(chunk: any, encoding: string, callback: (error?: Error | null) => void): void;
}

export class FrameDecoder extends Transform {
  constructor();
  _transform(chunk: any, encoding: string, callback: (error?: Error | null) => void): void;
  static _nextId: number;
}

export function createLibp2pStream(socket: any): {
  source: AsyncGenerator<any, void, unknown>;
  sink: (src: AsyncIterable<any>) => Promise<void>;
  [Symbol.asyncIterator]: () => AsyncIterator<any>;
};

export function encodeFrame(buffer: Buffer | string): Buffer;
