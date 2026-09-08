import "./TouchUI.css";
import cx from "classnames";
import React from "react";
import { readValuesWithDefault, writeValues } from "../js/pref.js";
import { computeToolbarLayout } from "./TouchController.js";
import { TouchDebugHUD } from "./TouchDebugHUD.js";

const SHIFT_NUMBER_MAP = {
  1: "!",
  2: "@",
  3: "#",
  4: "$",
  5: "%",
  6: "^",
  7: "&",
  8: "*",
  9: "(",
  0: ")",
};

export class TouchKeyboard extends React.Component {
  _isMounted = false;
  rafId = null;
  suppressInteractionUntil = 0;
  lastShiftClickTime = 0;
  _lastShiftEventTime = 0;

  state = {
    isTouchDevice: false,
    isToolbarCollapsed: false,
    isSystemKeyboardOpen: false,
    isCtrlMode: false,
    isAlphaMode: false,
    ctrlPreviousMode: null,
    isShiftActive: false,
    isShiftSticky: false,
    pressedKeyName: null,
    isStacked: true,
    stackedWidth: null,
    stackedHeight: null,
    stackedCols: 4,
    drawableRight: null,
    layoutToolbarScale: 1.0,
    isDragging: false,
    toolbarCustomRight: (() => {
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          const val = parseFloat(
            window.localStorage.getItem("pttchrome.toolbarCustomRight")
          );
          if (!isNaN(val)) return val;
        } catch (e) {}
      }
      return null;
    })(),
    toolbarCustomBottom: (() => {
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          const val = parseFloat(
            window.localStorage.getItem("pttchrome.toolbarCustomBottom")
          );
          if (!isNaN(val)) return val;
        } catch (e) {}
      }
      return null;
    })(),
    toolbarScale: (() => {
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          const val = parseFloat(
            window.localStorage.getItem("pttchrome.toolbarScale")
          );
          if (val >= 0.7 && val <= 1.5) return val;
        } catch (e) {}
      }
      return 1.0;
    })(),
  };
  isInstanceActive = () => {
    return Boolean(
      this._isMounted &&
      this.__v &&
      this.__v.__ &&
      (!this.__v.__c || this.__v.__c === this)
    );
  };

  setState(updater, callback) {
    if (!this.isInstanceActive()) {
      return;
    }
    super.setState(updater, callback);
  }

  checkTouchDevice = () => {
    if (typeof window === "undefined") return false;
    return Boolean(
      "ontouchstart" in window ||
      (navigator && navigator.maxTouchPoints > 0) ||
      (window.matchMedia &&
        (window.matchMedia("(pointer: coarse)").matches ||
          window.matchMedia("(max-width: 768px)").matches))
    );
  };

  getToolbarLayout = () => {
    if (typeof window === "undefined") {
      return {
        isStacked: true,
        stackedWidth: null,
        stackedHeight: null,
        maxCols: 4,
        toolbarScale: 1.0,
        drawableRight: null,
      };
    }
    const viewportWidth = window.visualViewport
      ? window.visualViewport.width
      : window.innerWidth;
    const viewportHeight = window.visualViewport
      ? window.visualViewport.height
      : window.innerHeight;

    const mainEl =
      document.querySelector(".main") ||
      (this.props.app &&
        this.props.app.view &&
        this.props.app.view.mainDisplay);
    const rect = mainEl ? mainEl.getBoundingClientRect() : null;

    const bufCols =
      (this.props.app && this.props.app.buf && this.props.app.buf.cols) || 80;
    const viewChw =
      (this.props.app && this.props.app.view && this.props.app.view.chw) || 10;
    const scaleX =
      (this.props.app && this.props.app.view && this.props.app.view.scaleX) ||
      1;

    let colWidth = viewChw * scaleX;
    let col80Right = null;

    if (rect && rect.width > 0 && bufCols > 0) {
      const padding = 5 * scaleX;
      colWidth = (rect.width - 2 * padding) / bufCols;
      const col0Left = rect.left + padding;
      col80Right = col0Left + 80 * colWidth;
    }

    const isCompactLandscape =
      (window.matchMedia &&
        window.matchMedia("(orientation: landscape) and (max-height: 500px)")
          .matches) ||
      (viewportWidth > viewportHeight && viewportHeight <= 500);

    const drawableRight = rect ? rect.right : viewportWidth;
    const drawableHeight = rect ? rect.height : undefined;

    return computeToolbarLayout({
      viewportWidth,
      viewportHeight,
      drawableRight,
      drawableHeight,
      col80Right,
      cols: bufCols,
      colWidth,
      termWidth: rect ? rect.width : bufCols * viewChw + 10,
      termRight: rect ? rect.right : undefined,
      isCompactLandscape,
      toolbarScale: this.state.toolbarScale || 1.0,
    });
  };

  scheduleToolbarUpdate = () => {
    if (!this.isInstanceActive()) {
      return;
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (typeof requestAnimationFrame !== "undefined") {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        if (!this.isInstanceActive()) {
          return;
        }
        this.updateToolbarLayout();
      });
    } else {
      this.updateToolbarLayout();
    }
  };

  clampToolbarPosition = (right, bottom, padWidth, padHeight) => {
    if (right == null && bottom == null) return { right: null, bottom: null };
    const viewportWidth =
      typeof window !== "undefined"
        ? window.visualViewport
          ? window.visualViewport.width
          : window.innerWidth
        : 800;
    const viewportHeight =
      typeof window !== "undefined"
        ? window.visualViewport
          ? window.visualViewport.height
          : window.innerHeight
        : 600;

    let nextRight = right;
    let nextBottom = bottom;
    const effectivePadWidth = padWidth || 160;
    const effectivePadHeight = padHeight || 50;

    if (nextRight != null) {
      const minRight = 4;
      const maxRight = Math.max(
        minRight,
        viewportWidth - effectivePadWidth - 4
      );
      nextRight = Math.max(minRight, Math.min(maxRight, nextRight));
    }
    if (nextBottom != null) {
      const minBottom = 4;
      const maxBottom = Math.max(
        minBottom,
        viewportHeight - effectivePadHeight - 4
      );
      nextBottom = Math.max(minBottom, Math.min(maxBottom, nextBottom));
    }
    return { right: nextRight, bottom: nextBottom };
  };

  updateToolbarLayout = () => {
    if (!this.isInstanceActive()) {
      return;
    }
    const layout = this.getToolbarLayout();
    let nextCustomRight = this.state.toolbarCustomRight;
    let nextCustomBottom = this.state.toolbarCustomBottom;
    if (nextCustomRight != null || nextCustomBottom != null) {
      const clamped = this.clampToolbarPosition(
        nextCustomRight,
        nextCustomBottom,
        layout.stackedWidth,
        layout.stackedHeight
      );
      nextCustomRight = clamped.right;
      nextCustomBottom = clamped.bottom;
    }

    if (
      layout.isStacked !== this.state.isStacked ||
      layout.stackedWidth !== this.state.stackedWidth ||
      layout.stackedHeight !== this.state.stackedHeight ||
      layout.toolbarScale !== this.state.layoutToolbarScale ||
      layout.maxCols !== this.state.stackedCols ||
      layout.drawableRight !== this.state.drawableRight ||
      nextCustomRight !== this.state.toolbarCustomRight ||
      nextCustomBottom !== this.state.toolbarCustomBottom
    ) {
      this.setState({
        isStacked: layout.isStacked,
        stackedWidth: layout.stackedWidth,
        stackedHeight: layout.stackedHeight,
        stackedCols: layout.maxCols || 4,
        drawableRight: layout.drawableRight,
        layoutToolbarScale: layout.toolbarScale,
        toolbarCustomRight: nextCustomRight,
        toolbarCustomBottom: nextCustomBottom,
      });
    }
  };

  componentDidMount() {
    this._isMounted = true;

    this.handleResizeOrTouch = () => {
      if (!this.isInstanceActive()) {
        window.removeEventListener("resize", this.handleResizeOrTouch, false);
        window.removeEventListener(
          "orientationchange",
          this.handleResizeOrTouch,
          false
        );
        window.removeEventListener("touchstart", this.handleResizeOrTouch, {
          passive: true,
        });
        return;
      }
      const isTouch = this.checkTouchDevice();
      if (isTouch !== this.state.isTouchDevice) {
        this.setState({ isTouchDevice: isTouch });
      }
      this.scheduleToolbarUpdate();
    };
    window.addEventListener("resize", this.handleResizeOrTouch, false);
    window.addEventListener(
      "orientationchange",
      this.handleResizeOrTouch,
      false
    );
    window.addEventListener("touchstart", this.handleResizeOrTouch, {
      passive: true,
    });
    if (this.checkTouchDevice()) {
      this.setState({ isTouchDevice: true });
    }

    this.scheduleToolbarUpdate();
    const mainEl = document.querySelector(".main");
    if (mainEl && typeof ResizeObserver !== "undefined") {
      this.mainResizeObserver = new ResizeObserver(() => {
        if (!this.isInstanceActive()) {
          if (this.mainResizeObserver) {
            this.mainResizeObserver.disconnect();
            this.mainResizeObserver = null;
          }
          return;
        }
        this.scheduleToolbarUpdate();
      });
      this.mainResizeObserver.observe(mainEl);
    }

    if (typeof window !== "undefined" && window.visualViewport) {
      this.visualViewportHandler = () => {
        if (!this.isInstanceActive()) {
          if (window.visualViewport) {
            window.visualViewport.removeEventListener(
              "resize",
              this.visualViewportHandler
            );
            window.visualViewport.removeEventListener(
              "scroll",
              this.visualViewportHandler
            );
          }
          return;
        }
        const vv = window.visualViewport;
        const offset = Math.max(
          0,
          window.innerHeight - (vv.height + vv.offsetTop)
        );
        const bbsWin = document.getElementById("BBSWindow");
        const target = bbsWin || document.documentElement;
        target.style.setProperty("--keyboard-offset", `${offset}px`);
        this.scheduleToolbarUpdate();
      };
      window.visualViewport.addEventListener(
        "resize",
        this.visualViewportHandler
      );
      window.visualViewport.addEventListener(
        "scroll",
        this.visualViewportHandler
      );
    }

    this.dismissKeypadsIfOutside = (event) => {
      if (
        event &&
        event.target &&
        event.target.closest &&
        (event.target.closest('[role="menuitem"]') ||
          event.target.closest(".dropdown-menu") ||
          event.target.closest(".TouchFloatingToolbar"))
      ) {
        return false;
      }
      if (this.state.isAlphaMode || this.state.isCtrlMode) {
        this.suppressInteractionUntil = Date.now() + 350;
        this.lastShiftClickTime = 0;
        this.setState({
          isAlphaMode: false,
          isCtrlMode: false,
          ctrlPreviousMode: null,
          isShiftActive: false,
          isShiftSticky: false,
        });
      }
      return true;
    };

    this.pointerDownHandler = (event) => {
      if (!this.isInstanceActive()) {
        window.removeEventListener(
          "pointerdown",
          this.pointerDownHandler,
          false
        );
        return;
      }
      this.dismissKeypadsIfOutside(event);
    };
    window.addEventListener("pointerdown", this.pointerDownHandler, false);

    this.clickHandler = (event) => {
      if (!this.isInstanceActive()) {
        window.removeEventListener("click", this.clickHandler, false);
        return;
      }
      this.dismissKeypadsIfOutside(event);
    };
    window.addEventListener("click", this.clickHandler, false);

    this.touchStartHandler = (event) => {
      if (!this.isInstanceActive()) {
        window.removeEventListener("touchstart", this.touchStartHandler, false);
        return;
      }
      this.dismissKeypadsIfOutside(event);
    };
    window.addEventListener("touchstart", this.touchStartHandler, false);

    if (this.props.app && this.props.app.inputArea) {
      this.inputAreaFocusHandler = () => {
        if (!this.isInstanceActive()) return;
        const mode = this.props.app.inputArea.getAttribute("inputmode");
        if (mode !== "none") {
          this.setState({ isSystemKeyboardOpen: true });
        }
      };
      this.inputAreaBlurHandler = () => {
        if (!this.isInstanceActive()) return;
        this.setState({ isSystemKeyboardOpen: false });
        if (this.props.app.inputArea) {
          this.props.app.inputArea.setAttribute("inputmode", "none");
          this.props.app.inputArea.setAttribute("virtualkeyboardpolicy", "manual");
        }
      };
      this.props.app.inputArea.addEventListener("focus", this.inputAreaFocusHandler, false);
      this.props.app.inputArea.addEventListener("blur", this.inputAreaBlurHandler, false);
    }
  }

  componentWillUnmount() {
    this._isMounted = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.stopKeyRepeat();
    if (this.dragState) {
      window.removeEventListener("pointermove", this.handleDragMove);
      window.removeEventListener("pointerup", this.handleDragEnd);
      window.removeEventListener("pointercancel", this.handleDragEnd);
      this.dragState = null;
    }
    if (
      typeof window !== "undefined" &&
      window.visualViewport &&
      this.visualViewportHandler
    ) {
      window.visualViewport.removeEventListener(
        "resize",
        this.visualViewportHandler
      );
      window.visualViewport.removeEventListener(
        "scroll",
        this.visualViewportHandler
      );
    }
    window.removeEventListener("resize", this.handleResizeOrTouch, false);
    window.removeEventListener(
      "orientationchange",
      this.handleResizeOrTouch,
      false
    );
    window.removeEventListener("touchstart", this.handleResizeOrTouch, {
      passive: true,
    });
    window.removeEventListener("touchstart", this.touchStartHandler, false);
    window.removeEventListener("click", this.clickHandler, false);
    window.removeEventListener("pointerdown", this.pointerDownHandler, false);
    if (this.mainResizeObserver) {
      this.mainResizeObserver.disconnect();
      this.mainResizeObserver = null;
    }
    if (this.props.app && this.props.app.inputArea) {
      if (this.inputAreaFocusHandler) {
        this.props.app.inputArea.removeEventListener("focus", this.inputAreaFocusHandler, false);
      }
      if (this.inputAreaBlurHandler) {
        this.props.app.inputArea.removeEventListener("blur", this.inputAreaBlurHandler, false);
      }
    }
  }
  handleTerminalKey = (keyName) => {
    const { app } = this.props;
    if (!app) return;

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(8);
      } catch (err) {}
    }

    const eventKey = keyName === "Space" ? " " : keyName;
    const fakeEvent = {
      key: eventKey,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      getModifierState: () => false,
      preventDefault: () => {},
    };

    let handled = false;
    if (app.view && app.view.onKeyDown) {
      try {
        app.view.onKeyDown(fakeEvent);
        handled = true;
      } catch (err) {
        console.warn(
          "Failed to dispatch key to view.onKeyDown, falling back to conn.send:",
          err
        );
      }
    }
    if (!handled && app.conn && app.conn.send) {
      const fallbackMap = {
        ArrowLeft: "\x1b[D",
        ArrowUp: "\x1b[A",
        ArrowDown: "\x1b[B",
        ArrowRight: "\x1b[C",
        PageUp: "\x1b[5~",
        PageDown: "\x1b[6~",
        Home: "\x1b[1~",
        End: "\x1b[4~",
        Space: " ",
        " ": " ",
        Backspace: "\b",
        Escape: "\x1b",
        Enter: "\r",
        Tab: "\t",
      };
      if (fallbackMap[keyName]) {
        app.conn.send(fallbackMap[keyName]);
      }
    }
  };

  handleKeyPointerDown = (keyName, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    this.activeKeyName = keyName;
    this.setState({ pressedKeyName: keyName });
    this.stopKeyRepeat();

    this.handleTerminalKey(keyName);

    this.keyRepeatTimer = setTimeout(() => {
      this.keyRepeatInterval = setInterval(() => {
        if (this.activeKeyName === keyName) {
          this.handleTerminalKey(keyName);
        } else {
          this.stopKeyRepeat();
        }
      }, 75);
    }, 350);
  };

  stopKeyRepeat = (e) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
    }
    this.activeKeyName = null;
    if (this.state.pressedKeyName) {
      this.setState({ pressedKeyName: null });
    }
    if (this.keyRepeatTimer) {
      clearTimeout(this.keyRepeatTimer);
      this.keyRepeatTimer = null;
    }
    if (this.keyRepeatInterval) {
      clearInterval(this.keyRepeatInterval);
      this.keyRepeatInterval = null;
    }
  };

  handleDragStart = (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (Date.now() < this.suppressInteractionUntil) return;
    e.preventDefault();
    e.stopPropagation();

    const toolbarEl = document.querySelector(".TouchFloatingToolbar");
    if (!toolbarEl) return;

    const rect = toolbarEl.getBoundingClientRect();
    const viewportWidth =
      typeof window !== "undefined"
        ? window.visualViewport
          ? window.visualViewport.width
          : window.innerWidth
        : 800;
    const viewportHeight =
      typeof window !== "undefined"
        ? window.visualViewport
          ? window.visualViewport.height
          : window.innerHeight
        : 600;

    const currentRight = Math.max(0, viewportWidth - rect.right);
    const currentBottom = Math.max(0, viewportHeight - rect.bottom);

    this.dragState = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startRight: currentRight,
      startBottom: currentBottom,
      padWidth: rect.width,
      padHeight: rect.height,
      hasMoved: false,
    };

    if (e.currentTarget && e.currentTarget.setPointerCapture) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (err) {}
    }

    window.addEventListener("pointermove", this.handleDragMove, {
      passive: false,
    });
    window.addEventListener("pointerup", this.handleDragEnd, {
      passive: false,
    });
    window.addEventListener("pointercancel", this.handleDragEnd, {
      passive: false,
    });
  };

  handleDragMove = (e) => {
    if (!this.dragState || e.pointerId !== this.dragState.pointerId) return;

    const dx = e.clientX - this.dragState.startX;
    const dy = e.clientY - this.dragState.startY;

    if (!this.dragState.hasMoved) {
      if (Math.hypot(dx, dy) < 4) return;
      this.dragState.hasMoved = true;
      this.setState({ isDragging: true });
    }

    e.preventDefault();
    e.stopPropagation();

    const viewportWidth =
      typeof window !== "undefined"
        ? window.visualViewport
          ? window.visualViewport.width
          : window.innerWidth
        : 800;
    const viewportHeight =
      typeof window !== "undefined"
        ? window.visualViewport
          ? window.visualViewport.height
          : window.innerHeight
        : 600;

    let nextRight = this.dragState.startRight - dx;
    let nextBottom = this.dragState.startBottom - dy;

    const minRight = 4;
    const maxRight = Math.max(
      minRight,
      viewportWidth - this.dragState.padWidth - 4
    );
    const minBottom = 4;
    const maxBottom = Math.max(
      minBottom,
      viewportHeight - this.dragState.padHeight - 4
    );

    nextRight = Math.max(minRight, Math.min(maxRight, nextRight));
    nextBottom = Math.max(minBottom, Math.min(maxBottom, nextBottom));

    this.setState({
      toolbarCustomRight: nextRight,
      toolbarCustomBottom: nextBottom,
    });
  };

  handleDragEnd = (e) => {
    if (!this.dragState || e.pointerId !== this.dragState.pointerId) return;

    window.removeEventListener("pointermove", this.handleDragMove);
    window.removeEventListener("pointerup", this.handleDragEnd);
    window.removeEventListener("pointercancel", this.handleDragEnd);

    if (this.dragState.hasMoved) {
      this.suppressInteractionUntil = Date.now() + 250;
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          if (this.state.toolbarCustomRight != null) {
            window.localStorage.setItem(
              "pttchrome.toolbarCustomRight",
              String(Math.round(this.state.toolbarCustomRight))
            );
          }
          if (this.state.toolbarCustomBottom != null) {
            window.localStorage.setItem(
              "pttchrome.toolbarCustomBottom",
              String(Math.round(this.state.toolbarCustomBottom))
            );
          }
        } catch (err) {}
      }
    }

    this.dragState = null;
    this.setState({ isDragging: false });
  };

  handleToolbarCapture = (event) => {
    if (Date.now() < this.suppressInteractionUntil) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  };

  handleToggleToolbarCollapse = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (Date.now() < this.suppressInteractionUntil) {
      return;
    }
    this.suppressInteractionUntil = Date.now() + 350;
    this.lastShiftClickTime = 0;
    this.setState((prev) => ({
      isToolbarCollapsed: !prev.isToolbarCollapsed,
      isCtrlMode: false,
      isAlphaMode: false,
      ctrlPreviousMode: null,
      isShiftActive: false,
      isShiftSticky: false,
    }));
  };

  handleToggleCtrlMode = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (Date.now() < this.suppressInteractionUntil) {
      return;
    }
    this.suppressInteractionUntil = Date.now() + 350;
    this.lastShiftClickTime = 0;
    this.setState((prev) => {
      if (prev.isCtrlMode) {
        const returnToAlpha = prev.ctrlPreviousMode === "alpha";
        return {
          isCtrlMode: false,
          isAlphaMode: returnToAlpha,
          ctrlPreviousMode: null,
          isShiftActive: false,
          isShiftSticky: false,
        };
      } else {
        const previousMode = prev.isAlphaMode ? "alpha" : "standard";
        return {
          isCtrlMode: true,
          isAlphaMode: false,
          ctrlPreviousMode: previousMode,
          isShiftActive: false,
          isShiftSticky: false,
        };
      }
    });
  };

  handleToggleAlphaMode = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (Date.now() < this.suppressInteractionUntil) {
      return;
    }
    this.suppressInteractionUntil = Date.now() + 350;
    this.lastShiftClickTime = 0;
    this.setState((prev) => ({
      isAlphaMode: !prev.isAlphaMode,
      isCtrlMode: false,
      ctrlPreviousMode: null,
      isShiftActive: false,
      isShiftSticky: false,
    }));
  };

  handleReturnToNormalPad = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (Date.now() < this.suppressInteractionUntil) {
      return;
    }
    this.suppressInteractionUntil = Date.now() + 350;
    this.lastShiftClickTime = 0;
    this.setState({
      isAlphaMode: false,
      isCtrlMode: false,
      ctrlPreviousMode: null,
      isShiftActive: false,
      isShiftSticky: false,
    });
  };

  handleToggleShift = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const now = Date.now();
    if (this._lastShiftEventTime && now - this._lastShiftEventTime < 200) {
      return;
    }
    this._lastShiftEventTime = now;

    this.setState((prev) => {
      if (prev.isShiftSticky) {
        return {
          isShiftActive: false,
          isShiftSticky: false,
        };
      }
      if (prev.isShiftActive) {
        return {
          isShiftActive: true,
          isShiftSticky: true,
        };
      }
      return {
        isShiftActive: true,
        isShiftSticky: false,
      };
    });
  };

  handleAlphaLetterDown = (letter, event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.sendAlphaLetter(letter);
  };

  sendAlphaLetter = (letter) => {
    const { app } = this.props;
    if (!app) return;

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(8);
      } catch (err) {}
    }

    const { isShiftActive, isShiftSticky } = this.state;
    const char = isShiftActive ? letter.toUpperCase() : letter.toLowerCase();
    const fakeEvent = {
      key: char,
      ctrlKey: false,
      altKey: false,
      shiftKey: Boolean(isShiftActive),
      getModifierState: (mod) => (mod === "Shift" ? isShiftActive : false),
      preventDefault: () => {},
    };

    let handled = false;
    if (app.view && app.view.onKeyDown) {
      try {
        app.view.onKeyDown(fakeEvent);
        handled = true;
      } catch (err) {
        console.warn("Failed to dispatch letter to view.onKeyDown:", err);
      }
    }
    if (!handled && app.conn && app.conn.send) {
      app.conn.send(char);
    }

    if (isShiftActive && !isShiftSticky) {
      this.lastShiftClickTime = 0;
      this.setState({
        isShiftActive: false,
        isShiftSticky: false,
      });
    }
  };

  handleCtrlLetterDown = (letter, event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.sendCtrlLetter(letter);
  };

  sendCtrlLetter = (letter) => {
    const { app } = this.props;
    if (!app) return;

    this.suppressInteractionUntil = Date.now() + 350;

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(8);
      } catch (err) {}
    }

    const lower = letter.toLowerCase();
    const fakeEvent = {
      key: lower,
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      getModifierState: (mod) => mod === "Control",
      preventDefault: () => {},
    };

    let handled = false;
    if (app.view && app.view.onKeyDown) {
      try {
        app.view.onKeyDown(fakeEvent);
        handled = true;
      } catch (err) {
        console.warn("Failed to dispatch ctrl key to view.onKeyDown:", err);
      }
    }
    if (!handled && app.conn && app.conn.send) {
      const code = lower.charCodeAt(0) - 96;
      if (code >= 1 && code <= 26) {
        app.conn.send(String.fromCharCode(code));
      }
    }

    this.exitCtrlMode();
  };

  exitCtrlMode = () => {
    this.lastShiftClickTime = 0;
    this.setState((prev) => {
      const returnToAlpha = prev.ctrlPreviousMode === "alpha";
      return {
        isCtrlMode: false,
        isAlphaMode: returnToAlpha,
        ctrlPreviousMode: null,
        isShiftActive: false,
        isShiftSticky: false,
      };
    });
  };

  handleCtrlKey = (keyName, event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.handleTerminalKey(keyName);
    this.exitCtrlMode();
  };

  sendCtrlNumber = (num) => {
    const { app } = this.props;
    if (app) {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate(8);
        } catch (err) {}
      }

      const fakeEvent = {
        key: num,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        getModifierState: () => false,
        preventDefault: () => {},
      };

      let handled = false;
      if (app.view && app.view.onKeyDown) {
        try {
          app.view.onKeyDown(fakeEvent);
          handled = true;
        } catch (err) {
          console.warn("Failed to dispatch number to view.onKeyDown:", err);
        }
      }
      if (!handled && app.conn && app.conn.send) {
        app.conn.send(num);
      }
    }
    this.exitCtrlMode();
  };

  sendAlphaNumber = (num) => {
    const { app } = this.props;
    if (!app) return;

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(8);
      } catch (err) {}
    }

    const { isShiftActive, isShiftSticky } = this.state;
    const char =
      isShiftActive && SHIFT_NUMBER_MAP[num] ? SHIFT_NUMBER_MAP[num] : num;

    const fakeEvent = {
      key: char,
      ctrlKey: false,
      altKey: false,
      shiftKey: Boolean(isShiftActive),
      getModifierState: (mod) =>
        mod === "Shift" ? Boolean(isShiftActive) : false,
      preventDefault: () => {},
    };

    let handled = false;
    if (app.view && app.view.onKeyDown) {
      try {
        app.view.onKeyDown(fakeEvent);
        handled = true;
      } catch (err) {
        console.warn("Failed to dispatch number to view.onKeyDown:", err);
      }
    }
    if (!handled && app.conn && app.conn.send) {
      app.conn.send(char);
    }

    if (isShiftActive && !isShiftSticky) {
      this.lastShiftClickTime = 0;
      this.setState({
        isShiftActive: false,
        isShiftSticky: false,
      });
    }
  };

  handleToolbarZoom = (delta, event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const currentScale = this.state.toolbarScale || 1.0;
    const nextScale = Math.max(
      0.7,
      Math.min(1.5, Math.round((currentScale + delta * 0.1) * 10) / 10)
    );
    if (nextScale === currentScale) return;

    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.setItem(
          "pttchrome.toolbarScale",
          String(nextScale)
        );
      } catch (err) {}
    }
    this.setState({ toolbarScale: nextScale }, () => {
      this.updateToolbarLayout();
    });
  };

  handleTermFontZoom = (delta, event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const { app } = this.props;
    if (!app || !app.view) return;
    if (app.zoomFont) {
      app.zoomFont(delta);
    } else {
      const currentSize = app.view.chh || 24;
      const newSize = Math.max(12, Math.min(60, currentSize + delta * 2));
      if (newSize === currentSize) return;

      const currentPrefs = readValuesWithDefault();
      const nextPrefs = {
        ...currentPrefs,
        fontSize: newSize,
      };
      writeValues(nextPrefs);
      app.onValuesPrefChange(nextPrefs);
      if (app.view.redraw) {
        app.view.redraw(true);
      }
    }
    this.updateToolbarLayout();
  };

  handleFloatingKeyboardPointerDown = (event) => {
    const { app } = this.props;
    if (!app || !app.inputArea) return;
    if (!this.state.isSystemKeyboardOpen) {
      app.inputArea.style.left = "0px";
      app.inputArea.style.top = "0px";
      app.inputArea.style.width = "1px";
      app.inputArea.style.height = "1px";
      app.inputArea.style.opacity = "0";
      app.inputArea.style.pointerEvents = "none";
      app.inputArea.removeAttribute("inputmode");
      app.inputArea.removeAttribute("virtualkeyboardpolicy");
      app.inputArea.setAttribute("inputmode", "text");
      app.inputArea.setAttribute("virtualkeyboardpolicy", "auto");
    }
  };

  handleFloatingKeyboardToggle = (event) => {
    event.stopPropagation();
    const { app } = this.props;
    if (!app || !app.inputArea) return;
    const isInputFocused =
      document.activeElement === app.inputArea &&
      app.inputArea.getAttribute("inputmode") !== "none";

    if (this.state.isSystemKeyboardOpen || isInputFocused) {
      event.preventDefault();
      app.inputArea.setAttribute("inputmode", "none");
      app.inputArea.setAttribute("virtualkeyboardpolicy", "manual");
      if (typeof navigator !== "undefined" && navigator.virtualKeyboard && navigator.virtualKeyboard.hide) {
        try {
          navigator.virtualKeyboard.hide();
        } catch (err) {}
      }
      app.inputArea.blur();
      this.setState({ isSystemKeyboardOpen: false });
    } else {
      app.inputArea.removeAttribute("inputmode");
      app.inputArea.removeAttribute("virtualkeyboardpolicy");
      app.inputArea.setAttribute("inputmode", "text");
      app.inputArea.setAttribute("virtualkeyboardpolicy", "auto");
      if (app.setInputAreaFocus) {
        app.setInputAreaFocus(true);
      } else {
        if (document.activeElement === app.inputArea) {
          app.inputArea.blur();
        }
        app.inputArea.focus();
      }
      if (typeof navigator !== "undefined" && navigator.virtualKeyboard && navigator.virtualKeyboard.show) {
        try {
          navigator.virtualKeyboard.show();
        } catch (err) {}
      }
      this.setState({ isSystemKeyboardOpen: true });
    }
  };

  handleFloatingMenuToggle = (event) => {
    if (this.props.onMenuToggle) {
      this.props.onMenuToggle(event);
    } else if (
      this.props.app &&
      this.props.app.openContextMenu
    ) {
      const rect = event.currentTarget.getBoundingClientRect();
      this.props.app.openContextMenu(rect.right, rect.top - 4);
    }
  };
  renderArrowLeft = () => (
    <button
      type="button"
      className={cx(
        "TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--arrow",
        {
          "TouchFloatingToolbar__Btn--pressed":
            this.state.pressedKeyName === "ArrowLeft",
        }
      )}
      title="向左 / 離開 (Left / Back)"
      aria-label="Left Arrow"
      onPointerDown={(e) => this.handleKeyPointerDown("ArrowLeft", e)}
      onPointerUp={this.stopKeyRepeat}
      onPointerLeave={this.stopKeyRepeat}
      onPointerCancel={this.stopKeyRepeat}
      onClick={(e) => e.preventDefault()}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );

  renderArrowUp = () => (
    <button
      type="button"
      className={cx(
        "TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--arrow",
        {
          "TouchFloatingToolbar__Btn--pressed":
            this.state.pressedKeyName === "ArrowUp",
        }
      )}
      title="向上 (Up)"
      aria-label="Up Arrow"
      onPointerDown={(e) => this.handleKeyPointerDown("ArrowUp", e)}
      onPointerUp={this.stopKeyRepeat}
      onPointerLeave={this.stopKeyRepeat}
      onPointerCancel={this.stopKeyRepeat}
      onClick={(e) => e.preventDefault()}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </button>
  );

  renderArrowDown = () => (
    <button
      type="button"
      className={cx(
        "TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--arrow",
        {
          "TouchFloatingToolbar__Btn--pressed":
            this.state.pressedKeyName === "ArrowDown",
        }
      )}
      title="向下 (Down)"
      aria-label="Down Arrow"
      onPointerDown={(e) => this.handleKeyPointerDown("ArrowDown", e)}
      onPointerUp={this.stopKeyRepeat}
      onPointerLeave={this.stopKeyRepeat}
      onPointerCancel={this.stopKeyRepeat}
      onClick={(e) => e.preventDefault()}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );

  renderArrowRight = () => (
    <button
      type="button"
      className={cx(
        "TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--arrow",
        {
          "TouchFloatingToolbar__Btn--pressed":
            this.state.pressedKeyName === "ArrowRight",
        }
      )}
      title="向右 / 進入 (Right / Enter)"
      aria-label="Right Arrow"
      onPointerDown={(e) => this.handleKeyPointerDown("ArrowRight", e)}
      onPointerUp={this.stopKeyRepeat}
      onPointerLeave={this.stopKeyRepeat}
      onPointerCancel={this.stopKeyRepeat}
      onClick={(e) => e.preventDefault()}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );

  renderPageUp = () => (
    <button
      type="button"
      className={cx(
        "TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--text TouchFloatingToolbar__Btn--nav-text",
        {
          "TouchFloatingToolbar__Btn--pressed":
            this.state.pressedKeyName === "PageUp",
        }
      )}
      title="上一頁 (Page Up)"
      aria-label="Page Up"
      onPointerDown={(e) => this.handleKeyPointerDown("PageUp", e)}
      onPointerUp={this.stopKeyRepeat}
      onPointerLeave={this.stopKeyRepeat}
      onPointerCancel={this.stopKeyRepeat}
      onClick={(e) => e.preventDefault()}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="12" y1="21" x2="12" y2="4" />
        <polyline points="6 10 12 4 18 10" />
        <line x1="7" y1="14" x2="17" y2="14" />
        <line x1="7" y1="18" x2="17" y2="18" />
      </svg>
    </button>
  );

  renderPageDown = () => (
    <button
      type="button"
      className={cx(
        "TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--text TouchFloatingToolbar__Btn--nav-text",
        {
          "TouchFloatingToolbar__Btn--pressed":
            this.state.pressedKeyName === "PageDown",
        }
      )}
      title="下一頁 (Page Down)"
      aria-label="Page Down"
      onPointerDown={(e) => this.handleKeyPointerDown("PageDown", e)}
      onPointerUp={this.stopKeyRepeat}
      onPointerLeave={this.stopKeyRepeat}
      onPointerCancel={this.stopKeyRepeat}
      onClick={(e) => e.preventDefault()}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="12" y1="3" x2="12" y2="20" />
        <polyline points="6 14 12 20 18 14" />
        <line x1="7" y1="6" x2="17" y2="6" />
        <line x1="7" y1="10" x2="17" y2="10" />
      </svg>
    </button>
  );

  renderHome = () => (
    <button
      type="button"
      className={cx(
        "TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--text TouchFloatingToolbar__Btn--nav-text",
        {
          "TouchFloatingToolbar__Btn--pressed":
            this.state.pressedKeyName === "Home",
        }
      )}
      title="到最前 (Home)"
      aria-label="Home"
      onPointerDown={(e) => this.handleKeyPointerDown("Home", e)}
      onPointerUp={this.stopKeyRepeat}
      onPointerLeave={this.stopKeyRepeat}
      onPointerCancel={this.stopKeyRepeat}
      onClick={(e) => e.preventDefault()}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="19" y1="19" x2="5" y2="5" />
        <polyline points="14 5 5 5 5 14" />
      </svg>
    </button>
  );

  renderEnd = () => (
    <button
      type="button"
      className={cx(
        "TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--text TouchFloatingToolbar__Btn--nav-text",
        {
          "TouchFloatingToolbar__Btn--pressed":
            this.state.pressedKeyName === "End",
        }
      )}
      title="到最後 (End)"
      aria-label="End"
      onPointerDown={(e) => this.handleKeyPointerDown("End", e)}
      onPointerUp={this.stopKeyRepeat}
      onPointerLeave={this.stopKeyRepeat}
      onPointerCancel={this.stopKeyRepeat}
      onClick={(e) => e.preventDefault()}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="5" y1="5" x2="19" y2="19" />
        <polyline points="10 19 19 19 19 10" />
      </svg>
    </button>
  );

  renderSpace = () => (
    <button
      type="button"
      className={cx(
        "TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--arrow TouchFloatingToolbar__Btn--space",
        {
          "TouchFloatingToolbar__Btn--pressed":
            this.state.pressedKeyName === "Space",
        }
      )}
      title="空白 (Space)"
      aria-label="Space"
      onPointerDown={(e) => this.handleKeyPointerDown("Space", e)}
      onPointerUp={this.stopKeyRepeat}
      onPointerLeave={this.stopKeyRepeat}
      onPointerCancel={this.stopKeyRepeat}
      onClick={(e) => e.preventDefault()}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12v4h14v-4" />
      </svg>
    </button>
  );

  renderBackspace = () => (
    <button
      type="button"
      className={cx("TouchFloatingToolbar__Btn", {
        "TouchFloatingToolbar__Btn--pressed":
          this.state.pressedKeyName === "Backspace",
      })}
      title="倒退刪除 (Backspace)"
      aria-label="Backspace"
      onPointerDown={(e) => this.handleKeyPointerDown("Backspace", e)}
      onPointerUp={this.stopKeyRepeat}
      onPointerLeave={this.stopKeyRepeat}
      onPointerCancel={this.stopKeyRepeat}
      onClick={(e) => e.preventDefault()}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
        <line x1="18" y1="9" x2="12" y2="15" />
        <line x1="12" y1="9" x2="18" y2="15" />
      </svg>
    </button>
  );

  renderEnter = () => (
    <button
      type="button"
      className={cx("TouchFloatingToolbar__Btn", {
        "TouchFloatingToolbar__Btn--pressed":
          this.state.pressedKeyName === "Enter",
      })}
      title="確認 / 輸入 (Enter)"
      aria-label="Enter"
      onPointerDown={(e) => this.handleKeyPointerDown("Enter", e)}
      onPointerUp={this.stopKeyRepeat}
      onPointerLeave={this.stopKeyRepeat}
      onPointerCancel={this.stopKeyRepeat}
      onClick={(e) => e.preventDefault()}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="9 10 4 15 9 20" />
        <path d="M20 4v7a4 4 0 0 1-4 4H4" />
      </svg>
    </button>
  );

  renderEscape = () => (
    <button
      type="button"
      className={cx(
        "TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--text TouchFloatingToolbar__Btn--esc",
        {
          "TouchFloatingToolbar__Btn--pressed":
            this.state.pressedKeyName === "Escape",
        }
      )}
      title="跳離 / 取消 (Esc)"
      aria-label="Escape"
      onPointerDown={(e) => this.handleKeyPointerDown("Escape", e)}
      onPointerUp={this.stopKeyRepeat}
      onPointerLeave={this.stopKeyRepeat}
      onPointerCancel={this.stopKeyRepeat}
      onClick={(e) => e.preventDefault()}
    >
      Esc
    </button>
  );

  renderTab = () => (
    <button
      type="button"
      className={cx("TouchFloatingToolbar__Btn", {
        "TouchFloatingToolbar__Btn--pressed":
          this.state.pressedKeyName === "Tab",
      })}
      title="Tab 鍵 (Tab)"
      aria-label="Tab"
      onPointerDown={(e) => this.handleKeyPointerDown("Tab", e)}
      onPointerUp={this.stopKeyRepeat}
      onPointerLeave={this.stopKeyRepeat}
      onPointerCancel={this.stopKeyRepeat}
      onClick={(e) => e.preventDefault()}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="20" y1="5" x2="20" y2="19" />
        <line x1="4" y1="12" x2="19" y2="12" />
        <polyline points="13 7 18 12 13 17" />
      </svg>
    </button>
  );

  renderToolbarZoomIn = () => (
    <button
      type="button"
      className="TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--system"
      title="工具列放大 (Enlarge Toolbar)"
      aria-label="Enlarge Toolbar"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => this.handleToolbarZoom(1, e)}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="12" y1="9" x2="12" y2="15" />
        <line x1="9" y1="12" x2="15" y2="12" />
      </svg>
    </button>
  );

  renderToolbarZoomOut = () => (
    <button
      type="button"
      className="TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--system"
      title="工具列縮小 (Shrink Toolbar)"
      aria-label="Shrink Toolbar"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => this.handleToolbarZoom(-1, e)}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="9" y1="12" x2="15" y2="12" />
      </svg>
    </button>
  );

  renderFontZoomIn = () => (
    <button
      type="button"
      className="TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--text TouchFloatingToolbar__Btn--system TouchFloatingToolbar__Btn--font-zoom TouchFloatingToolbar__Btn--font-zoom-in"
      title="終端字體放大 (Increase Terminal Font)"
      aria-label="Increase Terminal Font"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => this.handleTermFontZoom(1, e)}
    >
      A+
    </button>
  );

  renderFontZoomOut = () => (
    <button
      type="button"
      className="TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--text TouchFloatingToolbar__Btn--system TouchFloatingToolbar__Btn--font-zoom TouchFloatingToolbar__Btn--font-zoom-out"
      title="終端字體縮小 (Decrease Terminal Font)"
      aria-label="Decrease Terminal Font"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => this.handleTermFontZoom(-1, e)}
    >
      A-
    </button>
  );

  renderKeyboardToggle = () => {
    const isOpen = Boolean(this.state.isSystemKeyboardOpen);
    return (
      <label
        htmlFor="t"
        className={`TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--system ${
          isOpen ? "TouchFloatingToolbar__Btn--active" : ""
        }`}
        title="切換鍵盤 (Toggle Keyboard)"
        aria-label="Toggle Keyboard"
        role="button"
        onPointerDown={this.handleFloatingKeyboardPointerDown}
        onClick={this.handleFloatingKeyboardToggle}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
          <line x1="6" y1="8" x2="6.01" y2="8" />
          <line x1="10" y1="8" x2="10.01" y2="8" />
          <line x1="14" y1="8" x2="14.01" y2="8" />
          <line x1="18" y1="8" x2="18.01" y2="8" />
          <line x1="6" y1="12" x2="6.01" y2="12" />
          <line x1="10" y1="12" x2="10.01" y2="12" />
          <line x1="14" y1="12" x2="14.01" y2="12" />
          <line x1="18" y1="12" x2="18.01" y2="12" />
          <line x1="8" y1="16" x2="16" y2="16" />
        </svg>
      </label>
    );
  };

  renderMenuToggle = () => (
    <button
      type="button"
      className="TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--system"
      title="選單與設定 (Menu & Settings)"
      aria-label="Menu & Settings"
      onMouseDown={(e) => e.preventDefault()}
      onClick={this.handleFloatingMenuToggle}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="6" cy="12" r="1.5" />
        <circle cx="18" cy="12" r="1.5" />
      </svg>
    </button>
  );

  renderCollapseToggle = (isExpandIcon = false, extraClass = "") => (
    <button
      type="button"
      className={cx(
        "TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--system",
        extraClass
      )}
      title={
        isExpandIcon
          ? "展開方向鍵 (Expand Terminal Keys)"
          : "收合工具列 (Collapse Toolbar)"
      }
      aria-label={isExpandIcon ? "Expand Terminal Keys" : "Collapse Toolbar"}
      onMouseDown={(e) => e.preventDefault()}
      onClick={this.handleToggleToolbarCollapse}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {isExpandIcon ? (
          <React.Fragment>
            <polyline points="6 15 12 9 18 15" />
            <line x1="5" y1="19" x2="19" y2="19" />
          </React.Fragment>
        ) : (
          <React.Fragment>
            <polyline points="6 9 12 15 18 9" />
            <line x1="5" y1="19" x2="19" y2="19" />
          </React.Fragment>
        )}
      </svg>
    </button>
  );

  renderReturnToNormalPad = () => (
    <button
      type="button"
      className="TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--system TouchFloatingToolbar__Btn--qwert-nav-return"
      title="返回方向鍵 (Return to Direction Keys)"
      aria-label="Return to Direction Keys"
      onMouseDown={(e) => e.preventDefault()}
      onClick={this.handleReturnToNormalPad}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="2.6" strokeWidth="2" />
        <polyline points="8 7 12 3 16 7" />
        <polyline points="8 17 12 21 16 17" />
        <polyline points="7 8 3 12 7 16" />
        <polyline points="17 8 21 12 17 16" />
      </svg>
    </button>
  );

  renderCtrl = () => {
    const isCtrlActive = Boolean(this.state.isCtrlMode);
    return (
      <button
        type="button"
        className={cx(
          "TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--text TouchFloatingToolbar__Btn--ctrl TouchFloatingToolbar__Btn--ctrl-toggle",
          {
            "TouchFloatingToolbar__Btn--active": isCtrlActive,
            "TouchFloatingToolbar__Btn--pressed": isCtrlActive,
            "TouchFloatingToolbar__Btn--system": !isCtrlActive,
          }
        )}
        title={
          isCtrlActive
            ? "關閉 Ctrl 盤面 (Exit Ctrl Mode)"
            : "Ctrl 鍵 (Toggle Ctrl Mode)"
        }
        aria-label="Ctrl"
        onMouseDown={(e) => e.preventDefault()}
        onClick={this.handleToggleCtrlMode}
      >
        Ctrl
      </button>
    );
  };

  renderBackToMainToolbar = () => (
    <button
      type="button"
      className="TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--system"
      title="返回主工具列 (Back to Main Toolbar)"
      aria-label="Back to Main Toolbar"
      onMouseDown={(e) => e.preventDefault()}
      onClick={this.handleToggleCtrlMode}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
  );

  renderCtrlLetter = (letter) => (
    <button
      key={letter}
      type="button"
      className="TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--text TouchFloatingToolbar__Btn--ctrl TouchFloatingToolbar__Btn--qwert-letter TouchFloatingToolbar__Btn--ctrl-letter"
      title={`Ctrl+${letter}`}
      aria-label={`Ctrl+${letter}`}
      onPointerDown={(e) => this.handleCtrlLetterDown(letter, e)}
      onClick={(e) => e.preventDefault()}
    >
      ^{letter}
    </button>
  );

  renderAlpha = () => {
    const isAlphaActive = Boolean(this.state.isAlphaMode);
    return (
      <button
        type="button"
        className={cx(
          "TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--text TouchFloatingToolbar__Btn--alpha-toggle",
          {
            "TouchFloatingToolbar__Btn--active": isAlphaActive,
            "TouchFloatingToolbar__Btn--pressed": isAlphaActive,
            "TouchFloatingToolbar__Btn--system": !isAlphaActive,
          }
        )}
        title={
          isAlphaActive
            ? "關閉英文字母盤面 (Exit Letter Keypad)"
            : "英文字母盤面 (Toggle Letter Keypad)"
        }
        aria-label="a"
        onMouseDown={(e) => e.preventDefault()}
        onClick={this.handleToggleAlphaMode}
      >
        a
      </button>
    );
  };

  renderShift = () => {
    const { isShiftActive, isShiftSticky } = this.state;
    return (
      <button
        type="button"
        className={cx(
          "TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--shift-toggle",
          {
            "TouchFloatingToolbar__Btn--active":
              isShiftActive && !isShiftSticky,
            "TouchFloatingToolbar__Btn--pressed":
              isShiftActive && !isShiftSticky,
            "TouchFloatingToolbar__Btn--shift-sticky": isShiftSticky,
            "TouchFloatingToolbar__Btn--system": !isShiftActive,
          }
        )}
        title={
          isShiftSticky
            ? "鎖定大寫 (Caps Lock - Sticky)"
            : isShiftActive
              ? "切換為鎖定大寫 (Switch to Sticky)"
              : "切換為大寫 (Switch to Uppercase)"
        }
        aria-label={isShiftSticky ? "Caps Lock" : "Shift"}
        onMouseDown={(e) => e.preventDefault()}
        onPointerDown={this.handleToggleShift}
        onClick={(e) => e.preventDefault()}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill={isShiftActive ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {isShiftSticky ? (
            <React.Fragment>
              <path
                d="M12 3L5 11H8.5V16.5H15.5V11H19L12 3Z"
                fill="currentColor"
              />
              <line
                x1="5.5"
                y1="20.5"
                x2="18.5"
                y2="20.5"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </React.Fragment>
          ) : (
            <path d="M12 4L5 12H8.5V20H15.5V12H19L12 4Z" />
          )}
        </svg>
      </button>
    );
  };

  renderAlphaLetter = (letter) => {
    const { isShiftActive } = this.state;
    const displayChar = isShiftActive
      ? letter.toUpperCase()
      : letter.toLowerCase();
    return (
      <button
        key={letter}
        type="button"
        className={cx(
          "TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--text TouchFloatingToolbar__Btn--ctrl TouchFloatingToolbar__Btn--alpha TouchFloatingToolbar__Btn--qwert-letter",
          {
            "TouchFloatingToolbar__Btn--alpha-lowercase": !isShiftActive,
          }
        )}
        title={displayChar}
        aria-label={displayChar}
        onPointerDown={(e) => this.handleAlphaLetterDown(displayChar, e)}
        onClick={(e) => e.preventDefault()}
      >
        {displayChar}
      </button>
    );
  };

  renderAlphaNumber = (num) => {
    const { isShiftActive } = this.state;
    const displayChar =
      isShiftActive && SHIFT_NUMBER_MAP[num] ? SHIFT_NUMBER_MAP[num] : num;
    return (
      <button
        key={num}
        type="button"
        className="TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--text TouchFloatingToolbar__Btn--num"
        title={displayChar}
        aria-label={displayChar}
        onPointerDown={(e) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          this.sendAlphaNumber(num);
        }}
        onClick={(e) => e.preventDefault()}
      >
        {displayChar}
      </button>
    );
  };

  renderQwertBackspace = (isCtrl) => (
    <button
      type="button"
      className={cx(
        "TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--qwert-backspace",
        {
          "TouchFloatingToolbar__Btn--pressed":
            this.state.pressedKeyName === "Backspace",
        }
      )}
      title="倒退刪除 (Backspace)"
      aria-label="Backspace"
      onPointerDown={(e) => {
        if (isCtrl) {
          this.handleCtrlKey("Backspace", e);
        } else {
          this.handleKeyPointerDown("Backspace", e);
        }
      }}
      onPointerUp={isCtrl ? undefined : this.stopKeyRepeat}
      onPointerLeave={isCtrl ? undefined : this.stopKeyRepeat}
      onPointerCancel={isCtrl ? undefined : this.stopKeyRepeat}
      onClick={(e) => e.preventDefault()}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
        <line x1="18" y1="9" x2="12" y2="15" />
        <line x1="12" y1="9" x2="18" y2="15" />
      </svg>
    </button>
  );

  renderQwertSpace = (isCtrl) => (
    <button
      type="button"
      className={cx(
        "TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--qwert-space",
        {
          "TouchFloatingToolbar__Btn--pressed":
            this.state.pressedKeyName === "Space",
        }
      )}
      title="空白 (Space)"
      aria-label="Space"
      onPointerDown={(e) => {
        if (isCtrl) {
          this.handleCtrlKey("Space", e);
        } else {
          this.handleKeyPointerDown("Space", e);
        }
      }}
      onPointerUp={isCtrl ? undefined : this.stopKeyRepeat}
      onPointerLeave={isCtrl ? undefined : this.stopKeyRepeat}
      onPointerCancel={isCtrl ? undefined : this.stopKeyRepeat}
      onClick={(e) => e.preventDefault()}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12v4h14v-4" />
      </svg>
    </button>
  );

  renderQwertEscape = (isCtrl) => (
    <button
      type="button"
      className={cx(
        "TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--text TouchFloatingToolbar__Btn--qwert-esc",
        {
          "TouchFloatingToolbar__Btn--pressed":
            this.state.pressedKeyName === "Escape",
        }
      )}
      title="跳離 / 取消 (Esc)"
      aria-label="Escape"
      onPointerDown={(e) => {
        if (isCtrl) {
          this.handleCtrlKey("Escape", e);
        } else {
          this.handleKeyPointerDown("Escape", e);
        }
      }}
      onPointerUp={isCtrl ? undefined : this.stopKeyRepeat}
      onPointerLeave={isCtrl ? undefined : this.stopKeyRepeat}
      onPointerCancel={isCtrl ? undefined : this.stopKeyRepeat}
      onClick={(e) => e.preventDefault()}
    >
      Esc
    </button>
  );

  renderQwertEnter = (isCtrl) => (
    <button
      type="button"
      className={cx(
        "TouchFloatingToolbar__Btn TouchFloatingToolbar__Btn--qwert-enter",
        {
          "TouchFloatingToolbar__Btn--pressed":
            this.state.pressedKeyName === "Enter",
        }
      )}
      title="確認 / 輸入 (Enter)"
      aria-label="Enter"
      onPointerDown={(e) => {
        if (isCtrl) {
          this.handleCtrlKey("Enter", e);
        } else {
          this.handleKeyPointerDown("Enter", e);
        }
      }}
      onPointerUp={isCtrl ? undefined : this.stopKeyRepeat}
      onPointerLeave={isCtrl ? undefined : this.stopKeyRepeat}
      onPointerCancel={isCtrl ? undefined : this.stopKeyRepeat}
      onClick={(e) => e.preventDefault()}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="9 10 4 15 9 20" />
        <path d="M20 4v7a4 4 0 0 1-4 4H4" />
      </svg>
    </button>
  );

  render() {
    const {
      isToolbarCollapsed,
      isCtrlMode,
      isAlphaMode,
      isShiftActive,
      isShiftSticky,
      isStacked,
      stackedWidth,
      stackedHeight,
      stackedCols,
      drawableRight,
      layoutToolbarScale,
      toolbarScale,
    } = this.state;

    const isTouchDevice = this.state.isTouchDevice || this.checkTouchDevice();
    const anyModalShown = Boolean(this.props.anyModalShown);
    if (!isTouchDevice || anyModalShown) {
      return <TouchDebugHUD app={this.props.app} />;
    }
    const isStackedMode = isStacked && !isToolbarCollapsed;
    const viewportWidth =
      typeof window !== "undefined"
        ? window.visualViewport
          ? window.visualViewport.width
          : window.innerWidth
        : 0;
    const viewportHeight =
      typeof window !== "undefined"
        ? window.visualViewport
          ? window.visualViewport.height
          : window.innerHeight
        : 0;
    const isExpandedKeypad = isCtrlMode || isAlphaMode;
    const activeStackedWidth =
      isStackedMode && stackedWidth
        ? isExpandedKeypad
          ? Math.min(540, viewportWidth > 0 ? viewportWidth - 12 : 380)
          : stackedWidth
        : null;
    const activeStackedHeight =
      isStackedMode && stackedHeight
        ? Math.min(
            viewportHeight > 0 ? viewportHeight - 16 : Infinity,
            stackedHeight
          )
        : null;
    const baseRightOffset =
      isStackedMode && drawableRight != null && viewportWidth > 0
        ? Math.max(0, Math.round(viewportWidth - drawableRight))
        : null;
    const rightOffset =
      baseRightOffset != null && activeStackedWidth && viewportWidth > 0
        ? Math.min(
            baseRightOffset,
            Math.max(0, viewportWidth - activeStackedWidth - 6)
          )
        : baseRightOffset;

    const effectiveRight =
      this.state.toolbarCustomRight != null
        ? Math.min(
            this.state.toolbarCustomRight,
            activeStackedWidth && viewportWidth > 0
              ? Math.max(4, viewportWidth - activeStackedWidth - 6)
              : this.state.toolbarCustomRight
          )
        : rightOffset;

    const effectiveBottom =
      this.state.toolbarCustomBottom != null
        ? Math.min(
            this.state.toolbarCustomBottom,
            activeStackedHeight && viewportHeight > 0
              ? Math.max(4, viewportHeight - activeStackedHeight - 6)
              : this.state.toolbarCustomBottom
          )
        : null;

    const effectiveToolbarScale =
      isStackedMode && layoutToolbarScale
        ? layoutToolbarScale
        : toolbarScale || 1.0;
    const dockGroupWidth = Math.max(160, (stackedWidth || 234) - 12);
    const toolbarStyle = {
      "--toolbar-scale": String(effectiveToolbarScale),
      "--dock-group-width": `${dockGroupWidth}px`,
      ...(effectiveRight != null ? { right: `${effectiveRight}px` } : {}),
      ...(effectiveBottom != null
        ? {
            bottom: `calc(${effectiveBottom}px + var(--keyboard-offset, 0px))`,
          }
        : {}),
      ...(activeStackedWidth
        ? {
            "--stacked-toolbar-width": `${activeStackedWidth}px`,
            width: `${activeStackedWidth}px`,
            maxWidth: `${activeStackedWidth}px`,
            ...(activeStackedHeight
              ? {
                  height: `${activeStackedHeight}px`,
                  maxHeight: `${activeStackedHeight}px`,
                }
              : {}),
          }
        : {}),
    };

    return (
      <React.Fragment>
        <div
        className={cx("TouchFloatingToolbar", "nomouse_command", {
          "TouchFloatingToolbar--force-show": isTouchDevice,
          "TouchFloatingToolbar--collapsed": isToolbarCollapsed,
          "TouchFloatingToolbar--stacked": isStackedMode,
          "TouchFloatingToolbar--dragging": this.state.isDragging,
        })}
        style={toolbarStyle}
        onTouchStart={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (
            e.target === e.currentTarget ||
            (e.target &&
              e.target.classList &&
              e.target.classList.contains("TouchFloatingToolbar__Track"))
          ) {
            this.handleDragStart(e);
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClickCapture={this.handleToolbarCapture}
        onPointerDownCapture={this.handleToolbarCapture}
        onMouseDownCapture={this.handleToolbarCapture}
      >
        {isToolbarCollapsed ? (
          <React.Fragment>
            <div
              className="TouchFloatingToolbar__DragGrip"
              title="拖曳移動工具列 (Drag to Move)"
              aria-label="Drag toolbar"
              onPointerDown={this.handleDragStart}
            >
              <svg width="6" height="16" viewBox="0 0 6 16" fill="currentColor">
                <circle cx="3" cy="3" r="1.5" />
                <circle cx="3" cy="8" r="1.5" />
                <circle cx="3" cy="13" r="1.5" />
              </svg>
            </div>
            {this.renderKeyboardToggle()}
            <span className="TouchFloatingToolbar__Divider" />
            {this.renderMenuToggle()}
            <span className="TouchFloatingToolbar__Divider" />
            {this.renderCollapseToggle(true)}
          </React.Fragment>
        ) : (
          <React.Fragment>
            <div
              className="TouchFloatingToolbar__DragHandle"
              title="拖曳移動盤面 (Drag to Move)"
              aria-label="Drag pad"
              onPointerDown={this.handleDragStart}
            >
              <div className="TouchFloatingToolbar__DragHandleBar" />
            </div>
            {isCtrlMode ? (
              <div className="TouchFloatingToolbar__Track TouchFloatingToolbar__Track--stacked TouchFloatingToolbar__Track--ctrl TouchFloatingToolbar__Track--qwert">
                <div className="TouchFloatingToolbar__Row">
                  {this.renderCtrlLetter("Q")}
                  {this.renderCtrlLetter("W")}
                  {this.renderCtrlLetter("E")}
                  {this.renderCtrlLetter("R")}
                  {this.renderCtrlLetter("T")}
                  {this.renderCtrlLetter("Y")}
                  {this.renderCtrlLetter("U")}
                  {this.renderCtrlLetter("I")}
                  {this.renderCtrlLetter("O")}
                  {this.renderCtrlLetter("P")}
                </div>
                <div className="TouchFloatingToolbar__Row">
                  <span className="TouchFloatingToolbar__Spacer--half" />
                  {this.renderCtrlLetter("A")}
                  {this.renderCtrlLetter("S")}
                  {this.renderCtrlLetter("D")}
                  {this.renderCtrlLetter("F")}
                  {this.renderCtrlLetter("G")}
                  {this.renderCtrlLetter("H")}
                  {this.renderCtrlLetter("J")}
                  {this.renderCtrlLetter("K")}
                  {this.renderCtrlLetter("L")}
                  <span className="TouchFloatingToolbar__Spacer--half" />
                </div>
                <div className="TouchFloatingToolbar__Row">
                  <span className="TouchFloatingToolbar__Spacer--shift" />
                  {this.renderCtrlLetter("Z")}
                  {this.renderCtrlLetter("X")}
                  {this.renderCtrlLetter("C")}
                  {this.renderCtrlLetter("V")}
                  {this.renderCtrlLetter("B")}
                  {this.renderCtrlLetter("N")}
                  {this.renderCtrlLetter("M")}
                  {this.renderQwertBackspace(true)}
                </div>
                <div className="TouchFloatingToolbar__Row TouchFloatingToolbar__Row--dock">
                  <span className="TouchFloatingToolbar__Spacer TouchFloatingToolbar__Spacer--dock-fill" />
                  <div className="TouchFloatingToolbar__DockGroup">
                    {this.renderReturnToNormalPad()}
                    {this.renderAlpha()}
                    {this.renderKeyboardToggle()}
                    {this.renderCollapseToggle(
                      false,
                      "TouchFloatingToolbar__Btn--qwert-collapse"
                    )}
                  </div>
                </div>
              </div>
            ) : isAlphaMode ? (
              <div className="TouchFloatingToolbar__Track TouchFloatingToolbar__Track--stacked TouchFloatingToolbar__Track--ctrl TouchFloatingToolbar__Track--alpha TouchFloatingToolbar__Track--qwert">
                <div className="TouchFloatingToolbar__Row">
                  {this.renderAlphaNumber("1")}
                  {this.renderAlphaNumber("2")}
                  {this.renderAlphaNumber("3")}
                  {this.renderAlphaNumber("4")}
                  {this.renderAlphaNumber("5")}
                  {this.renderAlphaNumber("6")}
                  {this.renderAlphaNumber("7")}
                  {this.renderAlphaNumber("8")}
                  {this.renderAlphaNumber("9")}
                  {this.renderAlphaNumber("0")}
                </div>
                <div className="TouchFloatingToolbar__Row">
                  {this.renderAlphaLetter("Q")}
                  {this.renderAlphaLetter("W")}
                  {this.renderAlphaLetter("E")}
                  {this.renderAlphaLetter("R")}
                  {this.renderAlphaLetter("T")}
                  {this.renderAlphaLetter("Y")}
                  {this.renderAlphaLetter("U")}
                  {this.renderAlphaLetter("I")}
                  {this.renderAlphaLetter("O")}
                  {this.renderAlphaLetter("P")}
                </div>
                <div className="TouchFloatingToolbar__Row">
                  <span className="TouchFloatingToolbar__Spacer--half" />
                  {this.renderAlphaLetter("A")}
                  {this.renderAlphaLetter("S")}
                  {this.renderAlphaLetter("D")}
                  {this.renderAlphaLetter("F")}
                  {this.renderAlphaLetter("G")}
                  {this.renderAlphaLetter("H")}
                  {this.renderAlphaLetter("J")}
                  {this.renderAlphaLetter("K")}
                  {this.renderAlphaLetter("L")}
                  <span className="TouchFloatingToolbar__Spacer--half" />
                </div>
                <div className="TouchFloatingToolbar__Row">
                  {this.renderShift()}
                  {this.renderAlphaLetter("Z")}
                  {this.renderAlphaLetter("X")}
                  {this.renderAlphaLetter("C")}
                  {this.renderAlphaLetter("V")}
                  {this.renderAlphaLetter("B")}
                  {this.renderAlphaLetter("N")}
                  {this.renderAlphaLetter("M")}
                  {this.renderQwertBackspace(false)}
                </div>
                <div className="TouchFloatingToolbar__Row TouchFloatingToolbar__Row--dock">
                  <div className="TouchFloatingToolbar__TypingGroup">
                    {this.renderQwertEscape(false)}
                    {this.renderQwertSpace(false)}
                    {this.renderQwertEnter(false)}
                  </div>
                  <span className="TouchFloatingToolbar__Spacer TouchFloatingToolbar__Spacer--dock-gap" />
                  <div className="TouchFloatingToolbar__DockGroup">
                    {this.renderCtrl()}
                    {this.renderReturnToNormalPad()}
                    {this.renderKeyboardToggle()}
                    {this.renderCollapseToggle(
                      false,
                      "TouchFloatingToolbar__Btn--qwert-collapse"
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="TouchFloatingToolbar__Track TouchFloatingToolbar__Track--stacked">
                <div className="TouchFloatingToolbar__Row">
                  {this.renderFontZoomIn()}
                  {this.renderFontZoomOut()}
                  {this.renderTab()}
                  {this.renderMenuToggle()}
                </div>
                <div className="TouchFloatingToolbar__Row">
                  {this.renderEscape()}
                  {this.renderHome()}
                  {this.renderArrowUp()}
                  {this.renderEnd()}
                </div>
                <div className="TouchFloatingToolbar__Row">
                  {this.renderPageUp()}
                  {this.renderArrowLeft()}
                  {this.renderSpace()}
                  {this.renderArrowRight()}
                </div>
                <div className="TouchFloatingToolbar__Row">
                  {this.renderPageDown()}
                  {this.renderBackspace()}
                  {this.renderArrowDown()}
                  {this.renderEnter()}
                </div>
                <div className="TouchFloatingToolbar__Row TouchFloatingToolbar__Row--dock">
                  <div className="TouchFloatingToolbar__DockGroup TouchFloatingToolbar__DockGroup--full">
                    {this.renderCtrl()}
                    {this.renderAlpha()}
                    {this.renderKeyboardToggle()}
                    {this.renderCollapseToggle(false)}
                  </div>
                </div>
              </div>
            )}
          </React.Fragment>
        )}
      </div>
        <TouchDebugHUD app={this.props.app} />
      </React.Fragment>
    );
  }
}

export default TouchKeyboard;
