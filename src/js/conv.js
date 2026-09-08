import { u2b, b2u, ansiHalfColorConv } from './string_util.js';
import { b2uTable } from '../conv/uao.js';

export const CHARSETS = Object.freeze({
  BIG5: 'big5',
  UTF8: 'utf-8',
});

export class Conv {
  /**
   * @param {string} [charset='big5']
   */
  constructor(charset = CHARSETS.BIG5) {
    /** @type {string} */
    this._charset = CHARSETS.BIG5;
    this.charset = charset;
    /** @type {TextDecoder | null} */
    this.utf8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
    /** @type {TextEncoder | null} */
    this.utf8Encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  }

  set charset(val) {
    if (typeof val === 'string') {
      const lower = val.toLowerCase();
      if (lower === 'utf-8' || lower === 'utf8') {
        this._charset = CHARSETS.UTF8;
        return;
      }
      if (lower === 'big5' || lower === 'big-5' || lower === 'big5-uao') {
        this._charset = CHARSETS.BIG5;
        return;
      }
    }
    this._charset = val || CHARSETS.BIG5;
  }

  get charset() {
    return this._charset || CHARSETS.BIG5;
  }

  get isUtf8() {
    return this.charset === CHARSETS.UTF8;
  }

  /**
   * Encodes a Unicode string into a byte stream (Uint8Array).
   * @param {string} str
   * @returns {Uint8Array}
   */
  encode(str) {
    if (!str) return new Uint8Array(0);
    if (this.isUtf8) {
      if (this.utf8Encoder) {
        return this.utf8Encoder.encode(str);
      }
      return new TextEncoder().encode(str);
    }

    // Big5 encoding via u2b and half-color handling
    let s = u2b(str);
    if (s) {
      s = ansiHalfColorConv(s);
    }
    return s || '';
  }

  /**
   * Decodes a byte stream into a Unicode string.
   * @param {Uint8Array | number[] | string} bytes
   * @returns {string}
   */
  decode(bytes) {
    if (!bytes || bytes.length === 0) return '';
    const arr = bytes instanceof Uint8Array
      ? bytes
      : (typeof bytes === 'string'
        ? new Uint8Array(Array.from(bytes, c => c.charCodeAt(0) & 0xff))
        : new Uint8Array(bytes));

    if (this.isUtf8) {
      return this.utf8Decoder ? this.utf8Decoder.decode(arr) : new TextDecoder('utf-8').decode(arr);
    }

    // Fast path: 2-byte Big5 character
    if (arr.length === 2) {
      return this.decodeBig5Char(arr[0], arr[1]);
    }

    // Multiple bytes Big5
    let str = '';
    for (let i = 0; i < arr.length; ++i) {
      str += String.fromCharCode(arr[i]);
    }
    return b2u(str);
  }

  /**
   * Decodes a 2-byte Big5 character code.
   * @param {number} lead
   * @param {number} trail
   * @returns {string}
   */
  decodeBig5Char(lead, trail) {
    const pos = (lead << 8) | trail;
    const code = b2uTable ? b2uTable[pos] : 0;
    return code ? String.fromCharCode(code) : b2u(String.fromCharCode(lead, trail));
  }
}
