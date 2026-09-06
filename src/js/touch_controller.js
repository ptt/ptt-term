export class TouchController {
  constructor(app) {
    this.app = app;
    this.highlightCopy = false;
    this.touchStarted = false;
    this.touchedCenter = { x: 0, y: 0 };
    this.activePointerId = null;
    this.startX = 0;
    this.startY = 0;
    this.isPanning = false;

    this.setupHandlers();
  }

  setupHandlers() {
    const app = this.app;
    const target = app.BBSWin;
    if (!target) return;

    target.style.touchAction = 'none';

    target.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      if (this.activePointerId !== null) return;

      this.activePointerId = e.pointerId;
      this.touchStarted = true;
      this.isPanning = false;
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.touchedCenter = { x: e.clientX, y: e.clientY };
      this.highlightCopy = app.buf.highlightCursor;

      app.inputArea.blur();
      console.debug('pointerdown (touch)');

      try {
        target.setPointerCapture(e.pointerId);
      } catch (err) {}
    });

    target.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch') return;
      if (!this.touchStarted || e.pointerId !== this.activePointerId) return;

      const dist = Math.hypot(e.clientX - this.startX, e.clientY - this.startY);
      if (dist > 8) {
        this.isPanning = true;
      }

      if (this.isPanning && app.buf.pageState === 2) {
        e.preventDefault();
        this.highlightCopy = app.buf.highlightCursor;
        app.buf.highlightCursor = true;
        app.onMouse_move(e.clientX, e.clientY);
        this.touchedCenter.x = e.clientX;
        this.touchedCenter.y = e.clientY;
      }
    });

    const handlePointerEnd = (e) => {
      if (e.pointerType !== 'touch') return;
      if (!this.touchStarted || e.pointerId !== this.activePointerId) return;

      try {
        if (target.hasPointerCapture(e.pointerId)) {
          target.releasePointerCapture(e.pointerId);
        }
      } catch (err) {}

      if (this.isPanning) {
        if (app.buf.pageState === 2 && app.buf.highlightCursor && app.buf.nowHighlight !== -1) {
          app.onMouse_click({ clientX: this.touchedCenter.x, clientY: this.touchedCenter.y });
          app.buf.nowHighlight = -1;
          app.buf.highlightCursor = this.highlightCopy;
          app.BBSWin.style.cursor = 'auto';
        }
      } else {
        e.preventDefault();
        e.stopPropagation();
        this.highlightCopy = app.buf.highlightCursor;
        app.buf.highlightCursor = false;
        app.onMouse_move(e.clientX, e.clientY);
        app.onMouse_click(e);
        app.buf.nowHighlight = -1;
        app.buf.highlightCursor = this.highlightCopy;
        app.BBSWin.style.cursor = 'auto';
        console.debug('pointer tap (touch)');
      }

      this.touchStarted = false;
      this.isPanning = false;
      this.activePointerId = null;
      app.inputArea.focus();
      console.debug('pointerup (touch)');
    };

    target.addEventListener('pointerup', handlePointerEnd);

    target.addEventListener('pointercancel', (e) => {
      if (e.pointerType !== 'touch') return;
      if (e.pointerId !== this.activePointerId) return;

      try {
        if (target.hasPointerCapture(e.pointerId)) {
          target.releasePointerCapture(e.pointerId);
        }
      } catch (err) {}

      if (app.buf.highlightCursor) {
        app.buf.nowHighlight = -1;
        app.buf.highlightCursor = this.highlightCopy;
        app.BBSWin.style.cursor = 'auto';
      }

      this.touchStarted = false;
      this.isPanning = false;
      this.activePointerId = null;
      app.inputArea.focus();
      console.debug('pointercancel (touch)');
    });
  }
}
