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
    var fns = this._listeners[e.type];
    if (fns) {
      fns = fns.slice(0);
      for (var i in fns) {
        fns[i](e);
      }
    }
  }

  removeEventListener(type, listener) {
    this._listeners = this._listeners || {};
    var fns = this._listeners[type];
    if (fns) {
      for (var i in fns) {
        if (fns[i] === listener) {
          fns.splice(i, 1);
          break;
        }
      }
    }
  }
}
