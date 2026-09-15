import { setTimer } from './util.js';
import { normalizeMouseButtonAction } from './pref.js';

export function isDiscreteMouseWheelEvent(e) {
  if (!e) return false;
  if (e.deltaMode === 1 || e.deltaMode === 2) {
    return true;
  }
  const absY = Math.abs(e.deltaY || 0);
  const absX = Math.abs(e.deltaX || 0);
  if (absX > 0 && absY > 0) {
    return false;
  }
  if (typeof e.wheelDeltaY === 'number' && e.wheelDeltaY !== 0) {
    const absWheelDeltaY = Math.abs(e.wheelDeltaY);
    return absWheelDeltaY >= 120 && absWheelDeltaY % 120 === 0;
  }
  return absY >= 100;
}

export function isHorizontalWheelEvent(e, dominance = 1.5) {
  if (!e) return false;
  let dx = Math.abs(Number(e.deltaX) || 0);
  let dy = Math.abs(Number(e.deltaY) || 0);
  const mode = Number(e.deltaMode) || 0;
  if (mode === 1) {
    dx *= 16;
    dy *= 16;
  } else if (mode === 2) {
    dx *= 800;
    dy *= 800;
  }
  return dx > 0 && dx > dominance * dy;
}

export class MouseController {
  constructor(app, options = {}) {
    this.app = app;
    this.leftButtonDown = false;
    this.rightButtonDown = false;
    this._wheelClickResetTimer = null;
    this.wheelDeltaYAccum = 0;
    this.lastWheelEventTime = 0;
    this.lastWheelCmdTime = 0;
    this._lastWheelGestureEventTime = 0;
    this._lastWheelDirection = null;
    this._gestureHasDispatchedCmd = false;
    this._domListenersAttached = false;
    if (options.attachDOM !== false) {
      this.attachDOMListeners();
    }
  }

  attachDOMListeners() {
    if (this._domListenersAttached) return;
    this._domListenersAttached = true;
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('click', (e) => this.onClick(e), false);
      window.addEventListener('mousedown', (e) => this.onMouseDown(e), false);
      window.addEventListener('mouseup', (e) => this.onMouseUp(e), false);
      window.addEventListener(
        'contextmenu',
        () => {
          this.rightButtonDown = false;
        },
        true
      );
      window.addEventListener('blur', () => this.resetButtonState(), false);
      window.addEventListener(
        'wheel',
        (e) => this.onWheel(e),
        { capture: true, passive: false }
      );
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('mousemove', (e) => this.onMouseMove(e), false);
    }
  }

  resetButtonState() {
    this.leftButtonDown = false;
    this.rightButtonDown = false;
    this.wheelDeltaYAccum = 0;
    this._lastWheelGestureEventTime = 0;
    this._lastWheelDirection = null;
    this._gestureHasDispatchedCmd = false;
    if (this._wheelClickResetTimer) {
      this._wheelClickResetTimer.cancel();
      this._wheelClickResetTimer = null;
    }
  }

  isDialogOrExcludedTarget(e) {
    if (!e || !e.target) return false;
    if (typeof e.target.closest === 'function') {
      if (
        e.target.closest('dialog') ||
        e.target.closest('.nomouse_command') ||
        e.target.closest('.modal-dialog') ||
        e.target.closest('.modal-content')
      ) {
        return true;
      }
    }
    const cn = e.target.className;
    const cnStr =
      typeof cn === 'string'
        ? cn
        : typeof cn?.baseVal === 'string'
          ? cn.baseVal
          : '';
    if (cnStr.indexOf('nomouse_command') >= 0) {
      return true;
    }
    if (
      e.target.tagName &&
      String(e.target.tagName).toLowerCase().indexOf('menuitem') >= 0
    ) {
      return true;
    }
    return false;
  }

  dispatchClick(e, force = false) {
    const app = this.app;
    if (!app.conn || !app.conn.isConnected) return false;

    if (force && e && typeof e === 'object') {
      e.force = true;
    }
    const clickEvent = { event: e, force, handled: false };
    app.emit('term:click', clickEvent);
    if (app.inputInterceptors?.dispatchMouseClick(e)) {
      return true;
    }
    return Boolean(clickEvent.handled);
  }

  dispatchMove(cX, cY, refresh = false, force = false, options = {}) {
    const app = this.app;
    const eventName = force ? 'term:mouse-move:force' : 'term:mouse-move';
    if (
      !app.listenerCount(eventName) &&
      !app.listenerCount('term:mouse-move')
    )
      return;
    const pos = app.clientToPos(cX, cY);
    const payload = {
      col: pos.col,
      row: pos.row,
      clientX: cX,
      clientY: cY,
      refresh,
      force,
      highlight: options?.highlight,
    };
    if (force && app.listenerCount('term:mouse-move:force')) {
      app.emit('term:mouse-move:force', payload);
    } else {
      app.emit('term:mouse-move', payload);
    }
  }

  executeMouseButtonAction(rawAction, buttonType = 'left') {
    const app = this.app;
    if (!app) return false;
    const action = normalizeMouseButtonAction(rawAction, buttonType);
    switch (action) {
      case 'paste':
        app.doPaste?.();
        return true;
      case 'enter':
        app.setNavCmd('doEnter');
        return true;
      case 'left':
        app.setNavCmd('doLeft');
        return true;
      case 'right':
        app.setNavCmd('doRight');
        return true;
      case 'up':
        app.setNavCmd('doArrowUp');
        return true;
      case 'down':
        app.setNavCmd('doArrowDown');
        return true;
      case 'pageup':
        app.setNavCmd('doPageUp');
        return true;
      case 'pagedown':
        app.setNavCmd('doPageDown');
        return true;
      case 'esc':
        app.setNavCmd('doEsc');
        return true;
      case 'none':
      case 'menu':
      default:
        return false;
    }
  }

  onClick(e) {
    const app = this.app;
    if (
      app.modalShown ||
      app.contextMenuShown ||
      app.isDialogOrExcludedTarget(e)
    )
      return;
    const skipMouseClick = app.skipMouseClick;
    app.skipMouseClick = false;

    if (e.button !== 0 || e.ctrlKey) return;

    if (app.view?.clearDomSelectionIfCollapsed?.()) {
      app.lastSelection = null;
    }
    const a = e.target && e.target.closest('a');
    if (a) {
      if (app.site.handleCustomLink(a.href, app)) {
        e.preventDefault();
      }
      return;
    }
    if (app.isSelectionCollapsed()) {
      //no anything be select
      const forceFocus = Boolean(
        app.view?.useCanvasEngine && !app.hasActiveInputInterceptor?.()
      );
      if (
        !skipMouseClick &&
        app.site.handlePassScreenClick(app.buf, app.conn)
      ) {
        e.preventDefault();
        app.setInputAreaFocus(forceFocus);
        return;
      }
      if (!skipMouseClick && app.buf?.locator?.isActive?.()) {
        const pos = app.clientToPos(e.clientX, e.clientY);
        const report = app.buf.locator.handleMouseClick(e, pos);
        if (report) {
          app.send(report);
          e.preventDefault();
          app.setInputAreaFocus(forceFocus);
          return;
        }
      }
      if (skipMouseClick) {
        app.onMouse_move(e.clientX, e.clientY, true);
      } else if (app.onMouse_click(e)) {
        e.preventDefault();
        app.setInputAreaFocus(forceFocus);
      } else if (this.executeMouseButtonAction(app.mouseLeftFunction, 'left')) {
        e.preventDefault();
        app.setInputAreaFocus(forceFocus);
      }
    }
  }

  onMouseDown(e) {
    const app = this.app;
    if (
      app.modalShown ||
      app.contextMenuShown ||
      app.isDialogOrExcludedTarget(e)
    )
      return;
    const isRightClick = e.button === 2 || (e.button === 0 && e.ctrlKey);
    if (e.button === 0 && !e.ctrlKey) {
      this.leftButtonDown = true;
    } else if (isRightClick) {
      this.rightButtonDown = true;
    }
    if (app.inputInterceptors?.dispatchMouseDown(e)) {
      return;
    }
    //0=left button, 1=middle button, 2=right button
    if (e.button === 0 && !e.ctrlKey) {
      if (!app.isSelectionCollapsed()) app.skipMouseClick = true;
    } else if (e.button === 1) {
      if (e.target && typeof e.target.closest === 'function' && e.target.closest('a')) {
        return;
      }
      if (this.executeMouseButtonAction(app.mouseMiddleFunction, 'middle')) {
        e.preventDefault?.();
        return;
      }
    } else if (isRightClick) {
      const colRow = app.view?.snapshotDomSelection?.();
      if (colRow) {
        app.lastSelection = colRow;
      }
    }
  }

  onMouseUp(e) {
    const app = this.app;
    const isRightClick = e.button === 2 || (e.button === 0 && e.ctrlKey);
    if (e.button === 0 && !e.ctrlKey) {
      this.leftButtonDown = false;
      if (this._wheelClickResetTimer) {
        this._wheelClickResetTimer.cancel();
      }
      this._wheelClickResetTimer = setTimer(
        false,
        () => {
          this._wheelClickResetTimer = null;
          if (this.app) this.app.skipMouseClick = false;
        },
        100
      );
    } else if (isRightClick) {
      this.rightButtonDown = false;
    }
    if (
      app.modalShown ||
      app.contextMenuShown ||
      app.isDialogOrExcludedTarget(e)
    )
      return;
    app.inputInterceptors?.dispatchMouseUp(e);
    //0=left button, 1=middle button, 2=right button
    if (e.button === 0 && !e.ctrlKey) {
      if (app.view?.clearDomSelectionIfCollapsed?.()) {
        app.lastSelection = null;
      }
      const forceFocus = Boolean(
        app.view?.useCanvasEngine && !app.hasActiveInputInterceptor?.()
      );
      if (app.isSelectionCollapsed()) {
        //no anything be select
        app.setInputAreaFocus(forceFocus);
        e.preventDefault();
      } else {
        //something has be select
        if (
          app.copyOnSelect &&
          (app.hasActiveInputInterceptor() ||
            !app.view ||
            !app.view.useCanvasEngine)
        ) {
          app.doCopy(
            app.view
              ? app.view.getSelectedText()
              : typeof window !== 'undefined' && window.getSelection
                ? window
                    .getSelection()
                    .toString()
                    .replace(/\u00a0/g, ' ')
                : ''
          );
        }
        if (app.inputAreaFocusTimer) {
          app.inputAreaFocusTimer.cancel();
        }
        app.inputAreaFocusTimer = setTimer(
          false,
          () => {
            app.inputAreaFocusTimer = null;
            if (!app.contextMenuShown && app.isSelectionCollapsed())
              app.setInputAreaFocus(forceFocus);
          },
          10
        );
      }
    } else if (e.button == 2) {
      // right button: do not preventDefault so contextmenu can open
    } else {
      app.setInputAreaFocus();
      e.preventDefault();
    }
  }

  onMouseMove(e) {
    const app = this.app;
    if (typeof e.buttons === 'number') {
      if ((e.buttons & 1) === 0) this.leftButtonDown = false;
      if ((e.buttons & 2) === 0) this.rightButtonDown = false;
    }
    if (
      app.modalShown ||
      app.contextMenuShown ||
      app.isDialogOrExcludedTarget(e)
    )
      return;
    if (app.buf?.locator?.isActive?.()) {
      if (app.view?.setCursor) {
        app.view.setCursor('default');
      } else if (app.termWin?.style) {
        app.termWin.style.cursor = 'default';
      }
      if (app.buf.locator.requiresMotionReports?.()) {
        const pos = app.clientToPos(e.clientX, e.clientY);
        const report = app.buf.locator.handleMouseMove(e, pos);
        if (report) {
          app.send(report);
        }
      }
      return;
    }
    app.onMouse_move(e.clientX, e.clientY);
  }

  onWheel(e) {
    const app = this.app;
    if (app.modalShown || app.isDialogOrExcludedTarget(e)) return;

    if (app.buf?.locator?.isActive?.()) {
      const pos = app.clientToPos(e.clientX, e.clientY);
      const report = app.buf.locator.handleWheel(e, pos);
      if (report) {
        app.send(report);
        e.stopPropagation();
        e.preventDefault();
        return;
      }
    }

    if (isHorizontalWheelEvent(e)) {
      return;
    }

    const interceptorHandled = app.inputInterceptors?.dispatchWheel(e);
    if (interceptorHandled) {
      if (interceptorHandled === 'suppress') {
        e.stopPropagation?.();
        e.preventDefault?.();
      }
      return;
    }

    this.handleWheelAction(e);
  }

  handleFallbackWheel(e) {
    return this.handleWheelAction(e);
  }

  isTrackpadEvent(e) {
    if (!e) return false;
    const now = Date.now();
    if (this._lastWheelInputTime && now - this._lastWheelInputTime > 180) {
      this._isTrackpadStream = false;
    }
    this._lastWheelInputTime = now;

    if (!isDiscreteMouseWheelEvent(e)) {
      this._isTrackpadStream = true;
    } else if (e.deltaMode === 1 || e.deltaMode === 2) {
      this._isTrackpadStream = false;
    }

    return Boolean(this._isTrackpadStream);
  }

  handleWheelAction(e) {
    const app = this.app;
    if (!app || !e) return false;
    if (isHorizontalWheelEvent(e)) return false;

    if (app.contextMenuShown) {
      this.rightButtonDown = false;
    }

    const isRightButton = this.rightButtonDown || Boolean(e.buttons & 2);
    const isLeftButton =
      !isRightButton && (this.leftButtonDown || Boolean(e.buttons & 1));

    const actionPref = isRightButton
      ? app.mouseWheelRightAction || 'page'
      : isLeftButton
        ? app.mouseWheelLeftAction || 'none'
        : app.mouseWheelAction || 'arrow-1';

    if (actionPref === 'none') return false;

    if (isRightButton) {
      app.preventContextMenuOnMouseUp = true;
    }
    if (isLeftButton) {
      app.skipMouseClick = true;
    }

    const isTrackpad =
      Boolean(app.mouseWheelTrackpadMode) && this.isTrackpadEvent(e);
    const now = Date.now();
    const rawDirection = e.deltaY < 0 ? 'up' : e.deltaY > 0 ? 'down' : null;
    if (rawDirection) {
      const isNewGesture =
        !this._lastWheelGestureEventTime ||
        now - this._lastWheelGestureEventTime >= 350 ||
        this._lastWheelDirection !== rawDirection;
      if (isNewGesture) {
        this._gestureHasDispatchedCmd = false;
      }
      this._lastWheelGestureEventTime = now;
      this._lastWheelDirection = rawDirection;
    }

    // Physical Mouse Wheel: 1 wheel notch = 1 immediate action without pixel remainder accumulation
    if (!isTrackpad) {
      this.wheelDeltaYAccum = 0;
      if (!e.deltaY) return false;
      const isScrollUp = e.deltaY < 0;
      const direction = isScrollUp ? 'up' : 'down';

      if (actionPref === 'page') {
        this._dispatchWheelNav(
          isScrollUp ? 'doPageUp' : 'doPageDown',
          1,
          direction,
          now
        );
      } else if (actionPref.startsWith('arrow')) {
        const lines = parseInt(actionPref.split('-')[1], 10) || 1;
        const cmd = isScrollUp ? 'doArrowUp' : 'doArrowDown';
        this._dispatchWheelNav(cmd, lines, direction, now);
      }
      this.lastWheelCmdTime = now;
      e.stopPropagation?.();
      e.preventDefault?.();
      return true;
    }

    // Trackpad / Smooth Continuous Scroll: accumulate pixel deltas proportionally
    let deltaY = e.deltaY;
    if (e.deltaMode === 1) {
      deltaY *= 40;
    } else if (e.deltaMode === 2) {
      deltaY *= 400;
    }

    if (this.lastWheelEventTime && now - this.lastWheelEventTime > 250) {
      this.wheelDeltaYAccum = 0;
    }
    if (
      (this.wheelDeltaYAccum > 0 && deltaY < 0) ||
      (this.wheelDeltaYAccum < 0 && deltaY > 0)
    ) {
      this.wheelDeltaYAccum = 0;
    }

    this.lastWheelEventTime = now;
    this.wheelDeltaYAccum = (this.wheelDeltaYAccum || 0) + deltaY;

    const STEP = 35;
    if (Math.abs(this.wheelDeltaYAccum) < STEP) {
      e.stopPropagation?.();
      e.preventDefault?.();
      return true;
    }

    const isScrollUp = this.wheelDeltaYAccum < 0;
    const direction = isScrollUp ? 'up' : 'down';

    if (actionPref === 'page') {
      if (this.lastWheelCmdTime && now - this.lastWheelCmdTime < 120) {
        this.wheelDeltaYAccum = 0;
        e.stopPropagation?.();
        e.preventDefault?.();
        return true;
      }
      this.wheelDeltaYAccum = 0;
      this.lastWheelCmdTime = now;
      this._dispatchWheelNav(
        isScrollUp ? 'doPageUp' : 'doPageDown',
        1,
        direction,
        now
      );
    } else if (actionPref.startsWith('arrow')) {
      const lines = parseInt(actionPref.split('-')[1], 10) || 1;
      const cmd = isScrollUp ? 'doArrowUp' : 'doArrowDown';
      const steps = Math.max(
        1,
        Math.min(3, Math.floor(Math.abs(this.wheelDeltaYAccum) / STEP))
      );
      this.wheelDeltaYAccum -= isScrollUp ? -(steps * STEP) : steps * STEP;
      this.lastWheelCmdTime = now;
      this._dispatchWheelNav(cmd, steps * lines, direction, now);
    }

    e.stopPropagation?.();
    e.preventDefault?.();
    return true;
  }

  _dispatchWheelNav(cmd, count, direction, now) {
    const app = this.app;
    if (!app || count <= 0) return;

    const isContinuous = Boolean(this._gestureHasDispatchedCmd);
    this._gestureHasDispatchedCmd = true;

    let finalCmd = cmd;
    let finalCount = count;

    if (
      !app.inputInterceptors?.isActive?.() &&
      typeof app.site?.filterWheelScroll === 'function'
    ) {
      const filterRes = app.site.filterWheelScroll(app.buf, {
        direction,
        isContinuous,
        cmd,
        count,
        now,
      });
      if (filterRes) {
        if (filterRes.prevent) {
          finalCount = 0;
        } else {
          if (typeof filterRes.maxSteps === 'number') {
            finalCount = Math.min(finalCount, filterRes.maxSteps);
          }
          if (filterRes.overrideCmd) {
            finalCmd = filterRes.overrideCmd;
          }
        }
      }
    }

    for (let i = 0; i < finalCount; i++) {
      app.setNavCmd(finalCmd, {
        source: 'wheel',
        direction,
        isContinuous: i > 0 ? true : isContinuous,
      });
    }
  }
}
