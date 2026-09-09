import "./TouchUI.css";
import React from "react";
import { TouchKeyboard } from "./TouchKeyboard.js";

export {
  VirtualKeyboard,
  VirtualKeyboardPlugin,
  TouchKeyboardPlugin,
  TouchUIPlugin,
} from "../plugins/virtual_keyboard/index.js";

/**
 * TouchUI provides the unified container component for all touch interface elements,
 * rendering the virtual floating keyboard and keypad tools.
 */
export class TouchUI extends React.Component {
  render() {
    return <TouchKeyboard {...this.props} />;
  }
}

export default TouchUI;
