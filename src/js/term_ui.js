import React from 'react';
import { render } from 'preact';
import Row from "../components/Row";
import Screen from "../components/Screen";

export class ColorState {
  constructor(fg, bg, blink) {
    this.fg = fg;
    this.bg = bg;
    this.blink = blink;
  }

  equals(oth) {
    if (oth instanceof ColorState) {
      return this.fg == oth.fg && this.bg == oth.bg && this.blink == oth.blink;
    }
    return false;
  }
}

/**
 * @deprecated
 */
export function renderRowHtml(chars, row, forceWidth, enableLinkInlinePreview, cont) {
  let instance = null;
  render(
    <Row
      ref={(inst) => { instance = inst; }}
      chars={chars}
      row={row}
      forceWidth={forceWidth}
      enableLinkInlinePreview={enableLinkInlinePreview}
    />,
    cont
  );
  return instance;
}

export function renderScreen(lines, forceWidth, enableLinkInlinePreview, enableLinkHoverPreview, cont, options = {}, ref) {
  let instance = null;
  const { ref: optionsRef, ...restOptions } = options;
  const targetRef = ref || optionsRef;
  const setRef = (inst) => {
    instance = inst;
    if (typeof targetRef === 'function') {
      targetRef(inst);
    } else if (targetRef && 'current' in targetRef) {
      targetRef.current = inst;
    }
  };

  render(
    <Screen
      ref={setRef}
      lines={lines}
      forceWidth={forceWidth}
      enableLinkInlinePreview={enableLinkInlinePreview}
      enableLinkHoverPreview={enableLinkHoverPreview}
      {...restOptions}
    />,
    cont
  );

  return instance;
}

