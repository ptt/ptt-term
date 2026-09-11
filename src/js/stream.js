// Stream wrapper managing connection, character conversion (Conv), and filter pipeline

import { EventEmitter } from './event.js';
import { Conv, CHARSETS } from './conv.js';
import { escapeIAC, TelnetFilter } from './telnet.js';

export class Stream extends EventEmitter {
  /**
   * @param {any} [conn] The underlying connection (socket or connection object)
   * @param {object} [options]
   * @param {string} [options.charset] Initial charset ('big5' or 'utf-8')
   */
  constructor(conn = null, options = {}) {
    super();
    /** @type {any} */
    this.conn = null;
    /** @type {Conv} */
    this.conv = new Conv(options.charset || CHARSETS.BIG5);
    /** @type {any[]} */
    this.filters = [];
    /** @type {TelnetFilter | null} */
    this.telnetFilter = null;
    /** @type {any | null} */
    this.ansiFilter = null;

    if (conn) {
      this.attach(conn);
    }
  }

  get charset() {
    return this.conv.charset;
  }

  set charset(val) {
    this.conv.charset = val;
  }

  get isUtf8() {
    return this.conv.isUtf8;
  }

  /**
   * Attach underlying transport connection.
   * @param {any} conn
   */
  attach(conn) {
    this.conn = conn;
    if (!conn) return this;

    conn.on('data', (d) => {
      const raw = (d && d.data !== undefined) ? d.data : d;
      this.feed(raw);
    });
    conn.on('open', () => this.emit('open'));
    conn.on('close', () => this.emit('close'));
    return this;
  }

  /**
   * Register a filter into the pipeline.
   * Filters run in registration order on inbound, and reverse/specialized on outbound.
   * @param {any} filter
   */
  registerFilter(filter) {
    if (!filter) return this;
    this.filters.push(filter);

    if (filter.attachStream) {
      filter.attachStream(this);
    }

    if (filter instanceof TelnetFilter || filter.name === 'telnet') {
      this.telnetFilter = filter;
    }
    if (filter.name === 'ansi' || (filter.constructor && (filter.constructor.name === 'AnsiFilter' || filter.constructor.name === 'AnsiParser'))) {
      this.ansiFilter = filter;
    }

    return this;
  }

  /**
   * Inbound: Feed incoming raw data from conn into the filter pipeline.
   * Filters pre-process the data, then final iconv is performed on clean bytes.
   * @param {string | Uint8Array} data
   * @returns {any}
   */
  feed(data) {
    if (!data || data.length === 0) return null;

    let current = data;
    for (const filter of this.filters) {
      if (filter === this.telnetFilter && (this.conn && this.conn.filter)) {
        continue;
      }
      if (filter.inbound) {
        current = filter.inbound(current, this);
        if (!current || current.length === 0) break;
      }
    }
    this.emit('data', { data: current });
    return current;
  }

  /**
   * Outbound: Send data through stream.
   * 1. Conv converts Unicode string into byte stream.
   * 2. Telnet filter encodes IAC (0xFF -> 0xFF 0xFF).
   * 3. Sends byte stream to conn.
   * @param {string | Uint8Array} data
   */
  send(data) {
    if (!this.conn) return;

    let bytes;
    if (typeof data === 'string') {
      // 1. Conv converts Unicode string into byte stream
      bytes = this.conv.encode(data);
    } else if (data instanceof Uint8Array) {
      bytes = data;
    } else {
      bytes = new Uint8Array(data);
    }

    // 2. Telnet filter encodes IAC (skip if underlying conn already escapes IAC)
    if (!(this.conn && this.conn.filter)) {
      if (this.telnetFilter && this.telnetFilter.outbound) {
        bytes = this.telnetFilter.outbound(bytes, this);
      } else {
        bytes = escapeIAC(bytes);
      }
    }

    // 3. Send byte stream to conn
    this.sendRaw(bytes);
  }

  /**
   * Directly send raw bytes to conn without conv or IAC escaping
   * (e.g. for telnet protocol control responses).
   * @param {Uint8Array | string} bytes
   */
  sendRaw(bytes) {
    if (!this.conn || !bytes) return;

    if (this.conn._sendRaw) {
      this.conn._sendRaw(bytes);
    } else if (this.conn.sendRaw) {
      this.conn.sendRaw(bytes);
    } else if (this.conn.send) {
      this.conn.send(bytes);
    }
  }

  sendWillNaws(cols, rows) {
    if (this.telnetFilter && this.telnetFilter.sendWillNaws) {
      this.telnetFilter.sendWillNaws(cols, rows, this);
    } else {
      this.sendRaw(new Uint8Array([0xff, 0xfb, 0x1f]));
    }
  }

  sendNaws(cols, rows) {
    if (this.telnetFilter && this.telnetFilter.sendNaws) {
      this.telnetFilter.sendNaws(cols, rows, this);
    }
  }

  sendNop() {
    if (this.telnetFilter && this.telnetFilter.sendNop) {
      this.telnetFilter.sendNop(this);
    } else {
      this.sendRaw(new Uint8Array([0xff, 0xf1]));
    }
  }
}
