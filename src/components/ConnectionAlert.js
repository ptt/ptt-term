import React from "react";
import { compose, lifecycle } from "recompose";
import { Alert, Button, Fade } from "react-bootstrap";
import { i18n } from "../js/i18n";
import "./PageTopAlert.css";

const enhance = compose(
  lifecycle({
    componentDidMount() {
      this.handler = (e) => {
        const target = e.target;
        const isEditable =
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable);
        const isInModal =
          document.body.classList.contains("modal-open") ||
          (target && target.closest && target.closest(".modal"));

        if (isEditable || isInModal) {
          return;
        }

        if (e.keyCode === 13) {
          this.props.onDismiss();
        }
        // Kills everything because we don't want any further action performed under ConnectionAlert status
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      window.addEventListener("keydown", this.handler, true);
    },
    componentWillUnmount() {
      window.removeEventListener("keydown", this.handler, true);
    },
  })
);

export const ConnectionAlert = ({ onDismiss }) => (
  <Fade in>
    <Alert bsStyle="danger" className="PageTopAlert" onDismiss={onDismiss}>
      <h4>{i18n("alert_connectionHeader")}</h4>
      <p>{i18n("alert_connectionText")}</p>
      <p>
        <Button bsStyle="danger" onClick={onDismiss}>
          {i18n("alert_connectionReconnect")}
        </Button>
      </p>
    </Alert>
  </Fade>
);

export default enhance(ConnectionAlert);
