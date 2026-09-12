import cx from "classnames";
import React from "react";
import NativeDialog from "../NativeDialog";
import { _, setLocale } from "../../js/i18n";
import { FontManager } from "./FontManager";
import "./PrefModal.css";
import {
  DEFAULT_PREFS,
  PREF_STORAGE_KEY,
  getDefaultPrefs,
  readValuesWithDefault,
  writeValues,
  parseCaretStyle,
  serializeCaretStyle,
  parseOptionText,
} from "../../js/pref";
import { COLOR_SCHEMES, applyColorScheme, getContrastColor } from "../../js/color_schemes.js";
import {
  getAvailablePlugins,
  groupPlugins,
  PLUGIN_GROUPS,
} from "../../plugins/index.js";

import {
  buildBugReportUrl,
  getDefaultAppInfo,
  detectSite,
  detectClientType,
  detectClientMode,
  detectOS,
  detectOSVersion,
  detectBrowser,
  detectBrowserVersion,
  detectExtraSettings,
} from "../../js/bug_report.js";

export {
  getDefaultPrefs,
  readValuesWithDefault,
  writeValues,
  parseOptionText,
  groupPlugins,
  PLUGIN_GROUPS,
  buildBugReportUrl,
  detectSite,
  detectClientType,
  detectClientMode,
  detectOS,
  detectOSVersion,
  detectBrowser,
  detectBrowserVersion,
  detectExtraSettings,
};

const ANSI_COLOR_NAMES = [
  "0: Black (背景黑)",
  "1: Red (暗紅)",
  "2: Green (暗綠)",
  "3: Yellow (暗黃)",
  "4: Blue (暗藍)",
  "5: Magenta (暗紫)",
  "6: Cyan (暗青)",
  "7: Light Gray (預設文字)",
  "8: Dark Gray (暗灰)",
  "9: Bright Red (亮紅)",
  "10: Bright Green (亮綠)",
  "11: Bright Yellow (亮黃)",
  "12: Bright Blue (亮藍)",
  "13: Bright Magenta (亮紫)",
  "14: Bright Cyan (亮青)",
  "15: Bright White (亮白)",
];

function ensureHexColor(color) {
  if (!color || typeof color !== "string") return "#000000";
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    return (
      "#" +
      color[1] +
      color[1] +
      color[2] +
      color[2] +
      color[3] +
      color[3]
    );
  }
  return "#000000";
}

const renderPluginIcon = (icon) => {
  switch (icon) {
    case "book":
      return (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <line x1="9" y1="7" x2="15" y2="7" />
          <line x1="9" y1="11" x2="13" y2="11" />
        </svg>
      );
    case "speed":
      return (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 14l4-4" />
          <path d="M3.34 19a10 10 0 1 1 17.32 0" />
        </svg>
      );
    case "debug":
      return (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2v4" />
          <path d="m4.93 4.93 2.83 2.83" />
          <path d="M2 12h4" />
          <path d="m4.93 19.07 2.83-2.83" />
          <rect x="8" y="6" width="8" height="14" rx="4" />
          <path d="M16 12h6" />
          <path d="m19.07 4.93-2.83 2.83" />
          <path d="m19.07 19.07-2.83-2.83" />
        </svg>
      );
    case "timer":
      return (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case "image":
      return (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    case "terminal":
      return (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      );
    case "mouse":
      return (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="5" y="2" width="14" height="20" rx="7" />
          <line x1="12" y1="6" x2="12" y2="10" />
        </svg>
      );
    case "palette":
      return (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
          <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
          <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
          <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
        </svg>
      );
    case "wrap":
    case "wrap_text":
      return (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M3 12h15a3 3 0 1 1 0 6h-4" />
          <polyline points="16 16 14 18 16 20" />
          <line x1="3" y1="18" x2="10" y2="18" />
        </svg>
      );
    case "key":
    case "login":
      return (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
        </svg>
      );
    case "keyboard":
      return (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <line x1="6" y1="8" x2="6" y2="8" />
          <line x1="10" y1="8" x2="10" y2="8" />
          <line x1="14" y1="8" x2="14" y2="8" />
          <line x1="18" y1="8" x2="18" y2="8" />
          <line x1="6" y1="12" x2="6" y2="12" />
          <line x1="10" y1="12" x2="10" y2="12" />
          <line x1="14" y1="12" x2="14" y2="12" />
          <line x1="18" y1="12" x2="18" y2="12" />
          <line x1="7" y1="16" x2="17" y2="16" />
        </svg>
      );
    default:
      return (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      );
  }
};

const renderGroupIcon = (groupId) => {
  switch (groupId) {
    case "ui":
      return (
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="PrefModal__MacListBandIcon"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18" />
          <path d="M9 21V9" />
        </svg>
      );
    case "bbs":
      return (
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="PrefModal__MacListBandIcon"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
          <path d="M7 8h3" />
          <path d="M7 12h7" />
        </svg>
      );
    case "debug":
      return (
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="PrefModal__MacListBandIcon"
        >
          <rect width="8" height="14" x="8" y="6" rx="4" />
          <path d="m19 7-3 2" />
          <path d="m5 7 3 2" />
          <path d="m19 19-3-2" />
          <path d="m5 19 3-2" />
          <path d="M20 13h-4" />
          <path d="M4 13h4" />
          <path d="m10 4 1 2" />
          <path d="m14 4-1 2" />
        </svg>
      );
    default:
      return (
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="PrefModal__MacListBandIcon"
        >
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      );
  }
};

const renderBugIcon = () => (
  <svg
    className="PrefModal__About__BugIcon"
    viewBox="0 0 24 24"
    width="12"
    height="12"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m8 2 1.88 1.88" />
    <path d="M14.12 3.88 16 2" />
    <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
    <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
    <path d="M12 20v-9" />
    <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
    <path d="M6 13H2" />
    <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
    <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
    <path d="M22 13h-4" />
    <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
  </svg>
);

const replaceMsg = (msg, replacements) => {
  return msg.split(/#(\S+)#/gi).map((it, index) => {
    if (index % 2 === 1 && it in replacements) {
      const rep = replacements[it];
      return React.isValidElement(rep)
        ? React.cloneElement(rep, { key: `${it}-${index}` })
        : rep;
    } else {
      return it;
    }
  });
};

const replaceI18n = (id, replacements) => {
  const msg = _(id);
  if (Array.isArray(msg)) {
    return msg.map((it) => replaceMsg(it, replacements));
  }
  return replaceMsg(msg, replacements);
};

const link = (text, url) => (
  <a href={url} target="_blank" rel="noreferrer">
    {text}
  </a>
);

const changeNestedValue = (obj, key, newValue) => {
  let i = key.indexOf(".");
  if (i > 0) {
    let parentKey = key.substring(0, i);
    let subKey = key.substring(i + 1);
    return {
      ...obj,
      [parentKey]: changeNestedValue(obj[parentKey], subKey, newValue),
    };
  }
  return {
    ...obj,
    [key]: newValue,
  };
};


const TabLegend = ({ title, subtitle, onCloseClick }) => (
  <div className="TabLegend">
    <span className="TabLegend__Text">
      <span>{title}</span>
      {subtitle && <small>- {subtitle}</small>}
    </span>
    <button
      type="button"
      className="close"
      onClick={onCloseClick}
      aria-label="Close"
    >
      &times;
    </button>
  </div>
);

export function renderOptionDesc(rawText) {
  const { desc } = parseOptionText(rawText);
  if (!desc) return null;
  return (
    <span
      className="help-block"
      style={{
        fontSize: "12px",
        opacity: 0.7,
        marginTop: "4px",
        display: "block",
      }}
    >
      {desc}
    </span>
  );
}

const SelectOptionGroup = ({
  controlId,
  label,
  name,
  value,
  options,
  onChange,
}) => {
  const currentKey = options[value];
  const currentText = currentKey ? _(currentKey) : "";
  return (
    <div className="form-group" id={controlId}>
      <label className="control-label">{label}</label>
      <select
        className="form-control"
        name={name}
        value={value}
        onChange={onChange}
      >
        {options.map((key, index) => (
          <option key={key} value={index}>
            {parseOptionText(_(key)).label}
          </option>
        ))}
      </select>
      {renderOptionDesc(currentText)}
    </div>
  );
};

export class PrefModal extends React.Component {
  state = {
    navActiveKey: "general",
    values: readValuesWithDefault(),
    expandedPluginId: null,
    collapsedGroupIds: {},
  };

  replacements = {
    link_github_iamchucky: link("Chuck Yang", "https://github.com/iamchucky"),
    link_github_robertabcd: link("robertabcd", "https://github.com/robertabcd"),
    link_github_iid: link(
      "Wei-Cheng Yeh (IID)",
      "https://github.com/IepIweidieng",
    ),
    link_github_hungte: link(
      "Hung-Te Lin (piaip)",
      "https://github.com/hungte",
    ),
    link_github_ptt: link("PTT", "https://github.com/ptt"),
    link_official_PttTerm: link(
      "ptt/ptt-term",
      "https://github.com/ptt/ptt-term",
    ),
    link_robertabcd_PttChrome: link(
      "robertabcd/PttChrome",
      "https://github.com/robertabcd/PttChrome",
    ),
    link_github_current_owner: link(
      APP.GITHUB_REPOSITORY_OWNER,
      "https://github.com/" + APP.GITHUB_REPOSITORY_OWNER,
    ),
    link_current_repo: link(
      APP.GITHUB_REPOSITORY,
      "https://github.com/" + APP.GITHUB_REPOSITORY,
    ),
    link_current_PttChrome: link(
      APP.GITHUB_REPOSITORY,
      "https://github.com/" + APP.GITHUB_REPOSITORY,
    ),
    link_iamchucky_PttChrome: link(
      "iamchucky/PttChrome",
      "https://github.com/iamchucky/PttChrome",
    ),
    link_GPL20: link(
      "GNU General Public License v2.0",
      "https://www.gnu.org/licenses/old-licenses/gpl-2.0.html",
    ),
  };

  renderVersionList = () => {
    const list = replaceI18n("about_version_content", this.replacements);
    if (APP.GITHUB_REPOSITORY?.toLowerCase() !== "ptt/ptt-term") {
      const upstreamItem = replaceI18n(
        "about_version_upstream",
        this.replacements,
      );
      return [list[0], upstreamItem, ...list.slice(1)];
    }
    return list;
  };

  getBugReportUrl = () => {
    return buildBugReportUrl({
      app: this.props.app,
      isTouch: this.props.isTouch,
      values: this.state.values,
      win: typeof window !== "undefined" ? window : undefined,
      nav: typeof navigator !== "undefined" ? navigator : undefined,
      appInfo: getDefaultAppInfo(),
    });
  };

  componentDidMount() {
    this._onI18nChange = () => this.forceUpdate();
    this.props.app?.addEventListener?.("term:i18n:change", this._onI18nChange);
  }

  componentWillUnmount() {
    if (this._onI18nChange) {
      this.props.app?.removeEventListener?.("term:i18n:change", this._onI18nChange);
    }
  }

  componentDidUpdate(prevProps) {
    if (!prevProps.show && this.props.show) {
      this.setState({
        values: readValuesWithDefault(),
        expandedPluginId: null,
      });
    }
  }

  handleCloseClick = () => {
    this.props.onSave(writeValues(this.state.values));
  };

  handleResetClick = () => {
    const defaultValues = getDefaultPrefs();
    setLocale(defaultValues.uiLocale || "auto");
    writeValues(defaultValues);
    this.props.onReset(defaultValues);
    this.setState({ values: defaultValues });
  };

  handleNavSelect = (key) => (e) => {
    e.preventDefault();
    this.setState({ navActiveKey: key });
  };

  pluginHasOptions = (plugin) => {
    return (
      Boolean(plugin.renderOptions) ||
      (Array.isArray(plugin.options) && plugin.options.length > 0)
    );
  };

  handleTogglePluginExpand = (pluginId) => (e) => {
    if (
      e &&
      e.target &&
      e.target.closest &&
      e.target.closest(".PrefModal__MacSwitch")
    ) {
      return;
    }
    this.setState((prevState) => ({
      expandedPluginId:
        prevState.expandedPluginId === pluginId ? null : pluginId,
    }));
  };

  handleToggleGroupCollapse = (groupId) => (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    this.setState((prevState) => ({
      collapsedGroupIds: {
        ...prevState.collapsedGroupIds,
        [groupId]: !prevState.collapsedGroupIds?.[groupId],
      },
    }));
  };

  handleCheckboxChange = ({ target: { name, checked } }) => {
    this.setState((prevState) => {
      let nextValues = changeNestedValue(prevState.values, name, !!checked);
      const plugins = this.getPlugins();
      const matchedPlugin = plugins.find((p) => p.prefKey === name);
      if (matchedPlugin && typeof matchedPlugin.onTogglePref === "function") {
        nextValues = matchedPlugin.onTogglePref(!!checked, nextValues) || nextValues;
      }
      return { values: nextValues };
    });
  };

  applyLiveColorScheme = (vals) => {
    if (!vals) return;
    applyColorScheme(
      vals.colorScheme || "default",
      vals.customColors,
      vals.customDefaultBg,
      vals.customDefaultFg,
      vals.customDefaultLink,
      vals.customForcePlainText,
      vals.minimumContrast
    );
    if (this.props.app?.view) {
      this.props.app.view.updateHighlightColor();
      this.props.app.view.redraw(true);
    }
  };

  handleNumberInputChange = ({ target: { name, value } }) => {
    this.setState((prevState) => {
      const numVal = name === "lineHeight" ? parseFloat(value) : parseInt(value, 10);
      let nextValues = changeNestedValue(prevState.values, name, numVal);
      if (name === "minimumContrast") {
        this.applyLiveColorScheme(nextValues);
      }
      return { values: nextValues };
    });
  };

  handleTextInputChange = ({ target: { name, value } }) => {
    if (name === "useCanvasEngine") {
      const boolVal = value === "canvas" || value === true || value === "true";
      this.setState((prevState) => ({
        values: changeNestedValue(prevState.values, name, boolVal),
      }));
      return;
    }
    if (name === "uiLocale") {
      setLocale(value);
      this.props.app?.onPrefChange?.("uiLocale", value);
    }
    if (name === "colorScheme" && value === "custom") {
      const prevScheme = this.state.values.colorScheme || "default";
      const scheme = COLOR_SCHEMES[prevScheme] || COLOR_SCHEMES["default"];
      const baseColors = this.state.values.customColors ||
        [...(scheme?.colors || COLOR_SCHEMES["default"].colors)];
      const baseBg = this.state.values.customDefaultBg || scheme?.defaultBg || scheme?.colors[0] || "#000000";
      const baseFg = this.state.values.customDefaultFg || scheme?.defaultFg || scheme?.colors[7] || "#c0c0c0";
      const baseLink = this.state.values.customDefaultLink || scheme?.defaultLink || "#ff6600";
      const basePlainText = Boolean(this.state.values.customForcePlainText || scheme?.forcePlainText);
      const nextValues = {
        ...this.state.values,
        colorScheme: "custom",
        customColors: baseColors,
        customDefaultBg: baseBg,
        customDefaultFg: baseFg,
        customDefaultLink: baseLink,
        customForcePlainText: basePlainText,
      };
      this.applyLiveColorScheme(nextValues);
      this.setState({ values: nextValues });
      return;
    }
    this.setState((prevState) => {
      const nextValues = changeNestedValue(prevState.values, name, value);
      if (name === "colorScheme") {
        this.applyLiveColorScheme(nextValues);
      }
      return { values: nextValues };
    });
  };

  handleCustomDefaultBgChange = (newColor) => {
    this.setState((prevState) => {
      const nextValues = {
        ...prevState.values,
        colorScheme: "custom",
        customDefaultBg: newColor,
      };
      this.applyLiveColorScheme(nextValues);
      return { values: nextValues };
    });
  };

  handleCustomDefaultFgChange = (newColor) => {
    this.setState((prevState) => {
      const nextValues = {
        ...prevState.values,
        colorScheme: "custom",
        customDefaultFg: newColor,
      };
      this.applyLiveColorScheme(nextValues);
      return { values: nextValues };
    });
  };

  handleCustomDefaultLinkChange = (newColor) => {
    this.setState((prevState) => {
      const nextValues = {
        ...prevState.values,
        colorScheme: "custom",
        customDefaultLink: newColor,
      };
      this.applyLiveColorScheme(nextValues);
      return { values: nextValues };
    });
  };

  handleCustomColorChange = (index, newColor) => {
    const activeColors = this.state.values.customColors ||
      (COLOR_SCHEMES[this.state.values.colorScheme]?.colors || COLOR_SCHEMES["default"].colors);
    const updated = [...activeColors];
    updated[index] = newColor;
    this.setState((prevState) => {
      const nextValues = {
        ...prevState.values,
        colorScheme: "custom",
        customColors: updated,
      };
      this.applyLiveColorScheme(nextValues);
      return { values: nextValues };
    });
  };

  handleResetCustomColors = () => {
    const defScheme = COLOR_SCHEMES["default"];
    this.setState((prevState) => {
      const nextValues = {
        ...prevState.values,
        customColors: [...defScheme.colors],
        customDefaultBg: defScheme.defaultBg || defScheme.colors[0],
        customDefaultFg: defScheme.defaultFg || defScheme.colors[7],
        customDefaultLink: defScheme.defaultLink || "#ff6600",
        customForcePlainText: false,
      };
      this.applyLiveColorScheme(nextValues);
      return { values: nextValues };
    });
  };

  handleCustomizeCurrentScheme = (e) => {
    e?.preventDefault?.();
    const currentScheme = this.state.values.colorScheme || "default";
    const scheme = COLOR_SCHEMES[currentScheme] || COLOR_SCHEMES["default"];
    const colors = [...(scheme?.colors || COLOR_SCHEMES["default"].colors)];
    const defaultBg = scheme?.defaultBg || colors[0];
    const defaultFg = scheme?.defaultFg || colors[7];
    const defaultLink = scheme?.defaultLink || "#ff6600";
    const forcePlainText = Boolean(scheme?.forcePlainText);
    this.setState((prevState) => {
      const nextValues = {
        ...prevState.values,
        colorScheme: "custom",
        customColors: colors,
        customDefaultBg: defaultBg,
        customDefaultFg: defaultFg,
        customDefaultLink: defaultLink,
        customForcePlainText: forcePlainText,
      };
      this.applyLiveColorScheme(nextValues);
      return { values: nextValues };
    });
  };

  handleCaretShapeChange = ({ target: { value: shape } }) => {
    const { blink } = parseCaretStyle(this.state.values.cursorStyle);
    const newStyle = serializeCaretStyle(shape, blink);
    this.setState((prevState) => ({
      values: changeNestedValue(prevState.values, "cursorStyle", newStyle),
    }));
  };

  handleCaretBlinkChange = ({ target: { checked: blink } }) => {
    const { shape } = parseCaretStyle(this.state.values.cursorStyle);
    const newStyle = serializeCaretStyle(shape, blink);
    this.setState((prevState) => ({
      values: changeNestedValue(prevState.values, "cursorStyle", newStyle),
    }));
  };

  getPlugins() {
    const { app } = this.props;
    return getAvailablePlugins(app);
  }

  render() {
    const { show } = this.props;
    const { navActiveKey, values } = this.state;
    const plugins = this.getPlugins();
    const isTouch = Boolean(
      this.props.isTouch !== undefined
        ? this.props.isTouch
        : typeof window !== 'undefined' &&
            ('ontouchstart' in window ||
              (navigator && navigator.maxTouchPoints > 0) ||
              (window.matchMedia &&
                (window.matchMedia('(pointer: coarse)').matches ||
                  window.matchMedia('(max-width: 768px)').matches)))
    );
    const { shape: caretShape, blink: caretBlink } = parseCaretStyle(
      values.cursorStyle
    );

    return (
      <NativeDialog
        open={show}
        onClose={this.handleCloseClick}
        className="PrefModal native-modal"
      >
        <div className="PrefModal__Grid">
          <div className="PrefModal__Grid__Col--left">
            <h3>{_("menu_settings")}</h3>
            <ul className="nav nav-pills nav-stacked">
              <li className={navActiveKey === "general" ? "active" : ""}>
                <a href="#" onClick={this.handleNavSelect("general")}>
                  {_("options_general")}
                </a>
              </li>
              <li className={navActiveKey === "appearance" ? "active" : ""}>
                <a href="#" onClick={this.handleNavSelect("appearance")}>
                  {_("options_appearance")}
                </a>
              </li>
              <li className={navActiveKey === "font" ? "active" : ""}>
                <a href="#" onClick={this.handleNavSelect("font")}>
                  {_("options_fontFace")}
                </a>
              </li>
              <li className={navActiveKey === "mouse" ? "active" : ""}>
                <a href="#" onClick={this.handleNavSelect("mouse")}>
                  {_("options_mouse")}
                </a>
              </li>
              <li className={navActiveKey === "plugins" ? "active" : ""}>
                <a href="#" onClick={this.handleNavSelect("plugins")}>
                  {_("options_plugins")}
                </a>
              </li>
              <li className={navActiveKey === "advanced" ? "active" : ""}>
                <a href="#" onClick={this.handleNavSelect("advanced")}>
                  {_("options_advanced")}
                </a>
              </li>
              <li className={navActiveKey === "about" ? "active" : ""}>
                <a href="#" onClick={this.handleNavSelect("about")}>
                  {_("options_about")}
                </a>
              </li>
            </ul>
            <div className="PrefModal__Grid__Col--left__Footer">
              {(APP.VERSION || APP.COMMIT_HASH) && (
                <div
                  className="PrefModal__Grid__Col--left__BuildInfo"
                  title={
                    [
                      APP.NAME ? `${APP.NAME} v${APP.VERSION}` : "",
                      APP.COMMIT_HASH ? `Build: ${APP.COMMIT_HASH}` : "",
                      APP.BUILD_DATE || "",
                    ]
                      .filter(Boolean)
                      .join(" ")
                  }
                >
                  v{APP.VERSION}
                  {APP.COMMIT_HASH ? ` (${APP.COMMIT_HASH})` : ""}
                </div>
              )}
              <a
                href={this.getBugReportUrl()}
                target="_blank"
                rel="noopener noreferrer"
                role="button"
                className="btn btn-default PrefModal__Grid__Col--left__BugReport"
              >
                {renderBugIcon()}
                <span>{_("about_bug_report")}</span>
              </a>
              <button
                type="button"
                className="btn btn-default PrefModal__Grid__Col--left__Reset"
                onClick={this.handleResetClick}
              >
                {_("options_reset")}
              </button>
            </div>
          </div>
          <div className="PrefModal__Grid__Col--right">
            {navActiveKey === "general" && (
              <fieldset className="PrefModal__Grid__Col--right__Fieldset">
                <TabLegend
                  title={_("options_general")}
                  onCloseClick={this.handleCloseClick}
                />
                <div className="PrefModal__TabBody">
                  <div className="checkbox">
                    <label>
                      <input
                        type="checkbox"
                        name="warnBeforeClose"
                        checked={values.warnBeforeClose ?? true}
                        onChange={this.handleCheckboxChange}
                      />
                      {_("options_warnBeforeClose")}
                    </label>
                  </div>

                  <div className="form-group" id="enableBell">
                    <label className="control-label">
                      {_("options_enableBell")}
                    </label>
                    <select
                      className="form-control"
                      name="enableBell"
                      value={
                        values.enableBell === false || values.enableBell === "off"
                          ? "off"
                          : values.enableBell === "background"
                            ? "background"
                            : "always"
                      }
                      onChange={this.handleTextInputChange}
                    >
                      <option key="options_bellAlways" value="always">
                        {parseOptionText(_("options_bellAlways")).label}
                      </option>
                      <option key="options_bellBackground" value="background">
                        {parseOptionText(_("options_bellBackground")).label}
                      </option>
                      <option key="options_bellOff" value="off">
                        {parseOptionText(_("options_bellOff")).label}
                      </option>
                    </select>
                    {renderOptionDesc(
                      {
                        always: _("options_bellAlways"),
                        background: _("options_bellBackground"),
                        off: _("options_bellOff"),
                      }[
                        values.enableBell === false || values.enableBell === "off"
                          ? "off"
                          : values.enableBell === "background"
                            ? "background"
                            : "always"
                      ]
                    )}
                  </div>
                  <div className="checkbox">
                    <label>
                      <input
                        type="checkbox"
                        name="enableVisualBell"
                        checked={values.enableVisualBell}
                        onChange={this.handleCheckboxChange}
                      />
                      {_("options_enableVisualBell")}
                    </label>
                  </div>
                </div>
              </fieldset>
            )}
            {navActiveKey === "appearance" && (
              <fieldset className="PrefModal__Grid__Col--right__Fieldset">
                <TabLegend
                  title={_("options_appearance")}
                  onCloseClick={this.handleCloseClick}
                />
                <div className="PrefModal__TabBody">
                  <div className="form-group" id="colorScheme">
                  <label className="control-label">
                    {_("options_colorScheme")}
                  </label>
                  <select
                    className="form-control"
                    name="colorScheme"
                    value={values.colorScheme || "default"}
                    onChange={this.handleTextInputChange}
                  >
                    {Object.keys(COLOR_SCHEMES).map((key) => (
                      <option key={key} value={key}>
                        {parseOptionText(_(COLOR_SCHEMES[key].titleI18n)).label}
                      </option>
                    ))}
                  </select>
                  {renderOptionDesc(
                    COLOR_SCHEMES[values.colorScheme || "default"]
                      ? _(COLOR_SCHEMES[values.colorScheme || "default"].titleI18n)
                      : ""
                  )}
                  {(() => {
                    const isCustom = (values.colorScheme === "custom");
                    const scheme = COLOR_SCHEMES[values.colorScheme] || COLOR_SCHEMES["default"];
                    const isPlain = Boolean(isCustom ? values.customForcePlainText : scheme?.forcePlainText);
                    const rawColors = isCustom
                      ? (values.customColors || COLOR_SCHEMES["default"].colors)
                      : (scheme?.colors || COLOR_SCHEMES["default"].colors);
                    const activeBg = isCustom
                      ? (values.customDefaultBg || rawColors[0])
                      : (scheme?.defaultBg || rawColors[0]);
                    const activeFg = isCustom
                      ? (values.customDefaultFg || rawColors[7])
                      : (scheme?.defaultFg || rawColors[7]);
                    const activeColors = isPlain
                      ? Array.from({ length: 16 }, (_, i) => (i === 0 ? activeBg : activeFg))
                      : rawColors;
                    const activeLink = isCustom
                      ? (values.customDefaultLink || "#ff6600")
                      : (scheme?.defaultLink || "#ff6600");
                    return (
                      <>
                        <div className="PrefModal__ColorDefaults">
                          <div className="PrefModal__ColorDefaultTitle">
                            {_("options_colorScheme_defaultColors")}:
                          </div>
                          <div className="PrefModal__ColorDefaultItems">
                            <div className="PrefModal__ColorDefaultItem">
                              <span className="PrefModal__ColorDefaultLabel">
                                {_("options_colorScheme_defaultBg")}:
                              </span>
                              {isCustom ? (
                                <label
                                  className="PrefModal__ColorSwatch PrefModal__ColorSwatch--editable PrefModal__ColorDefaultSwatch"
                                  title={`${_("options_colorScheme_defaultBg")}: ${activeBg}`}
                                  style={{ backgroundColor: activeBg }}
                                >
                                  <input
                                    type="color"
                                    value={ensureHexColor(activeBg)}
                                    onChange={(e) => this.handleCustomDefaultBgChange(e.target.value)}
                                    className="PrefModal__ColorInput"
                                  />
                                </label>
                              ) : (
                                <span
                                  className="PrefModal__ColorSwatch PrefModal__ColorDefaultSwatch"
                                  title={`${_("options_colorScheme_defaultBg")}: ${activeBg}`}
                                  style={{ backgroundColor: activeBg }}
                                />
                              )}
                            </div>
                            <div className="PrefModal__ColorDefaultItem">
                              <span className="PrefModal__ColorDefaultLabel">
                                {_("options_colorScheme_defaultFg")}:
                              </span>
                              {isCustom ? (
                                <label
                                  className="PrefModal__ColorSwatch PrefModal__ColorSwatch--editable PrefModal__ColorDefaultSwatch"
                                  title={`${_("options_colorScheme_defaultFg")}: ${activeFg}`}
                                  style={{ backgroundColor: activeFg }}
                                >
                                  <input
                                    type="color"
                                    value={ensureHexColor(activeFg)}
                                    onChange={(e) => this.handleCustomDefaultFgChange(e.target.value)}
                                    className="PrefModal__ColorInput"
                                  />
                                </label>
                              ) : (
                                <span
                                  className="PrefModal__ColorSwatch PrefModal__ColorDefaultSwatch"
                                  title={`${_("options_colorScheme_defaultFg")}: ${activeFg}`}
                                  style={{ backgroundColor: activeFg }}
                                />
                              )}
                            </div>
                            <div className="PrefModal__ColorDefaultItem">
                              <span className="PrefModal__ColorDefaultLabel">
                                {_("options_colorScheme_defaultLink")}:
                              </span>
                              {isCustom ? (
                                <label
                                  className="PrefModal__ColorSwatch PrefModal__ColorSwatch--editable PrefModal__ColorDefaultSwatch"
                                  title={`${_("options_colorScheme_defaultLink")}: ${activeLink}`}
                                  style={{ backgroundColor: activeLink }}
                                >
                                  <input
                                    type="color"
                                    value={ensureHexColor(activeLink)}
                                    onChange={(e) => this.handleCustomDefaultLinkChange(e.target.value)}
                                    className="PrefModal__ColorInput"
                                  />
                                </label>
                              ) : (
                                <span
                                  className="PrefModal__ColorSwatch PrefModal__ColorDefaultSwatch"
                                  title={`${_("options_colorScheme_defaultLink")}: ${activeLink}`}
                                  style={{ backgroundColor: activeLink }}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="PrefModal__ColorSchemePreview">
                          {activeColors.map((c, i) => {
                            const displayColor = (!isPlain && (values.minimumContrast || 0) > 0 && i !== 0)
                              ? getContrastColor(c, activeBg, values.minimumContrast)
                              : c;
                            return (isCustom && !isPlain) ? (
                              <label
                                key={i}
                                className="PrefModal__ColorSwatch PrefModal__ColorSwatch--editable"
                                title={`${ANSI_COLOR_NAMES[i]}: ${c}${displayColor !== c ? ` → ${displayColor}` : ""}`}
                                style={{ backgroundColor: displayColor }}
                              >
                                <input
                                  type="color"
                                  value={ensureHexColor(c)}
                                  onChange={(e) => this.handleCustomColorChange(i, e.target.value)}
                                  className="PrefModal__ColorInput"
                                />
                              </label>
                            ) : (
                              <span
                                key={i}
                                className="PrefModal__ColorSwatch"
                                title={`${ANSI_COLOR_NAMES[i]}: ${c}${displayColor !== c ? ` → ${displayColor}` : ""}`}
                                style={{ backgroundColor: displayColor }}
                              />
                            );
                          })}
                        </div>
                        {isCustom ? (
                          <div className="PrefModal__ColorSchemeHint">
                            <small className="text-muted">{_("options_colorScheme_customHint")}</small>
                            <button
                              type="button"
                              className="btn btn-default btn-xs PrefModal__ResetCustomBtn"
                              onClick={this.handleResetCustomColors}
                            >
                              {_("options_colorScheme_resetCustom")}
                            </button>
                          </div>
                        ) : (
                          <div className="PrefModal__ColorSchemeHint">
                            <small className="text-muted">
                              <a href="#" onClick={this.handleCustomizeCurrentScheme}>
                                {_("options_colorScheme_customizeThis")}
                              </a>
                            </small>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div className="form-group" id="minimumContrast">
                  <div className="PrefModal__SliderHeader">
                    <label className="control-label" htmlFor="minimumContrastInput">
                      {_("options_minimumContrast")}
                    </label>
                    <span className="PrefModal__SliderValue">
                      {(values.minimumContrast || 0) === 0
                        ? _("options_minimumContrast_off")
                        : `${values.minimumContrast}%`}
                    </span>
                  </div>
                  <input
                    id="minimumContrastInput"
                    type="range"
                    className="PrefModal__RangeSlider"
                    name="minimumContrast"
                    min="0"
                    max="100"
                    step="5"
                    disabled={Boolean(
                      values.colorScheme === "custom"
                        ? values.customForcePlainText
                        : COLOR_SCHEMES[values.colorScheme]?.forcePlainText
                    )}
                    value={values.minimumContrast || 0}
                    onChange={this.handleNumberInputChange}
                  />
                  <small className="help-block text-muted">
                    {_("options_minimumContrast_desc")}
                  </small>
                </div>
                <div className="form-group" id="lineHeight">
                  <label className="control-label">
                    {_("options_lineHeight")}
                  </label>
                  <select
                    className="form-control"
                    name="lineHeight"
                    value={String(values.lineHeight || 1.0)}
                    onChange={this.handleNumberInputChange}
                  >
                    <option value="1">1.0</option>
                    <option value="1.1">1.1</option>
                    <option value="1.2">1.2</option>
                    <option value="1.3">1.3</option>
                    <option value="1.4">1.4</option>
                    <option value="1.5">1.5</option>
                  </select>
                </div>
                <div className="form-group" id="cursorStyle">
                  <label className="control-label">
                    {_("options_cursorStyle")}
                  </label>
                  <select
                    className="form-control"
                    name="caretShape"
                    value={caretShape}
                    onChange={this.handleCaretShapeChange}
                  >
                    <option key="options_caretIbeam" value="ibeam">
                      {parseOptionText(_("options_caretIbeam")).label}
                    </option>
                    <option key="options_caretBlock" value="block">
                      {parseOptionText(_("options_caretBlock")).label}
                    </option>
                    <option key="options_caretHalfBlock" value="half-block">
                      {parseOptionText(_("options_caretHalfBlock")).label}
                    </option>
                    <option key="options_caretUnderline" value="underline">
                      {parseOptionText(_("options_caretUnderline")).label}
                    </option>
                  </select>
                  {renderOptionDesc(
                    {
                      ibeam: _("options_caretIbeam"),
                      block: _("options_caretBlock"),
                      "half-block": _("options_caretHalfBlock"),
                      underline: _("options_caretUnderline"),
                    }[caretShape]
                  )}
                </div>
                <div className="checkbox" id="caretBlink">
                  <label>
                    <input
                      type="checkbox"
                      name="caretBlink"
                      checked={caretBlink}
                      onChange={this.handleCaretBlinkChange}
                    />
                    {_("options_caretBlink")}
                  </label>
                </div>
                <div className="form-group" id="termMargin">
                  <label className="control-label">
                    {_("options_termMargin")}
                  </label>
                  <input
                    className="form-control"
                    name="termMargin"
                    type="number"
                    value={values.termMargin ?? 0}
                    onChange={this.handleNumberInputChange}
                  />
                </div>
                <div className="form-group" id="termSizeMode">
                  <label className="control-label">
                    {_("options_termSize")}
                  </label>
                  <select
                    className="form-control"
                    name="termSizeMode"
                    value={isTouch ? "fixed-font-size" : values.termSizeMode}
                    disabled={isTouch}
                    onChange={this.handleTextInputChange}
                  >
                    <option key="options_fixedTermSize" value="fixed-term-size">
                      {parseOptionText(_("options_fixedTermSize")).label}
                    </option>
                    <option key="options_fixedFontSize" value="fixed-font-size">
                      {parseOptionText(_("options_fixedFontSize")).label}
                    </option>
                    <option key="options_maxFontSize" value="max-font-size">
                      {parseOptionText(_("options_maxFontSize")).label}
                    </option>
                  </select>
                  {!isTouch &&
                    renderOptionDesc(
                      {
                        "fixed-term-size": _("options_fixedTermSize"),
                        "fixed-font-size": _("options_fixedFontSize"),
                        "max-font-size": _("options_maxFontSize"),
                      }[values.termSizeMode]
                    )}
                  {isTouch && (
                    <span
                      className="help-block"
                      style={{
                        fontSize: '12px',
                        opacity: 0.7,
                        marginTop: '4px',
                        display: 'block'
                      }}
                    >
                      {_("options_touchFixedFontNote")}
                    </span>
                  )}
                </div>
                {!isTouch && values.termSizeMode === "fixed-term-size" && (
                  <div>
                    <div className="form-group" id="termSize_cols">
                      <label className="control-label">
                        {_("options_cols")}
                      </label>
                      <input
                        className="form-control"
                        name="termSize.cols"
                        type="number"
                        value={values.termSize.cols}
                        onChange={this.handleNumberInputChange}
                      />
                    </div>
                    <div className="form-group" id="termSize_rows">
                      <label className="control-label">
                        {_("options_rows")}
                      </label>
                      <input
                        className="form-control"
                        name="termSize.rows"
                        type="number"
                        value={values.termSize.rows}
                        onChange={this.handleNumberInputChange}
                      />
                    </div>
                    <div className="checkbox">
                      <label>
                        <input
                          type="checkbox"
                          name="fontFitWindowWidth"
                          checked={values.fontFitWindowWidth}
                          onChange={this.handleCheckboxChange}
                        />
                        {_("options_fontFitWindowWidth")}
                      </label>
                    </div>
                  </div>
                )}
                {(isTouch || values.termSizeMode === "fixed-font-size") && (
                  <div className="form-group" id="fontSize">
                    <label className="control-label">
                      {_("options_fontSize")}
                    </label>
                    <input
                      className="form-control"
                      name="fontSize"
                      type="number"
                      value={values.fontSize}
                      onChange={this.handleNumberInputChange}
                    />
                  </div>
                )}
                {!isTouch && values.termSizeMode === "max-font-size" && (
                  <div className="form-group" id="maxFontSize">
                    <label className="control-label">
                      {_("options_fontSizeMax")}
                    </label>
                    <input
                      className="form-control"
                      name="maxFontSize"
                      type="number"
                      value={values.maxFontSize}
                      onChange={this.handleNumberInputChange}
                    />
                  </div>
                )}
                </div>
              </fieldset>
            )}
            {navActiveKey === "font" && (
              <fieldset className="PrefModal__Grid__Col--right__Fieldset">
                <TabLegend
                  title={_("options_fontFace")}
                  onCloseClick={this.handleCloseClick}
                />
                <div className="PrefModal__TabBody">
                  <div className="form-group" id="fontFace">
                    <label className="control-label">
                      {_("options_fontFaceAndPriority")}
                    </label>
                    <FontManager
                      value={values.fontFace}
                      onChange={(newFontFace) => {
                        this.handleTextInputChange({
                          target: { name: "fontFace", value: newFontFace },
                        });
                      }}
                    />
                  </div>
                </div>
              </fieldset>
            )}
            {navActiveKey === "mouse" && (
              <fieldset className="PrefModal__Grid__Col--right__Fieldset">
                <TabLegend
                  title={_("options_mouse")}
                  onCloseClick={this.handleCloseClick}
                />
                <div className="PrefModal__TabBody">
                  <div className="form-group" id="rightClickAction">
                  <label className="control-label">
                    {_("options_rightClickAction")}
                  </label>
                  <select
                    className="form-control"
                    name="rightClickAction"
                    value={values.rightClickAction || "menu"}
                    onChange={this.handleTextInputChange}
                  >
                    <option value="menu">
                      {parseOptionText(_("options_rightClickAction_menu")).label}
                    </option>
                    <option value="paste">
                      {parseOptionText(_("options_rightClickAction_paste")).label}
                    </option>
                  </select>
                  {renderOptionDesc(
                    (values.rightClickAction || "menu") === "paste"
                      ? _("options_rightClickAction_paste")
                      : _("options_rightClickAction_menu")
                  )}
                </div>
                <div className="checkbox">
                  <label>
                    <input
                      type="checkbox"
                      name="copyOnSelect"
                      checked={values.copyOnSelect}
                      onChange={this.handleCheckboxChange}
                    />
                    {_("options_copyOnSelect")}
                  </label>
                </div>
                <div className="checkbox">
                  <label>
                    <input
                      type="checkbox"
                      name="trimTrailingSpaces"
                      checked={values.trimTrailingSpaces ?? true}
                      onChange={this.handleCheckboxChange}
                    />
                    {_("options_trimTrailingSpaces")}
                  </label>
                </div>
                <div className="checkbox">
                  <label>
                    <input
                      type="checkbox"
                      name="supportMouseReporting"
                      checked={values.supportMouseReporting ?? true}
                      onChange={this.handleCheckboxChange}
                    />
                    {_("options_supportMouseReporting")}
                  </label>
                </div>
                <span
                  className="help-block"
                  style={{
                    fontSize: "12px",
                    opacity: 0.7,
                    marginTop: "-4px",
                    marginLeft: "24px",
                    marginBottom: "10px",
                    display: "block",
                  }}
                >
                  {_("options_supportMouseReporting_desc")}
                </span>
                </div>
              </fieldset>
            )}
            {navActiveKey === "plugins" && (
              <fieldset className="PrefModal__Grid__Col--right__Fieldset">
                <TabLegend
                  title={_("options_plugins")}
                  onCloseClick={this.handleCloseClick}
                />
                <div className="PrefModal__TabBody">
                  <p className="PrefModal__TabSubtitle">
                  {_("options_plugins_desc")}
                </p>
                <div className="PrefModal__MacList">
                  {groupPlugins(plugins).map((group) => {
                    const groupTitle = _(group.titleKey) || group.title;
                    const isGroupCollapsed = Boolean(
                      this.state.collapsedGroupIds?.[group.id]
                    );
                    return (
                      <React.Fragment key={group.id}>
                        <div
                          className={cx(
                            "PrefModal__MacListBand",
                            `PrefModal__MacListBand--${group.id}`,
                            {
                              "PrefModal__MacListBand--collapsed": isGroupCollapsed,
                            }
                          )}
                          onClick={this.handleToggleGroupCollapse(group.id)}
                          role="button"
                          tabIndex={0}
                          aria-expanded={!isGroupCollapsed}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              this.handleToggleGroupCollapse(group.id)(e);
                            }
                          }}
                        >
                          <div className="PrefModal__MacListBandHeader">
                            <span className="PrefModal__MacListBandChevron">
                              <svg
                                viewBox="0 0 10 10"
                                width="9"
                                height="9"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="2 3 5 6 8 3" />
                              </svg>
                            </span>
                            {renderGroupIcon(group.id)}
                            <span className="PrefModal__MacListBandTitle">
                              {groupTitle}
                            </span>
                          </div>
                          <span className="PrefModal__MacListBandCount">
                            {group.plugins.length}
                          </span>
                        </div>
                        {!isGroupCollapsed
                          ? group.plugins.map((plugin) => {
                          const pluginId = plugin.id || plugin.name;
                          const isChecked = Boolean(
                            plugin.prefKey ? values[plugin.prefKey] : plugin.enabled
                          );
                          const hasOptions = this.pluginHasOptions(plugin);
                          const isExpanded = this.state.expandedPluginId === pluginId;
                          return (
                            <div
                              key={pluginId}
                              className={cx(
                                "PrefModal__MacListItem",
                                `PrefModal__MacListItem--${group.id}`,
                                {
                                  "PrefModal__MacListItem--enabled": isChecked,
                                  "PrefModal__MacListItem--hasOptions": hasOptions,
                                  "PrefModal__MacListItem--expanded": isExpanded,
                                }
                              )}
                            >
                        <div
                          className="PrefModal__MacListItemHeader"
                          onClick={
                            hasOptions
                              ? this.handleTogglePluginExpand(pluginId)
                              : undefined
                          }
                          role={hasOptions ? "button" : undefined}
                          tabIndex={hasOptions ? 0 : undefined}
                          onKeyDown={
                            hasOptions
                              ? (e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    if (
                                      e.target &&
                                      e.target.closest &&
                                      (e.target.closest(".PrefModal__MacSwitch") ||
                                        e.target.closest(".PrefModal__MacOptionsBtn"))
                                    ) {
                                      return;
                                    }
                                    e.preventDefault();
                                    this.handleTogglePluginExpand(pluginId)(e);
                                  }
                                }
                              : undefined
                          }
                        >
                          <div className="PrefModal__MacListItemIcon">
                            {renderPluginIcon(plugin.icon)}
                          </div>
                          <div className="PrefModal__MacListItemContent">
                            <div className="PrefModal__MacListItemTitle">
                              <span>{plugin.title || plugin.name}</span>
                            </div>
                            {plugin.description && (
                              <div className="PrefModal__MacListItemDesc">
                                {plugin.description}
                              </div>
                            )}
                          </div>
                          <div className="PrefModal__MacListItemActions">
                            <label className="PrefModal__MacSwitch">
                              <input
                                type="checkbox"
                                name={plugin.prefKey || `plugin_${plugin.id}`}
                                checked={isChecked}
                                onChange={this.handleCheckboxChange}
                              />
                              <span className="PrefModal__MacSwitchSlider" />
                            </label>
                            {hasOptions && (
                              <button
                                type="button"
                                className={cx("PrefModal__MacOptionsBtn", {
                                  "PrefModal__MacOptionsBtn--expanded": isExpanded,
                                })}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  this.handleTogglePluginExpand(pluginId)(e);
                                }}
                                aria-expanded={isExpanded}
                                title={
                                  isExpanded
                                    ? _("options_collapse") : _("options_expand")
                                }
                              >
                                {_("options_plugin_options")}
                              </button>
                            )}
                          </div>
                        </div>
                        {hasOptions && isExpanded && (
                          <div className="PrefModal__MacListItemSub">
                            {plugin.renderOptions ? (
                              plugin.renderOptions({
                                values,
                                handleCheckboxChange: this.handleCheckboxChange,
                                handleNumberInputChange: this.handleNumberInputChange,
                                handleSelectChange: this.handleSelectChange,
                              })
                            ) : null}
                          </div>
                        )}
                            </div>
                          );
                        })
                      : null}
                    </React.Fragment>
                    );
                  })}
                </div>
                </div>
              </fieldset>
            )}
            {navActiveKey === "advanced" && (
              <fieldset className="PrefModal__Grid__Col--right__Fieldset">
                <TabLegend
                  title={_("options_advanced")}
                  onCloseClick={this.handleCloseClick}
                />
                <div className="PrefModal__TabBody">
                  <div className="form-group" id="useCanvasEngine">
                    <label className="control-label">
                      {_("options_renderEngine")}
                    </label>
                    <select
                      className="form-control"
                      name="useCanvasEngine"
                      value={values.useCanvasEngine !== false ? "canvas" : "dom"}
                      onChange={this.handleTextInputChange}
                    >
                      <option value="canvas">
                        {parseOptionText(_("options_renderEngineCanvas")).label}
                      </option>
                      <option value="dom">
                        {parseOptionText(_("options_renderEngineDOM")).label}
                      </option>
                    </select>
                    {renderOptionDesc(
                      {
                        canvas: _("options_renderEngineCanvas"),
                        dom: _("options_renderEngineDOM"),
                      }[values.useCanvasEngine !== false ? "canvas" : "dom"]
                    )}
                  </div>
                  <div className="checkbox PrefModal__Grid__Col--right__SubCheckbox">
                    <label>
                      <input
                        type="checkbox"
                        name="smoothAnsiArt"
                        checked={values.smoothAnsiArt}
                        disabled={values.useCanvasEngine === false}
                        onChange={this.handleCheckboxChange}
                      />
                      {_("options_smoothAnsiArt")}
                    </label>
                  </div>
                  <div className="form-group" id="backspaceKey">
                  <label className="control-label">
                    {_("options_backspaceKey")}
                  </label>
                  <select
                    className="form-control"
                    name="backspaceKey"
                    value={values.backspaceKey || "control-h"}
                    onChange={this.handleTextInputChange}
                  >
                    <option value="control-h">
                      {parseOptionText(_("options_keyControlH")).label}
                    </option>
                    <option value="control-?">
                      {parseOptionText(_("options_keyControlQuestion")).label}
                    </option>
                  </select>
                  {renderOptionDesc(
                    (values.backspaceKey || "control-h") === "control-?"
                      ? _("options_keyControlQuestion")
                      : _("options_keyControlH")
                  )}
                </div>
                <div className="form-group" id="deleteKey">
                  <label className="control-label">
                    {_("options_deleteKey")}
                  </label>
                  <select
                    className="form-control"
                    name="deleteKey"
                    value={values.deleteKey || "escape-sequence"}
                    onChange={this.handleTextInputChange}
                  >
                    <option value="escape-sequence">
                      {parseOptionText(_("options_keyEscapeSequence")).label}
                    </option>
                    <option value="control-?">
                      {parseOptionText(_("options_keyControlQuestion")).label}
                    </option>
                    <option value="control-h">
                      {parseOptionText(_("options_keyControlH")).label}
                    </option>
                  </select>
                  {renderOptionDesc(
                    {
                      "escape-sequence": _("options_keyEscapeSequence"),
                      "control-?": _("options_keyControlQuestion"),
                      "control-h": _("options_keyControlH"),
                    }[values.deleteKey || "escape-sequence"]
                  )}
                </div>
                <div className="form-group" id="uiLocale">
                  <label className="control-label">
                    {_("options_uiLocale")}
                  </label>
                  <select
                    className="form-control"
                    name="uiLocale"
                    value={values.uiLocale || "auto"}
                    onChange={this.handleTextInputChange}
                  >
                    <option value="auto">
                      {parseOptionText(_("options_locale_auto")).label}
                    </option>
                    <option value="zh_tw">
                      {parseOptionText(_("options_locale_zhTW")).label}
                    </option>
                    <option value="en_us">
                      {parseOptionText(_("options_locale_enUS")).label}
                    </option>
                  </select>
                  {renderOptionDesc(
                    {
                      auto: _("options_locale_auto"),
                      zh_tw: _("options_locale_zhTW"),
                      en_us: _("options_locale_enUS"),
                    }[values.uiLocale || "auto"]
                  )}
                </div>
                </div>
              </fieldset>
            )}
            {navActiveKey === "about" && (
              <div className="PrefModal__About">
                <TabLegend
                  title={_("appName")}
                  subtitle={_("about_appName_subtitle")}
                  onCloseClick={this.handleCloseClick}
                />
                <div className="PrefModal__TabBody">
                  <div>
                    <p>{replaceI18n("about_description", this.replacements)}</p>
                  </div>
                  <div>
                    <legend>{_("about_version_title")}</legend>
                    <div className="PrefModal__About__Version">
                      {APP.NAME} v{APP.VERSION}
                      {process.env.DEVELOPER_MODE ? (
                        <small>({_("alert_developerModeHeader")})</small>
                      ) : (
                        ""
                      )}
                    </div>
                    <div className="PrefModal__About__Build">
                      {APP.COMMIT_HASH || APP.BUILD_DATE ? (
                        <span>
                          Build:{" "}
                          {APP.COMMIT_HASH ? (
                            <a
                              href={`https://github.com/${APP.GITHUB_REPOSITORY}/commit/${APP.COMMIT_HASH}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Commit Hash"
                              className="PrefModal__About__CommitLink"
                            >
                              {APP.COMMIT_HASH}
                            </a>
                          ) : (
                            ""
                          )}
                          {APP.COMMIT_HASH && APP.BUILD_DATE ? " " : ""}
                          {APP.BUILD_DATE}
                        </span>
                      ) : (
                        ""
                      )}
                      <a
                        href={this.getBugReportUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        role="button"
                        className="btn btn-xs PrefModal__About__BugReportBtn"
                      >
                        {renderBugIcon()}
                        <span>{_("about_bug_report")}</span>
                      </a>
                    </div>
                    <ul>
                      {this.renderVersionList().map((text, index) => (
                        <li key={index}>{text}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <legend>{_("about_license_title")}</legend>
                    <p>
                      {replaceI18n("about_license_content", this.replacements)}
                    </p>
                  </div>
                  <div>
                    <legend>{_("about_new_title")}</legend>
                    <ul>
                      {_("about_new_content").map((text, index) => (
                        <li key={index}>{text}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </NativeDialog>
    );
  }
}

export default PrefModal;
