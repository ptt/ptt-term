import { EventEmitter } from './event.js';

export class InputInterceptors extends EventEmitter {
  constructor(app) {
    super();
    this.app = app;
    this._activeSources = new Set();
  }

  setActive(active, source = this) {
    if (active) {
      this._activeSources.add(source);
    } else {
      this._activeSources.delete(source);
    }
  }

  hasActive() {
    if (this._activeSources.size > 0) {
      return true;
    }
    const event = { active: false };
    this.emit('queryActive', event);
    return event.active;
  }

  isActive() {
    return this.hasActive();
  }

  dispatchNavCmd(cmd) {
    const event = {
      cmd,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    this.emit('navCmd', event);
    return event.defaultPrevented;
  }

  dispatchWheel(e) {
    const event = {
      originalEvent: e,
      deltaY: e ? e.deltaY : 0,
      handled: false,
      suppress: false,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
        this.handled = true;
      },
    };
    this.emit('wheel', event);
    if (event.suppress) {
      return 'suppress';
    }
    if (event.handled || event.defaultPrevented || (e && e.defaultPrevented)) {
      return true;
    }
    return false;
  }

  dispatchMouseClick(e) {
    this.emit('mouseClick', e);
    return Boolean(e && e.defaultPrevented);
  }

  dispatchKeyDown(e) {
    this.emit('keyDown', e);
    return Boolean(e && e.defaultPrevented);
  }

  dispatchTextInput(e) {
    this.emit('textInput', e);
    return Boolean(e && e.defaultPrevented);
  }

  dispatchSelectAll() {
    const event = {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    this.emit('selectAll', event);
    return event.defaultPrevented;
  }

  getSelectedText() {
    const event = { text: null };
    this.emit('getSelectedText', event);
    return event.text;
  }

  getSelectionColRow() {
    const event = { colRow: undefined };
    this.emit('getSelectionColRow', event);
    return event.colRow;
  }
}
