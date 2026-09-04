export class FpsMeter {
  constructor() {
    this.enabled = false;
    this.element = null;
    this.lastFrameTime = 0;
    this.lastRenderTime = 0;
    this.lastUiUpdateTime = 0;
    this.recentDeltas = [];
    this.recentDurations = [];
    this.isCanvas = false;
    this.idleTimer = null;
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
    this.element.textContent = `FPS: ${fpsText} (${durationText} ms) [${engine}]`;
    this.lastUiUpdateTime = now;
  }
}

export default FpsMeter;
