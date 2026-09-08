import { i18n } from '../../js/i18n.js';

export class LiveHelperUI {
  constructor(plugin) {
    this.plugin = plugin;
    this.dialogElem = null;
    this.enableBtn = null;
    this.secInput = null;
    this.dragActive = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dialogInitialTop = 0;
    this.dialogInitialLeft = 0;
    this._onMouseMove = null;
    this._onMouseUp = null;
  }

  ensureElement() {
    if (this.dialogElem || typeof document === 'undefined') return this.dialogElem;

    const dialog = document.createElement('dialog');
    dialog.className = 'NativeDialog LiveHelperModal__Dialog';

    const content = document.createElement('div');
    content.className = 'NativeDialog__content';

    const body = document.createElement('div');
    body.className = 'LiveHelperModal__Body';
    body.style.cursor = 'move';

    // Enable/Disable toggle button
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-default nomouse_command ${this.plugin.active ? 'active' : ''}`;
    btn.title = 'Alt + r';
    btn.style.cursor = 'pointer';
    btn.textContent = i18n('liveHelperEnable');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.plugin.toggle();
    });
    this.enableBtn = btn;
    body.appendChild(btn);

    // Span "每"
    const textSpan1 = document.createElement('span');
    textSpan1.className = 'LiveHelperModal__Body__Text nomouse_command';
    textSpan1.textContent = i18n('liveHelperSpan');
    body.appendChild(textSpan1);

    // Number input
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'LiveHelperModal__Body__Input form-control nomouse_command';
    input.value = String(this.plugin.intervalSec || 1);
    input.min = '1';
    input.style.cursor = 'text';
    input.addEventListener('change', (e) => {
      this.plugin.setIntervalSec(e.target.value);
    });
    this.secInput = input;
    body.appendChild(input);

    // Span "秒自動更新"
    const textSpan2 = document.createElement('span');
    textSpan2.className = 'LiveHelperModal__Body__Text nomouse_command';
    textSpan2.textContent = i18n('liveHelperSpanSec');
    body.appendChild(textSpan2);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'LiveHelperModal__Body__Close close nomouse_command';
    closeBtn.style.cursor = 'pointer';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.plugin.hideModal();
    });
    body.appendChild(closeBtn);

    // Drag handling
    body.addEventListener('mousedown', (e) => this.handleMouseDown(e));

    content.appendChild(body);
    dialog.appendChild(content);

    const mountTarget =
      (this.plugin.app && this.plugin.app.termWin) ||
      document.getElementById('TermWindow') ||
      document.body;
    if (mountTarget?.appendChild) {
      mountTarget.appendChild(dialog);
    }
    this.dialogElem = dialog;
    return dialog;
  }

  handleMouseDown(e) {
    if (
      e.button !== 0 ||
      e.target.tagName === 'BUTTON' ||
      e.target.tagName === 'INPUT' ||
      e.target.closest?.('button') ||
      e.target.closest?.('input')
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
      this.dialogElem.style.margin = '0';
      this.dialogElem.style.right = 'auto';
      this.dialogElem.style.top = `${rect.top}px`;
      this.dialogElem.style.left = `${rect.left}px`;
    }
    this._onMouseMove = (ev) => this.handleMouseMove(ev);
    this._onMouseUp = () => this.handleMouseUp();
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
  }

  handleMouseMove(e) {
    if (this.dragActive && this.dialogElem) {
      window.getSelection?.()?.removeAllRanges();
      const top = this.dialogInitialTop + (e.clientY - this.dragStartY);
      const left = this.dialogInitialLeft + (e.clientX - this.dragStartX);
      this.dialogElem.style.top = `${top}px`;
      this.dialogElem.style.left = `${left}px`;
    }
  }

  handleMouseUp() {
    this.dragActive = false;
    if (this._onMouseMove) {
      window.removeEventListener('mousemove', this._onMouseMove);
      this._onMouseMove = null;
    }
    if (this._onMouseUp) {
      window.removeEventListener('mouseup', this._onMouseUp);
      this._onMouseUp = null;
    }
  }

  update() {
    if (!this.dialogElem && !this.plugin.showsModal) return;
    this.ensureElement();
    if (!this.dialogElem) return;

    if (this.enableBtn) {
      if (this.plugin.active) {
        this.enableBtn.classList.add('active');
      } else {
        this.enableBtn.classList.remove('active');
      }
    }
    if (this.secInput && document.activeElement !== this.secInput) {
      this.secInput.value = String(this.plugin.intervalSec || 1);
    }
    if (this.plugin.showsModal) {
      if (!this.dialogElem.open) {
        try {
          if (typeof this.dialogElem.show === 'function') {
            this.dialogElem.show();
          } else {
            this.dialogElem.setAttribute('open', '');
          }
        } catch (e) {}
      }
      this.dialogElem.style.display = '';
    } else {
      if (this.dialogElem.open) {
        try {
          if (typeof this.dialogElem.close === 'function') {
            this.dialogElem.close();
          } else {
            this.dialogElem.removeAttribute('open');
          }
        } catch (e) {}
      }
      this.dialogElem.style.display = 'none';
    }
  }

  destroy() {
    this.handleMouseUp();
    if (this.dialogElem) {
      this.dialogElem.remove();
      this.dialogElem = null;
      this.enableBtn = null;
      this.secInput = null;
    }
  }
}

export default LiveHelperUI;
