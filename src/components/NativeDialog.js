import React from "react";
import cx from "classnames";
import "./NativeDialog.css";

export class NativeDialog extends React.Component {
  dialogRef = React.createRef();

  componentDidMount() {
    this.syncDialog();
    if (this.props.open) {
      this.attachGlobalEscape();
    }
  }

  componentDidUpdate(prevProps) {
    if (this.props.open !== prevProps.open) {
      this.syncDialog();
      if (this.props.open) {
        this.attachGlobalEscape();
      } else {
        this.detachGlobalEscape();
      }
    }
  }

  componentWillUnmount() {
    this.detachGlobalEscape();
    const dialog = this.dialogRef.current;
    if (dialog && dialog.open) {
      dialog.close();
      if (typeof window !== "undefined" && window.app && !window.app.modalShown && !window.app.contextMenuShown) {
        setTimeout(() => {
          if (!window.app.modalShown && !window.app.contextMenuShown) {
            window.app.setInputAreaFocus?.(true);
          }
        }, 0);
      }
    }
  }

  handleGlobalKeyDown = (e) => {
    if (e.key === "Escape" || e.code === "Escape" || e.keyCode === 27) {
      e.preventDefault();
      e.stopPropagation();
      if (this.props.onClose) {
        this.props.onClose(e);
      }
    }
  };

  attachGlobalEscape() {
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.handleGlobalKeyDown, true);
    }
  }

  detachGlobalEscape() {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.handleGlobalKeyDown, true);
    }
  }

  syncDialog() {
    const dialog = this.dialogRef.current;
    if (!dialog) return;

    if (this.props.open) {
      if (!dialog.open) {
        try {
          if (this.props.modal !== false) {
            dialog.showModal();
          } else {
            dialog.show();
          }
        } catch (e) {
          // Ignore if already open
        }
      }
    } else {
      if (dialog.open) {
        dialog.close();
        if (typeof window !== "undefined" && window.app && !window.app.modalShown && !window.app.contextMenuShown) {
          setTimeout(() => {
            if (!window.app.modalShown && !window.app.contextMenuShown) {
              window.app.setInputAreaFocus?.(true);
            }
          }, 0);
        }
      }
    }
  }

  handleClick = (e) => {
    if (
      this.props.modal !== false &&
      this.props.backdropClose !== false &&
      e.target === this.dialogRef.current
    ) {
      if (this.props.onClose) {
        this.props.onClose(e);
      }
    }
  };

  handleCancel = (e) => {
    e.preventDefault();
    if (this.props.onClose) {
      this.props.onClose(e);
    }
  };

  handleKeyDown = (e) => {
    if (e.key === "Escape" || e.code === "Escape" || e.keyCode === 27) {
      e.preventDefault();
      e.stopPropagation();
      if (this.props.onClose) {
        this.props.onClose(e);
      }
    }
    if (this.props.onKeyDown) {
      this.props.onKeyDown(e);
    }
  };

  render() {
    const {
      className,
      style,
      children,
      onMouseDown,
      onMouseMove,
      onMouseUp
    } = this.props;

    return (
      <dialog
        ref={this.dialogRef}
        className={cx("NativeDialog", className)}
        onClick={this.handleClick}
        onCancel={this.handleCancel}
        onKeyDown={this.handleKeyDown}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        style={style}
      >
        <div className="NativeDialog__content">{children}</div>
      </dialog>
    );
  }
}

export default NativeDialog;
