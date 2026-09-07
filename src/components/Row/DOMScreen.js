import React from "react";
import Row from "./index";
import ImagePreviewer, {
  initialImagePreviewState,
  resetImagePreviewState,
  updateImagePreviewMove,
  createImagePreviewRequest,
} from "../ImagePreviewer";

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

  componentDidUpdate(prevProps) {
    if (
      this.props.lines !== prevProps.lines &&
      this.state.currentImagePreview
    ) {
      this.setState(resetImagePreviewState());
    }
  }

  handleMouseMove = ({ clientX, clientY }) => {
    const nextPos = updateImagePreviewMove(this.state, clientX, clientY);
    if (nextPos) {
      this.setState(nextPos);
    }
  };

  handleHyperLinkMouseOver = (e) => {
    if (this.props.enableLinkHoverPreview) {
      const href = e && e.currentTarget ? e.currentTarget.href : undefined;
      if (href) {
        if (this.state.currentImagePreview && this.state.previewHref === href) {
          return;
        }
        const whitelistOnly = this.props.picPreviewWhitelistOnly !== false;
        const request = createImagePreviewRequest(href, whitelistOnly);
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
    this.setState(resetImagePreviewState());
  };

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
        <ImagePreviewer.HoverPreview
          request={this.state.currentImagePreview}
          href={this.state.previewHref}
          left={this.state.left}
          top={this.state.top}
        />
      </div>
    );
  }
}

export default DOMScreen;
