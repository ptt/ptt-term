import React from "react";
import cx from "classnames";
import { i18n } from "../../js/i18n";
import { DEFAULT_PREFS } from "../../js/pref";
import {
  parseFontList,
  serializeFontList,
  PRESET_FONTS,
} from "../../js/font_util";
import "./FontManager.css";

const TrashIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="currentColor"
    aria-hidden="true"
    style={{ display: "block" }}
  >
    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
    <path
      fillRule="evenodd"
      d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"
    />
  </svg>
);

export class FontManager extends React.Component {
  state = {
    selectedFont: "",
    deviceFonts: [],
    isQuerying: false,
    hasQueried: false,
    queryError: null,
    draggingIndex: null,
    dragOverIndex: null,
  };

  getFontList() {
    return parseFontList(this.props.value);
  }

  updateFontList(newList) {
    if (this.props.onChange) {
      this.props.onChange(serializeFontList(newList));
    }
  }

  handleAdd = (fontName) => {
    const target = (fontName || this.state.selectedFont || "").trim();
    if (!target) return;
    const current = this.getFontList();
    const alreadyExists = current.some(
      (f) => f.toLowerCase() === target.toLowerCase(),
    );
    if (!alreadyExists) {
      this.updateFontList([...current, target]);
    }
    this.setState({ selectedFont: "" });
  };

  handleRemove = (index) => {
    const current = this.getFontList();
    current.splice(index, 1);
    this.updateFontList(current);
  };

  handleMoveUp = (index) => {
    if (index <= 0) return;
    const current = this.getFontList();
    const temp = current[index - 1];
    current[index - 1] = current[index];
    current[index] = temp;
    this.updateFontList(current);
  };

  handleMoveDown = (index) => {
    const current = this.getFontList();
    if (index >= current.length - 1) return;
    const temp = current[index + 1];
    current[index + 1] = current[index];
    current[index] = temp;
    this.updateFontList(current);
  };

  handleDragStart = (e, index) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    this.setState({ draggingIndex: index });
  };

  handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (this.state.dragOverIndex !== index) {
      this.setState({ dragOverIndex: index });
    }
  };

  handleDragLeave = () => {
    this.setState({ dragOverIndex: null });
  };

  handleDrop = (e, targetIndex) => {
    e.preventDefault();
    const { draggingIndex } = this.state;
    if (draggingIndex !== null && draggingIndex !== targetIndex) {
      const current = this.getFontList();
      const [item] = current.splice(draggingIndex, 1);
      current.splice(targetIndex, 0, item);
      this.updateFontList(current);
    }
    this.setState({ draggingIndex: null, dragOverIndex: null });
  };

  handleDragEnd = () => {
    this.setState({ draggingIndex: null, dragOverIndex: null });
  };

  handleQueryLocalFonts = async () => {
    if (typeof window === "undefined" || !("queryLocalFonts" in window)) {
      return;
    }
    this.setState({ isQuerying: true, queryError: null });
    try {
      const fonts = await window.queryLocalFonts();
      const families = Array.from(new Set(fonts.map((f) => f.family)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      this.setState({
        deviceFonts: families,
        hasQueried: true,
        isQuerying: false,
      });
    } catch (err) {
      console.warn("queryLocalFonts error:", err);
      this.setState({
        isQuerying: false,
        queryError: err.name === "AbortError" ? null : err.message || "Failed",
      });
    }
  };

  handleRestoreDefault = () => {
    if (this.props.onChange) {
      this.props.onChange(DEFAULT_PREFS.fontFace);
    }
  };

  handleSelectChange = (e) => {
    this.setState({ selectedFont: e.target.value });
  };

  handleSelectKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      this.handleAdd();
    }
  };

  render() {
    const {
      selectedFont,
      deviceFonts,
      isQuerying,
      hasQueried,
      queryError,
      draggingIndex,
      dragOverIndex,
    } = this.state;

    const fontList = this.getFontList();
    const canQueryLocalFonts =
      typeof window !== "undefined" && "queryLocalFonts" in window;

    return (
      <div className="FontManager">
        <div className="FontManager__Toolbar">
          <span className="FontManager__Toolbar__Title">
            {i18n("options_fontList_title")}
          </span>
          <div className="FontManager__Toolbar__Actions">
            {canQueryLocalFonts && (
              <button
                type="button"
                className="btn btn-default btn-xs"
                onClick={this.handleQueryLocalFonts}
                disabled={isQuerying}
                title={
                  hasQueried
                    ? `${i18n("options_fontList_queried")} (${deviceFonts.length})`
                    : i18n("options_fontList_queryDevice")
                }
              >
                {isQuerying
                  ? i18n("options_fontList_querying")
                  : hasQueried
                    ? `✓ ${i18n("options_fontList_queried")} (${deviceFonts.length})`
                    : i18n("options_fontList_queryDevice")}
              </button>
            )}
            <button
              type="button"
              className="btn btn-default btn-xs"
              onClick={this.handleRestoreDefault}
              title={i18n("options_fontList_restoreDefault")}
            >
              {i18n("options_fontList_restoreDefault")}
            </button>
          </div>
        </div>

        {queryError && (
          <div className="FontManager__Status FontManager__Status--error">
            {queryError}
          </div>
        )}

        <div className="FontManager__List">
          {fontList.length === 0 ? (
            <div className="FontManager__Empty">
              {i18n("options_fontList_empty")}
            </div>
          ) : (
            fontList.map((font, idx) => {
              const isDragging = draggingIndex === idx;
              const isDragOver = dragOverIndex === idx;
              return (
                <div
                  key={`${font}-${idx}`}
                  className={cx("FontManager__Item", {
                    "FontManager__Item--dragging": isDragging,
                    "FontManager__Item--dragover": isDragOver,
                  })}
                  draggable
                  onDragStart={(e) => this.handleDragStart(e, idx)}
                  onDragOver={(e) => this.handleDragOver(e, idx)}
                  onDragLeave={this.handleDragLeave}
                  onDrop={(e) => this.handleDrop(e, idx)}
                  onDragEnd={this.handleDragEnd}
                >
                  <span
                    className="FontManager__Item__Handle"
                    title={i18n("options_fontList_title")}
                  >
                    ⋮⋮
                  </span>
                  <div className="FontManager__Item__Info">
                    <span className="FontManager__Item__Name">{font}</span>
                    <span
                      className="FontManager__Item__Preview"
                      style={{ fontFamily: `'${font}', monospace` }}
                    >
                      {i18n("options_fontList_preview")} ({font})
                    </span>
                  </div>
                  <div className="FontManager__Item__Controls">
                    <button
                      type="button"
                      className="btn btn-default btn-xs"
                      disabled={idx === 0}
                      onClick={() => this.handleMoveUp(idx)}
                      title={i18n("options_fontList_moveUp")}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="btn btn-default btn-xs"
                      disabled={idx === fontList.length - 1}
                      onClick={() => this.handleMoveDown(idx)}
                      title={i18n("options_fontList_moveDown")}
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-xs"
                      onClick={() => this.handleRemove(idx)}
                      title={i18n("options_fontList_remove")}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="FontManager__AddBox">
          <select
            className="form-control FontManager__AddBox__Select"
            value={selectedFont}
            onChange={this.handleSelectChange}
            onKeyDown={this.handleSelectKeyDown}
          >
            <option value="" disabled>
              {i18n("options_fontList_selectThenAdd")}
            </option>
            <optgroup label={i18n("options_fontList_presetGroup")}>
              {PRESET_FONTS.map((f) => (
                <option key={`preset-${f}`} value={f}>
                  {f}
                </option>
              ))}
            </optgroup>
            {deviceFonts.length > 0 && (
              <optgroup
                label={`${i18n("options_fontList_deviceGroup")} (${deviceFonts.length})`}
              >
                {deviceFonts.map((f) => (
                  <option key={`device-${f}`} value={f}>
                    {f}
                  </option>
                ))}
              </optgroup>
            )}
          </select>

          <button
            type="button"
            className="btn btn-primary btn-sm FontManager__AddBox__Button"
            disabled={!selectedFont}
            onClick={() => this.handleAdd()}
          >
            {i18n("options_fontList_add")}
          </button>
        </div>
      </div>
    );
  }
}

export default FontManager;
