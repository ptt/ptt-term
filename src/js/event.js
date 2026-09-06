const BaseEventTarget =
  typeof EventTarget !== "undefined"
    ? EventTarget
    : class FallbackEventTarget {
        addEventListener(type, listener) {
          this._listeners = this._listeners || {};
          (this._listeners[type] = this._listeners[type] || []).push(listener);
        }

        dispatchEvent(e) {
          this._listeners = this._listeners || {};
          const fns = this._listeners[e.type];
          if (fns) {
            for (const fn of fns.slice(0)) {
              fn(e);
            }
          }
          return true;
        }

        removeEventListener(type, listener) {
          this._listeners = this._listeners || {};
          const fns = this._listeners[type];
          if (fns) {
            const idx = fns.indexOf(listener);
            if (idx !== -1) fns.splice(idx, 1);
          }
        }
      };

export class Event extends BaseEventTarget {}
export default Event;
