/**
 * Terminal Locator (XTerm SGR Mouse Tracking Protocol Handler).
 *
 * Implements XTerm DECSET/DECRST mouse tracking in SGR mode:
 * - DECSET 1000 (VT200 / Normal Mouse Tracking: press and release)
 * - DECSET 1002 (Button-Event Mouse Tracking: press, release, drag)
 * - DECSET 1003 (Any-Event Mouse Tracking: all motion, press, release)
 * - DECSET 1006 (SGR Extended Mouse Mode: \x1b[<b;x;yM / \x1b[<b;x;ym)
 */

export class Locator {
  /**
   * @param {import('./term_buf').TermBuf} [termbuf]
   * @param {object} [options]
   */
  constructor(termbuf, options = {}) {
    this.termbuf = termbuf || null;
    this.enabled = options.enabled ?? true;

    // Mouse tracking mode: 0 = off, 1000 = normal, 1002 = button-event, 1003 = any-event
    this.mouseTrackingMode = 0;
    this.sgrMode = true; // SGR mode is the default and only format

    // Track currently pressed buttons (0=left, 1=middle, 2=right)
    this.downButtons = new Set();
    this.lastCol = 0;
    this.lastRow = 0;
  }

  /**
   * Reset locator state to defaults.
   */
  reset() {
    this.mouseTrackingMode = 0;
    this.downButtons.clear();
  }

  /**
   * Check if mouse locator reporting is currently active.
   * @returns {boolean}
   */
  isActive() {
    return this.enabled && this.mouseTrackingMode > 0;
  }


  /**
   * Check if motion reporting is required (button drag 1002 or any-event 1003).
   * @returns {boolean}
   */
  requiresMotionReports() {
    if (!this.isActive()) return false;
    if (this.mouseTrackingMode === 1003) return true;
    if (this.mouseTrackingMode === 1002 && this.downButtons.size > 0) return true;
    return false;
  }

  /**
   * Handle host DECSET sequence: CSI ? Pm h
   * @param {number} mode
   */
  handleDECSET(mode) {
    switch (mode) {
      case 9:
      case 1000:
      case 1002:
      case 1003:
        this.mouseTrackingMode = mode;
        break;
      case 1006:
        this.sgrMode = true;
        break;
      default:
        break;
    }
  }

  /**
   * Handle host DECRST sequence: CSI ? Pm l
   * @param {number} mode
   */
  handleDECRST(mode) {
    switch (mode) {
      case 9:
      case 1000:
      case 1002:
      case 1003:
        if (this.mouseTrackingMode === mode) {
          this.mouseTrackingMode = 0;
        }
        break;
      case 1006:
        // SGR stays the preferred format
        break;
      default:
        break;
    }
  }

  /**
   * Format an XTerm SGR Mouse sequence.
   * Format: CSI < Cb ; Cx ; Cy M (down/motion) or m (up)
   *
   * @param {number} cb Button code + modifiers
   * @param {number} cx 1-based column
   * @param {number} cy 1-based row
   * @param {boolean} [isRelease=false]
   * @returns {string}
   */
  formatSGR(cb, cx, cy, isRelease = false) {
    return `\x1b[<${cb};${cx};${cy}${isRelease ? 'm' : 'M'}`;
  }

  /**
   * Map browser MouseEvent button & modifiers to XTerm Cb code.
   * @param {MouseEvent} [e]
   * @param {number} button
   * @param {boolean} [isMotion=false]
   * @param {boolean} [isRelease=false]
   * @returns {number}
   */
  getXtermButtonCode(e, button, isMotion = false, isRelease = false) {
    let cb = 0;
    switch (button) {
      case 0: cb = 0; break;
      case 1: cb = 1; break;
      case 2: cb = 2; break;
      case 64: cb = 64; break; // wheel up
      case 65: cb = 65; break; // wheel down
      default: cb = 0; break;
    }

    if (e) {
      if (e.shiftKey) cb |= 4;
      if (e.metaKey || e.altKey) cb |= 8;
      if (e.ctrlKey) cb |= 16;
    }
    if (isMotion) {
      cb |= 32;
    }
    return cb;
  }

  /**
   * Clamp col and row to 1-based bounds.
   * @param {number} col 0-based
   * @param {number} row 0-based
   * @returns {{ c: number, r: number }} 1-based col and row
   */
  clampCoords(col, row) {
    const maxCols = this.termbuf?.cols || 80;
    const maxRows = this.termbuf?.rows || 24;
    const c = Math.max(1, Math.min(maxCols, Math.floor(col) + 1));
    const r = Math.max(1, Math.min(maxRows, Math.floor(row) + 1));
    this.lastCol = c - 1;
    this.lastRow = r - 1;
    return { c, r };
  }

  /**
   * Handle mouse down event.
   * @param {MouseEvent} e
   * @param {{ col: number, row: number }} pos
   * @returns {string | null}
   */
  handleMouseDown(e, pos) {
    if (!this.isActive() || (e && e.shiftKey)) return null;
    const button = e ? (e.button ?? 0) : 0;
    this.downButtons.add(button);
    const { c, r } = this.clampCoords(pos?.col ?? 0, pos?.row ?? 0);
    const cb = this.getXtermButtonCode(e, button, false, false);
    return this.formatSGR(cb, c, r, false);
  }

  /**
   * Handle mouse up event.
   * @param {MouseEvent} e
   * @param {{ col: number, row: number }} pos
   * @returns {string | null}
   */
  handleMouseUp(e, pos) {
    if (!this.isActive() || (e && e.shiftKey)) return null;
    const button = e ? (e.button ?? 0) : 0;
    this.downButtons.delete(button);
    const { c, r } = this.clampCoords(pos?.col ?? 0, pos?.row ?? 0);
    const cb = this.getXtermButtonCode(e, button, false, true);
    return this.formatSGR(cb, c, r, true);
  }

  /**
   * Handle mouse click event (button down + up with location).
   * @param {MouseEvent} e
   * @param {{ col: number, row: number }} pos
   * @returns {string | null}
   */
  handleMouseClick(e, pos) {
    if (!this.isActive() || (e && e.shiftKey)) return null;
    const button = e ? (e.button ?? 0) : 0;
    const { c, r } = this.clampCoords(pos?.col ?? 0, pos?.row ?? 0);
    const cbDown = this.getXtermButtonCode(e, button, false, false);
    const cbUp = this.getXtermButtonCode(e, button, false, true);
    return this.formatSGR(cbDown, c, r, false) + this.formatSGR(cbUp, c, r, true);
  }

  /**
   * Handle mouse move event.
   * @param {MouseEvent | null} e
   * @param {{ col: number, row: number }} pos
   * @returns {string | null}
   */
  handleMouseMove(e, pos) {
    if (!this.isActive() || (e && e.shiftKey)) return null;
    const isButtonDrag = this.mouseTrackingMode === 1002 && this.downButtons.size > 0;
    const isAnyEvent = this.mouseTrackingMode === 1003;
    if (isButtonDrag || isAnyEvent) {
      const { c, r } = this.clampCoords(pos?.col ?? 0, pos?.row ?? 0);
      const firstDown = this.downButtons.values().next().value ?? 0;
      const cb = this.getXtermButtonCode(e, firstDown, true, false);
      return this.formatSGR(cb, c, r, false);
    }
    return null;
  }

  /**
   * Handle mouse wheel event.
   * @param {WheelEvent} e
   * @param {{ col: number, row: number }} pos
   * @returns {string | null}
   */
  handleWheel(e, pos) {
    if (!this.isActive() || (e && e.shiftKey)) return null;
    const isUp = (e?.deltaY ?? 0) < 0;
    const button = isUp ? 64 : 65;
    const { c, r } = this.clampCoords(pos?.col ?? 0, pos?.row ?? 0);
    const cb = this.getXtermButtonCode(e, button, false, false);
    return this.formatSGR(cb, c, r, false);
  }
}

export default Locator;
