import $ from "jquery";
import cx from "classnames";
import React from "react";
import ReactDOM from "react-dom";
import { compose, withStateHandlers, withProps, lifecycle } from "recompose";
import { MenuItem } from "react-bootstrap";
import { i18n } from "../../js/i18n";
import DropdownMenu from "./DropdownMenu";
import InputHelperModal from "./InputHelperModal";
import LiveHelperModal from "./LiveHelperModal";
import PrefModal from "./PrefModal";

function noop() {}

const EVENT_KEY_BY_HOT_KEY = {
  ["C".charCodeAt(0)]: "copy",
  ["E".charCodeAt(0)]: "copyLinkUrl",
  ["P".charCodeAt(0)]: "paste",
  ["S".charCodeAt(0)]: "searchGoogle",
  ["T".charCodeAt(0)]: "openUrlNewTab"
};

const menuHandlerByEventKey = {
  copy: (app, { selectedText }) => app.doCopy(selectedText),
  copyAnsi: app => app.doCopyAnsi(),
  paste: app => app.doPaste(),
  searchGoogle: (app, { selectedText }) =>
    app.doSearchGoogle(selectedText),
  openUrlNewTab: (app, { aElement }) =>
    app.doOpenUrlNewTab(aElement),
  copyLinkUrl: (app, { contextOnUrl }) => app.doCopy(contextOnUrl),
  selectAll: app => app.doSelectAll(),
  mouseBrowsing: app => app.switchMouseBrowsing()
};

const onPrefSaveImpl = (app, values) => {
  app.onValuesPrefChange(values);
  app.modalShown = false;
  app.setInputAreaFocus();
  app.switchToEasyReadingMode(app.view.useEasyReadingMode);

  return {
    showsSettings: false
  };
};

const initialState = {
  // --- Menu state ---
  open: false,
  pageX: 0,
  pageY: 0,
  contextOnUrl: "",
  aElement: undefined,
  selectedText: "",
  urlEnabled: false,
  normalEnabled: false,
  selEnabled: false,
  // --- Modal state ---
  showsInputHelper: false,
  showsLiveArticleHelper: false,
  showsSettings: false,
  // --- LiveHelper state ---
  liveHelperEnabled: false,
  liveHelperSec: 1
};

const enhance = compose(
  withStateHandlers(initialState, {
    onContextMenu: (state, { app }) => event => {
      event.stopPropagation();
      event.preventDefault();
      const { CmdHandler } = app;
      const doDOMMouseScroll =
        CmdHandler.getAttribute("doDOMMouseScroll") === "1";
      if (doDOMMouseScroll) {
        CmdHandler.setAttribute("doDOMMouseScroll", "0");
        return;
      }
      if (app.inputAreaFocusTimer) {
        app.inputAreaFocusTimer.cancel();
        app.inputAreaFocusTimer = null;
      }
      app.contextMenuShown = true;
      // just in case the selection get de-selected
      const selColRow = app.view.getSelectionColRow();
      app.lastSelection = selColRow || null;

      const target = $(event.target);
      let contextOnUrl = "";
      let aElement;
      if (target.is("a")) {
        contextOnUrl = target.attr("href");
        aElement = target[0];
      } else if (target.parent().is("a")) {
        contextOnUrl = target.parent().attr("href");
        aElement = target[0].parentNode;
      }

      // replace the &nbsp;
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

      return {
        open: true,
        pageX: event.pageX,
        pageY: event.pageY,
        contextOnUrl,
        aElement,
        selectedText,
        urlEnabled,
        normalEnabled,
        selEnabled
      };
    },

    onHide: (state, { app }) => () => {
      if (state.open) {
        app.contextMenuShown = false;
        if (!app.view.isEasyReadingActive()) {
          app.setInputAreaFocus();
        }
        return initialState;
      }
    },

    onMenuSelect: (state, { app }) => (eventKey, event) => {
      menuHandlerByEventKey[eventKey](app, state);
      event.stopPropagation();
      app.contextMenuShown = false;
      if (!app.view.isEasyReadingActive()) {
        app.setInputAreaFocus();
      }
      return initialState;
    },

    onInputHelperClick: (state, { app }) => event => {
      event.stopPropagation();
      app.contextMenuShown = false;
      return {
        ...initialState,
        showsInputHelper: true
      };
    },

    onLiveArticleHelperClick: (state, { app }) => event => {
      event.stopPropagation();
      app.contextMenuShown = false;
      return {
        ...initialState,
        showsLiveArticleHelper: true
      };
    },

    onSettingsClick: (state, { app }) => event => {
      event.stopPropagation();
      app.contextMenuShown = false;
      app.onDisableLiveHelperModalState();
      app.modalShown = true;
      return {
        ...initialState,
        showsSettings: true
      };
    },

    onQuickSearchSelect: (state, { app, selectedText }) => (
      eventKey,
      event
    ) => {
      const url = eventKey.replace("%s", selectedText);
      window.open(url);
      event.stopPropagation();
      app.contextMenuShown = false;
      return initialState;
    },

    onInputHelperHide: (state, { app }) => () => {
      return {
        showsInputHelper: false
      };
    },
    onInputHelperReset: (state, { app }) => () => {
      const resetCmd = app.site.getEditorColorResetCommand();
      app.conn.send(resetCmd);
    },
    onInputHelperCmdSend: (state, { app }) => cmd => {
      const sel = app.view.getSelectionColRow();
      if (sel && app.buf.pageState == 6) {
        const resetCmd = app.site.getEditorColorResetCommand();
        var y = app.buf.cur_y;
        var selCmd = "";
        // move cursor to end and send reset code
        selCmd += "\x1b[H";
        if (y > sel.end.row) {
          selCmd += "\x1b[A".repeat(y - sel.end.row);
        } else if (y < sel.end.row) {
          selCmd += "\x1b[B".repeat(sel.end.row - y);
        }
        var repeats = app.buf.getRowText(sel.end.row, 0, sel.end.col)
          .length;
        selCmd += "\x1b[C".repeat(repeats) + resetCmd;

        // move cursor to start and send color code
        y = sel.end.row;
        selCmd += "\x1b[H";
        if (y > sel.start.row) {
          selCmd += "\x1b[A".repeat(y - sel.start.row);
        } else if (y < sel.start.row) {
          selCmd += "\x1b[B".repeat(sel.start.row - y);
        }
        repeats = app.buf.getRowText(sel.start.row, 0, sel.start.col)
          .length;
        selCmd += "\x1b[C".repeat(repeats);
        cmd = selCmd + cmd;
      }
      app.conn.send(cmd);
    },
    onInputHelperConvSend: (state, { app }) => value => {
      app.conn.convSend(value);
    },

    onLiveHelperHide: (state, { app }) => nextState => {
      app.setAutoPushthreadUpdate(-1);
      return {
        showsLiveArticleHelper: false,
        liveHelperEnabled: false
      };
    },
    onLiveHelperChange: (state, { app }) => nextState => {
      if (nextState.enabled) {
        // cancel easy reading mode first
        app.view.useEasyReadingMode = false;
        app.switchToEasyReadingMode();
        app.setAutoPushthreadUpdate(nextState.sec);
      } else {
        app.setAutoPushthreadUpdate(-1);
      }
      return {
        liveHelperEnabled: nextState.enabled,
        liveHelperSec: nextState.sec
      };
    },

    onPrefSave: (state, { app }) => values => {
      return onPrefSaveImpl(app, values);
    },
    onPrefReset: (state, { app }) => values => {
      app.onValuesPrefChange(values);
      app.view.redraw(true);
      app.switchToEasyReadingMode(app.view.useEasyReadingMode);
    }
  }),
  withProps(({ app, liveHelperEnabled, onLiveHelperChange }) => {
    // FIXME: side effect
    if (liveHelperEnabled) {
      app.onToggleLiveHelperModalState = () => {
        onLiveHelperChange({
          enabled: !state.enabled,
          sec: state.sec
        });
      };
      app.onDisableLiveHelperModalState = () => {
        onLiveHelperChange({
          enabled: false,
          sec: state.sec
        });
      };
    } else {
      app.onToggleLiveHelperModalState = app.onDisableLiveHelperModalState = noop;
    }
  }),
  lifecycle({
    componentDidMount() {
      this.contextMenuHandler = event => {
        ReactDOM.unstable_batchedUpdates(() => {
          this.props.onContextMenu(event);
        });
      };
      document
        .getElementById("BBSWindow")
        .addEventListener("contextmenu", this.contextMenuHandler, true);

      this.clickHandler = () => {
        this.props.onHide();
      };
      window.addEventListener("click", this.clickHandler, false);

      this.touchStartHandler = event => {
        if (event.target.getAttribute("role") === "menuitem") {
          return;
        }
        this.props.onHide();
      };
      window.addEventListener("touchstart", this.touchStartHandler, false);

      this.hotKeyUpHandler = event => {
        if (!this.props.open) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (event.altKey || event.ctrlKey || event.shiftKey) {
          return;
        }
        const eventKey = EVENT_KEY_BY_HOT_KEY[event.keyCode];
        if (eventKey) {
          this.props.onMenuSelect(eventKey, event);
        }
      };
      window.addEventListener("keyup", this.hotKeyUpHandler, false);
    },
    componentWillUnmount() {
      window.removeEventListener("keyup", this.hotKeyUpHandler, false);
      window.removeEventListener("touchstart", this.touchStartHandler, false);
      window.removeEventListener("click", this.clickHandler, false);
      const bbsWindow = document.getElementById("BBSWindow");
      if (bbsWindow) {
        bbsWindow.removeEventListener(
          "contextmenu",
          this.contextMenuHandler,
          true
        );
      }
    }
  })
);

export const ContextMenu = ({
  app,
  //
  pageX,
  pageY,
  open,
  urlEnabled,
  normalEnabled,
  selEnabled,
  selectedText,
  onMenuSelect,
  onInputHelperClick,
  onLiveArticleHelperClick,
  onSettingsClick,
  onQuickSearchSelect,
  //
  showsInputHelper,
  showsLiveArticleHelper,
  showsSettings,
  //
  liveHelperEnabled,
  liveHelperSec,
  onInputHelperHide,
  onInputHelperReset,
  onInputHelperCmdSend,
  onInputHelperConvSend,
  onLiveHelperHide,
  onLiveHelperChange,
  onPrefSave,
  onPrefReset
}) => (
  <React.Fragment>
    <div
      className={cx({
        open
      })}
    >
      <DropdownMenu
        pageX={pageX}
        pageY={pageY}
        urlEnabled={urlEnabled}
        normalEnabled={normalEnabled}
        selEnabled={selEnabled}
        mouseBrowsingEnabled={app.buf.useMouseBrowsing}
        selectedText={selectedText}
        onMenuSelect={onMenuSelect}
        onInputHelperClick={onInputHelperClick}
        onLiveArticleHelperClick={onLiveArticleHelperClick}
        onSettingsClick={onSettingsClick}
        onQuickSearchSelect={onQuickSearchSelect}
      />
    </div>
    <InputHelperModal
      show={showsInputHelper}
      site={app.site}
      onHide={onInputHelperHide}
      onReset={onInputHelperReset}
      onCmdSend={onInputHelperCmdSend}
      onConvSend={onInputHelperConvSend}
    />
    <LiveHelperModal
      show={showsLiveArticleHelper}
      onHide={onLiveHelperHide}
      enabled={liveHelperEnabled}
      sec={liveHelperSec}
      onChange={onLiveHelperChange}
    />
    <PrefModal show={showsSettings} onSave={onPrefSave} onReset={onPrefReset} />
  </React.Fragment>
);

export default enhance(ContextMenu);
