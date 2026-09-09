import cx from "classnames";
import React from "react";
import { i18n } from "../../js/i18n";
import { readValuesWithDefault, writeValues } from "../../js/pref";
import { TouchKeyboard } from "../../touch/TouchKeyboard";
import DropdownMenu from "./DropdownMenu";
import InputHelperModal from "./InputHelperModal";
import PrefModal from "./PrefModal";

const EVENT_KEY_BY_HOT_KEY = {
  c: "copy",
  e: "copyLinkUrl",
  p: "paste",
  s: "searchGoogle",
  t: "openUrlNewTab",
};

const menuHandlerByEventKey = {
  copy: (app, { selectedText }) => app.doCopy(selectedText),
  copyAnsi: (app) => app.doCopyAnsi(),
  paste: (app) => app.doPaste(),
  searchGoogle: (app, { selectedText }) => app.doSearchGoogle(selectedText),
  openUrlNewTab: (app, { aElement }) => app.doOpenUrlNewTab(aElement),
  copyLinkUrl: (app, { contextOnUrl }) => app.doCopy(contextOnUrl),
  selectAll: (app) => app.doSelectAll(),
  mouseBrowsing: (app) => app.switchMouseBrowsing(),
};

const onPrefSaveImpl = (app, values) => {
  app.onValuesPrefChange(values);
  app.modalShown = false;
  app.setInputAreaFocus();
  app.switchToEasyReadingMode(app.view.useEasyReadingMode);

  return {
    showsSettings: false,
  };
};

const initialState = {
  // --- Menu state ---
  open: false,
  pageX: 0,
  pageY: 0,
  anchorRect: null,
  contextOnUrl: "",
  aElement: undefined,
  selectedText: "",
  urlEnabled: false,
  normalEnabled: false,
  selEnabled: false,
  // --- Modal state ---
  showsInputHelper: false,
  showsSettings: false,
};

export class ContextMenu extends React.Component {
  _isMounted = false;

  state = {
    ...initialState,
    isTouchDevice: false,
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

  componentDidMount() {
    this._isMounted = true;
    const { app } = this.props;

    if (app) {
      app.openContextMenu = (x, y) => {
        if (!this.isInstanceActive()) return;
        this.showMenuAt(x, y);
      };
    }

    this.contextMenuHandler = (event) => {
      if (!this.isInstanceActive()) {
        const termWindow = document.getElementById("TermWindow");
        if (termWindow) {
          termWindow.removeEventListener(
            "contextmenu",
            this.contextMenuHandler,
            true
          );
        }
        return;
      }
      this.handleContextMenu(event);
    };
    const termWindow = document.getElementById("TermWindow");
    if (termWindow) {
      termWindow.addEventListener("contextmenu", this.contextMenuHandler, true);
    }

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

    this.clickHandler = (event) => {
      if (!this.isInstanceActive()) {
        window.removeEventListener("click", this.clickHandler, false);
        return;
      }
      if (
        event &&
        event.target &&
        event.target.closest &&
        (event.target.closest('[role="menuitem"]') ||
          event.target.closest(".dropdown-menu") ||
          event.target.closest(".modal-dialog") ||
          event.target.closest(".TouchFloatingToolbar"))
      ) {
        return;
      }
      this.handleHide();
    };
    window.addEventListener("click", this.clickHandler, false);

    this.touchStartHandler = (event) => {
      if (!this.isInstanceActive()) {
        window.removeEventListener("touchstart", this.touchStartHandler, false);
        return;
      }
      if (
        event &&
        event.target &&
        event.target.closest &&
        (event.target.closest('[role="menuitem"]') ||
          event.target.closest(".dropdown-menu") ||
          event.target.closest(".modal-dialog") ||
          event.target.closest(".TouchFloatingToolbar"))
      ) {
        return;
      }
      this.handleHide();
    };
    window.addEventListener("touchstart", this.touchStartHandler, false);

    this.hotKeyUpHandler = (event) => {
      if (!this.isInstanceActive()) {
        window.removeEventListener("keyup", this.hotKeyUpHandler, false);
        return;
      }
      if (!this.state.open) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.altKey || event.ctrlKey || event.shiftKey) {
        return;
      }
      const key = (event.key || "").toLowerCase();
      const eventKey = EVENT_KEY_BY_HOT_KEY[key];
      if (eventKey) {
        this.handleMenuSelect(eventKey, event);
      }
    };
    window.addEventListener("keyup", this.hotKeyUpHandler, false);
  }

  componentWillUnmount() {
    this._isMounted = false;
    const { app } = this.props;
    if (app && app.openContextMenu) {
      app.openContextMenu = null;
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
    window.removeEventListener("keyup", this.hotKeyUpHandler, false);
    window.removeEventListener("touchstart", this.touchStartHandler, false);
    window.removeEventListener("click", this.clickHandler, false);
    const termWindow = document.getElementById("TermWindow");
    if (termWindow) {
      termWindow.removeEventListener(
        "contextmenu",
        this.contextMenuHandler,
        true
      );
    }
  }

  handleFloatingMenuToggle = (event, targetEl) => {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    if (Date.now() < (this._suppressMenuToggleUntil || 0)) {
      return;
    }
    this._suppressMenuToggleUntil = Date.now() + 350;
    if (this.state.open) {
      this.handleHide();
      return;
    }

    const { app } = this.props;
    if (app.inputAreaFocusTimer) {
      app.inputAreaFocusTimer.cancel();
      app.inputAreaFocusTimer = null;
    }
    app.contextMenuShown = true;

    const selColRow = app.view.getSelectionColRow();
    app.lastSelection = selColRow || null;

    let selectedText = app.view.getSelectedText();
    if (!selectedText && !window.getSelection().isCollapsed) {
      selectedText = window
        .getSelection()
        .toString()
        .replace(/\u00a0/g, " ");
    }
    const urlEnabled = false;
    const normalEnabled = !selectedText;
    const selEnabled = !!selectedText;

    const target =
      targetEl ||
      event?.currentTarget ||
      event?.target?.closest?.("button") ||
      event?.target ||
      (typeof document !== "undefined"
        ? document.querySelector?.(
            ".TouchFloatingToolbar [aria-label='Menu & Settings']"
          ) ||
          document.querySelector?.(".TouchFloatingToolbar__Btn--system") ||
          document.querySelector?.(".TouchFloatingToolbar")
        : null);

    const rect =
      target?.getBoundingClientRect?.() || {
        left:
          (typeof window !== "undefined" ? window.innerWidth : 800) - 50,
        right:
          (typeof window !== "undefined" ? window.innerWidth : 800) - 10,
        top:
          (typeof window !== "undefined" ? window.innerHeight : 600) - 50,
        bottom:
          (typeof window !== "undefined" ? window.innerHeight : 600) - 10,
        width: 40,
        height: 40,
      };

    const pageX = Math.min(
      rect.right,
      (typeof window !== "undefined" ? window.innerWidth : 800) - 8
    );
    const pageY = rect.top - 4;

    this._menuOpenedAt = Date.now();
    this.setState({
      open: true,
      pageX,
      pageY,
      anchorRect: rect,
      contextOnUrl: "",
      aElement: null,
      selectedText,
      urlEnabled,
      normalEnabled,
      selEnabled,
    });
  };

  handleContextMenu = (event) => {
    event.stopPropagation();
    event.preventDefault();
    if (
      event.pointerType === "touch" ||
      (this.checkTouchDevice() && event.button === 0) ||
      (this.props.app &&
        this.props.app.touch &&
        this.props.app.touch.lastTouchTime &&
        Date.now() - this.props.app.touch.lastTouchTime < 1000)
    ) {
      return;
    }
    this.showMenuAt(event.pageX, event.pageY, event.target);
  };

  showMenuAt = (pageX, pageY, targetEl) => {
    const { app } = this.props;
    if (app.preventContextMenuOnMouseUp) {
      app.preventContextMenuOnMouseUp = false;
      return;
    }
    if (app.inputAreaFocusTimer) {
      app.inputAreaFocusTimer.cancel();
      app.inputAreaFocusTimer = null;
    }
    app.contextMenuShown = true;
    const selColRow = app.view.getSelectionColRow();
    app.lastSelection = selColRow || null;

    const aElement = targetEl ? targetEl.closest("a") : null;
    const contextOnUrl = aElement ? aElement.getAttribute("href") || "" : "";

    let selectedText = app.view.getSelectedText();
    if (!selectedText && !window.getSelection().isCollapsed) {
      selectedText = window
        .getSelection()
        .toString()
        .replace(/\u00a0/g, " ");
    }
    const urlEnabled = !!contextOnUrl;
    const normalEnabled = !urlEnabled && !selectedText;
    const selEnabled = !normalEnabled;

    this._menuOpenedAt = Date.now();
    this.setState({
      open: true,
      pageX,
      pageY,
      anchorRect: null,
      contextOnUrl,
      aElement,
      selectedText,
      urlEnabled,
      normalEnabled,
      selEnabled,
    });
  };

  handleHide = () => {
    if (this.state.open) {
      const { app } = this.props;
      app.contextMenuShown = false;
      if (!app.view.isEasyReadingActive()) {
        app.setInputAreaFocus();
      }
      this.setState(initialState);
    }
  };

  handleMenuSelect = (eventKey, event) => {
    if (Date.now() < (this._menuOpenedAt || 0) + 350) {
      event?.stopPropagation?.();
      event?.preventDefault?.();
      return;
    }
    const { app } = this.props;
    menuHandlerByEventKey[eventKey](app, this.state);
    event?.stopPropagation?.();
    app.contextMenuShown = false;
    if (!app.view.isEasyReadingActive()) {
      app.setInputAreaFocus();
    }
    this.setState(initialState);
  };

  handleInputHelperClick = (event) => {
    event.stopPropagation();
    this.props.app.contextMenuShown = false;
    this.setState({
      ...initialState,
      showsInputHelper: true,
    });
  };

  handleLiveArticleHelperClick = (event) => {
    if (event) {
      event.stopPropagation();
    }
    const { app } = this.props;
    if (app) {
      app.contextMenuShown = false;
    }
    this.setState({
      ...initialState,
    });
    const liveUpdatePlugin = app?.liveUpdate || app?.getPlugin?.("live_update");
    liveUpdatePlugin?.showModal?.(true);
  };
  handleLiveHelperClick = this.handleLiveArticleHelperClick;

  handleSettingsClick = (event) => {
    event.stopPropagation();
    const { app } = this.props;
    app.contextMenuShown = false;
    app.modalShown = true;
    this.setState({
      ...initialState,
      showsSettings: true,
    });
  };

  handleInputHelperHide = () => {
    this.setState({ showsInputHelper: false });
  };

  handleInputHelperReset = () => {
    const resetCmd = this.props.app.site.getEditorColorResetCommand();
    this.props.app.send(resetCmd);
  };

  handleInputHelperCmdSend = (cmd) => {
    const { app } = this.props;
    const sel = app.view.getSelectionColRow();
    if (sel && app.buf.pageState == 6) {
      const resetCmd = app.site.getEditorColorResetCommand();
      let y = app.buf.cur_y;
      let selCmd = "";
      selCmd += "\x1b[H";
      if (y > sel.end.row) {
        selCmd += "\x1b[A".repeat(y - sel.end.row);
      } else if (y < sel.end.row) {
        selCmd += "\x1b[B".repeat(sel.end.row - y);
      }
      let x = app.buf.cur_x;
      if (x > sel.end.col) {
        selCmd += "\x1b[D".repeat(x - sel.end.col);
      } else if (x < sel.end.col) {
        selCmd += "\x1b[C".repeat(sel.end.col - x);
      }
      app.send(cmd + resetCmd + selCmd);
    } else {
      app.send(cmd);
    }
  };

  handleInputHelperConvSend = (str) => {
    const { app } = this.props;
    app.send(str);
  };

  handlePrefSave = (values) => {
    const { app } = this.props;
    const nextState = onPrefSaveImpl(app, values);
    this.setState(nextState);
  };

  handlePrefReset = (values) => {
    const { app } = this.props;
    app.onValuesPrefChange(values);
    app.view.redraw(true);
    app.switchToEasyReadingMode(app.view.useEasyReadingMode);
  };

  render() {
    const {
      open,
      pageX,
      pageY,
      urlEnabled,
      normalEnabled,
      selEnabled,
      selectedText,
      showsInputHelper,
      showsSettings,
      isTouchDevice,
    } = this.state;
    const { app } = this.props;
    const anyModalShown = showsInputHelper || showsSettings;
    const liveUpdatePlugin = app?.liveUpdate || app?.getPlugin?.("live_update");
    const liveHelperEnabled = Boolean(
      liveUpdatePlugin ? liveUpdatePlugin.enabled : false
    );
    const inputHelperPlugin = app?.inputHelper || app?.getPlugin?.("input_helper");
    const inputHelperEnabled = Boolean(
      inputHelperPlugin ? inputHelperPlugin.enabled : true
    );

    return (
      <React.Fragment>
        <TouchKeyboard
          app={app}
          onMenuToggle={this.handleFloatingMenuToggle}
          anyModalShown={anyModalShown}
        />
        <div className={cx({ open })}>
          <DropdownMenu
            open={open}
            pageX={pageX}
            pageY={pageY}
            anchorRect={this.state.anchorRect}
            urlEnabled={urlEnabled}
            normalEnabled={normalEnabled}
            selEnabled={selEnabled}
            mouseBrowsingEnabled={
              Boolean(app?.getPlugin?.("mouse_browsing")?.enabled ?? (app && app.buf ? app.buf.useMouseBrowsing : false))
            }
            inputHelperEnabled={inputHelperEnabled}
            liveHelperEnabled={liveHelperEnabled}
            selectedText={selectedText}
            onMenuSelect={this.handleMenuSelect}
            onInputHelperClick={this.handleInputHelperClick}
            onLiveArticleHelperClick={this.handleLiveArticleHelperClick}
            onLiveHelperClick={this.handleLiveArticleHelperClick}
            onSettingsClick={this.handleSettingsClick}
          />
        </div>
        <InputHelperModal
          show={showsInputHelper}
          site={app ? app.site : null}
          onHide={this.handleInputHelperHide}
          onReset={this.handleInputHelperReset}
          onCmdSend={this.handleInputHelperCmdSend}
          onConvSend={this.handleInputHelperConvSend}
        />
        <PrefModal
          app={app}
          show={showsSettings}
          isTouch={isTouchDevice}
          onSave={this.handlePrefSave}
          onReset={this.handlePrefReset}
        />
      </React.Fragment>
    );
  }
}

export default ContextMenu;
