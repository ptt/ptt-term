import {
  parseReplyText,
  parsePushInitText,
  parseReqNotMetText
} from './string_util';
import { readValuesWithDefault } from '../components/ContextMenu/PrefModal';

export class EasyReading {
  constructor(core, view, termBuf) {
    this._core = core;
    this._view = view;
    this._termBuf = termBuf;

    this._customTurnPageLines = 0;

    this.easyReadingReachedPageEnd = false;
    this.sendCommandAfterUpdate = '';
    this.ignoreOneUpdate = false;

    function bindProperty(target, name, obj, prop) {
      if (!prop) prop = name;
      Object.defineProperty(obj, prop, {
        get: () => target[name],
        set: (val) => { target[name] = val; }
      });
    }
    bindProperty(this._view, 'useEasyReadingMode', this, '_enabled');
    bindProperty(this._termBuf, 'startedEasyReading', this);
    bindProperty(this._termBuf, 'easyReadingShowReplyText', this);
    bindProperty(this._termBuf, 'easyReadingShowPushInitText', this);

    this._termBuf.addEventListener('change', (e) => this._onChanged(e));
    this._termBuf.addEventListener('viewUpdate', (e) => this._onViewUpdated(e));
  }

  get _turnPageLines() {
    if (this._customTurnPageLines > 0) return this._customTurnPageLines;
    if (this._view && this._view.easyReadingContent && this._view.chh) {
      let lines = Math.floor(this._view.easyReadingContent.clientHeight / this._view.chh) - 1;
      if (lines > 0) return lines;
    }
    return 22;
  }

  set _turnPageLines(val) {
    this._customTurnPageLines = val;
  }

  _onChanged(e) {
    console.debug("page state: " + this._termBuf.prevPageState + "->" + this._termBuf.pageState);
    const values = readValuesWithDefault()
    // make sure to come back to easy reading mode
    const isEnteringReading = (this._termBuf.prevPageState == 2 || this._termBuf.prevPageState == 0) &&
        this._termBuf.pageState == 3;
    if (isEnteringReading &&
        !this._enabled && 
        values.enableEasyReading &&
        this._core.connectedUrl.easyReadingSupported)
    {
      this._enabled = true;
    } else if (!values.enableEasyReading) {
      this._enabled = false;
    }

    if (!this._enabled)
      return;

    const profile = this._termBuf.siteProfile;
    let lastColNum = this._termBuf.cols - 1;
    let lastRowNum = profile.getLastRowNum(this._termBuf);
    var lastRowText = this._termBuf.getRowText(lastRowNum, 0, this._termBuf.cols);
    // dealing with page state jump to 0 because last row wasn't updated fully 
    if (this._termBuf.pageState == 3) {
      this.startedEasyReading = true;
    } else if (this.startedEasyReading && parseReqNotMetText(lastRowText)) {
      this.easyReadingShowPushInitText = true;
    } else {
      this.easyReadingShowReplyText = false;
      this.easyReadingShowPushInitText = false;
      this.startedEasyReading = false;
    }
    if (this.startedEasyReading) {
      console.debug('easy reading cursor pos: ' + this._termBuf.cur_y + ':' + this._termBuf.cur_x);
      const isParked = profile.isCursorParked(this._termBuf);

      if (isParked) {
        if (this.ignoreOneUpdate) {
          this.ignoreOneUpdate = false;
          return;
        }
        var result = profile.parseReadingStatus(lastRowText, this._termBuf);
        if (result) {
          var isEnd = profile.isArticleEnd(lastRowText, this._termBuf, result);

          if (isEnd) {
            this.easyReadingReachedPageEnd = true;
          } else {
            this.easyReadingReachedPageEnd = false;
            if (!this.sendCommandAfterUpdate) {
              // send page down
              this.sendCommandAfterUpdate = '\x1b[6~';
            }
          }
        } else if (profile.isArticleEnd(lastRowText, this._termBuf, null)) {
          this.easyReadingReachedPageEnd = true;
        } else if (!this.easyReadingShowPushInitText) { // only if not showing last row text
          this._termBuf.pageState = 5;
          this.startedEasyReading = false;
        }
      } else if (this._termBuf.cur_y == lastRowNum) {
        if (!this.easyReadingShowPushInitText) {
          var lastRowText = this._termBuf.getRowText(lastRowNum, 0, this._termBuf.cols);
          var result = parsePushInitText(lastRowText);
          if (result) {
            this.easyReadingShowPushInitText = true;
          } else {
            this.easyReadingShowPushInitText = false;
            return;
          }
        }
      } else if (this._termBuf.cur_y == lastRowNum - 1) {
        var secondToLastRowText = this._termBuf.getRowText(lastRowNum - 1, 0, this._termBuf.cols);
        var result = parseReplyText(secondToLastRowText);
        if (result) {
          this.easyReadingShowReplyText = true;
        } else {
          this.easyReadingShowReplyText = false;
          return;
        }
      } else {
        // last line hasn't changed
        return;
      }
    }
  }

  _onViewUpdated(e) {
    console.debug('view update');
    if (this.sendCommandAfterUpdate) {
      console.debug("send:" + this.sendCommandAfterUpdate);
      if (this.sendCommandAfterUpdate != 'skipOne') {
        this._send(this.sendCommandAfterUpdate);
      }
      this.sendCommandAfterUpdate = '';
    }
  }

  leaveCurrentPost() {
    console.debug('leave current post');
    if (this._core && typeof this._core.suppressInertialWheel === 'function') {
      this._core.suppressInertialWheel();
    }
    if (!this.easyReadingReachedPageEnd) {
      this.ignoreOneUpdate = true;
    }
    this._termBuf.prevPageState = 0;
  }

  stopEasyReading() {
    console.debug('stop easy reading');
    this.sendCommandAfterUpdate = 'skipOne';
    if (this._core && typeof this._core.suppressInertialWheel === 'function') {
      this._core.suppressInertialWheel();
    }
  }

  _send(data) {
    this._view.conn.send(data);
  }

  send(data) {
    this._send(data);
  }

  hide() {
    this._view.hideEasyReading();
  }

  _onKeyDown(e) {
    if (!this._enabled || !this.startedEasyReading)
      return;

    this._onKeyDownProcessUI(e);
    if (e.defaultPrevented)
      return;

    const profile = this._termBuf.siteProfile;
    var stop = false;
    if (!e.ctrlKey && !e.altKey) {
      switch (e.key) {
        case 'Backspace':
        case 'ArrowUp':
          if (profile.navigatePrevPost(this))
            stop = true;
          break;
        case 'Enter':
        case 'ArrowDown':
          if (profile.navigateNextPost(this))
            stop = true;
          break;
      }
    } else if (e.ctrlKey && !e.altKey) {
      switch (e.key) {
        case 'h':
          if (profile.navigatePrevPost(this))
            stop = true;
          break;
      }
    }
    if (stop)
      e.preventDefault();
  }

  _scrollBy(lines) {
    var cont = this._view.easyReadingContent;
    if (!cont)
      return false;
    if (lines < 0 && cont.scrollTop <= 0)
      return false;
    if (lines > 0 && cont.scrollTop >= cont.scrollHeight - cont.clientHeight)
      return false;
    cont.scrollTop += this._view.chh * lines;
    return true;
  }

  _scrollEnd() {
    if (!this._view.easyReadingContent)
      return false;
    this._view.easyReadingContent.scrollTop = this._view.easyReadingContent.scrollHeight;
    return true;
  }

  _scrollTop() {
    if (!this._view.easyReadingContent)
      return false;
    this._view.easyReadingContent.scrollTop = 0;
    return true;
  }

  _onKeyDownProcessUI(e) {
    const profile = this._termBuf.siteProfile;
    if (profile.handleEasyReadingKeyDown && profile.handleEasyReadingKeyDown(this, e)) {
      e.preventDefault();
      return;
    }

    var stop = false;
    if (!e.ctrlKey && !e.altKey) {
      switch (e.key) {
        case 'Backspace':
          stop = this._scrollBy(-this._turnPageLines);
          if (!stop)
            this.leaveCurrentPost();
          break;
        case 'ArrowRight':
        case ' ':
        case 't':
          this._scrollBy(this._turnPageLines);
          stop = true;
          break;
        case 'PageUp':
          this._scrollBy(-this._turnPageLines);
          stop = true;
          break;
        case 'PageDown':
          this._scrollBy(this._turnPageLines);
          stop = true;
          break;
        case 'Escape':
          // Temporarily hide easy reading overlay to reveal the underlying terminal screen
          this._view.hideEasyReading();
          stop = true;
          break;
        case 'ArrowLeft':
          this.stopEasyReading();
          this.hide();
          break;
        case 'ArrowUp':
          stop = this._scrollBy(-1);
          if (!stop)
            this.leaveCurrentPost();
          break;
        case 'Enter':
        case 'ArrowDown':
          stop = this._scrollBy(1);
          if (!stop) {
            if (!this.easyReadingReachedPageEnd) {
              stop = true;
            } else {
              this.leaveCurrentPost();
            }
          }
          break;
        case 'k':
          stop = this._scrollBy(-1);
          stop = true;
          break;
        case 'j':
          stop = this._scrollBy(1);
          stop = true;
          break;
        case 'Home':
        case '0':
        case 'g':
          this._scrollTop();
          stop = true;
          break;
        case 'End':
        case '$':
        case 'G':
          this._scrollEnd();
          stop = true;
          break;
        case 'Tab':
          stop = true;
          break;
      }
    } else if (e.ctrlKey && !e.altKey) {
      switch (e.key) {
        case 'f':
          this._scrollBy(this._turnPageLines);
          stop = true;
          break;
        case 'b':
          this._scrollBy(-this._turnPageLines);
          stop = true;
          break;
        case 'h':
          stop = this._scrollBy(-this._turnPageLines);
          if (!stop)
            this.leaveCurrentPost();
          break;
      }
    }
    if (stop)
      e.preventDefault();
  }

  _onMouseClick(e) {
    if (!this._enabled || !this.startedEasyReading)
      return;
    var stop = false;
    // XXX Should not use term buffer to track mouse cursor.
    switch (this._termBuf.mouseCursor) {
      case 0:
      case 1: // Arrow Left
        this.stopEasyReading();
        this.hide();
        break;
      case 2: // Page Up
        this._scrollBy(-this._turnPageLines);
        stop = true;
        break;
      case 3: // Page Down
        this._scrollBy(this._turnPageLines);
        stop = true;
        break;
      case 4: // Home
        this._scrollTop();
        stop = true;
        break;
      case 5: // End
        this._scrollEnd();
        stop = true;
        break;
      case 6:
      case 7:
        break;
      case 8: // [
      case 9: // ]
      case 10: // =
      case 12: // Refresh post / pushed texts
      case 13: // Last post with the same title (LIST)
      case 14: // Last post with the same title (READING)
        this.leaveCurrentPost();
        break;
      default: // Do nothing
        break;
    }
    if (stop)
      e.preventDefault();
  }
}
