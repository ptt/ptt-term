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
} from "../../js/pref";

export { getDefaultPrefs, readValuesWithDefault, writeValues };

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
  };

  replacements = {
    link_github_iamchucky: link("Chuck Yang", "https://github.com/iamchucky"),
    link_github_robertabcd: link("robertabcd", "https://github.com/robertabcd"),
    link_robertabcd_PttChrome: link(
      "robertabcd/PttChrome",
      "https://github.com/robertabcd/PttChrome",
    ),
    link_github_current_owner: link(
      PTTCHROME.GITHUB_REPOSITORY_OWNER,
      "https://github.com/" + PTTCHROME.GITHUB_REPOSITORY_OWNER,
    ),
    link_current_PttChrome: link(
      PTTCHROME.GITHUB_REPOSITORY,
      "https://github.com/" + PTTCHROME.GITHUB_REPOSITORY,
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
      this.setState({ values: readValuesWithDefault() });
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

  handleCheckboxChange = ({ target: { name, checked } }) => {
    this.setState((prevState) => ({
      values: changeNestedValue(prevState.values, name, !!checked),
    }));
  };

  handleNumberInputChange = ({ target: { name, value } }) => {
    this.setState((prevState) => ({
      values: changeNestedValue(prevState.values, name, parseInt(value, 10)),
    }));
  };

  handleTextInputChange = ({ target: { name, value } }) => {
    this.setState((prevState) => ({
      values: changeNestedValue(prevState.values, name, value),
    }));
  };

  render() {
    const { show } = this.props;
    const { navActiveKey, values } = this.state;

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
              <li className={navActiveKey === "mouseBrowsing" ? "active" : ""}>
                <a href="#" onClick={this.handleNavSelect("mouseBrowsing")}>
                  {i18n("options_mouseBrowsing")}
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
                      name="enablePicPreview"
                      checked={values.enablePicPreview}
                      onChange={this.handleCheckboxChange}
                    />
                    {i18n("options_enablePicPreview")}
                  </label>
                </div>
                <div className="checkbox PrefModal__Grid__Col--right__SubCheckbox">
                  <label>
                    <input
                      type="checkbox"
                      name="picPreviewWhitelistOnly"
                      checked={values.picPreviewWhitelistOnly}
                      disabled={!values.enablePicPreview}
                      onChange={this.handleCheckboxChange}
                    />
                    {i18n("options_picPreviewWhitelistOnly")}
                  </label>
                </div>
                <div className="checkbox">
                  <label>
                    <input
                      type="checkbox"
                      name="enableNotifications"
                      checked={values.enableNotifications}
                      onChange={this.handleCheckboxChange}
                    />
                    {i18n("options_enableNotifications")}
                  </label>
                </div>
                <div className="checkbox">
                  <label>
                    <input
                      type="checkbox"
                      name="enableEasyReading"
                      checked={values.enableEasyReading}
                      onChange={this.handleCheckboxChange}
                    />
                    {i18n("options_enableEasyReading")}
                  </label>
                </div>
                <div className="checkbox">
                  <label>
                    <input
                      type="checkbox"
                      name="endTurnsOnLiveUpdate"
                      checked={values.endTurnsOnLiveUpdate}
                      onChange={this.handleCheckboxChange}
                    />
                    {i18n("options_endTurnsOnLiveUpdate")}
                  </label>
                </div>
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
                <div className="form-group" id="antiIdleTime">
                  <label className="control-label">
                    {i18n("options_antiIdleTime")}
                  </label>
                  <input
                    className="form-control"
                    name="antiIdleTime"
                    type="number"
                    title={i18n("tooltip_antiIdleTime")}
                    value={values.antiIdleTime}
                    onChange={this.handleNumberInputChange}
                  />
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
                    name="cursorStyle"
                    value={values.cursorStyle || "blink"}
                    onChange={this.handleTextInputChange}
                  >
                    <option key="options_cursorBlink" value="blink">
                      {i18n("options_cursorBlink")}
                    </option>
                    <option key="options_cursorUnderline" value="underline">
                      {i18n("options_cursorUnderline")}
                    </option>
                    <option key="options_cursorReverse" value="reverse">
                      {i18n("options_cursorReverse")}
                    </option>
                    <option key="options_cursorBlinkReverse" value="blink-reverse">
                      {i18n("options_cursorBlinkReverse")}
                    </option>
                  </select>
                </div>
                <div className="form-group" id="bbsMargin">
                  <label className="control-label">
                    {i18n("options_bbsMargin")}
                  </label>
                  <input
                    className="form-control"
                    name="bbsMargin"
                    type="number"
                    value={values.bbsMargin}
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
                    value={values.termSizeMode}
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
                </div>
                {values.termSizeMode === "fixed-term-size" && (
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
                {values.termSizeMode === "fixed-font-size" && (
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
                {values.termSizeMode === "max-font-size" && (
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
            {navActiveKey === "mouseBrowsing" && (
              <fieldset className="PrefModal__Grid__Col--right__Fieldset">
                <TabLegend
                  title={i18n("options_mouseBrowsing")}
                  onCloseClick={this.handleCloseClick}
                />
                <div className="checkbox">
                  <label>
                    <input
                      type="checkbox"
                      name="useMouseBrowsing"
                      checked={values.useMouseBrowsing}
                      onChange={this.handleCheckboxChange}
                    />
                    {i18n("options_useMouseBrowsing")}
                  </label>
                </div>
                <div className="checkbox">
                  <label>
                    <input
                      type="checkbox"
                      name="mouseBrowsingHighlight"
                      checked={values.mouseBrowsingHighlight}
                      onChange={this.handleCheckboxChange}
                    />
                    {i18n("options_mouseBrowsingHighlight")}
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
                <div className="checkbox">
                  <label>
                    <input
                      type="checkbox"
                      name="showFps"
                      checked={values.showFps}
                      onChange={this.handleCheckboxChange}
                    />
                    {i18n("options_showFps")}
                  </label>
                </div>
                <div className="checkbox">
                  <label>
                    <input
                      type="checkbox"
                      name="captureConnectionLog"
                      checked={values.captureConnectionLog}
                      onChange={this.handleCheckboxChange}
                    />
                    {i18n("options_captureConnectionLog")}
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
                    {i18n("about_version_title")} - {PTTCHROME.NAME} v
                    {PTTCHROME.VERSION}
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
