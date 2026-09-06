import { Event } from './event';

export function Websocket(url) {
  this._conn = new WebSocket(url);
  this._conn.binaryType = "arraybuffer";
  this._conn.addEventListener('open', (e) => this._onOpen(e));
  this._conn.addEventListener('message', (e) => this._onMessage(e));
  this._conn.addEventListener('error', (e) => this._onError(e));
  this._conn.addEventListener('close', (e) => this._onClose(e));
};

Event.mixin(Websocket.prototype);

Websocket.prototype._onOpen = function(e) {
  this.dispatchEvent(new CustomEvent('open'));
};

Websocket.prototype._onMessage = function(e) {
  var data = new Uint8Array(e.data);
  this.dispatchEvent(new CustomEvent('rawRecv', {
    detail: {
      data: data
    }
  }));
  this.dispatchEvent(new CustomEvent('data', {
    detail: {
      data: String.fromCharCode.apply(String, data)
    }
  }));
};

Websocket.prototype._onError = function(e) {
  this.dispatchEvent(new CustomEvent('error'));
};

Websocket.prototype._onClose = function(e) {
  this.dispatchEvent(new CustomEvent('close'));
};

Websocket.prototype.send = function(str) {
  // XXX: move this to app.
  // because ptt seems to reponse back slowly after large
  // chunk of text is pasted, so better to split it up.
  if (typeof str !== 'string') {
    var byteArray = str instanceof Uint8Array ? str : new Uint8Array(str);
    this.dispatchEvent(new CustomEvent('rawSend', {
      detail: {
        data: byteArray
      }
    }));
    this._conn.send(byteArray.buffer);
    return;
  }
  var chunk = 1000;
  for (var i = 0; i < str.length; i += chunk) {
    var chunkStr = str.substring(i, i+chunk);
    var byteArray = new Uint8Array(chunkStr.split('').map((x) => x.charCodeAt(0)));
    this.dispatchEvent(new CustomEvent('rawSend', {
      detail: {
        data: byteArray
      }
    }));
    this._conn.send(byteArray.buffer);
  }
};

Websocket.prototype.close = function() {
  this._conn.close();
};
