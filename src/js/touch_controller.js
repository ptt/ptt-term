export class TouchController {
  constructor(app) {
    this.app = app;
    this.highlightCopy = false;
    this.touchStarted = false;
    this.touchedCenter = { x: 0, y: 0 };

    // make sure the text selection still works
    delete Hammer.defaults.cssProps.userSelect;

    this.ham = null;
    this.setupHandlers();
  }

  setupHandlers() {
  const app = this.app;

  document.body.ontouchmove = (e) => { 
    if (e.touches.length != 1) return false;
    return true;
  };

  document.body.ontouchstart = (e) => {
    this.touchStarted = true;
    app.inputArea.blur();
    console.debug('touchstart');
  };

  document.body.ontouchend = (e) => {
    if (app.buf.pageState == 2 && app.buf.highlightCursor &&
        app.buf.nowHighlight != -1) {
      app.onMouse_click(this.touchedCenter.x, this.touchedCenter.y);
      app.buf.nowHighlight = -1;
      app.buf.highlightCursor = this.highlightCopy;
      app.BBSWin.style.cursor = 'auto';
      this.touchStarted = false;
      app.inputArea.focus();
    }
    console.debug('touchend');
  };

  this.ham = new Hammer(app.BBSWin);
  this.ham.on('pan', (ev) => {
    if (ev.pointerType == 'touch') {
      //console.log(ev);
      if (app.buf.pageState == 2) {
        ev.preventDefault();
        ev.srcEvent.preventDefault();

        this.highlightCopy = app.buf.highlightCursor;
        app.buf.highlightCursor = true;
        app.onMouse_move(ev.center.x, ev.center.y);
        this.touchedCenter.x = ev.center.x;
        this.touchedCenter.y = ev.center.y;
      }
    }
  });

  this.ham.on('tap', (ev) => {
    //console.log(ev);
    ev.preventDefault();
    ev.srcEvent.stopPropagation();
    ev.srcEvent.preventDefault();
    if (ev.pointerType != 'touch') return; 
    this.highlightCopy = app.buf.highlightCursor;
    app.buf.highlightCursor = false;
    app.onMouse_move(ev.center.x, ev.center.y);
    app.onMouse_click(ev.center.x, ev.center.y);
    app.buf.nowHighlight = -1;
    app.buf.highlightCursor = this.highlightCopy;
    app.BBSWin.style.cursor = 'auto';
    this.touchStarted = false;
    app.inputArea.focus();
    console.log('touchtap');
  });
  }
}
