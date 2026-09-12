import React from "preact/compat";

export class PluginOverlay extends React.Component {
  componentDidMount() {
    this._attachApp(this.props.app);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.app !== this.props.app) {
      this._detachApp(prevProps.app);
      this._attachApp(this.props.app);
    }
  }

  componentWillUnmount() {
    this._detachApp(this.props.app);
  }

  _attachApp(app) {
    if (app) {
      this._onOverlayUpdate = () => this.forceUpdate();
      app.on("term:overlay:update", this._onOverlayUpdate);
    }
  }

  _detachApp(app) {
    if (app && this._onOverlayUpdate) {
      app.off("term:overlay:update", this._onOverlayUpdate);
      this._onOverlayUpdate = null;
    }
  }

  render() {
    const { app } = this.props;
    if (!app) return null;

    const elements = [];
    const renderedIds = new Set();

    // 1. Render overlays from registered overlay items
    const registeredOverlays = app.getOverlays ? app.getOverlays() : [];
    for (const item of registeredOverlays) {
      if (item.id) {
        renderedIds.add(item.id);
      }
      if (typeof item.render === "function") {
        const rendered = item.render({ app });
        if (rendered) {
          elements.push(
            React.createElement(React.Fragment, { key: item.id }, rendered)
          );
        }
      }
    }

    // 2. Render overlays from plugins implementing renderOverlay without registering
    const plugins = app.plugins || [];
    for (const plugin of plugins) {
      const pluginId = plugin.id || plugin.name;
      if (
        !renderedIds.has(pluginId) &&
        !plugin._initialized &&
        plugin.enabled !== false &&
        typeof plugin.renderOverlay === "function"
      ) {
        const rendered = plugin.renderOverlay({ app });
        if (rendered) {
          renderedIds.add(pluginId);
          elements.push(
            React.createElement(React.Fragment, { key: pluginId }, rendered)
          );
        }
      }
    }

    if (elements.length === 0) return null;

    return React.createElement(
      "div",
      { className: "PluginOverlay-container" },
      elements
    );
  }
}

export default PluginOverlay;
