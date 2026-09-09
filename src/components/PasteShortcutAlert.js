import React from "react";
import { _ } from "../js/i18n";
import "./PageTopAlert.css";

export const PasteShortcutAlert = ({ onDismiss }) => (
  <div
    role="alert"
    className="alert alert-info alert-dismissible PageTopAlert"
    tabIndex={-1}
  >
    <button
      type="button"
      className="close"
      aria-label="Close"
      onClick={onDismiss}
    >
      <span aria-hidden="true">&times;</span>
    </button>
    <h4>{_("alert_pasteShortcutHeader")}</h4>
    <p>{_("alert_pasteShortcutText")}</p>
    <p>
      <button type="button" className="btn btn-primary" onClick={onDismiss}>
        {_("alert_pasteShortcutClose")}
      </button>
    </p>
  </div>
);

export default PasteShortcutAlert;
