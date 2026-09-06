import $ from "jquery";
import cx from "classnames";
import React from "react";
import ReactDOM from "react-dom";
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
  copyAnsi: (app) => app.doCopyAnsi(),
  paste: (app) => app.doPaste(),
  searchGoogle: (app, { selectedText }) =>
    app.doSearchGoogle(selectedText),
  openUrlNewTab: (app, { aElement }) =>
    app.doOpenUrlNewTab(aElement),
  copyLinkUrl: (app, { contextOnUrl }) => app.doCopy(contextOnUrl),
  selectAll: (app) => app.doSelectAll(),
  mouseBrowsing: (app) => app.switchMouseBrowsing()
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

export class ContextMenu extends React.Component {
  state = { ...initialState };

  componentDidMount() {
    this.contextMenuHandler = (event) => {
      ReactDOM.unstable_batchedUpdates(() => {
        this.handleContextMenu(event);
      });
    };
    const bbsWindow = document.getElementById("BBSWindow");
    if (bbsWindow) {
      bbsWindow.addEventListener("contextmenu", this.contextMenuHandler, true);
    }

    this.clickHandler = () => {
      this.handleHide();
    };
    window.addEventListener("click", this.clickHandler, false);

    this.touchStartHandler = (event) => {
      if (event.target.getAttribute("role") === "menuitem") {
        return;
      }
      this.handleHide();
    };
    window.addEventListener("touchstart", this.touchStartHandler, false);

    this.hotKeyUpHandler = (event) => {
      if (!this.state.open) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.altKey || event.ctrlKey || event.shiftKey) {
        return;
      }
      const eventKey = EVENT_KEY_BY_HOT_KEY[event.keyCode];
      if (eventKey) {
        this.handleMenuSelect(eventKey, event);
      }
    };
    window.addEventListener("keyup", this.hotKeyUpHandler, false);

    this.updateAppCallbacks();
  }

  componentDidUpdate(prevProps, prevState) {
    if (
      prevState.liveHelperEnabled !== this.state.liveHelperEnabled ||
      prevState.liveHelperSec !== this.state.liveHelperSec
    ) {
      this.updateAppCallbacks();
    }
  }

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

  updateAppCallbacks() {
    const { app } = this.props;
    if (!app) return;
    if (this.state.liveHelperEnabled) {
      app.onToggleLiveHelperModalState = () => {
        this.handleLiveHelperChange({
          enabled: !this.state.liveHelperEnabled,
          sec: this.state.liveHelperSec
        });
      };
      app.onDisableLiveHelperModalState = () => {
        this.handleLiveHelperChange({
          enabled: false,
          sec: this.state.liveHelperSec
        });
      };
    } else {
      app.onToggleLiveHelperModalState = app.onDisableLiveHelperModalState = noop;
    }
  }

  handleContextMenu = (event) => {
    event.stopPropagation();
    event.preventDefault();
    const { app } = this.props;
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

    this.setState({
      open: true,
      pageX: event.pageX,
      pageY: event.pageY,
      contextOnUrl,
      aElement,
      selectedText,
      urlEnabled,
      normalEnabled,
      selEnabled
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
    const { app } = this.props;
    menuHandlerByEventKey[eventKey](app, this.state);
    if (event) {
      event.stopPropagation();
    }
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
      showsInputHelper: true
    });
  };

  handleLiveArticleHelperClick = (event) => {
    event.stopPropagation();
    this.props.app.contextMenuShown = false;
    this.setState({
      ...initialState,
      showsLiveArticleHelper: true
    });
  };

  handleSettingsClick = (event) => {
    event.stopPropagation();
    const { app } = this.props;
    app.contextMenuShown = false;
    app.onDisableLiveHelperModalState();
    app.modalShown = true;
    this.setState({
      ...initialState,
      showsSettings: true
    });
  };

  handleQuickSearchSelect = (eventKey, event) => {
    const url = eventKey.replace("%s", this.state.selectedText);
    window.open(url);
    if (event) {
      event.stopPropagation();
    }
    this.props.app.contextMenuShown = false;
    this.setState(initialState);
  };

  handleInputHelperHide = () => {
    this.setState({ showsInputHelper: false });
  };

  handleInputHelperReset = () => {
    const resetCmd = this.props.app.site.getEditorColorResetCommand();
    this.props.app.conn.send(resetCmd);
  };

  handleInputHelperCmdSend = (cmd) => {
    const { app } = this.props;
    const sel = app.view.getSelectionColRow();
    if (sel && app.buf.pageState == 6) {
      const resetCmd = app.site.getEditorColorResetCommand();
      let y = app.buf.cur_y;
      let selCmd = "";
      // move cursor to end and send reset code
      selCmd += "\x1b[H";
      if (y > sel.end.row) {
        selCmd += "\x1b[A".repeat(y - sel.end.row);
      } else if (y < sel.end.row) {
        selCmd += "\x1b[B".repeat(sel.end.row - y);
      }
      let repeats = app.buf.getRowText(sel.end.row, 0, sel.end.col).length;
      selCmd += "\x1b[C".repeat(repeats) + resetCmd;

      // move cursor to start and send color code
      y = sel.end.row;
      selCmd += "\x1b[H";
      if (y > sel.start.row) {
        selCmd += "\x1b[A".repeat(y - sel.start.row);
      } else if (y < sel.start.row) {
        selCmd += "\x1b[B".repeat(sel.start.row - y);
      }
      repeats = app.buf.getRowText(sel.start.row, 0, sel.start.col).length;
      selCmd += "\x1b[C".repeat(repeats);
      cmd = selCmd + cmd;
    }
    app.conn.send(cmd);
  };

  handleInputHelperConvSend = (value) => {
    this.props.app.conn.convSend(value);
  };

  handleLiveHelperHide = () => {
    this.props.app.setAutoPushthreadUpdate(-1);
    this.setState({
      showsLiveArticleHelper: false,
      liveHelperEnabled: false
    });
  };

  handleLiveHelperChange = (nextState) => {
    const { app } = this.props;
    if (nextState.enabled) {
      // cancel easy reading mode first
      app.view.useEasyReadingMode = false;
      app.switchToEasyReadingMode();
      app.setAutoPushthreadUpdate(nextState.sec);
    } else {
      app.setAutoPushthreadUpdate(-1);
    }
    this.setState({
      liveHelperEnabled: nextState.enabled,
      liveHelperSec: nextState.sec
    });
  };

  handlePrefSave = (values) => {
    this.setState(onPrefSaveImpl(this.props.app, values));
  };

  handlePrefReset = (values) => {
    const { app } = this.props;
    app.onValuesPrefChange(values);
    app.view.redraw(true);
    app.switchToEasyReadingMode(app.view.useEasyReadingMode);
  };

  render() {
    const { app } = this.props;
    const {
      open,
      pageX,
      pageY,
      urlEnabled,
      normalEnabled,
      selEnabled,
      selectedText,
      showsInputHelper,
      showsLiveArticleHelper,
      showsSettings,
      liveHelperEnabled,
      liveHelperSec
    } = this.state;

    return (
      <React.Fragment>
        <div className={cx({ open })}>
          <DropdownMenu
            pageX={pageX}
            pageY={pageY}
            urlEnabled={urlEnabled}
            normalEnabled={normalEnabled}
            selEnabled={selEnabled}
            mouseBrowsingEnabled={app.buf.useMouseBrowsing}
            selectedText={selectedText}
            onMenuSelect={this.handleMenuSelect}
            onInputHelperClick={this.handleInputHelperClick}
            onLiveArticleHelperClick={this.handleLiveArticleHelperClick}
            onSettingsClick={this.handleSettingsClick}
            onQuickSearchSelect={this.handleQuickSearchSelect}
          />
        </div>
        <InputHelperModal
          show={showsInputHelper}
          site={app.site}
          onHide={this.handleInputHelperHide}
          onReset={this.handleInputHelperReset}
          onCmdSend={this.handleInputHelperCmdSend}
          onConvSend={this.handleInputHelperConvSend}
        />
        <LiveHelperModal
          show={showsLiveArticleHelper}
          onHide={this.handleLiveHelperHide}
          enabled={liveHelperEnabled}
          sec={liveHelperSec}
          onChange={this.handleLiveHelperChange}
        />
        <PrefModal
          show={showsSettings}
          onSave={this.handlePrefSave}
          onReset={this.handlePrefReset}
        />
      </React.Fragment>
    );
  }
}

export default ContextMenu;
