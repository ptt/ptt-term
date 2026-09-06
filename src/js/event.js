export class Event {
  static mixin(obj) {
    const proto = Event.prototype;
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key !== 'constructor') {
        obj[key] = proto[key];
      }
    }
  }

  addEventListener(type, listener) {
    this._listeners = this._listeners || {};
    (this._listeners[type] = this._listeners[type] || []).push(listener);
  }

  dispatchEvent(e) {
    this._listeners = this._listeners || {};
    const fns = this._listeners[e.type];
    if (fns) {
      const copy = fns.slice(0);
      for (let i = 0; i < copy.length; i++) {
        copy[i](e);
      }
    }
  }

  removeEventListener(type, listener) {
    this._listeners = this._listeners || {};
    const fns = this._listeners[type];
    if (fns) {
      for (let i = 0; i < fns.length; i++) {
        if (fns[i] === listener) {
          fns.splice(i, 1);
          break;
        }
      }
    }
  }
}
