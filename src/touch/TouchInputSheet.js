import React from "react";
import cx from "classnames";
import { _ } from "../js/i18n.js";
import { wrapText, stringWidth } from "../js/string_util.js";
import "./TouchInputSheet.css";

export { stringWidth };

export class TouchInputSheet extends React.Component {
  textareaRef = React.createRef();

  state = {
    text: "",
    autoWrap: true,
    appendEnter: true,
  };

  componentDidMount() {
    this.registerInterceptor();
    if (this.props.open) {
      this.focusTextarea();
    }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.app !== this.props.app) {
      this.unregisterInterceptor(prevProps.app);
      this.registerInterceptor(this.props.app);
    }
    if (!prevProps.open && this.props.open) {
      this.focusTextarea();
    }
  }

  componentWillUnmount() {
    this.unregisterInterceptor();
    if (this._textareaEl) {
      this._textareaEl.removeEventListener("keydown", this.handleNativeKeyStop, false);
      this._textareaEl.removeEventListener("keyup", this.handleNativeKeyStop, false);
      this._textareaEl.removeEventListener("keypress", this.handleNativeKeyStop, false);
      this._textareaEl = null;
    }
  }

  registerInterceptor = (targetApp = this.props.app) => {
    const inputInterceptors = targetApp?.inputInterceptors;
    if (inputInterceptors) {
      this.handleKeyDownBound = (e) => {
        if (!this.props.open) return;
        if (e.key === "Escape") {
          e.preventDefault();
          this.handleClose();
        } else {
          e.preventDefault();
        }
      };
      this.handleQueryActiveBound = (e) => {
        if (this.props.open) {
          e.active = true;
        }
      };
      inputInterceptors.on("keyDown", this.handleKeyDownBound);
      inputInterceptors.on("queryActive", this.handleQueryActiveBound);
    }
  };

  unregisterInterceptor = (targetApp = this.props.app) => {
    const inputInterceptors = targetApp?.inputInterceptors;
    if (inputInterceptors) {
      if (this.handleKeyDownBound) {
        inputInterceptors.off("keyDown", this.handleKeyDownBound);
        this.handleKeyDownBound = null;
      }
      if (this.handleQueryActiveBound) {
        inputInterceptors.off("queryActive", this.handleQueryActiveBound);
        this.handleQueryActiveBound = null;
      }
    }
  };

  attachTextareaRef = (el) => {
    if (this._textareaEl && this._textareaEl !== el) {
      this._textareaEl.removeEventListener("keydown", this.handleNativeKeyStop, false);
      this._textareaEl.removeEventListener("keyup", this.handleNativeKeyStop, false);
      this._textareaEl.removeEventListener("keypress", this.handleNativeKeyStop, false);
    }
    this._textareaEl = el;
    this.textareaRef.current = el;
    if (el) {
      el.addEventListener("keydown", this.handleNativeKeyStop, false);
      el.addEventListener("keyup", this.handleNativeKeyStop, false);
      el.addEventListener("keypress", this.handleNativeKeyStop, false);
    }
  };

  handleNativeKeyStop = (e) => {
    e.stopPropagation();
  };

  focusTextarea = () => {
    const el = this.textareaRef && this.textareaRef.current;
    if (el) {
      try {
        el.focus({ preventScroll: true });
      } catch (e) {
        el.focus();
      }
      setTimeout(() => {
        if (this.props.open && this.textareaRef?.current) {
          try {
            this.textareaRef.current.focus({ preventScroll: true });
          } catch (e) {}
        }
      }, 50);
    }
  };

  blurTextarea = () => {
    if (this.textareaRef && this.textareaRef.current) {
      try {
        this.textareaRef.current.blur();
      } catch (e) {}
    }
  };

  handleTextInput = (e) => {
    this.setState({ text: e.target.value });
  };

  handleKeyDown = (e) => {
    e.stopPropagation();
    if (e.nativeEvent) {
      e.nativeEvent.stopPropagation?.();
    }

    if (e.key === "Enter") {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.handleSend();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      this.handleClose();
    }
  };

  handleKeyUp = (e) => {
    e.stopPropagation();
    if (e.nativeEvent) {
      e.nativeEvent.stopPropagation?.();
    }
  };

  handleKeyPress = (e) => {
    e.stopPropagation();
    if (e.nativeEvent) {
      e.nativeEvent.stopPropagation?.();
    }
  };

  handleAppendEnterChange = (e) => {
    this.setState({ appendEnter: Boolean(e.target.checked) });
  };

  handleAutoWrapChange = (e) => {
    this.setState({ autoWrap: Boolean(e.target.checked) });
  };

  handleClear = () => {
    this.setState({ text: "" }, () => {
      this.focusTextarea();
    });
  };

  handleClose = () => {
    this.blurTextarea();
    if (this.props.onClose) {
      this.props.onClose();
    }
    if (this.props.app && typeof this.props.app.setInputAreaFocus === "function") {
      setTimeout(() => {
        try {
          this.props.app.setInputAreaFocus();
        } catch (e) {}
      }, 50);
    }
  };

  handleBackdropClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    this.handleClose();
  };

  handleSwitchToDirectInput = () => {
    this.blurTextarea();
    if (this.props.onSwitchDirectInput) {
      this.props.onSwitchDirectInput();
    }
  };

  handleSend = () => {
    const { app, onSend } = this.props;
    const { text, autoWrap, appendEnter } = this.state;
    if (!text && !appendEnter) return;

    let payload = text;
    if (autoWrap && payload) {
      payload = wrapText(payload, 78, "\r");
    } else if (payload) {
      payload = payload.replace(/\r\n|\n/g, "\r");
    }

    if (appendEnter) {
      if (!payload.endsWith("\r")) {
        payload += "\r";
      }
    }

    if (typeof onSend === "function") {
      onSend(payload);
    } else if (payload) {
      if (app && typeof app.dispatchPaste === "function") {
        app.dispatchPaste(payload);
      } else if (app && app.view && typeof app.view.paste === "function") {
        app.view.paste(payload);
      } else if (app && typeof app.send === "function") {
        app.send(payload);
      }
    }

    this.setState({ text: "" });
    this.blurTextarea();
    if (this.props.onClose) {
      this.props.onClose();
    }
    if (app && typeof app.setInputAreaFocus === "function") {
      setTimeout(() => {
        try {
          app.setInputAreaFocus();
        } catch (e) {}
      }, 50);
    }
  };

  render() {
    const { open } = this.props;
    const { text, autoWrap, appendEnter } = this.state;

    const lines = text.split(/\r\n|\r|\n/);
    let maxLineBytes = 0;
    for (const line of lines) {
      const len = stringWidth(line);
      if (len > maxLineBytes) maxLineBytes = len;
    }
    const isOverLimit = maxLineBytes > 78;
    const counterText =
      lines.length <= 1
        ? `${stringWidth(text)} / 78 B`
        : _("touch_input_sheet_multi_lines", [lines.length, maxLineBytes]) ||
          `${lines.length} 行 · 最大 ${maxLineBytes} / 78 B`;

    return (
      <React.Fragment>
        {open && (
          <div
            className="TouchInputSheet__Backdrop"
            onClick={this.handleBackdropClick}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onKeyUp={(e) => e.stopPropagation()}
          />
        )}
        <div
          className={cx("TouchInputSheet", "nomouse_command", {
            "TouchInputSheet--open": open,
          })}
          style={{ display: open ? "flex" : "none" }}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onKeyUp={(e) => e.stopPropagation()}
          onKeyPress={(e) => e.stopPropagation()}
        >
          {/* Header Bar: Title, Byte Counter, Direct Switch, Close */}
          <div className="TouchInputSheet__Header">
            <div className="TouchInputSheet__Title">
              {_("touch_input_sheet_title") || "輸入訊息"}
            </div>

            <div className="TouchInputSheet__HeaderRight">
              <div
                className={cx("TouchInputSheet__Counter", {
                  "TouchInputSheet__Counter--warn": isOverLimit,
                })}
                title={
                  isOverLimit
                    ? _("touch_input_sheet_line_over_limit") ||
                      "超過單行建議長度 78 字元 (送出時將自動折行)"
                    : _("touch_input_sheet_line_limit") ||
                      "單行建議長度 (78字元)"
                }
              >
                {counterText}
              </div>

              <button
                type="button"
                className="TouchInputSheet__IconBtn TouchInputSheet__IconBtn--direct"
                title={_("touch_input_sheet_direct_mode") || "切換為終端直連輸入"}
                aria-label={_("touch_input_sheet_direct_mode") || "Direct Input"}
                onClick={this.handleSwitchToDirectInput}
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
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
              </button>

              <button
                type="button"
                className="TouchInputSheet__IconBtn TouchInputSheet__IconBtn--close"
                title={_("touch_input_sheet_close") || "收起"}
                aria-label={_("touch_input_sheet_close") || "Close"}
                onClick={this.handleClose}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Text Area */}
          <div className="TouchInputSheet__Body">
            <textarea
              ref={this.attachTextareaRef}
              className="TouchInputSheet__Textarea"
              placeholder={
                _("touch_input_sheet_placeholder") ||
                "輸入訊息、推文或文章內容..."
              }
              value={text}
              rows={3}
              enterKeyHint="enter"
              onInput={this.handleTextInput}
              onKeyDown={this.handleKeyDown}
              onKeyUp={this.handleKeyUp}
              onKeyPress={this.handleKeyPress}
            />
          </div>

          {/* Footer Bar: Options & Actions */}
          <div className="TouchInputSheet__Footer">
            <div className="TouchInputSheet__Options">
              <label className="TouchInputSheet__OptionLabel">
                <input
                  type="checkbox"
                  tabIndex={-1}
                  checked={appendEnter}
                  onChange={this.handleAppendEnterChange}
                />
                <span className="TouchInputSheet__OptionText--full">
                  {_("touch_input_sheet_send_enter") || "送出換行 (↵)"}
                </span>
                <span className="TouchInputSheet__OptionText--compact">↵</span>
              </label>
              <label className="TouchInputSheet__OptionLabel">
                <input
                  type="checkbox"
                  tabIndex={-1}
                  checked={autoWrap}
                  onChange={this.handleAutoWrapChange}
                />
                <span className="TouchInputSheet__OptionText--full">
                  {_("touch_input_sheet_auto_wrap") || "自動折行"}
                </span>
                <span className="TouchInputSheet__OptionText--compact">
                  {_("touch_input_sheet_auto_wrap_compact") || "折行"}
                </span>
              </label>
            </div>

            <div className="TouchInputSheet__Actions">
              {text ? (
                <button
                  type="button"
                  className="TouchInputSheet__Btn TouchInputSheet__Btn--clear"
                  onClick={this.handleClear}
                >
                  {_("touch_input_sheet_clear") || "清空"}
                </button>
              ) : null}
              <button
                type="button"
                className="TouchInputSheet__Btn TouchInputSheet__Btn--send"
                disabled={!text.trim() && !appendEnter}
                onClick={this.handleSend}
              >
                <span>{_("touch_input_sheet_send") || "送出"}</span>
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
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </React.Fragment>
    );
  }
}

export default TouchInputSheet;
