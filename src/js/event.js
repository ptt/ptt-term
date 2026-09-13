/**
 * Lightweight, DOM-free EventEmitter with two-level SmartSlot optimization:
 * - 0 listeners: null internal state (zero allocation)
 * - 1 listener: direct slot on instance without Map or Set allocations
 * - 2+ listeners: promotes to Map<type, Function | Set<Function>>
 * - Automatically demotes back to single slot or null on removal
 * - Supports subscribe() returning an unsubscribe function
 * - Supports '*' wildcard listener
 * - Includes addEventListener/removeEventListener/dispatchEvent compatibility aliases
 */
export class EventEmitter {
  constructor() {
    this._singleType = null;
    this._singleListener = null;
    this._events = null;
  }

  on(type, listener) {
    if (typeof listener !== 'function') return this;

    // Case 0: Empty -> store in single slot
    if (!this._singleType && !this._events) {
      this._singleType = type;
      this._singleListener = listener;
      return this;
    }

    // Case 1: Same listener already in single slot
    if (this._singleType === type && this._singleListener === listener) {
      return this;
    }

    // Case 2: Second listener or second type -> promote to Map
    if (!this._events) {
      this._events = new Map();
      this._events.set(this._singleType, this._singleListener);
      this._singleType = null;
      this._singleListener = null;
    }

    const existing = this._events.get(type);
    if (!existing) {
      this._events.set(type, listener);
    } else if (typeof existing === 'function') {
      if (existing !== listener) {
        this._events.set(type, new Set([existing, listener]));
      }
    } else {
      existing.add(listener);
    }

    return this;
  }

  addListener(type, listener) {
    return this.on(type, listener);
  }

  subscribe(type, listener) {
    this.on(type, listener);
    return () => this.off(type, listener);
  }

  off(type, listener) {
    // Check single slot
    if (this._singleType === type) {
      const isMatch =
        !listener ||
        this._singleListener === listener ||
        (this._singleListener && this._singleListener.originalListener === listener);
      if (isMatch) {
        this._singleType = null;
        this._singleListener = null;
      }
      return this;
    }

    if (!this._events) return this;

    const existing = this._events.get(type);
    if (!existing) return this;

    if (!listener || existing === listener || existing.originalListener === listener) {
      this._events.delete(type);
    } else if (existing instanceof Set) {
      for (const fn of existing) {
        if (fn === listener || fn.originalListener === listener) {
          existing.delete(fn);
          break;
        }
      }
      if (existing.size === 1) {
        const [remaining] = existing;
        this._events.set(type, remaining);
      } else if (existing.size === 0) {
        this._events.delete(type);
      }
    }

    // Demote to single slot if only 1 type with 1 listener remains
    if (this._events.size === 1) {
      const [[onlyType, onlyListener]] = this._events.entries();
      if (typeof onlyListener === 'function') {
        this._singleType = onlyType;
        this._singleListener = onlyListener;
        this._events = null;
      }
    } else if (this._events.size === 0) {
      this._events = null;
    }

    return this;
  }

  removeListener(type, listener) {
    return this.off(type, listener);
  }

  once(type, listener) {
    if (typeof listener !== 'function') return this;
    const wrapper = (...args) => {
      this.off(type, wrapper);
      listener.apply(this, args);
    };
    wrapper.originalListener = listener;
    return this.on(type, wrapper);
  }

  _dispatch(type, args, shouldStop = null) {
    if (shouldStop && shouldStop(args[0])) return true;

    const invoke = (fn, isWildcard) => {
      try {
        if (isWildcard) {
          fn.apply(this, [...args, type]);
        } else {
          fn.apply(this, args);
        }
      } catch (err) {
        console.error(`[EventEmitter] error in ${isWildcard ? '*' : type}:`, err);
      }
    };

    // Fast path: single slot
    if (this._singleType === type || this._singleType === '*') {
      invoke(this._singleListener, this._singleType === '*');
      return shouldStop ? Boolean(shouldStop(args[0])) : true;
    }

    if (!this._events) return false;

    let handled = false;
    const runGroup = (key, isWildcard) => {
      const listeners = this._events.get(key);
      if (typeof listeners === 'function') {
        if (!shouldStop || !shouldStop(args[0])) {
          invoke(listeners, isWildcard);
        }
        handled = true;
      } else if (listeners) {
        const snapshot = Array.from(listeners);
        for (const fn of snapshot) {
          if (shouldStop && shouldStop(args[0])) break;
          invoke(fn, isWildcard);
        }
        handled = handled || snapshot.length > 0;
      }
    };

    runGroup(type, false);
    if (this._events) {
      runGroup('*', true);
    }

    return shouldStop ? Boolean(shouldStop(args[0])) : handled;
  }

  emit(type, ...args) {
    return this._dispatch(type, args, null);
  }

  emitStoppable(
    type,
    event,
    shouldStop = (e) => Boolean(e?.defaultPrevented || e?.handled)
  ) {
    return this._dispatch(type, [event], shouldStop);
  }

  removeAllListeners(type) {
    if (!type) {
      this._singleType = null;
      this._singleListener = null;
      this._events = null;
      return this;
    }
    return this.off(type);
  }

  listenerCount(type) {
    if (this._singleType === type) return 1;
    if (!this._events) return 0;
    const existing = this._events.get(type);
    if (typeof existing === 'function') return 1;
    if (existing instanceof Set) return existing.size;
    return 0;
  }

  addEventListener(type, listener) {
    return this.on(type, listener);
  }

  removeEventListener(type, listener) {
    return this.off(type, listener);
  }

  dispatchEvent(e) {
    if (!e) return true;
    const type = typeof e === 'string' ? e : e.type;
    if (!type) return true;
    return this.emit(type, e);
  }
}

export class Event extends EventEmitter {}
export default Event;
