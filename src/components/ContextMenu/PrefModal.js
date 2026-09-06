import cx from "classnames";
import React from "react";
import { compose, withStateHandlers, withHandlers, lifecycle } from "recompose";
import {
  Modal,
  Tab,
  Row,
  Col,
  Nav,
  NavItem,
  Button,
  Checkbox,
  FormGroup,
  ControlLabel,
  FormControl,
  OverlayTrigger,
  Popover,
} from "react-bootstrap";
import { i18n } from "../../js/i18n";
import "./PrefModal.css";
import {
  DEFAULT_PREFS,
  PREF_STORAGE_KEY,
  getDefaultPrefs,
  readValuesWithDefault,
  writeValues,
} from "../../js/pref";

export { getDefaultPrefs, readValuesWithDefault, writeValues };

const normalizeSec = (value) => {
  const sec = parseInt(value, 10);
  return sec > 1 ? sec : 1;
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

const enhance = compose(
  withStateHandlers(
    () => ({
      navActiveKey: "general",
      values: readValuesWithDefault(),
      replacements: {
        link_github_iamchucky: link(
          "Chuck Yang",
          "https://github.com/iamchucky"
        ),
        link_github_robertabcd: link(
          "robertabcd",
          "https://github.com/robertabcd"
        ),
        link_robertabcd_PttChrome: link(
          "robertabcd/PttChrome",
          "https://github.com/robertabcd/PttChrome"
        ),
        link_github_current_owner: link(
          PTTCHROME.GITHUB_REPOSITORY_OWNER,
          "https://github.com/" + PTTCHROME.GITHUB_REPOSITORY_OWNER
        ),
        link_current_PttChrome: link(
          PTTCHROME.GITHUB_REPOSITORY,
          "https://github.com/" + PTTCHROME.GITHUB_REPOSITORY
        ),
        link_iamchucky_PttChrome: link(
          "iamchucky/PttChrome",
          "https://github.com/iamchucky/PttChrome"
        ),
        link_GPL20: link(
          "General Public License v2.0",
          "https://www.gnu.org/licenses/old-licenses/gpl-2.0.html"
        ),
      },
    }),
    {
      onCloseClick:
        ({ values }, { onSave }) =>
        () =>
          onSave(writeValues(values)),

      onResetClick:
        (state, { onReset }) =>
        () => {
          const defaultValues = getDefaultPrefs();
          writeValues(defaultValues);
          onReset(defaultValues);
          return {
            values: defaultValues,
          };
        },

      onSyncValues: () => () => ({
        values: readValuesWithDefault(),
      }),

      onNavSelect: () => (activeKey) => ({
        navActiveKey: activeKey,
      }),

      onCheckboxChange:
        ({ values }) =>
        ({ target: { name, checked } }) => ({
          values: changeNestedValue(values, name, !!checked),
        }),

      onNumberInputChange:
        ({ values }) =>
        ({ target: { name, value } }) => ({
          values: changeNestedValue(values, name, parseInt(value, 10)),
        }),

      onTextInputChange:
        ({ values }) =>
        ({ target: { name, value } }) => ({
          values: changeNestedValue(values, name, value),
        }),
    }
  ),
  lifecycle({
    componentDidUpdate(prevProps) {
      if (!prevProps.show && this.props.show) {
        this.props.onSyncValues();
      }
    },
  })
);

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
    {title}
    {subtitle && <small> - {subtitle}</small>}
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
  <FormGroup controlId={controlId}>
    <ControlLabel>{label}</ControlLabel>
    <FormControl
      componentClass="select"
      name={name}
      value={value}
      onChange={onChange}
    >
      {options.map((key, index) => (
        <option key={key} value={index}>
          {i18n(key)}
        </option>
      ))}
    </FormControl>
  </FormGroup>
);

export const PrefModal = ({
  show,
  // from recompose
  onCloseClick,
  onResetClick,
  navActiveKey,
  onNavSelect,
  values,
  onCheckboxChange,
  onNumberInputChange,
  onTextInputChange,
  replacements,
}) => (
  <Modal show={show} onHide={onCloseClick} className="PrefModal">
    <Modal.Body>
      <Tab.Container
        id="pref-modal-tabs"
        activeKey={navActiveKey}
        onSelect={onNavSelect}
      >
        <div className="PrefModal__Grid">
          <div className="PrefModal__Grid__Col--left">
            <h3>{i18n("menu_settings")}</h3>
            <Nav bsStyle="pills" stacked>
              <NavItem eventKey="general">{i18n("options_general")}</NavItem>
              <NavItem eventKey="appearance">
                {i18n("options_appearance")}
              </NavItem>
              <NavItem eventKey="mouseBrowsing">
                {i18n("options_mouseBrowsing")}
              </NavItem>
              <NavItem eventKey="advanced">
                {i18n("options_advanced")}
              </NavItem>
              <NavItem eventKey="about">{i18n("options_about")}</NavItem>
            </Nav>
            <Button
              className="PrefModal__Grid__Col--left__Reset"
              onClick={onResetClick}
            >
              {i18n("options_reset")}
            </Button>
          </div>
          <div className="PrefModal__Grid__Col--right">
            <Tab.Content animation>
              <Tab.Pane eventKey="general">
                <fieldset className="PrefModal__Grid__Col--right__Fieldset">
                  <TabLegend
                    title={i18n("options_general")}
                    onCloseClick={onCloseClick}
                  />
                  <Checkbox
                    name="enablePicPreview"
                    checked={values.enablePicPreview}
                    onChange={onCheckboxChange}
                  >
                    {i18n("options_enablePicPreview")}
                  </Checkbox>
                  <Checkbox
                    name="enableNotifications"
                    checked={values.enableNotifications}
                    onChange={onCheckboxChange}
                  >
                    {i18n("options_enableNotifications")}
                  </Checkbox>
                  <Checkbox
                    name="enableEasyReading"
                    checked={values.enableEasyReading}
                    onChange={onCheckboxChange}
                  >
                    {i18n("options_enableEasyReading")}
                  </Checkbox>
                  <Checkbox
                    name="endTurnsOnLiveUpdate"
                    checked={values.endTurnsOnLiveUpdate}
                    onChange={onCheckboxChange}
                  >
                    {i18n("options_endTurnsOnLiveUpdate")}
                  </Checkbox>
                  <Checkbox
                    name="copyOnSelect"
                    checked={values.copyOnSelect}
                    onChange={onCheckboxChange}
                  >
                    {i18n("options_copyOnSelect")}
                  </Checkbox>
                  <FormGroup controlId="antiIdleTime">
                    <ControlLabel>{i18n("options_antiIdleTime")}</ControlLabel>
                    <OverlayTrigger
                      trigger="focus"
                      placement="right"
                      overlay={
                        <Popover id="tooltip_antiIdleTime">
                          {i18n("tooltip_antiIdleTime")}
                        </Popover>
                      }
                    >
                      <FormControl
                        name="antiIdleTime"
                        type="number"
                        value={values.antiIdleTime}
                        onChange={onNumberInputChange}
                      />
                    </OverlayTrigger>
                  </FormGroup>
                  <FormGroup controlId="lineWrap">
                    <ControlLabel>{i18n("options_lineWrap")}</ControlLabel>
                    <FormControl
                      name="lineWrap"
                      type="number"
                      value={values.lineWrap}
                      onChange={onNumberInputChange}
                    />
                  </FormGroup>
                </fieldset>
              </Tab.Pane>
              <Tab.Pane eventKey="appearance">
                <fieldset className="PrefModal__Grid__Col--right__Fieldset">
                  <TabLegend
                    title={i18n("options_appearance")}
                    onCloseClick={onCloseClick}
                  />
                  <FormGroup controlId="fontFace">
                    <ControlLabel>{i18n("options_fontFace")}</ControlLabel>
                    <OverlayTrigger
                      trigger="focus"
                      placement="right"
                      overlay={
                        <Popover id="tooltip_fontFace">
                          {i18n("tooltip_fontFace")}
                        </Popover>
                      }
                    >
                      <FormControl
                        name="fontFace"
                        type="text"
                        value={values.fontFace}
                        onChange={onTextInputChange}
                      />
                    </OverlayTrigger>
                  </FormGroup>
                  <FormGroup controlId="bbsMargin">
                    <ControlLabel>{i18n("options_bbsMargin")}</ControlLabel>
                    <FormControl
                      name="bbsMargin"
                      type="number"
                      value={values.bbsMargin}
                      onChange={onNumberInputChange}
                    />
                  </FormGroup>
                  <FormGroup controlId="termSizeMode">
                    <ControlLabel>{i18n("options_termSize")}</ControlLabel>
                    <FormControl
                      componentClass="select"
                      name="termSizeMode"
                      value={values.termSizeMode}
                      onChange={onTextInputChange}
                    >
                      <option
                        key={"options_fixedTermSize"}
                        value={"fixed-term-size"}
                      >
                        {i18n("options_fixedTermSize")}
                      </option>
                      <option
                        key={"options_fixedFontSize"}
                        value={"fixed-font-size"}
                      >
                        {i18n("options_fixedFontSize")}
                      </option>
                      <option
                        key={"options_maxFontSize"}
                        value={"max-font-size"}
                      >
                        {i18n("options_maxFontSize")}
                      </option>
                    </FormControl>
                  </FormGroup>
                  {(() => {
                    switch (values.termSizeMode) {
                      case "fixed-term-size":
                        return (
                          <div>
                            <FormGroup controlId="termSize_cols">
                              <ControlLabel>
                                {i18n("options_cols")}
                              </ControlLabel>
                              <FormControl
                                name="termSize.cols"
                                type="number"
                                value={values.termSize.cols}
                                onChange={onNumberInputChange}
                              />
                            </FormGroup>
                            <FormGroup controlId="termSize_rows">
                              <ControlLabel>
                                {i18n("options_rows")}
                              </ControlLabel>
                              <FormControl
                                name="termSize.rows"
                                type="number"
                                value={values.termSize.rows}
                                onChange={onNumberInputChange}
                              />
                            </FormGroup>
                            <Checkbox
                              name="fontFitWindowWidth"
                              checked={values.fontFitWindowWidth}
                              onChange={onCheckboxChange}
                            >
                              {i18n("options_fontFitWindowWidth")}
                            </Checkbox>
                          </div>
                        );
                      case "fixed-font-size":
                        return (
                          <FormGroup controlId="fontSize">
                            <ControlLabel>
                              {i18n("options_fontSize")}
                            </ControlLabel>
                            <FormControl
                              name="fontSize"
                              type="number"
                              value={values.fontSize}
                              onChange={onNumberInputChange}
                            />
                          </FormGroup>
                        );
                      case "max-font-size":
                        return (
                          <FormGroup controlId="maxFontSize">
                            <ControlLabel>
                              {i18n("options_fontSizeMax")}
                            </ControlLabel>
                            <FormControl
                              name="maxFontSize"
                              type="number"
                              value={values.maxFontSize}
                              onChange={onNumberInputChange}
                            />
                          </FormGroup>
                        );
                      default:
                        return null;
                    }
                  })()}
                </fieldset>
              </Tab.Pane>
              <Tab.Pane eventKey="mouseBrowsing">
                <fieldset className="PrefModal__Grid__Col--right__Fieldset">
                  <TabLegend
                    title={i18n("options_mouseBrowsing")}
                    onCloseClick={onCloseClick}
                  />
                  <Checkbox
                    name="useMouseBrowsing"
                    checked={values.useMouseBrowsing}
                    onChange={onCheckboxChange}
                  >
                    {i18n("options_useMouseBrowsing")}
                  </Checkbox>
                  <Checkbox
                    name="mouseBrowsingHighlight"
                    checked={values.mouseBrowsingHighlight}
                    onChange={onCheckboxChange}
                  >
                    {i18n("options_mouseBrowsingHighlight")}
                  </Checkbox>
                  <div className="PrefModal__Grid__Col--right__MouseBrowsingHighlightColor">
                    {i18n("options_highlightColor")}
                    <FormControl
                      componentClass="select"
                      className={cx(
                        `b${values.mouseBrowsingHighlightColor}`,
                        `b${values.mouseBrowsingHighlightColor}`
                      )}
                      name="mouseBrowsingHighlightColor"
                      value={values.mouseBrowsingHighlightColor}
                      onChange={onNumberInputChange}
                    >
                      {Array(16)
                        .fill(0, 1 /* skip transparent (index === 0) */)
                        .map((x, i) => (
                          <option
                            key={i}
                            value={i}
                            className={cx(
                              `b${i}` /* FIXME: Existing bug: Not working for Chrome */
                            )}
                          />
                        ))}
                    </FormControl>
                  </div>
                  <SelectOptionGroup
                    controlId="mouseLeftFunction"
                    label={i18n("options_mouseLeftFunction")}
                    name="mouseLeftFunction"
                    value={values.mouseLeftFunction}
                    options={MOUSE_LEFT_OPTIONS}
                    onChange={onNumberInputChange}
                  />
                  <SelectOptionGroup
                    controlId="mouseMiddleFunction"
                    label={i18n("options_mouseMiddleFunction")}
                    name="mouseMiddleFunction"
                    value={values.mouseMiddleFunction}
                    options={MOUSE_MIDDLE_OPTIONS}
                    onChange={onNumberInputChange}
                  />
                  <SelectOptionGroup
                    controlId="mouseWheelFunction1"
                    label={i18n("options_mouseWheelFunction1")}
                    name="mouseWheelFunction1"
                    value={values.mouseWheelFunction1}
                    options={MOUSE_WHEEL_OPTIONS}
                    onChange={onNumberInputChange}
                  />
                  <SelectOptionGroup
                    controlId="mouseWheelFunction2"
                    label={i18n("options_mouseWheelFunction2")}
                    name="mouseWheelFunction2"
                    value={values.mouseWheelFunction2}
                    options={MOUSE_WHEEL_OPTIONS}
                    onChange={onNumberInputChange}
                  />
                  <SelectOptionGroup
                    controlId="mouseWheelFunction3"
                    label={i18n("options_mouseWheelFunction3")}
                    name="mouseWheelFunction3"
                    value={values.mouseWheelFunction3}
                    options={MOUSE_WHEEL_OPTIONS}
                    onChange={onNumberInputChange}
                  />
                </fieldset>
              </Tab.Pane>
              <Tab.Pane eventKey="advanced">
                <fieldset className="PrefModal__Grid__Col--right__Fieldset">
                  <TabLegend
                    title={i18n("options_advanced")}
                    onCloseClick={onCloseClick}
                  />
                  <Checkbox
                    name="useCanvasEngine"
                    checked={values.useCanvasEngine}
                    onChange={onCheckboxChange}
                  >
                    {i18n("options_useCanvasEngine")}
                  </Checkbox>
                  <Checkbox
                    className="PrefModal__Grid__Col--right__SubCheckbox"
                    name="smoothAnsiArt"
                    checked={values.smoothAnsiArt}
                    disabled={!values.useCanvasEngine}
                    onChange={onCheckboxChange}
                  >
                    {i18n("options_smoothAnsiArt")}
                  </Checkbox>
                  <Checkbox
                    name="showFps"
                    checked={values.showFps}
                    onChange={onCheckboxChange}
                  >
                    {i18n("options_showFps")}
                  </Checkbox>
                  <Checkbox
                    name="captureConnectionLog"
                    checked={values.captureConnectionLog}
                    onChange={onCheckboxChange}
                  >
                    {i18n("options_captureConnectionLog")}
                  </Checkbox>
                </fieldset>
              </Tab.Pane>
              <Tab.Pane eventKey="about">
                <div>
                  <TabLegend
                    title={i18n("appName")}
                    subtitle={i18n("about_appName_subtitle")}
                    onCloseClick={onCloseClick}
                  />
                  <p>{replaceI18n("about_description", replacements)}</p>
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
                    {replaceI18n("about_version_content", replacements).map(
                      (text, index) => (
                        <li key={index}>{text}</li>
                      )
                    )}
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
              </Tab.Pane>
            </Tab.Content>
          </div>
        </div>
      </Tab.Container>
    </Modal.Body>
  </Modal>
);

export default enhance(PrefModal);
