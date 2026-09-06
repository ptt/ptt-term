import React from "react";
import cx from "classnames";
import "./NativeDialog.css";

export class NativeDialog extends React.Component {
  dialogRef = React.createRef();

  componentDidMount() {
    this.syncDialog();
  }

  componentDidUpdate(prevProps) {
    if (this.props.open !== prevProps.open) {
      this.syncDialog();
    }
  }

  componentWillUnmount() {
    const dialog = this.dialogRef.current;
    if (dialog && dialog.open) {
      dialog.close();
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
