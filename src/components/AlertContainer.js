import React, { useState, useEffect } from "react";
import { createPortal } from "preact/compat";
import ConnectionAlert from "./ConnectionAlert";
import PasteShortcutAlert from "./PasteShortcutAlert";
import DeveloperModeAlert from "./DeveloperModeAlert";

export const AlertContainer = ({ app, container }) => {
  const [alert, setAlert] = useState(app ? app.activeAlert : null);

  useEffect(() => {
    if (!app) return;
    const handleAlertChange = (nextAlert) => {
      setAlert(nextAlert);
    };
    app.onAlertChange = handleAlertChange;
    setAlert(app.activeAlert);
    return () => {
      if (app.onAlertChange === handleAlertChange) {
        app.onAlertChange = null;
      }
    };
  }, [app]);

  if (!alert) {
    return null;
  }

  const handleDismiss = () => {
    const onDismiss = alert.onDismiss;
    if (app) {
      app.dismissAlert(alert.type);
    } else {
      setAlert(null);
    }
    if (onDismiss) {
      onDismiss();
    }
  };

  let alertComponent = null;
  switch (alert.type) {
    case "developerMode":
      alertComponent = <DeveloperModeAlert onDismiss={handleDismiss} {...alert.props} />;
      break;
    case "connection":
      alertComponent = <ConnectionAlert onDismiss={handleDismiss} {...alert.props} />;
      break;
    case "pasteShortcut":
      alertComponent = <PasteShortcutAlert onDismiss={handleDismiss} {...alert.props} />;
      break;
    default:
      if (alert.component) {
        const CustomAlert = alert.component;
        alertComponent = <CustomAlert onDismiss={handleDismiss} {...alert.props} />;
      }
      break;
  }

  if (!alertComponent) {
    return null;
  }

  const target =
    container ||
    (typeof document !== "undefined"
      ? document.getElementById("reactAlert") || document.body
      : null);

  if (!target) {
    return alertComponent;
  }

  return createPortal(alertComponent, target);
};

export default AlertContainer;
