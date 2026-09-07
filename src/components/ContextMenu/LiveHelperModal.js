import React from "react";
import NativeDialog from "../NativeDialog";
import { i18n } from "../../js/i18n";
import "./LiveHelperModal.css";

const normalizeSec = (value) => {
  const sec = parseInt(value, 10);
  return sec > 1 ? sec : 1;
};

export class LiveHelperModal extends React.Component {
  dragActive = false;
  dragStartX = 0;
  dragStartY = 0;
  dialogInitialTop = 0;
  dialogInitialLeft = 0;
  dialogElem = null;

  handleEnabledClick = () => {
    const { enabled, sec, onChange } = this.props;
    if (onChange) {
      onChange({ enabled: !enabled, sec });
    }
  };

  handleSecChange = (e) => {
    const { enabled, onChange } = this.props;
    if (onChange) {
      onChange({ enabled, sec: normalizeSec(e.target.value) });
    }
  };

  handleMouseDown = (e) => {
    if (
      e.button !== 0 ||
      e.target.tagName === "BUTTON" ||
      e.target.tagName === "INPUT" ||
      e.target.closest("button") ||
      e.target.closest("input")
    ) {
      return;
    }
    this.dragActive = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    if (this.dialogElem) {
      const rect = this.dialogElem.getBoundingClientRect();
      this.dialogInitialTop = rect.top;
      this.dialogInitialLeft = rect.left;
      this.dialogElem.style.margin = "0";
      this.dialogElem.style.right = "auto";
      this.dialogElem.style.top = `${rect.top}px`;
      this.dialogElem.style.left = `${rect.left}px`;
    }
    window.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("mouseup", this.handleMouseUp);
  };

  handleMouseMove = (e) => {
    if (this.dragActive && this.dialogElem) {
      window.getSelection().removeAllRanges();
      const top = this.dialogInitialTop + (e.clientY - this.dragStartY);
      const left = this.dialogInitialLeft + (e.clientX - this.dragStartX);
      this.dialogElem.style.top = `${top}px`;
      this.dialogElem.style.left = `${left}px`;
    }
  };

  handleMouseUp = () => {
    this.dragActive = false;
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("mouseup", this.handleMouseUp);
  };

  componentWillUnmount() {
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("mouseup", this.handleMouseUp);
  }

  render() {
    const { show, onHide, enabled, sec } = this.props;

    return (
      <NativeDialog
        open={show}
        onClose={onHide}
        modal={false}
        className="LiveHelperModal__Dialog"
        ref={(ref) => {
          this.dialogElem = ref && ref.dialogRef ? ref.dialogRef.current : null;
        }}
      >
        <div
          className="LiveHelperModal__Body"
          onMouseDown={this.handleMouseDown}
          style={{ cursor: "move" }}
        >
          <button
            type="button"
            className={`btn btn-default ${enabled ? "active" : ""}`}
            title="Alt + r"
            onClick={this.handleEnabledClick}
            style={{ cursor: "pointer" }}
          >
            {i18n("liveHelperEnable")}
          </button>
          <span className="LiveHelperModal__Body__Text nomouse_command">
            {i18n("liveHelperSpan")}
          </span>
          <input
            type="number"
            className="LiveHelperModal__Body__Input form-control nomouse_command"
            value={sec}
            onChange={this.handleSecChange}
            style={{ cursor: "text" }}
          />
          <span className="LiveHelperModal__Body__Text nomouse_command">
            {i18n("liveHelperSpanSec")}
          </span>
          <button
            type="button"
            className="LiveHelperModal__Body__Close close nomouse_command"
            onClick={onHide}
            style={{ cursor: "pointer" }}
          >
            &times;
          </button>
        </div>
      </NativeDialog>
    );
  }
}

export default LiveHelperModal;
