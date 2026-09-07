'use strict';

const KeyMap = {
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

export class TermKeyboard {
  // isLeftDB: function() -> bool
  // isCurDB: function() -> bool
  // send: function(data)
  constructor(isLeftDB, isCurDB, send) {
    this._checkLeftDB = isLeftDB;
    this._checkCurDB = isCurDB;
    this._sendFunc = send;
  }

  _send(data) {
    this._sendFunc(data);
    return true;
  }

  _sendCharCode(code) {
    return this._send(String.fromCharCode(code));
  }

  _checkDB(key) {
    switch (key) {
      case 'Backspace':
      case 'ArrowLeft':
        return this._checkLeftDB();
      case 'Delete':
      case 'ArrowRight':
        return this._checkCurDB();
    }
    return false;
  }

  onKeyDown(e) {
    if (this._onKeyDown(e))
      e.preventDefault();
  }

  _onKeyDown(e) {
    // Windows/Command key.
    if (e.getModifierState('Meta')) {
      return false;
    }

    if (!e.ctrlKey && !e.altKey) {
      // Shift-Insert as paste.
      if (e.shiftKey && e.key == 'Insert') {
        return false;
      }

      let mapped = KeyMap[e.key];
      if (mapped) {
        if (this._checkDB(e.key)) {
          return this._send(mapped + mapped);
        } else {
          return this._send(mapped);
        }
      } else if (e.key.length == 1) {
        if (!e.isComposing && e.key !== 'Process' && e.keyCode !== 229) {
          return this._send(e.key);
        }
        return false;
      }
    } else if (e.ctrlKey && !e.altKey && !e.shiftKey) {
      // Use lowercase no even capslock's on.
      let key = e.key.length == 1 ? e.key.toLowerCase() : e.key;
      let mappedCode = CtrlShiftMap[key];
      if (mappedCode !== undefined) {
        return this._sendCharCode(mappedCode);
      }
    } else if (!e.ctrlKey && e.altKey && !e.shiftKey) {
      // Remapped keys, which conflict browser shortcuts.
      // Use lowercase no even capslock's on.
      switch (e.key.toLowerCase()) {
        case 'r':
        case 't':
        case 'w':
        case 'a':
          // Ctrl+key
          return this._sendCharCode(e.key.toUpperCase().charCodeAt(0) - 64);
      }
    }
    return false;
  }

  /**
   * @deprecated Handled in onKeyDown
   */
  onKeyPress(e) {
    return false;
  }
}
