import React from "react";
import { i18n } from "../js/i18n";
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
    <h4>{i18n("alert_pasteShortcutHeader")}</h4>
    <p>{i18n("alert_pasteShortcutText")}</p>
    <p>
      <button type="button" className="btn btn-primary" onClick={onDismiss}>
        {i18n("alert_pasteShortcutClose")}
      </button>
    </p>
  </div>
);

export default PasteShortcutAlert;
