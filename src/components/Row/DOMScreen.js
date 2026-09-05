import React from "react";
import Row from "./index";
import ImagePreviewer, {
  of,
  resolveSrcToImageUrl,
  resolveWithImageDOM,
} from "../ImagePreviewer";

export class DOMScreen extends React.Component {
  state = {
    currentHighlighted: undefined,
    currentImagePreview: undefined,
    left: undefined,
    top: undefined,
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
      this.setState({
        currentImagePreview: undefined,
        left: undefined,
        top: undefined,
      });
    }
  }

  handleMouseMove = ({ clientX, clientY }) => {
    if (this.state.currentImagePreview) {
      this.setState({
        left: clientX,
        top: clientY,
      });
    }
  };

  handleHyperLinkMouseOver = ({ currentTarget: { href } }) => {
    if (this.props.enableLinkHoverPreview) {
      this.setState({
        currentImagePreview: of(href)
          .then(resolveSrcToImageUrl)
          .then(resolveWithImageDOM),
      });
    }
  };

  handleHyperLinkMouseOut = () => {
    this.setState({ currentImagePreview: undefined });
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
        {this.state.currentImagePreview && (
          <ImagePreviewer
            request={this.state.currentImagePreview}
            component={ImagePreviewer.OnHover}
            left={this.state.left}
            top={this.state.top}
          />
        )}
      </div>
    );
  }
}

export default DOMScreen;
