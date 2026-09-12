import { PAGE_STATE } from "../js/sites/index.js";

const MOVE_THRESHOLD = 8;
const PINCH_STEP_PX = 28;

export class TouchController {
  constructor(app) {
    this.app = app;
    this.touchStarted = false;
    this.touchedCenter = { x: 0, y: 0 };
    this.startX = 0;
    this.startY = 0;
    this.lastX = 0;
    this.lastY = 0;
    this.isPanning = false;
    this.isSelecting = false;
    this.isPinching = false;
    this.panDirection = null;
    this.pointers = new Map();
    this.pinchLastDist = 0;
    this.pinchAccumulatedDelta = 0;
    this.lastMidX = 0;
    this.lastMidY = 0;
    this.lastTouchTime = 0;

    this.setupHandlers();
  }

  clearLongPressTimer() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  zoomFont(delta) {
    this.app?.zoomFont?.(delta);
  }

  setupHandlers() {
    const app = this.app;
    const target = app.termWin;
    if (!target) return;

    target.style.touchAction = "none";

    target.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;

      const isLink = Boolean(
        e.target && e.target.closest && e.target.closest("a")
      );
      if (!isLink) {
        e.preventDefault();
      }

      this.lastTouchTime = Date.now();
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pointers.size === 1) {
        this.touchStarted = true;
        this.isPanning = false;
        this.isSelecting = false;
        this.isPinching = false;
        this.panDirection = null;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.touchedCenter = { x: e.clientX, y: e.clientY };

        if (app.inputArea) {
          app.inputArea.setAttribute("inputmode", "none");
          app.inputArea.blur();
        }
        console.debug("pointerdown (touch)");

        try {
          target.setPointerCapture(e.pointerId);
        } catch (err) {}
      } else if (this.pointers.size === 2) {
        // Multi-touch: enter pinch zoom / two-finger pan mode
        if (this.isSelecting && app.view) {
          app.view.clearSelection();
        }
        this.isSelecting = false;
        this.isPinching = true;
        this.isPanning = false;

        const [p1, p2] = Array.from(this.pointers.values());
        this.pinchLastDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        this.pinchAccumulatedDelta = 0;
        this.lastMidX = (p1.x + p2.x) / 2;
        this.lastMidY = (p1.y + p2.y) / 2;
      }
    });

    target.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "touch") return;
      if (!this.pointers.has(e.pointerId)) return;

      this.lastTouchTime = Date.now();
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pointers.size >= 2) {
        // Two-finger gesture: pinch to zoom font and two-finger pan
        const [p1, p2] = Array.from(this.pointers.values());
        const currentDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const distDelta = currentDist - this.pinchLastDist;
        this.pinchAccumulatedDelta += distDelta;
        this.pinchLastDist = currentDist;

        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const moveDeltaX = midX - this.lastMidX;
        const moveDeltaY = midY - this.lastMidY;
        this.lastMidX = midX;
        this.lastMidY = midY;

        if (app.view) {
          if (moveDeltaX !== 0) {
            app.view.panBy(-moveDeltaX, 0);
          }
          if (moveDeltaY !== 0) {
            app.view.panBy(0, -moveDeltaY);
          }
        }

        if (this.pinchAccumulatedDelta >= PINCH_STEP_PX) {
          this.zoomFont(1);
          this.pinchAccumulatedDelta = 0;
        } else if (this.pinchAccumulatedDelta <= -PINCH_STEP_PX) {
          this.zoomFont(-1);
          this.pinchAccumulatedDelta = 0;
        }
        return;
      }

      if (this.isPinching) return;

      const dist = Math.hypot(e.clientX - this.startX, e.clientY - this.startY);
      if (dist > MOVE_THRESHOLD) {
        if (!this.panDirection) {
          const dx = Math.abs(e.clientX - this.startX);
          const dy = Math.abs(e.clientY - this.startY);
          const site = app.site;
          if (dy >= dx && site?.pageState === PAGE_STATE.LIST) {
            this.panDirection = "list_scroll";
            this.isPanning = true;
          } else {
            this.panDirection = "select";
            this.isSelecting = true;
            if (app.view) {
              app.view.startSelection({
                clientX: this.startX,
                clientY: this.startY,
              });
            }
          }
        }
      }

      if (this.panDirection === "list_scroll") {
        e.preventDefault();
        app.onMouse_move(e.clientX, e.clientY, false, true, { highlight: true });
        this.touchedCenter.x = e.clientX;
        this.touchedCenter.y = e.clientY;
      } else if (this.panDirection === "select" && this.isSelecting) {
        e.preventDefault();
        if (app.view) {
          app.view.updateSelection({ clientX: e.clientX, clientY: e.clientY });
        }
      }
    });

    const handlePointerEnd = (e) => {
      if (e.pointerType !== "touch") return;
      if (!this.pointers.has(e.pointerId)) return;

      this.lastTouchTime = Date.now();
      this.pointers.delete(e.pointerId);

      try {
        if (target.hasPointerCapture(e.pointerId)) {
          target.releasePointerCapture(e.pointerId);
        }
      } catch (err) {}

      if (this.isPinching) {
        if (this.pointers.size === 0) {
          this.isPinching = false;
          this.touchStarted = false;
          this.isPanning = false;
          this.isSelecting = false;
          this.panDirection = null;
        }
        return;
      }

      if (this.isSelecting) {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        let text = "";
        if (app.view) {
          text = app.view.endSelection ? app.view.endSelection() : (app.view.getSelectedText ? app.view.getSelectedText() : "");
        }
        if (text && app.doCopy) {
          app.doCopy(text);
        }
        this.isSelecting = false;
        this.touchStarted = false;
        this.isPanning = false;
        this.panDirection = null;
        console.debug("pointer select-copy (touch)");
        return;
      }

      if (this.isPanning) {
        const site = app.site;
        if (
          this.panDirection === "list_scroll" &&
          site?.pageState === PAGE_STATE.LIST &&
          app.buf
        ) {
          const isHighlighted =
            app.view &&
            typeof app.view.highlightedRow === "number" &&
            app.view.highlightedRow !== -1;
          if (isHighlighted) {
            app.onMouse_click(
              {
                clientX: this.touchedCenter.x,
                clientY: this.touchedCenter.y,
              },
              true
            );
          }
          app.emit?.("term:clear-highlight");
          app.view?.clearHighlight?.();
          if (target && target.style) target.style.cursor = "auto";
        }
      } else {
        e.preventDefault();
        e.stopPropagation();
        if (app.view) {
          app.view.clearSelection();
        }
        app.onMouse_move(e.clientX, e.clientY, false, true, { highlight: false });
        app.onMouse_click(e, true);
        app.emit?.("term:clear-highlight");
        app.view?.clearHighlight?.();
        if (target && target.style) target.style.cursor = "auto";
        console.debug("pointer tap (touch)");
      }

      if (this.pointers.size === 0) {
        this.touchStarted = false;
        this.isPanning = false;
        this.isSelecting = false;
        this.panDirection = null;
      }
      console.debug("pointerup (touch)");
    };

    target.addEventListener("pointerup", handlePointerEnd);

    target.addEventListener("pointercancel", (e) => {
      if (e.pointerType !== "touch") return;
      if (!this.pointers.has(e.pointerId)) return;

      this.lastTouchTime = Date.now();
      this.pointers.delete(e.pointerId);

      try {
        if (target.hasPointerCapture(e.pointerId)) {
          target.releasePointerCapture(e.pointerId);
        }
      } catch (err) {}

      if (this.isSelecting && app.view) {
        app.view.clearSelection();
      }

      app.emit?.("term:clear-highlight");
      app.view?.clearHighlight?.();
      if (target && target.style) target.style.cursor = "auto";

      if (this.pointers.size === 0) {
        this.touchStarted = false;
        this.isPanning = false;
        this.isSelecting = false;
        this.isPinching = false;
        this.panDirection = null;
      }
      console.debug("pointercancel (touch)");
    });

    target.addEventListener(
      "contextmenu",
      (e) => {
        if (
          e.pointerType === "touch" ||
          (this.lastTouchTime && Date.now() - this.lastTouchTime < 1000)
        ) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );
  }
}

/**
 * Compute floating toolbar layout and stacking behavior.
 * Width is calculated as "drawableRight - col80Right" (the right boundary
 * of the drawable area minus the right boundary coordinate of col 80).
 * When this width is enough to hold at least 3 buttons, the toolbar stacks into
 * a fixed 4-row layout and scales to max fit (whichever fills first: height or width).
 *
 * @param {Object} options
 * @param {number} options.viewportWidth
 * @param {number} [options.viewportHeight]
 * @param {number} [options.drawableRight] Right boundary of the drawable area
 * @param {number} [options.drawableHeight] Height of the drawable area
 * @param {number} [options.col80Right] Right boundary coordinate of column 80
 * @param {number} [options.cols] Current terminal columns (buf.cols)
 * @param {number} [options.colWidth] Width of one column in pixels
 * @param {boolean} [options.isCompactLandscape]
 * @param {number} [options.toolbarScale]
 * @returns {{ isStacked: boolean, stackedWidth: number, stackedHeight: number, toolbarScale: number, maxCols: number, drawableRight: number }}
 */
export function computeToolbarLayout({
  viewportWidth,
  viewportHeight,
  drawableRight,
  drawableHeight,
  col80Right,
  cols = 80,
  colWidth,
  isCompactLandscape = false,
  toolbarScale = 1.0,
}) {
  const baseRowCount = 5;
  // Button sizes reference Android/iOS virtual keyboard keys (iOS ~42pt, Android ~48dp)
  // and are sized slightly larger (52px in portrait, 44x42px in landscape) to ensure easy finger tapping.
  const baseBtnWidth = isCompactLandscape ? 44 : 52;
  const baseBtnHeight = isCompactLandscape ? 42 : 52;
  const btnGap = isCompactLandscape ? 3 : 4;
  const padX = isCompactLandscape ? 10 : 14;
  const padY = isCompactLandscape ? 8 : 12;
  const verticalMargin = isCompactLandscape ? 12 : 24;

  const baseWidth = 4 * baseBtnWidth + 3 * btnGap + padX;
  const baseHeight =
    baseRowCount * baseBtnHeight + (baseRowCount - 1) * btnGap + padY;

  // 1. Calculate remaining width as the right bound of drawable area minus column 80 right bound
  let effectiveDrawableRight = drawableRight;
  let effectiveCol80Right = col80Right;

  if (effectiveDrawableRight == null) {
    if (colWidth != null && cols != null && cols > 80) {
      effectiveDrawableRight = cols * colWidth;
    } else {
      effectiveDrawableRight = viewportWidth;
    }
  }

  if (effectiveCol80Right == null) {
    if (colWidth != null && cols != null && cols > 80) {
      effectiveCol80Right = 80 * colWidth;
    }
  }

  let remainingWidth = 0;
  if (effectiveCol80Right != null) {
    remainingWidth = Math.max(0, effectiveDrawableRight - effectiveCol80Right);
  } else if (colWidth != null && cols != null && cols > 80) {
    remainingWidth = Math.max(0, (cols - 80) * colWidth);
  }

  // 2. Compute available dimensions
  // Always use stacked layout across portrait and landscape orientations.
  // Base size (scale = 1.0) is the minimum dimension.
  const availableWidth = Math.max(baseWidth, remainingWidth);
  let availableHeight =
    viewportHeight != null && viewportHeight > 0
      ? Math.max(60, viewportHeight - verticalMargin)
      : baseHeight;
  if (drawableHeight != null && drawableHeight > 0) {
    availableHeight = Math.min(availableHeight, Math.max(60, drawableHeight));
  }

  // 3. Max-fit scaling: whichever dimension fills first (width or height).
  // Base size (scale = 1.0) is the minimum value across all screen orientations.
  const scaleX = availableWidth / baseWidth;
  const scaleY = availableHeight / baseHeight;
  const rawFitScale = Math.min(scaleX, scaleY);
  const fitScale = Math.max(1.0, rawFitScale);

  const stackedWidth =
    fitScale === scaleX
      ? Math.floor(availableWidth)
      : Math.max(baseWidth, Math.floor(baseWidth * fitScale));
  const stackedHeight =
    fitScale === scaleY
      ? Math.floor(availableHeight)
      : Math.max(baseHeight, Math.floor(baseHeight * fitScale));

  return {
    isStacked: true,
    stackedWidth,
    stackedHeight,
    toolbarScale: Number(fitScale.toFixed(3)),
    maxCols: 4,
    drawableRight: effectiveDrawableRight,
  };
}
