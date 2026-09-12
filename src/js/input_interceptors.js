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
    return Boolean(e && (e.defaultPrevented || e.handled));
  }

  dispatchMouseDown(e) {
    this.emit('mouseDown', e);
    return Boolean(e && (e.defaultPrevented || e.handled));
  }

  dispatchMouseUp(e) {
    this.emit('mouseUp', e);
    return Boolean(e && (e.defaultPrevented || e.handled));
  }

  dispatchKeyDown(e) {
    this.emit('keyDown', e);
    return Boolean(e && (e.defaultPrevented || e.handled));
  }

  dispatchTextInput(e) {
    this.emit('textInput', e);
    return Boolean(e && (e.defaultPrevented || e.handled));
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

  registerInterceptor(interceptor) {
    if (!interceptor || this._registeredInterceptors?.has(interceptor)) return;
    if (!this._registeredInterceptors) {
      this._registeredInterceptors = new Map();
    }
    const handlers = [];

    if (typeof interceptor.handleNavCmd === 'function') {
      const fn = (e) => {
        if (e?.defaultPrevented) return;
        if (interceptor.handleNavCmd(e.cmd)) {
          e.preventDefault?.();
        }
      };
      this.on('navCmd', fn);
      handlers.push(['navCmd', fn]);
    }

    if (typeof interceptor.handleWheel === 'function') {
      const fn = (e) => {
        if (e?.handled || e?.suppress || e?.defaultPrevented) return;
        const res = interceptor.handleWheel(e.originalEvent || e);
        if (res === 'suppress') {
          e.suppress = true;
          e.preventDefault?.();
        } else if (res) {
          e.handled = true;
          e.preventDefault?.();
        }
      };
      this.on('wheel', fn);
      handlers.push(['wheel', fn]);
    }

    if (typeof interceptor.handleMouseClick === 'function') {
      const fn = (e) => {
        if (e?.handled || e?.defaultPrevented) return;
        if (interceptor.handleMouseClick(e)) {
          if (e) {
            e.defaultPrevented = true;
            e.handled = true;
            e.preventDefault?.();
          }
        }
      };
      this.on('mouseClick', fn);
      handlers.push(['mouseClick', fn]);
    }

    if (typeof interceptor.handleMouseDown === 'function') {
      const fn = (e) => {
        if (e?.handled || e?.defaultPrevented) return;
        if (interceptor.handleMouseDown(e)) {
          if (e) {
            e.defaultPrevented = true;
            e.handled = true;
            e.preventDefault?.();
          }
        }
      };
      this.on('mouseDown', fn);
      handlers.push(['mouseDown', fn]);
    }

    if (typeof interceptor.handleMouseUp === 'function') {
      const fn = (e) => {
        if (e?.handled || e?.defaultPrevented) return;
        if (interceptor.handleMouseUp(e)) {
          if (e) {
            e.defaultPrevented = true;
            e.handled = true;
            e.preventDefault?.();
          }
        }
      };
      this.on('mouseUp', fn);
      handlers.push(['mouseUp', fn]);
    }

    if (typeof interceptor.handleKeyDown === 'function') {
      const fn = (e) => {
        if (e?.handled || e?.defaultPrevented) return;
        if (interceptor.handleKeyDown(e)) {
          if (e) {
            e.defaultPrevented = true;
            e.handled = true;
            e.preventDefault?.();
          }
        }
      };
      this.on('keyDown', fn);
      handlers.push(['keyDown', fn]);
    }

    if (typeof interceptor.handleTextInput === 'function') {
      const fn = (e) => {
        if (e?.handled || e?.defaultPrevented) return;
        if (interceptor.handleTextInput(e)) {
          if (e) {
            e.defaultPrevented = true;
            e.handled = true;
            e.preventDefault?.();
          }
        }
      };
      this.on('textInput', fn);
      handlers.push(['textInput', fn]);
    }

    if (typeof interceptor.isActive === 'function') {
      const fn = (e) => {
        if (interceptor.isActive()) {
          e.active = true;
        }
      };
      this.on('queryActive', fn);
      handlers.push(['queryActive', fn]);
    }

    if (typeof interceptor.getSelectedText === 'function') {
      const fn = (e) => {
        if (e?.text !== null && e?.text !== undefined) return;
        const text = interceptor.getSelectedText();
        if (text !== null && text !== undefined) {
          e.text = text;
        }
      };
      this.on('getSelectedText', fn);
      handlers.push(['getSelectedText', fn]);
    }

    if (typeof interceptor.getSelectionColRow === 'function') {
      const fn = (e) => {
        if (e?.colRow !== undefined) return;
        const colRow = interceptor.getSelectionColRow();
        if (colRow !== undefined) {
          e.colRow = colRow;
        }
      };
      this.on('getSelectionColRow', fn);
      handlers.push(['getSelectionColRow', fn]);
    }

    if (typeof interceptor.selectAll === 'function') {
      const fn = (e) => {
        if (e?.defaultPrevented) return;
        if (interceptor.selectAll()) {
          e.preventDefault?.();
        }
      };
      this.on('selectAll', fn);
      handlers.push(['selectAll', fn]);
    }

    this._registeredInterceptors.set(interceptor, handlers);
  }

  unregisterInterceptor(interceptor) {
    if (!interceptor || !this._registeredInterceptors?.has(interceptor)) return;
    const handlers = this._registeredInterceptors.get(interceptor);
    for (const [event, fn] of handlers) {
      this.off(event, fn);
    }
    this._registeredInterceptors.delete(interceptor);
  }
}
