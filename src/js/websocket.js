import { EventEmitter } from './event.js';

export function uint8ArrayToBinaryString(bytes) {
  const len = bytes.length;
  // Fast path for small packets (< 1KB) without apply/stack overhead
  if (len < 1024) {
    let str = "";
    for (let i = 0; i < len; i++) str += String.fromCharCode(bytes[i]);
    return str;
  }
  // For large packets, chunk at 8192 to avoid call stack limits
  const CHUNK_SIZE = 8192;
  let str = "";
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    str += String.fromCharCode.apply(
      null,
      bytes.subarray(i, Math.min(i + CHUNK_SIZE, len))
    );
  }
  return str;
}

export const BUFFER_HIGH_WATERMARK = 4096;
export const BUFFER_LOW_WATERMARK = 1024;
export const CHUNK_SIZE = 512;
export const INTER_CHUNK_DELAY_MS = 15;

export class Websocket extends EventEmitter {
  constructor(url) {
    super();
    this._conn = new WebSocket(url, "telnet");
    this._conn.binaryType = "arraybuffer";
    this._sendQueue = [];
    this._isFlushing = false;

    this._conn.addEventListener('open', (e) => this._onOpen(e));
    this._conn.addEventListener('message', (e) => this._onMessage(e));
    this._conn.addEventListener('error', (e) => this._onError(e));
    this._conn.addEventListener('close', (e) => this._onClose(e));
  }

  get bufferedAmount() {
    return this._conn ? this._conn.bufferedAmount : 0;
  }

  _onOpen(e) {
    this.emit('open');
  }

  _onMessage(e) {
    const data = new Uint8Array(e.data);
    this.emit('rawRecv', { data });
    this.emit('data', { data });
  }

  _onError(e) {
    this.emit('error');
  }

  _onClose(e) {
    this._sendQueue = [];
    this._isFlushing = false;
    this.emit('close');
  }

  send(data) {
    if (!this._conn) return;

    if (typeof data !== 'string') {
      const byteArray = data instanceof Uint8Array ? data : new Uint8Array(data);
      this._sendQueue.push(byteArray);
    } else {
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const slice = data.substring(i, i + CHUNK_SIZE);
        const byteArray = new Uint8Array(slice.length);
        for (let j = 0; j < slice.length; j++) {
          byteArray[j] = slice.charCodeAt(j) & 0xff;
        }
        this._sendQueue.push(byteArray);
      }
    }

    if (!this._isFlushing) {
      this._flushSendQueue();
    }
  }

  async _flushSendQueue() {
    this._isFlushing = true;

    try {
      while (this._sendQueue.length > 0) {
        if (
          !this._conn ||
          (typeof WebSocket !== 'undefined' && this._conn.readyState !== WebSocket.OPEN)
        ) {
          this._sendQueue = [];
          break;
        }

        // Apply backpressure if bufferedAmount exceeds high watermark
        while (this._conn && this._conn.bufferedAmount > BUFFER_HIGH_WATERMARK) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }

        const chunk = this._sendQueue.shift();
        if (!chunk) continue;

        this.emit('rawSend', {
          data: chunk,
          detail: {
            data: chunk,
          },
        });
        this._conn.send(chunk.buffer);

        // If more chunks remain in queue (bulk transmission / paste), apply inter-chunk delay
        if (this._sendQueue.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, INTER_CHUNK_DELAY_MS));
        }
      }
    } finally {
      this._isFlushing = false;
    }
  }

  close() {
    this._sendQueue = [];
    this._isFlushing = false;
    if (this._conn) {
      this._conn.close();
    }
  }
}
