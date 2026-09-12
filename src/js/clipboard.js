export class ClipboardManager {
  constructor() {
    this.strToCopy = null;
  }

  formatCopyText(str, trimTrailingSpaces = true) {
    if (typeof str !== 'string' || str.indexOf('\x1b') >= 0) return str;
    if (trimTrailingSpaces !== false) {
      return str
        .split(/\r\n|\r|\n/)
        .map((line) => line.replace(/[ \t]+$/, ''))
        .join('\r')
        .replace(/[ \t\r]+$/, '');
    }
    return str.replace(/\r\n|\n/g, '\r');
  }

  async copyText(str, { trimTrailingSpaces = true } = {}) {
    if (typeof str !== 'string') return;
    const formatted = this.formatCopyText(str, trimTrailingSpaces);
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(formatted);
        return;
      } catch (err) {
        // Fall back to execCommand if permission denied or unsupported context
      }
    }
    this.strToCopy = formatted;
    let textarea = null;
    try {
      if (typeof document !== 'undefined' && document.body) {
        textarea = document.createElement('textarea');
        textarea.value = formatted;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        textarea.style.left = '-9999px';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, formatted.length);
      }
      if (typeof document !== 'undefined' && document.execCommand) {
        document.execCommand('copy');
      }
    } catch (err) {}
    if (textarea && textarea.parentNode) {
      textarea.parentNode.removeChild(textarea);
    }
    this.strToCopy = null;
  }

  handleDOMCopy(e, { getSelectedText, trimTrailingSpaces = true } = {}) {
    if (this.strToCopy) {
      e.clipboardData.setData('text', this.strToCopy);
      e.preventDefault();
      console.log('copied: ', this.strToCopy);
    } else if (typeof getSelectedText === 'function') {
      const text = this.formatCopyText(getSelectedText(), trimTrailingSpaces);
      if (text) {
        e.clipboardData.setData('text', text);
        e.preventDefault();
      }
    }
  }

  formatPasteText(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/\r\n|\n/g, '\r');
  }

  async readText() {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      const text = await navigator.clipboard.readText();
      return this.formatPasteText(text);
    }
    throw new Error('Clipboard API not available');
  }

  handleDOMPaste(e) {
    const raw = e?.clipboardData
      ? e.clipboardData.getData('text/plain') || e.clipboardData.getData('text')
      : '';
    const str = this.formatPasteText(raw);
    if (str) {
      e.preventDefault?.();
    }
    return str;
  }

  createPasteEvent(content, originalEvent = null) {
    if (typeof content !== 'string') {
      return null;
    }
    const normalized = this.formatPasteText(content);
    const detail = {
      data: normalized,
      text: normalized,
      originalEvent,
    };
    return {
      type: 'term:paste',
      detail,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      get data() {
        return detail.data;
      },
      set data(val) {
        detail.data = val;
        detail.text = val;
      },
      get text() {
        return detail.text;
      },
      set text(val) {
        detail.data = val;
        detail.text = val;
      },
    };
  }

  completePaste(view, event) {
    if (!event || event.defaultPrevented) {
      return false;
    }
    if (view?.buf?.site?.onPaste) {
      view.buf.site.onPaste(event);
      if (event.defaultPrevented) {
        return false;
      }
    }
    const result = event.data ?? event.text ?? event.detail?.data ?? event.detail?.text;
    if (typeof result !== 'string') {
      return false;
    }
    if (view?.paste) {
      view.paste(result);
    } else if (view?.onTextInput) {
      view.onTextInput(result, true);
    }
    return true;
  }
}
