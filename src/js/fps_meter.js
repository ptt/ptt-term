export class FpsMeter {
  constructor(options = {}) {
    this.enabled = false;
    this.element = null;
    this.textSpan = null;
    this.canvasBtn = null;
    this.smoothAnsiBtn = null;
    this.lastFrameTime = 0;
    this.lastRenderTime = 0;
    this.lastUiUpdateTime = 0;
    this.recentDeltas = [];
    this.recentDurations = [];
    this.isCanvas = !!options.isCanvas;
    this.idleTimer = null;
    this.smoothAnsiArt = options.smoothAnsiArt !== undefined ? !!options.smoothAnsiArt : true;
    this.onToggleCanvas = typeof options.onToggleCanvas === 'function' ? options.onToggleCanvas : null;
    this.onToggleSmoothAnsi = typeof options.onToggleSmoothAnsi === 'function' ? options.onToggleSmoothAnsi : null;
  }

  ensureElement() {
    if (!this.element && typeof document !== 'undefined') {
      this.element = document.getElementById('fpsOverlay');
      if (!this.element) {
        this.element = document.createElement('div');
        this.element.id = 'fpsOverlay';
        document.body.appendChild(this.element);
      }
    }
    if (this.element && !this.textSpan && typeof document !== 'undefined') {
      this.element.innerHTML = '';
      this.textSpan = document.createElement('span');
      this.textSpan.className = 'fps-text';
      this.element.appendChild(this.textSpan);

      const space1 = document.createTextNode(' ');
      this.element.appendChild(space1);

      this.canvasBtn = document.createElement('span');
      this.canvasBtn.className = 'fps-canvas nomouse_command';
      this.canvasBtn.style.cursor = 'pointer';
      this.canvasBtn.style.pointerEvents = 'auto';
      this.canvasBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.toggleCanvas();
      });
      this.canvasBtn.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
      this.element.appendChild(this.canvasBtn);

      const space2 = document.createTextNode(' ');
      this.element.appendChild(space2);

      this.smoothAnsiBtn = document.createElement('span');
      this.smoothAnsiBtn.className = 'fps-smooth-ansi nomouse_command';
      this.smoothAnsiBtn.style.cursor = 'pointer';
      this.smoothAnsiBtn.style.pointerEvents = 'auto';
      this.smoothAnsiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.toggleSmoothAnsi();
      });
      this.smoothAnsiBtn.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
      this.element.appendChild(this.smoothAnsiBtn);
    }
    return this.element;
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    const el = this.ensureElement();
    if (!el) return;

    if (this.enabled) {
      el.style.display = 'block';
      this.reset();
      this.updateDisplay(performance.now(), true);
      this.startIdleChecker();
    } else {
      el.style.display = 'none';
      this.stopIdleChecker();
      this.reset();
    }
  }

  reset() {
    this.lastFrameTime = 0;
    this.lastRenderTime = 0;
    this.lastUiUpdateTime = 0;
    this.recentDeltas = [];
    this.recentDurations = [];
  }

  startIdleChecker() {
    this.stopIdleChecker();
    this.idleTimer = setInterval(() => {
      if (!this.enabled) return;
      const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      if (this.lastRenderTime > 0 && now - this.lastRenderTime > 800) {
        this.recentDeltas = [];
        this.updateDisplay(now, false);
      }
    }, 400);
    if (this.idleTimer && typeof this.idleTimer.unref === 'function') {
      this.idleTimer.unref();
    }
  }

  stopIdleChecker() {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  recordFrame(renderDurationMs, isCanvas) {
    if (!this.enabled) return;

    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    this.isCanvas = !!isCanvas;
    this.lastRenderTime = now;

    if (typeof renderDurationMs === 'number' && renderDurationMs >= 0) {
      this.recentDurations.push(renderDurationMs);
      if (this.recentDurations.length > 20) {
        this.recentDurations.shift();
      }
    }

    if (this.lastFrameTime > 0) {
      const delta = now - this.lastFrameTime;
      // Only treat frames within 1 second as continuous rendering
      if (delta > 0 && delta < 1000) {
        this.recentDeltas.push(delta);
        if (this.recentDeltas.length > 20) {
          this.recentDeltas.shift();
        }
      } else {
        // Gap too large: reset rolling deltas for a fresh burst
        this.recentDeltas = [];
      }
    }
    this.lastFrameTime = now;

    // Throttle UI update to avoid DOM overhead affecting FPS
    if (now - this.lastUiUpdateTime >= 200) {
      this.updateDisplay(now, false);
    }
  }

  updateDisplay(now, forceIdle) {
    if (!this.enabled || !this.element) return;

    let fpsText = '--';
    if (!forceIdle && this.recentDeltas.length > 0 && now - this.lastRenderTime <= 800) {
      const avgDelta = this.recentDeltas.reduce((a, b) => a + b, 0) / this.recentDeltas.length;
      const fps = avgDelta > 0 ? (1000 / avgDelta) : 0;
      fpsText = fps.toFixed(1);
    } else if (this.lastRenderTime > 0) {
      fpsText = '0.0';
    }

    let durationText = '--';
    if (this.recentDurations.length > 0) {
      const avgDuration = this.recentDurations.reduce((a, b) => a + b, 0) / this.recentDurations.length;
      durationText = avgDuration.toFixed(1);
    }

    const engine = this.isCanvas ? 'Canvas' : 'DOM';
    const mainText = `FPS: ${fpsText} (${durationText} ms)`;
    const canvasText = `[${engine}]`;
    const statusText = this.smoothAnsiArt ? 'on' : 'off';
    const ansiText = `[smoothANSI: ${statusText}]`;

    if (this.textSpan && this.canvasBtn && this.smoothAnsiBtn) {
      this.textSpan.textContent = mainText;
      this.canvasBtn.textContent = canvasText;
      this.smoothAnsiBtn.textContent = ansiText;
    } else {
      this.element.textContent = `${mainText} ${canvasText} ${ansiText}`;
    }
    this.lastUiUpdateTime = now;
  }

  toggleCanvas() {
    this.isCanvas = !this.isCanvas;
    if (typeof this.onToggleCanvas === 'function') {
      this.onToggleCanvas(this.isCanvas);
    }
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    this.updateDisplay(now, false);
  }

  setIsCanvas(isCanvas) {
    this.isCanvas = !!isCanvas;
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    this.updateDisplay(now, false);
  }

  toggleSmoothAnsi() {
    this.smoothAnsiArt = !this.smoothAnsiArt;
    if (typeof this.onToggleSmoothAnsi === 'function') {
      this.onToggleSmoothAnsi(this.smoothAnsiArt);
    }
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    this.updateDisplay(now, false);
  }

  setSmoothAnsiArt(enabled) {
    this.smoothAnsiArt = !!enabled;
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    this.updateDisplay(now, false);
  }
}

export default FpsMeter;
