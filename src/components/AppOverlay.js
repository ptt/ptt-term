import React from "react";
import ContextMenu from "./ContextMenu";
import AlertContainer from "./AlertContainer";

export const AppOverlay = ({ app }) => {
  return (
    <React.Fragment>
      <ContextMenu app={app} />
      <AlertContainer app={app} />
    </React.Fragment>
  );
};

export default AppOverlay;
