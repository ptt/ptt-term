import React from "react";
import { i18n } from "../js/i18n";
import "./PageTopAlert.css";

export const DeveloperModeAlert = ({ onDismiss }) => (
  <div
    role="alert"
    className="alert alert-purple alert-dismissible PageTopAlert fade in"
  >
    <button
      type="button"
      className="close"
      aria-label="Close"
      onClick={onDismiss}
    >
      <span aria-hidden="true">&times;</span>
    </button>
    <h4>{i18n("alert_developerModeHeader")}</h4>
    <p>{i18n("alert_developerModeText")}</p>
    <p>
      <button type="button" className="btn btn-purple" onClick={onDismiss}>
        {i18n("alert_developerModeDismiss")}
      </button>
    </p>
  </div>
);

export default DeveloperModeAlert;
