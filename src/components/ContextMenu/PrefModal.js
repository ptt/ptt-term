import cx from "classnames";
import React from "react";
import NativeDialog from "../NativeDialog";
import { i18n } from "../../js/i18n";
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
} from "../../js/pref";
import { getAvailablePlugins } from "../../plugins/index.js";

export { getDefaultPrefs, readValuesWithDefault, writeValues };

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
  const msg = i18n(id);
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

const MOUSE_LEFT_OPTIONS = [
  "options_none",
  "options_enterKey",
  "options_rightKey",
];

const MOUSE_MIDDLE_OPTIONS = [
  "options_none",
  "options_enterKey",
  "options_leftKey",
  "options_doPaste",
];

const MOUSE_WHEEL_OPTIONS = [
  "options_none",
  "options_upDown",
  "options_pageUpDown",
  "options_threadLastNext",
];

const TabLegend = ({ title, subtitle, onCloseClick }) => (
  <legend>
    <span className="TabLegend__Text">
      <span>{title}</span>
      {subtitle && <small>- {subtitle}</small>}
    </span>
    <button type="button" className="close" onClick={onCloseClick}>
      &times;
    </button>
  </legend>
);

const SelectOptionGroup = ({
  controlId,
  label,
  name,
  value,
  options,
  onChange,
}) => (
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
          {i18n(key)}
        </option>
      ))}
    </select>
  </div>
);

export class PrefModal extends React.Component {
  state = {
    navActiveKey: "general",
    values: readValuesWithDefault(),
    expandedPluginId: null,
  };

  replacements = {
    link_github_iamchucky: link("Chuck Yang", "https://github.com/iamchucky"),
    link_github_robertabcd: link("robertabcd", "https://github.com/robertabcd"),
    link_robertabcd_PttChrome: link(
      "robertabcd/PttChrome",
      "https://github.com/robertabcd/PttChrome",
    ),
    link_github_current_owner: link(
      APP.GITHUB_REPOSITORY_OWNER,
      "https://github.com/" + APP.GITHUB_REPOSITORY_OWNER,
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
      "General Public License v2.0",
      "https://www.gnu.org/licenses/old-licenses/gpl-2.0.html",
    ),
  };

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
      plugin.id === "live_update" ||
      plugin.id === "anti_idle" ||
      plugin.id === "media_previewer" ||
      plugin.id === "mouse_browsing" ||
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

  handleCheckboxChange = ({ target: { name, checked } }) => {
    this.setState((prevState) => {
      let nextValues = changeNestedValue(prevState.values, name, !!checked);
      if (name === "enableLiveUpdate" && checked) {
        if (nextValues.endTurnsOnLiveUpdate === undefined) {
          nextValues = changeNestedValue(nextValues, "endTurnsOnLiveUpdate", true);
        }
        if (nextValues.showLiveUpdateToolbar === undefined) {
          nextValues = changeNestedValue(nextValues, "showLiveUpdateToolbar", true);
        }
        if (!nextValues.liveUpdateInterval) {
          nextValues = changeNestedValue(nextValues, "liveUpdateInterval", 1);
        }
      }
      if (name === "enableAntiIdle") {
        if (checked && (!nextValues.antiIdleTime || nextValues.antiIdleTime <= 0)) {
          nextValues = changeNestedValue(nextValues, "antiIdleTime", 60);
        } else if (!checked) {
          nextValues = changeNestedValue(nextValues, "antiIdleTime", 0);
        }
      }
      return { values: nextValues };
    });
  };

  handleNumberInputChange = ({ target: { name, value } }) => {
    this.setState((prevState) => {
      const numVal = parseInt(value, 10);
      let nextValues = changeNestedValue(prevState.values, name, numVal);
      if (name === "antiIdleTime") {
        nextValues = changeNestedValue(nextValues, "enableAntiIdle", numVal > 0);
      }
      return { values: nextValues };
    });
  };

  handleTextInputChange = ({ target: { name, value } }) => {
    this.setState((prevState) => ({
      values: changeNestedValue(prevState.values, name, value),
    }));
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
            <h3>{i18n("menu_settings")}</h3>
            <ul className="nav nav-pills nav-stacked">
              <li className={navActiveKey === "general" ? "active" : ""}>
                <a href="#" onClick={this.handleNavSelect("general")}>
                  {i18n("options_general")}
                </a>
              </li>
              <li className={navActiveKey === "appearance" ? "active" : ""}>
                <a href="#" onClick={this.handleNavSelect("appearance")}>
                  {i18n("options_appearance")}
                </a>
              </li>
              <li className={navActiveKey === "font" ? "active" : ""}>
                <a href="#" onClick={this.handleNavSelect("font")}>
                  {i18n("options_fontFace")}
                </a>
              </li>
              <li className={navActiveKey === "plugins" ? "active" : ""}>
                <a href="#" onClick={this.handleNavSelect("plugins")}>
                  {i18n("options_plugins")}
                </a>
              </li>
              <li className={navActiveKey === "advanced" ? "active" : ""}>
                <a href="#" onClick={this.handleNavSelect("advanced")}>
                  {i18n("options_advanced")}
                </a>
              </li>
              <li className={navActiveKey === "about" ? "active" : ""}>
                <a href="#" onClick={this.handleNavSelect("about")}>
                  {i18n("options_about")}
                </a>
              </li>
            </ul>
            <button
              type="button"
              className="btn btn-default PrefModal__Grid__Col--left__Reset"
              onClick={this.handleResetClick}
            >
              {i18n("options_reset")}
            </button>
          </div>
          <div className="PrefModal__Grid__Col--right">
            {navActiveKey === "general" && (
              <fieldset className="PrefModal__Grid__Col--right__Fieldset">
                <TabLegend
                  title={i18n("options_general")}
                  onCloseClick={this.handleCloseClick}
                />
                <div className="checkbox">
                  <label>
                    <input
                      type="checkbox"
<div className="checkbox">
                  <label>
                    <input
                      type="checkbox"
                      name="copyOnSelect"
                      checked={values.copyOnSelect}
                      onChange={this.handleCheckboxChange}
                    />
                    {i18n("options_copyOnSelect")}
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
                    {i18n("options_supportMouseReporting")}
                  </label>
                </div>

                <div className="form-group" id="enableBell">
                  <label className="control-label">
                    {i18n("options_enableBell")}
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
                      {i18n("options_bellAlways")}
                    </option>
                    <option key="options_bellBackground" value="background">
                      {i18n("options_bellBackground")}
                    </option>
                    <option key="options_bellOff" value="off">
                      {i18n("options_bellOff")}
                    </option>
                  </select>
                </div>
                <div className="form-group" id="lineWrap">
                  <label className="control-label">
                    {i18n("options_lineWrap")}
                  </label>
                  <input
                    className="form-control"
                    name="lineWrap"
                    type="number"
                    value={values.lineWrap}
                    onChange={this.handleNumberInputChange}
                  />
                </div>
              </fieldset>
            )}
            {navActiveKey === "appearance" && (
              <fieldset className="PrefModal__Grid__Col--right__Fieldset">
                <TabLegend
                  title={i18n("options_appearance")}
                  onCloseClick={this.handleCloseClick}
                />
                <div className="form-group" id="cursorStyle">
                  <label className="control-label">
                    {i18n("options_cursorStyle")}
                  </label>
                  <select
                    className="form-control"
                    name="caretShape"
                    value={caretShape}
                    onChange={this.handleCaretShapeChange}
                  >
                    <option key="options_caretIbeam" value="ibeam">
                      {i18n("options_caretIbeam")}
                    </option>
                    <option key="options_caretBlock" value="block">
                      {i18n("options_caretBlock")}
                    </option>
                    <option key="options_caretHalfBlock" value="half-block">
                      {i18n("options_caretHalfBlock")}
                    </option>
                    <option key="options_caretUnderline" value="underline">
                      {i18n("options_caretUnderline")}
                    </option>
                  </select>
                </div>
                <div className="checkbox" id="caretBlink">
                  <label>
                    <input
                      type="checkbox"
                      name="caretBlink"
                      checked={caretBlink}
                      onChange={this.handleCaretBlinkChange}
                    />
                    {i18n("options_caretBlink")}
                  </label>
                </div>
                <div className="form-group" id="termMargin">
                  <label className="control-label">
                    {i18n("options_termMargin")}
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
                    {i18n("options_termSize")}
                  </label>
                  <select
                    className="form-control"
                    name="termSizeMode"
                    value={isTouch ? "fixed-font-size" : values.termSizeMode}
                    disabled={isTouch}
                    onChange={this.handleTextInputChange}
                  >
                    <option key="options_fixedTermSize" value="fixed-term-size">
                      {i18n("options_fixedTermSize")}
                    </option>
                    <option key="options_fixedFontSize" value="fixed-font-size">
                      {i18n("options_fixedFontSize")}
                    </option>
                    <option key="options_maxFontSize" value="max-font-size">
                      {i18n("options_maxFontSize")}
                    </option>
                  </select>
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
                      {i18n("options_touchFixedFontNote")}
                    </span>
                  )}
                </div>
                {!isTouch && values.termSizeMode === "fixed-term-size" && (
                  <div>
                    <div className="form-group" id="termSize_cols">
                      <label className="control-label">
                        {i18n("options_cols")}
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
                        {i18n("options_rows")}
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
                        {i18n("options_fontFitWindowWidth")}
                      </label>
                    </div>
                  </div>
                )}
                {(isTouch || values.termSizeMode === "fixed-font-size") && (
                  <div className="form-group" id="fontSize">
                    <label className="control-label">
                      {i18n("options_fontSize")}
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
                      {i18n("options_fontSizeMax")}
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
              </fieldset>
            )}
            {navActiveKey === "font" && (
              <fieldset className="PrefModal__Grid__Col--right__Fieldset">
                <TabLegend
                  title={i18n("options_fontFace")}
                  onCloseClick={this.handleCloseClick}
                />
                <div className="form-group" id="fontFace">
                  <label className="control-label">
                    {i18n("options_fontFaceAndPriority")}
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
              </fieldset>
            )}
            {navActiveKey === "plugins" && (
              <fieldset className="PrefModal__Grid__Col--right__Fieldset">
                <TabLegend
                  title={i18n("options_plugins")}
                  onCloseClick={this.handleCloseClick}
                />
                <p className="PrefModal__TabSubtitle">
                  {i18n("options_plugins_desc")}
                </p>
                <div className="PrefModal__MacList">
                  {plugins.map((plugin) => {
                    const pluginId = plugin.id || plugin.name;
                    const isChecked = Boolean(
                      plugin.prefKey ? values[plugin.prefKey] : plugin.enabled
                    );
                    const hasOptions = this.pluginHasOptions(plugin);
                    const isExpanded = this.state.expandedPluginId === pluginId;
                    return (
                      <div
                        key={pluginId}
                        className={cx("PrefModal__MacListItem", {
                          "PrefModal__MacListItem--enabled": isChecked,
                          "PrefModal__MacListItem--hasOptions": hasOptions,
                          "PrefModal__MacListItem--expanded": isExpanded,
                        })}
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
                                    ? i18n("options_collapse") || "收起選項"
                                    : i18n("options_expand") || "展開選項"
                                }
                              >
                                Options...
                              </button>
                            )}
                          </div>
                        </div>
                        {hasOptions && isExpanded && (
                          <div className="PrefModal__MacListItemSub">
                            {plugin.id === "live_update" && (
                              <>
                                <div className="checkbox PrefModal__MacSubCheckbox">
                                  <label>
                                    <input
                                      type="checkbox"
                                      name="endTurnsOnLiveUpdate"
                                      checked={Boolean(
                                        values.endTurnsOnLiveUpdate !== false
                                      )}
                                      onChange={this.handleCheckboxChange}
                                    />
                                    <span>{i18n("options_endTurnsOnLiveUpdate")}</span>
                                  </label>
                                </div>
                                <div className="checkbox PrefModal__MacSubCheckbox">
                                  <label>
                                    <input
                                      type="checkbox"
                                      name="showLiveUpdateToolbar"
                                      checked={Boolean(
                                        values.showLiveUpdateToolbar !== false
                                      )}
                                      onChange={this.handleCheckboxChange}
                                    />
                                    <span>{i18n("options_showLiveUpdateToolbar")}</span>
                                  </label>
                                </div>
                                <div className="PrefModal__MacSubOptionRow">
                                  <span className="PrefModal__MacSubLabel">
                                    {i18n("options_liveUpdateInterval")}
                                  </span>
                                  <div className="PrefModal__MacSubInlineInput">
                                    <input
                                      className="form-control"
                                      type="number"
                                      name="liveUpdateInterval"
                                      min="1"
                                      value={values.liveUpdateInterval || 1}
                                      onChange={this.handleNumberInputChange}
                                    />
                                    <span className="PrefModal__MacSubUnit">
                                      {i18n("options_liveUpdateIntervalSec")}
                                    </span>
                                  </div>
                                </div>
                              </>
                            )}
                            {plugin.id === "anti_idle" && (
                              <div className="PrefModal__MacSubOptionRow">
                                <span className="PrefModal__MacSubLabel">
                                  {i18n("options_antiIdleTime")}
                                </span>
                                <div className="PrefModal__MacSubInlineInput">
                                  <input
                                    className="form-control"
                                    type="number"
                                    name="antiIdleTime"
                                    min="1"
                                    value={values.antiIdleTime || 60}
                                    onChange={this.handleNumberInputChange}
                                  />
                                  <span className="PrefModal__MacSubUnit">
                                    {i18n("options_liveUpdateIntervalSec")}
                                  </span>
                                </div>
                              </div>
                            )}
                            {plugin.id === "media_previewer" && (
                              <div className="checkbox PrefModal__MacSubCheckbox">
                                <label>
                                  <input
                                    type="checkbox"
                                    name="picPreviewWhitelistOnly"
                                    checked={Boolean(
                                      values.picPreviewWhitelistOnly !== false
                                    )}
                                    onChange={this.handleCheckboxChange}
                                  />
                                  <span>{i18n("options_picPreviewWhitelistOnly")}</span>
                                </label>
                              </div>
                            )}
                            {plugin.id === "mouse_browsing" && (
                              <>
                                <div className="checkbox PrefModal__MacSubCheckbox">
                                  <label>
                                    <input
                                      type="checkbox"
                                      name="mouseBrowsingHighlight"
                                      checked={values.mouseBrowsingHighlight}
                                      onChange={this.handleCheckboxChange}
                                    />
                                    <span>{i18n("options_mouseBrowsingHighlight")}</span>
                                  </label>
                                </div>

                                <div className="PrefModal__Grid__Col--right__MouseBrowsingHighlightColor">
                                  {i18n("options_highlightColor")}
                                  <select
                                    className={cx(
                                      "form-control",
                                      `b${values.mouseBrowsingHighlightColor}`,
                                    )}
                                    name="mouseBrowsingHighlightColor"
                                    value={values.mouseBrowsingHighlightColor}
                                    onChange={this.handleNumberInputChange}
                                  >
                                    {Array(16)
                                      .fill(0, 1)
                                      .map((x, i) => (
                                        <option key={i} value={i} className={cx(`b${i}`)} />
                                      ))}
                                  </select>
                                </div>
                                <SelectOptionGroup
                                  controlId="mouseLeftFunction"
                                  label={i18n("options_mouseLeftFunction")}
                                  name="mouseLeftFunction"
                                  value={values.mouseLeftFunction}
                                  options={MOUSE_LEFT_OPTIONS}
                                  onChange={this.handleNumberInputChange}
                                />
                                <SelectOptionGroup
                                  controlId="mouseMiddleFunction"
                                  label={i18n("options_mouseMiddleFunction")}
                                  name="mouseMiddleFunction"
                                  value={values.mouseMiddleFunction}
                                  options={MOUSE_MIDDLE_OPTIONS}
                                  onChange={this.handleNumberInputChange}
                                />
                                <SelectOptionGroup
                                  controlId="mouseWheelFunction1"
                                  label={i18n("options_mouseWheelFunction1")}
                                  name="mouseWheelFunction1"
                                  value={values.mouseWheelFunction1}
                                  options={MOUSE_WHEEL_OPTIONS}
                                  onChange={this.handleNumberInputChange}
                                />
                                <SelectOptionGroup
                                  controlId="mouseWheelFunction2"
                                  label={i18n("options_mouseWheelFunction2")}
                                  name="mouseWheelFunction2"
                                  value={values.mouseWheelFunction2}
                                  options={MOUSE_WHEEL_OPTIONS}
                                  onChange={this.handleNumberInputChange}
                                />
                                <SelectOptionGroup
                                  controlId="mouseWheelFunction3"
                                  label={i18n("options_mouseWheelFunction3")}
                                  name="mouseWheelFunction3"
                                  value={values.mouseWheelFunction3}
                                  options={MOUSE_WHEEL_OPTIONS}
                                  onChange={this.handleNumberInputChange}
                                />
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            )}
            {navActiveKey === "advanced" && (
              <fieldset className="PrefModal__Grid__Col--right__Fieldset">
                <TabLegend
                  title={i18n("options_advanced")}
                  onCloseClick={this.handleCloseClick}
                />
                <div className="checkbox">
                  <label>
                    <input
                      type="checkbox"
                      name="useCanvasEngine"
                      checked={values.useCanvasEngine}
                      onChange={this.handleCheckboxChange}
                    />
                    {i18n("options_useCanvasEngine")}
                  </label>
                </div>
                <div className="checkbox PrefModal__Grid__Col--right__SubCheckbox">
                  <label>
                    <input
                      type="checkbox"
                      name="smoothAnsiArt"
                      checked={values.smoothAnsiArt}
                      disabled={!values.useCanvasEngine}
                      onChange={this.handleCheckboxChange}
                    />
                    {i18n("options_smoothAnsiArt")}
                  </label>
                </div>
              </fieldset>
            )}
            {navActiveKey === "about" && (
              <div className="PrefModal__About">
                <div>
                  <TabLegend
                    title={i18n("appName")}
                    subtitle={i18n("about_appName_subtitle")}
                    onCloseClick={this.handleCloseClick}
                  />
                  <p>{replaceI18n("about_description", this.replacements)}</p>
                </div>
                <div>
                  <legend>
                    {i18n("about_version_title")} - {APP.NAME} v
                    {APP.VERSION}
                    {process.env.DEVELOPER_MODE
                      ? ` (${i18n("alert_developerModeHeader")})`
                      : ""}
                  </legend>
                  <ul>
                    {replaceI18n(
                      "about_version_content",
                      this.replacements,
                    ).map((text, index) => (
                      <li key={index}>{text}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <legend>{i18n("about_new_title")}</legend>
                  <ul>
                    {i18n("about_new_content").map((text, index) => (
                      <li key={index}>{text}</li>
                    ))}
                  </ul>
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
