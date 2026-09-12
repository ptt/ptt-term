import { setTimer } from './util.js';

export class MouseController {
  constructor(app) {
    this.app = app;
  }

  attachDOMListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('click', (e) => this.app.mouse_click(e), false);
      window.addEventListener('mousedown', (e) => this.app.mouse_down(e), false);
      window.addEventListener('mouseup', (e) => this.app.mouse_up(e), false);
      window.addEventListener(
        'wheel',
        (e) => this.app.mouse_scroll(e),
        { capture: true, passive: false }
      );
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('mousemove', (e) => this.app.mouse_move(e), false);
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

    if (e.button !== 0) return;

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
      const forceFocus = Boolean(app.view?.useCanvasEngine);
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
    if (app.inputInterceptors?.dispatchMouseDown(e)) {
      return;
    }
    //0=left button, 1=middle button, 2=right button
    if (e.button === 0) {
      if (!app.isSelectionCollapsed()) app.skipMouseClick = true;
    } else if (e.button == 2) {
      const colRow = app.view?.snapshotDomSelection?.();
      if (colRow) {
        app.lastSelection = colRow;
      }
    }
  }

  onMouseUp(e) {
    const app = this.app;
    if (
      app.modalShown ||
      app.contextMenuShown ||
      app.isDialogOrExcludedTarget(e)
    )
      return;
    app.inputInterceptors?.dispatchMouseUp(e);
    //0=left button, 1=middle button, 2=right button
    if (e.button === 0) {
      const forceFocus = Boolean(app.view?.useCanvasEngine);
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

    const interceptorHandled = app.inputInterceptors?.dispatchWheel(e);
    if (interceptorHandled) {
      e.stopPropagation();
      e.preventDefault();
    }
  }
}
