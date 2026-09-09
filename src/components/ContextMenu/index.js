import cx from "classnames";
import React from "react";
import { _ } from "../../js/i18n";
import { readValuesWithDefault, writeValues } from "../../js/pref";
import DropdownMenu from "./DropdownMenu";
import PrefModal from "../Settings/PrefModal";

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
  app.switchToEasyReadingMode(values?.enableEasyReading ?? app.prefValues?.enableEasyReading);

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
  showsSettings: false,
};

export class ContextMenu extends React.Component {
  static _registeredItems = [];

  static registerItem(item) {
    if (!item || !item.id) return;
    const idx = ContextMenu._registeredItems.findIndex((i) => i.id === item.id);
    if (idx !== -1) {
      ContextMenu._registeredItems[idx] = item;
    } else {
      ContextMenu._registeredItems.push(item);
    }
  }

  static unregisterItem(idOrItem) {
    const id = typeof idOrItem === "string" ? idOrItem : idOrItem?.id;
    const idx = ContextMenu._registeredItems.findIndex((i) => i.id === id);
    if (idx !== -1) {
      ContextMenu._registeredItems.splice(idx, 1);
    }
  }

  static getRegisteredItems() {
    return [...ContextMenu._registeredItems];
  }

  getRegisteredItems() {
    const staticItems = ContextMenu.getRegisteredItems();
    const appItems = this.props.app?.getContextMenuItems?.() || [];
    const itemMap = new Map();
    for (const item of staticItems) {
      itemMap.set(item.id, item);
    }
    for (const item of appItems) {
      itemMap.set(item.id, item);
    }
    return Array.from(itemMap.values()).sort(
      (a, b) => (a.order ?? 100) - (b.order ?? 100)
    );
  }

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
      app.handleFloatingMenuToggle = this.handleFloatingMenuToggle;
      this._onContextMenuUpdate = () => {
        if (this.isInstanceActive()) {
          this.forceUpdate();
        }
      };
      app.addEventListener?.(
        "term:context-menu:update",
        this._onContextMenuUpdate
      );
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
    if (app && app.handleFloatingMenuToggle === this.handleFloatingMenuToggle) {
      app.handleFloatingMenuToggle = null;
    }
    if (app && this._onContextMenuUpdate) {
      app.removeEventListener?.(
        "term:context-menu:update",
        this._onContextMenuUpdate
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
    const { app } = this.props;
    if (app && app.rightClickAction === "paste" && !event.shiftKey) {
      app.doPaste();
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
      if (!app.hasActiveInputInterceptor?.()) {
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
    menuHandlerByEventKey[eventKey]?.(app, this.state);
    event?.stopPropagation?.();
    app.contextMenuShown = false;
    if (!app.hasActiveInputInterceptor?.()) {
      app.setInputAreaFocus();
    }
    this.setState(initialState);
  };

  handleInputHelperClick = (event) => {
    if (event) {
      event.stopPropagation();
    }
    this.handleHide();
    const registered = this.getRegisteredItems().find(
      (item) => item.id === "input_helper"
    );
    if (registered && typeof registered.onClick === "function") {
      registered.onClick(this.props.app, {
        closeMenu: () => this.handleHide(),
        event,
        state: this.state,
      });
    }
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
    const registered = this.getRegisteredItems().find(
      (item) => item.id === "live_update"
    );
    if (registered && typeof registered.onClick === "function") {
      registered.onClick(app, {
        closeMenu: () => this.handleHide(),
        event,
        state: this.state,
      });
    }
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

  handlePrefSave = (values) => {
    const { app } = this.props;
    const nextState = onPrefSaveImpl(app, values);
    this.setState(nextState);
  };

  handlePrefReset = (values) => {
    const { app } = this.props;
    app.onValuesPrefChange(values);
    app.view.redraw(true);
    app.switchToEasyReadingMode(values?.enableEasyReading ?? app.prefValues?.enableEasyReading);
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
      showsSettings,
      isTouchDevice,
    } = this.state;
    const { app } = this.props;
    const anyModalShown = Boolean(showsSettings || app?.modalShown);

    const registeredItems = this.getRegisteredItems();
    const menuContext = {
      open,
      pageX,
      pageY,
      urlEnabled,
      normalEnabled,
      selEnabled,
      selectedText,
      contextOnUrl: this.state.contextOnUrl,
      isTouchDevice,
    };

    const pluginItems = [];
    for (const item of registeredItems) {
      const isVisible =
        typeof item.visible === "function"
          ? item.visible(app, menuContext)
          : item.visible !== undefined
          ? Boolean(item.visible)
          : normalEnabled;
      if (!isVisible) continue;

      const isChecked =
        typeof item.checked === "function"
          ? item.checked(app, menuContext)
          : Boolean(item.checked);

      const isEnabled =
        typeof item.enabled === "function"
          ? item.enabled(app, menuContext)
          : item.enabled !== undefined
          ? Boolean(item.enabled)
          : true;

      const label =
        typeof item.label === "function"
          ? item.label(app)
          : item.label || item.id;

      pluginItems.push({
        id: item.id,
        label,
        checked: isChecked,
        enabled: isEnabled,
        order: item.order ?? 100,
        onClick: (event) => {
          if (event) event.stopPropagation();
          this.handleHide();
          if (typeof item.onClick === "function") {
            item.onClick(app, {
              event,
              closeMenu: () => this.handleHide(),
              state: this.state,
            });
          }
        },
      });
    }
    pluginItems.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));

    const mouseBrowsingEnabled = Boolean(
      app && app.useMouseBrowsing !== undefined
        ? app.useMouseBrowsing
        : app && app.buf
        ? app.buf.useMouseBrowsing
        : false
    );

    return (
      <React.Fragment>
        <div className={cx({ open })}>
          <DropdownMenu
            open={open}
            pageX={pageX}
            pageY={pageY}
            anchorRect={this.state.anchorRect}
            urlEnabled={urlEnabled}
            normalEnabled={normalEnabled}
            selEnabled={selEnabled}
            mouseBrowsingEnabled={mouseBrowsingEnabled}
            pluginItems={pluginItems}
            inputHelperEnabled={true}
            liveHelperEnabled={false}
            selectedText={selectedText}
            onMenuSelect={this.handleMenuSelect}
            onInputHelperClick={this.handleInputHelperClick}
            onLiveArticleHelperClick={this.handleLiveArticleHelperClick}
            onLiveHelperClick={this.handleLiveArticleHelperClick}
            onSettingsClick={this.handleSettingsClick}
          />
        </div>
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
