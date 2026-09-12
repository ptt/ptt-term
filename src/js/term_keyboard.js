import { EventEmitter } from './event.js';

export const KeyMap = {
  'Backspace': '\b',
  'Tab': '\t',
  'Enter': '\r',
  'Escape': '\x1b',
  'Home': '\x1b[1~',
  'Insert': '\x1b[2~',
  'Delete': '\x1b[3~',
  'End': '\x1b[4~',
  'PageUp': '\x1b[5~',
  'PageDown': '\x1b[6~',
  'ArrowUp': '\x1b[A',
  'ArrowDown': '\x1b[B',
  'ArrowRight': '\x1b[C',
  'ArrowLeft': '\x1b[D',
  // Edge.
  'Up': '\x1b[A',
  'Down': '\x1b[B',
  'Right': '\x1b[C',
  'Left': '\x1b[D'
};
let CtrlShiftMap = {
  '@': 0,    // NUL
  '[': 27,   // ESC
  '\\': 28,  // FS
  ']': 29,   // GS
  '^': 30,   // RS
  '_': 31,   // US
  '?': 127   // DEL
};
// A -> 1
for (let i = 97; i <= 122; i++) {
  CtrlShiftMap[String.fromCharCode(i)] = i - 96;
}

// FIXME: Under Mac, IME inputs will be sent as key of modified char.
// Need to use key code directly.

export class TermKeyboard extends EventEmitter {
  /**
   * @param {function(string): boolean} send
   * @param {function(object)|EventTarget} [onKey]
   * @param {object} [options]
   */
  constructor(send, onKey = null, options = {}) {
    super();
    this._sendFunc = send;
    this._onKey = onKey;
    this.backspaceKey = options.backspaceKey || 'control-h';
    this.deleteKey = options.deleteKey || 'escape-sequence';
  }

  getMappedKey(key) {
    if (key === 'Backspace') {
      return this.backspaceKey === 'control-?' ? '\x7f' : '\b';
    }
    if (key === 'Delete') {
      if (this.deleteKey === 'control-?') return '\x7f';
      if (this.deleteKey === 'control-h') return '\b';
      return '\x1b[3~';
    }
    return KeyMap[key];
  }

  _send(data) {
    if (typeof this._sendFunc === 'function') {
      this._sendFunc(data);
    }
    return true;
  }

  _sendCharCode(code) {
    return this._send(String.fromCharCode(code));
  }

  /**
   * Send a specific key (e.g. navigation or character) without triggering key event listeners.
   * @param {string} key 
   * @returns {boolean}
   */
  sendKey(key) {
    const mapped = this.getMappedKey(key);
    if (mapped) {
      return this._send(mapped);
    }
    if (typeof key === 'string' && key.length === 1) {
      return this._send(key);
    }
    return false;
  }

  _fireKeyEvent(key, mapped, event) {
    const detail = { key, mapped, term: this, event };
    this.emit('term:key', { ...detail, detail });
    if (typeof this._onKey === 'function') {
      this._onKey(detail);
    }
  }

  onKeyDown(e) {
    if (this._onKeyDown(e))
      e.preventDefault();
  }

  _onKeyDown(e) {
    if (!e) return false;
    // Windows/Command key.
    if (e.metaKey) {
      return false;
    }

    // Standard IME guard (Safari & Chrome): Do not process BBS mapped keys (arrows, enter, backspace)
    // while IME composition is active in any browser.
    if (e.isComposing || e.key === 'Process' || e.keyCode === 229) {
      return false;
    }

    if (!e.ctrlKey && !e.altKey) {
      // Shift-Insert as paste.
      if (e.shiftKey && e.key == 'Insert') {
        return false;
      }

      let mapped = e.key ? this.getMappedKey(e.key) : null;
      if (mapped) {
        const sent = this._send(mapped);
        this._fireKeyEvent(e.key, mapped, e);
        return sent;
      } else if (e.key && e.key.length == 1) {
        if (!e.isComposing && e.key !== 'Process' && e.keyCode !== 229) {
          const sent = this._send(e.key);
          this._fireKeyEvent(e.key, e.key, e);
          return sent;
        }
        return false;
      }
    } else if (e.ctrlKey && !e.altKey && !e.shiftKey) {
      if (!e.key) return false;
      // Use lowercase no even capslock's on.
      let key = e.key.length == 1 ? e.key.toLowerCase() : e.key;
      let mappedCode = CtrlShiftMap[key];
      if (mappedCode !== undefined) {
        const sent = this._sendCharCode(mappedCode);
        this._fireKeyEvent(e.key, String.fromCharCode(mappedCode), e);
        return sent;
      }
    } else if (!e.ctrlKey && e.altKey && !e.shiftKey) {
      if (!e.key) return false;
      // Remapped keys, which conflict browser shortcuts.
      // Use lowercase no even capslock's on.
      switch (e.key.toLowerCase()) {
        case 'r':
        case 't':
        case 'w':
        case 'a': {
          // Ctrl+key
          const code = e.key.toUpperCase().charCodeAt(0) - 64;
          const sent = this._sendCharCode(code);
          this._fireKeyEvent(e.key, String.fromCharCode(code), e);
          return sent;
        }
      }
    }
    return false;
  }


}
