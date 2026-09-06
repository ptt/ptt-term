import React, { useEffect } from "react";
import { i18n } from "../js/i18n";
import "./PageTopAlert.css";

export const ConnectionAlert = ({ onDismiss }) => {
  useEffect(() => {
    const handler = (e) => {
      const target = e.target;
      const isEditable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      const isInModal =
        document.body.classList.contains("modal-open") ||
        (target && target.closest && target.closest(".modal")) ||
        (target && target.closest && target.closest("dialog[open]"));

      if (isEditable || isInModal) {
        return;
      }

      if (e.keyCode === 13) {
        onDismiss();
      }
      // Kills everything because we don't want any further action performed under ConnectionAlert status
      e.preventDefault();
      e.stopImmediatePropagation();
    };

    window.addEventListener("keydown", handler, true);
    return () => {
      window.removeEventListener("keydown", handler, true);
    };
  }, [onDismiss]);

  return (
    <div
      role="alert"
      className="alert alert-danger alert-dismissible PageTopAlert fade in"
    >
      <button
        type="button"
        className="close"
        aria-label="Close"
        onClick={onDismiss}
      >
        <span aria-hidden="true">&times;</span>
      </button>
      <h4>{i18n("alert_connectionHeader")}</h4>
      <p>{i18n("alert_connectionText")}</p>
      <p>
        <button type="button" className="btn btn-danger" onClick={onDismiss}>
          {i18n("alert_connectionReconnect")}
        </button>
      </p>
    </div>
  );
};

export default ConnectionAlert;
