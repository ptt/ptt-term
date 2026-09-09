import React, { Component } from 'react';
import cx from 'classnames';
import NativeDialog from '../../components/NativeDialog.js';
import { _ } from '../../js/i18n.js';
import './LiveHelperModal.css';

export class LiveHelperModal extends Component {
  constructor(props) {
    super(props);
    this.state = {
      pos: null,
    };
    this.dragActive = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.initialTop = 0;
    this.initialLeft = 0;
  }

  handleMouseDown = (e) => {
    if (
      e.button !== 0 ||
      e.target.tagName === 'BUTTON' ||
      e.target.tagName === 'INPUT' ||
      e.target.closest?.('button') ||
      e.target.closest?.('input')
    ) {
      return;
    }
    const dialog = e.currentTarget.closest('dialog');
    if (!dialog) return;

    this.dragActive = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    const rect = dialog.getBoundingClientRect();
    this.initialTop = rect.top;
    this.initialLeft = rect.left;

    this._onMouseMove = (ev) => this.handleMouseMove(ev);
    this._onMouseUp = () => this.handleMouseUp();
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
  };

  handleMouseMove = (e) => {
    if (!this.dragActive) return;
    window.getSelection?.()?.removeAllRanges();
    const top = this.initialTop + (e.clientY - this.dragStartY);
    const left = this.initialLeft + (e.clientX - this.dragStartX);
    this.setState({ pos: { top, left } });
  };

  handleMouseUp = () => {
    this.dragActive = false;
    if (this._onMouseMove) {
      window.removeEventListener('mousemove', this._onMouseMove);
      this._onMouseMove = null;
    }
    if (this._onMouseUp) {
      window.removeEventListener('mouseup', this._onMouseUp);
      this._onMouseUp = null;
    }
  };

  componentWillUnmount() {
    this.handleMouseUp();
  }

  render() {
    const { show, active, intervalSec, onToggle, onIntervalChange, onClose } = this.props;
    if (!show) return null;

    const style = this.state.pos
      ? {
          margin: 0,
          right: 'auto',
          top: `${this.state.pos.top}px`,
          left: `${this.state.pos.left}px`,
        }
      : undefined;

    return (
      <NativeDialog
        className="LiveHelperModal__Dialog"
        open={show}
        modal={false}
        style={style}
      >
        <div
          className="LiveHelperModal__Body"
          style={{ cursor: 'move' }}
          onMouseDown={this.handleMouseDown}
        >
          <button
            type="button"
            className={cx('btn btn-default nomouse_command', { active })}
            title="Alt + r"
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              onToggle?.();
            }}
          >
            {_('liveHelperEnable')}
          </button>
          <span className="LiveHelperModal__Body__Text nomouse_command">
            {_('liveHelperSpan')}
          </span>
          <input
            type="number"
            className="LiveHelperModal__Body__Input form-control nomouse_command"
            value={intervalSec || 1}
            min="1"
            style={{ cursor: 'text' }}
            onChange={(e) => {
              onIntervalChange?.(e.target.value);
            }}
          />
          <span className="LiveHelperModal__Body__Text nomouse_command">
            {_('liveHelperSpanSec')}
          </span>
          <button
            type="button"
            className="LiveHelperModal__Body__Close close nomouse_command"
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              onClose?.();
            }}
          >
            &times;
          </button>
        </div>
      </NativeDialog>
    );
  }
}

export default LiveHelperModal;
