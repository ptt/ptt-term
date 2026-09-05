import React from "react";
import DOMScreen from "./Row/DOMScreen";
import CanvasScreen from "./Canvas/CanvasScreen";

export class Screen extends React.Component {
  constructor(props) {
    super(props);
    this.implRef = React.createRef();
  }

  setCurrentHighlighted = (currentHighlighted) => {
    if (this.implRef.current && this.implRef.current.setCurrentHighlighted) {
      this.implRef.current.setCurrentHighlighted(currentHighlighted);
    }
  };

  onBlink = () => {
    if (this.implRef.current && this.implRef.current.onBlink) {
      this.implRef.current.onBlink();
    }
  };

  getSelectedText = () => {
    if (
      this.implRef.current &&
      typeof this.implRef.current.getSelectedText === "function"
    ) {
      return this.implRef.current.getSelectedText();
    }
    return "";
  };

  getSelectionColRow = () => {
    if (
      this.implRef.current &&
      typeof this.implRef.current.getSelectionColRow === "function"
    ) {
      return this.implRef.current.getSelectionColRow();
    }
    return null;
  };

  selectAll = () => {
    if (
      this.implRef.current &&
      typeof this.implRef.current.selectAll === "function"
    ) {
      this.implRef.current.selectAll();
    }
  };

  render() {
    if (this.props.useCanvas) {
      return <CanvasScreen ref={this.implRef} {...this.props} />;
    }
    return <DOMScreen ref={this.implRef} {...this.props} />;
  }
}

export {
  DOMScreen,
  CanvasScreen,
};
export default Screen;
