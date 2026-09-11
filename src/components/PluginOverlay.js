import React from "react";

export class PluginOverlay extends React.Component {
  componentDidMount() {
    const { app } = this.props;
    if (app) {
      this._onOverlayUpdate = () => this.forceUpdate();
      app.on("term:overlay:update", this._onOverlayUpdate);
      app.on("term:pref-change", this._onOverlayUpdate);
    }
  }

  componentWillUnmount() {
    const { app } = this.props;
    if (app && this._onOverlayUpdate) {
      app.off("term:overlay:update", this._onOverlayUpdate);
      app.off("term:pref-change", this._onOverlayUpdate);
    }
  }

  render() {
    const { app } = this.props;
    if (!app) return null;

    const elements = [];

    // 1. Render overlays from registered overlay items
    const registeredOverlays = app.getOverlays ? app.getOverlays() : [];
    for (const item of registeredOverlays) {
      if (typeof item.render === "function") {
        const rendered = item.render({ app });
        if (rendered) {
          elements.push(<React.Fragment key={item.id}>{rendered}</React.Fragment>);
        }
      }
    }

    // 2. Render overlays from plugins implementing renderOverlay
    const plugins = app.plugins || [];
    for (const plugin of plugins) {
      if (typeof plugin.renderOverlay === "function") {
        const rendered = plugin.renderOverlay({ app });
        if (rendered) {
          elements.push(
            <React.Fragment key={plugin.id || plugin.name}>
              {rendered}
            </React.Fragment>
          );
        }
      }
    }

    if (elements.length === 0) return null;

    return <div className="PluginOverlay-container">{elements}</div>;
  }
}

export default PluginOverlay;
