import React from "react";
import DOMScreen from "./Row/DOMScreen";
import CanvasScreen from "./Canvas/CanvasScreen";

export class Screen extends React.Component {
  constructor(props) {
    super(props);
    this.implRef = React.createRef();
  }

  setCurrentHighlighted = (currentHighlighted) => {
    if (this.implRef.current) {
      this.implRef.current.setCurrentHighlighted(currentHighlighted);
    }
  };

  onBlink = () => {
    if (this.implRef.current) {
      this.implRef.current.onBlink();
    }
  };

  getSelectedText = () => {
    if (this.implRef.current) {
      return this.implRef.current.getSelectedText();
    }
    return "";
  };

  getSelectionColRow = () => {
    if (this.implRef.current) {
      return this.implRef.current.getSelectionColRow();
    }
    return null;
  };

  selectAll = () => {
    if (this.implRef.current) {
      this.implRef.current.selectAll();
    }
  };

  startSelection = (coords) => {
    if (this.implRef.current && this.implRef.current.startSelection) {
      this.implRef.current.startSelection(coords);
    }
  };

  updateSelection = (coords) => {
    if (this.implRef.current && this.implRef.current.updateSelection) {
      this.implRef.current.updateSelection(coords);
    }
  };

  endSelection = () => {
    if (this.implRef.current && this.implRef.current.endSelection) {
      return this.implRef.current.endSelection();
    }
    return "";
  };

  clearSelection = () => {
    if (this.implRef.current && this.implRef.current.clearSelection) {
      this.implRef.current.clearSelection();
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
