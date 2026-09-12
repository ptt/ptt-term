import React from "react";
import Row from "./index";

const initialImagePreviewState = {
  currentImagePreview: undefined,
  previewHref: undefined,
  left: undefined,
  top: undefined,
};

const resetImagePreviewState = () => ({ ...initialImagePreviewState });

const updateImagePreviewMove = (state, clientX, clientY) => {
  if (
    state &&
    state.currentImagePreview &&
    (state.left === undefined || state.top === undefined)
  ) {
    return { left: clientX, top: clientY };
  }
  return null;
};

export class DOMScreen extends React.Component {
  state = {
    currentHighlighted: undefined,
    ...initialImagePreviewState,
  };

  setCurrentHighlighted = (currentHighlighted) => {
    this.setState({ currentHighlighted });
  };

  onBlink = () => {};

  getSelectedText = () => {
    if (typeof window !== "undefined") {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        return sel.toString().replace(/\u00a0/g, " ");
      }
    }
    return "";
  };

  getSelectionColRow = () => {
    return null;
  };

  selectAll = () => {
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      const el = document.getElementById("mainContainer");
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  };

  startSelection = () => {};
  updateSelection = () => {};
  endSelection = () => {
    return this.getSelectedText();
  };

  clearSelection = () => {
    if (typeof window !== "undefined") {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
      }
    }
  };

  componentDidUpdate(prevProps) {
    if (
      (this.props.lines !== prevProps.lines ||
        (prevProps.enableLinkHoverPreview && !this.props.enableLinkHoverPreview)) &&
      this.state.currentImagePreview
    ) {
      const resetState =
        this.props.resetHyperlinkPreviewState ||
        resetImagePreviewState;
      this.setState(resetState());
    }
  }

  handleMouseMove = (e) => {
    const clientX = e?.clientX;
    const clientY = e?.clientY;
    this.props.onHyperlinkMove?.(e, { screen: this });

    const updateMove =
      this.props.updateHyperlinkPreviewMove || updateImagePreviewMove;
    const nextPos = updateMove(this.state, clientX, clientY);
    if (nextPos) {
      this.setState(nextPos);
    }
  };

  handleHyperLinkMouseOver = (e) => {
    const href = e && e.currentTarget ? e.currentTarget.href : undefined;
    const propHandled = this.props.onHyperlinkHover?.(e, href, { screen: this });

    if (propHandled === false) {
      return;
    }

    if (this.props.enableLinkHoverPreview) {
      if (href) {
        if (this.state.currentImagePreview && this.state.previewHref === href) {
          return;
        }
        const createRequest = this.props.createHyperlinkPreviewRequest;
        const request = createRequest?.(href);
        if (request) {
          this.setState({
            currentImagePreview: request,
            previewHref: href,
            left: e.clientX,
            top: e.clientY,
          });
        }
      }
    }
  };

  handleHyperLinkMouseOut = (e) => {
    if (
      e &&
      e.relatedTarget &&
      e.currentTarget &&
      e.currentTarget.contains(e.relatedTarget)
    ) {
      return;
    }

    const propHandled = this.props.onHyperlinkLeave?.(e, { screen: this });

    if (propHandled === false) {
      return;
    }

    const resetState =
      this.props.resetHyperlinkPreviewState ||
      resetImagePreviewState;
    this.setState(resetState());
  };

  renderHyperlinkPreview() {
    if (typeof this.props.renderHyperlinkPreview !== "function") {
      return null;
    }
    const previewState = {
      request: this.state.currentImagePreview,
      href: this.state.previewHref,
      left: this.state.left,
      top: this.state.top,
    };
    return this.props.renderHyperlinkPreview(previewState);
  }

  render() {
    return (
      <div id="mainContainer" onMouseMove={this.handleMouseMove}>
        {this.props.lines &&
          this.props.lines.map((chars, row) => (
            <Row
              key={row}
              chars={chars}
              row={row}
              forceWidth={this.props.forceWidth}
              enableLinkInlinePreview={this.props.enableLinkInlinePreview}
              highlighted={this.state.currentHighlighted === row}
              onHyperLinkMouseOver={this.handleHyperLinkMouseOver}
              onHyperLinkMouseOut={this.handleHyperLinkMouseOut}
            />
          ))}
        {this.renderHyperlinkPreview()}
      </div>
    );
  }
}

export default DOMScreen;
