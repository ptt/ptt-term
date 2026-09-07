import { Event } from './event.js';

export function uint8ArrayToBinaryString(bytes) {
  const CHUNK_SIZE = 8192;
  if (bytes.length <= CHUNK_SIZE) {
    return String.fromCharCode.apply(null, bytes);
  }
  let str = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    str += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE));
  }
  return str;
}

export class Websocket extends Event {
  constructor(url) {
    super();
    this._conn = new WebSocket(url, "telnet");
    this._conn.binaryType = "arraybuffer";
    this._conn.addEventListener('open', (e) => this._onOpen(e));
    this._conn.addEventListener('message', (e) => this._onMessage(e));
    this._conn.addEventListener('error', (e) => this._onError(e));
    this._conn.addEventListener('close', (e) => this._onClose(e));
  }

  _onOpen(e) {
    this.dispatchEvent(new CustomEvent('open'));
  }

  _onMessage(e) {
    const data = new Uint8Array(e.data);
    this.dispatchEvent(new CustomEvent('rawRecv', {
      detail: {
        data: data
      }
    }));
    this.dispatchEvent(new CustomEvent('data', {
      detail: {
        data: uint8ArrayToBinaryString(data)
      }
    }));
  }

  _onError(e) {
    this.dispatchEvent(new CustomEvent('error'));
  }

  _onClose(e) {
    this.dispatchEvent(new CustomEvent('close'));
  }

  send(str) {
    // XXX: move this to app.
    // because ptt seems to reponse back slowly after large
    // chunk of text is pasted, so better to split it up.
    if (typeof str !== 'string') {
      const byteArray = str instanceof Uint8Array ? str : new Uint8Array(str);
      this.dispatchEvent(new CustomEvent('rawSend', {
        detail: {
          data: byteArray
        }
      }));
      this._conn.send(byteArray.buffer);
      return;
    }
    const chunk = 1000;
    for (let i = 0; i < str.length; i += chunk) {
      const chunkStr = str.substring(i, i+chunk);
      const byteArray = new Uint8Array(chunkStr.split('').map((x) => x.charCodeAt(0)));
      this.dispatchEvent(new CustomEvent('rawSend', {
        detail: {
          data: byteArray
        }
      }));
      this._conn.send(byteArray.buffer);
    }
  }

  close() {
    this._conn.close();
  }
}
