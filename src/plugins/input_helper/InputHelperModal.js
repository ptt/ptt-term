import cx from "classnames";
import React from "react";
import NativeDialog from "../../components/NativeDialog";
import ColorSpan from "../../components/Row/WordSegmentBuilder/ColorSpan";
import { i18n } from "../../js/i18n";
import "./InputHelperModal.css";

const SYMBOLS = {
  general: [
    "，",
    "、",
    "。",
    "．",
    "？",
    "！",
    "～",
    "＄",
    "％",
    "＠",
    "＆",
    "＃",
    "＊",
    "‧",
    "；",
    "︰",
    "…",
    "‥",
    "﹐",
    "﹒",
    "˙",
    "·",
    "﹔",
    "﹕",
    "‘",
    "’",
    "“",
    "”",
    "〝",
    "〞",
    "‵",
    "′",
    "〃"
  ],

  lineBorders: [
    "├",
    "─",
    "┼",
    "┴",
    "┬",
    "┤",
    "┌",
    "┐",
    "│",
    "▕",
    "└",
    "┘",
    "╭",
    "╮",
    "╰",
    "╯",
    "╔",
    "╦",
    "╗",
    "╠",
    "═",
    "╬",
    "╣",
    "╓",
    "╥",
    "╖",
    "╒",
    "╤",
    "╕",
    "║",
    "╚",
    "╩",
    "╝",
    "╟",
    "╫",
    "╢",
    "╙",
    "╨",
    "╜",
    "╞",
    "╪",
    "╡",
    "╘",
    "╧",
    "╛"
  ],

  blocks: [
    "＿",
    "ˍ",
    "▁",
    "▂",
    "▃",
    "▄",
    "▅",
    "▆",
    "▇",
    "█",
    "▏",
    "▎",
    "▍",
    "▌",
    "▋",
    "▊",
    "▉",
    "◢",
    "◣",
    "◥",
    "◤"
  ],

  lines: [
    "﹣",
    "﹦",
    "≡",
    "｜",
    "∣",
    "∥",
    "–",
    "︱",
    "—",
    "︳",
    "╴",
    "¯",
    "￣",
    "﹉",
    "﹊",
    "﹍",
    "﹎",
    "﹋",
    "﹌",
    "﹏",
    "︴",
    "∕",
    "﹨",
    "╱",
    "╲",
    "／",
    "＼"
  ],

  special: [
    "↑",
    "↓",
    "←",
    "→",
    "↖",
    "↗",
    "↙",
    "↘",
    "㊣",
    "◎",
    "○",
    "●",
    "⊕",
    "⊙",
    "△",
    "▲",
    "☆",
    "★",
    "◇",
    "Æ",
    "□",
    "■",
    "▽",
    "▼",
    "§",
    "￥",
    "〒",
    "￠",
    "￡",
    "※",
    "♀",
    "♂"
  ],

  brackets: [
    "〔",
    "〕",
    "【",
    "】",
    "《",
    "》",
    "（",
    "）",
    "｛",
    "｝",
    "﹙",
    "﹚",
    "『",
    "』",
    "﹛",
    "﹜",
    "﹝",
    "﹞",
    "＜",
    "＞",
    "﹤",
    "﹥",
    "「",
    "」",
    "︵",
    "︶",
    "︷",
    "︸",
    "︹",
    "︺",
    "︻",
    "︼",
    "︽",
    "︾",
    "〈",
    "〉",
    "︿",
    "﹀",
    "﹁",
    "﹂",
    "﹃",
    "﹄"
  ],

  greek: [
    "Α",
    "Β",
    "Γ",
    "Δ",
    "Ε",
    "Ζ",
    "Η",
    "Θ",
    "Ι",
    "Κ",
    "Λ",
    "Μ",
    "Ν",
    "Ξ",
    "Ο",
    "Π",
    "Ρ",
    "Σ",
    "Τ",
    "Υ",
    "Φ",
    "Χ",
    "Ψ",
    "Ω",
    "α",
    "β",
    "γ",
    "δ",
    "ε",
    "ζ",
    "η",
    "θ",
    "ι",
    "κ",
    "λ",
    "μ",
    "ν",
    "ξ",
    "ο",
    "π",
    "ρ",
    "σ",
    "τ",
    "υ",
    "φ",
    "χ",
    "ψ",
    "ω"
  ],

  phonetic: [
    "ㄅ",
    "ㄆ",
    "ㄇ",
    "ㄈ",
    "ㄉ",
    "ㄊ",
    "ㄋ",
    "ㄌ",
    "ㄍ",
    "ㄎ",
    "ㄏ",
    "ㄐ",
    "ㄑ",
    "ㄒ",
    "ㄓ",
    "ㄔ",
    "ㄕ",
    "ㄖ",
    "ㄗ",
    "ㄘ",
    "ㄙ",
    "ㄚ",
    "ㄛ",
    "ㄜ",
    "ㄝ",
    "ㄞ",
    "ㄟ",
    "ㄠ",
    "ㄡ",
    "ㄢ",
    "ㄣ",
    "ㄤ",
    "ㄥ",
    "ㄦ",
    "ㄧ",
    "ㄨ",
    "ㄩ",
    "˙",
    "ˊ",
    "ˇ",
    "ˋ"
  ],

  math: [
    "╳",
    "＋",
    "﹢",
    "－",
    "×",
    "÷",
    "＝",
    "≠",
    "≒",
    "∞",
    "ˇ",
    "±",
    "√",
    "⊥",
    "∠",
    "∟",
    "⊿",
    "㏒",
    "㏑",
    "∫",
    "∮",
    "∵",
    "∴",
    "≦",
    "≧",
    "∩",
    "∪"
  ],

  hiragana: [
    "あ",
    "い",
    "う",
    "え",
    "お",
    "か",
    "き",
    "く",
    "け",
    "こ",
    "さ",
    "し",
    "す",
    "せ",
    "そ",
    "た",
    "ち",
    "つ",
    "て",
    "と",
    "な",
    "に",
    "ぬ",
    "ね",
    "の",
    "は",
    "ひ",
    "ふ",
    "へ",
    "ほ",
    "ま",
    "み",
    "む",
    "め",
    "も",
    "ら",
    "り",
    "る",
    "れ",
    "ろ",
    "が",
    "ぎ",
    "ぐ",
    "げ",
    "ご",
    "ざ",
    "じ",
    "ず",
    "ぜ",
    "ぞ",
    "だ",
    "ぢ",
    "づ",
    "で",
    "ど",
    "ば",
    "び",
    "ぶ",
    "べ",
    "ぼ",
    "ぱ",
    "ぴ",
    "ぷ",
    "ぺ",
    "ぽ",
    "や",
    "ゆ",
    "よ",
    "わ",
    "ん",
    "を"
  ],

  katakana: [
    "ア",
    "イ",
    "ウ",
    "エ",
    "オ",
    "カ",
    "キ",
    "ク",
    "ケ",
    "コ",
    "サ",
    "シ",
    "ス",
    "セ",
    "ソ",
    "タ",
    "チ",
    "ツ",
    "テ",
    "ト",
    "ナ",
    "ニ",
    "ヌ",
    "ネ",
    "ノ",
    "ハ",
    "ヒ",
    "フ",
    "ヘ",
    "ホ",
    "マ",
    "ミ",
    "ム",
    "メ",
    "モ",
    "ラ",
    "リ",
    "ル",
    "レ",
    "ロ",
    "ガ",
    "ギ",
    "グ",
    "ゲ",
    "ゴ",
    "ザ",
    "ジ",
    "ズ",
    "ゼ",
    "ゾ",
    "ダ",
    "ジ",
    "ズ",
    "デ",
    "ド",
    "バ",
    "ビ",
    "ブ",
    "ベ",
    "ボ",
    "パ",
    "ピ",
    "プ",
    "ペ",
    "ポ",
    "ヤ",
    "ユ",
    "ヨ",
    "ワ",
    "ン",
    "ヲ"
  ]
};

const EMOTICONS = {
  angry: [
    "(ノ ゜Д゜)ノ ︵ ═╩════╩═",
    "╯-____-)╯~═╩════╩═~",
    "(╭∩╮\\_/╭∩╮)",
    "( ︶︿︶)_╭∩╮",
    "( ‵□′)───C＜─___-)|||",
    "(￣ε(#￣) #○=(一-一o)",
    "(o一-一)=○# (￣#)3￣)",
    "╰(‵皿′＊)╯",
    "○(#‵︿′ㄨ)○",
    "◢▆▅▄▃-崩╰(〒皿〒)╯潰-▃▄▅▆◣"
  ],

  meh: [
    "(σ′▽‵)′▽‵)σ 哈哈哈哈～你看看你",
    "( ￣ c￣)y▂ξ",
    "( ′-`)y-～",
    "′_>‵",
    "╮(′～‵〞)╭",
    '╮(﹀_﹀")╭',
    "︿(￣︶￣)︿",
    "..╮(﹋﹏﹌)╭..",
    "╮(╯_╰)╭",
    "╮(╯▽╰)/"
  ],

  sweat: [
    "(－^－)ｄ",
    "(￣￣；)",
    "(￣□￣|||)a",
    "(●；－_－)●",
    "￣▽￣||",
    "╭ ﹀◇﹀〣",
    "ˋ(′_‵||)ˊ",
    "●( ¯▽¯；●",
    "o(＞＜；)o o"
  ],

  happy: [
    "~(￣▽￣)~(＿△＿)~(￣▽￣)~(＿△＿)~(￣▽￣)~",
    "(~^O^~)",
    "(∩_∩)",
    "<(￣︶￣)>",
    "v(￣︶￣)y",
    "﹨(╯▽╰)∕",
    "\\(@^0^@)/",
    "\\(^▽^)/",
    "\\⊙▽⊙/"
  ],

  other: [
    "(．＿．?)",
    "(？o？)",
    "(‧Q‧)",
    "〒△〒",
    "m川@.川m",
    "(¯(∞)¯)",
    "(⊙o⊙)",
    "(≧<>≦)",
    "(☆_☆)",
    'o(‧"‧)o'
  ]
};

function sendColorCommand({ fg, bg, isBlink }, onCmdSend, type, site) {
  onCmdSend(site.getEditorColorCommand({ fg, bg, isBlink }, type));
}

export class InputHelperModal extends React.Component {
  state = {
    fg: 7,
    bg: 0,
    isBlink: false,
    activeTab: "colors",
    symbolDropdownOpen: false,
    emoDropdownOpen: false,
    sendDropdownOpen: false,
  };

  dragActive = false;
  dragStartX = 0;
  dragStartY = 0;
  dialogInitialTop = 0;
  dialogInitialLeft = 0;
  dialogElem = null;

  handleMouseDown = (e) => {
    if (
      e.button !== 0 ||
      e.target.tagName === "BUTTON" ||
      e.target.closest("button")
    ) {
      return;
    }
    this.dragActive = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    if (this.dialogElem) {
      const rect = this.dialogElem.getBoundingClientRect();
      this.dialogInitialTop = rect.top;
      this.dialogInitialLeft = rect.left;
      this.dialogElem.style.top = `${rect.top}px`;
      this.dialogElem.style.left = `${rect.left}px`;
    }
    window.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("mouseup", this.handleMouseUp);
  };

  handleMouseMove = (e) => {
    if (this.dragActive && this.dialogElem) {
      window.getSelection().removeAllRanges();
      const top = this.dialogInitialTop + (e.clientY - this.dragStartY);
      const left = this.dialogInitialLeft + (e.clientX - this.dragStartX);
      this.dialogElem.style.top = `${top}px`;
      this.dialogElem.style.left = `${left}px`;
    }
  };

  handleMouseUp = () => {
    this.dragActive = false;
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("mouseup", this.handleMouseUp);
  };

  componentDidMount() {
    window.addEventListener("click", this.handleDocumentClick);
  }

  componentWillUnmount() {
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("mouseup", this.handleMouseUp);
    window.removeEventListener("click", this.handleDocumentClick);
  }

  handleDocumentClick = (e) => {
    if (
      this.state.symbolDropdownOpen ||
      this.state.emoDropdownOpen ||
      this.state.sendDropdownOpen
    ) {
      if (
        !e.target.closest?.(".dropdown") &&
        !e.target.closest?.(".btn-group")
      ) {
        this.setState({
          symbolDropdownOpen: false,
          emoDropdownOpen: false,
          sendDropdownOpen: false,
        });
      }
    }
  };

  handleColorClick = (e) => {
    const fg = e.currentTarget.dataset.fg;
    if (fg !== undefined) {
      this.setState({ fg: parseInt(fg, 10) });
    }
  };

  handleColorContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const bg = e.currentTarget.dataset.bg;
    if (bg !== undefined) {
      this.setState({ bg: parseInt(bg, 10) });
    }
  };

  handleBlinkChange = (e) => {
    this.setState({ isBlink: e.target.checked });
  };

  handleSendClick = () => {
    sendColorCommand(this.state, this.props.onCmdSend, undefined, this.props.site);
  };

  handleSendSelect = (type) => (e) => {
    e.preventDefault();
    this.setState({ sendDropdownOpen: false });
    sendColorCommand(this.state, this.props.onCmdSend, type, this.props.site);
  };

  handleSendReset = (e) => {
    e.preventDefault();
    this.setState({ sendDropdownOpen: false });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleSymEmoClick = (e) => {
    if (this.props.onConvSend) {
      this.props.onConvSend(e.target.textContent);
    }
  };

  selectTab = (tab) => (e) => {
    e.preventDefault();
    this.setState({
      activeTab: tab,
      symbolDropdownOpen: false,
      emoDropdownOpen: false,
    });
  };

  toggleSymbolDropdown = (e) => {
    e.preventDefault();
    this.setState((prev) => ({
      symbolDropdownOpen: !prev.symbolDropdownOpen,
      emoDropdownOpen: false,
    }));
  };

  toggleEmoDropdown = (e) => {
    e.preventDefault();
    this.setState((prev) => ({
      emoDropdownOpen: !prev.emoDropdownOpen,
      symbolDropdownOpen: false,
    }));
  };

  toggleSendDropdown = (e) => {
    e.preventDefault();
    this.setState((prev) => ({
      sendDropdownOpen: !prev.sendDropdownOpen,
    }));
  };

  render() {
    const { show, onHide } = this.props;
    const { fg, bg, isBlink, activeTab, symbolDropdownOpen, emoDropdownOpen, sendDropdownOpen } = this.state;

    return (
      <NativeDialog
        open={show}
        onClose={onHide}
        modal={false}
        className="InputHelperModal__Dialog"
        ref={(ref) => {
          this.dialogElem = ref && ref.dialogRef ? ref.dialogRef.current : null;
        }}
      >
        <div className="modal-header" onMouseDown={this.handleMouseDown} style={{ cursor: "move" }}>
          <h4 className="modal-title">{i18n("inputHelperTitle")}</h4>
          <button type="button" className="close" onClick={onHide} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body">
          <ul className="nav nav-tabs">
            <li className={activeTab === "colors" ? "active" : ""}>
              <a href="#" onClick={this.selectTab("colors")}>
                {i18n("colorTitle")}
              </a>
            </li>
            <li className={cx("dropdown", { active: activeTab.startsWith("symbols.") })}>
              <a href="#" className="dropdown-toggle" onClick={this.toggleSymbolDropdown}>
                {i18n("symTitle")} <span className="caret" />
              </a>
              {symbolDropdownOpen && (
                <ul className="dropdown-menu" style={{ display: "block" }}>
                  {Object.keys(SYMBOLS).map((group) => (
                    <li key={group} className={activeTab === `symbols.${group}` ? "active" : ""}>
                      <a href="#" onClick={this.selectTab(`symbols.${group}`)}>
                        {i18n(`symTitle_${group}`)}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
            <li className={cx("dropdown", { active: activeTab.startsWith("emoticons.") })}>
              <a href="#" className="dropdown-toggle" onClick={this.toggleEmoDropdown}>
                {i18n("emoTitle")} <span className="caret" />
              </a>
              {emoDropdownOpen && (
                <ul className="dropdown-menu" style={{ display: "block" }}>
                  {Object.keys(EMOTICONS).map((group) => (
                    <li key={group} className={activeTab === `emoticons.${group}` ? "active" : ""}>
                      <a href="#" onClick={this.selectTab(`emoticons.${group}`)}>
                        {i18n(`emoTitle_${group}`)}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          </ul>

          <div className="tab-content" style={{ marginTop: 15 }}>
            {activeTab === "colors" && (
              <div>
                <div className="row">
                  <div className="col-xs-12 col-sm-7">
                    <ul className="InputHelperModal__ColorList">
                      {Array(16)
                        .fill(0)
                        .map((_, i) => (
                          <li
                            key={i}
                            onClick={this.handleColorClick}
                            onContextMenu={this.handleColorContextMenu}
                            className={`b${i}`}
                            data-fg={i}
                            data-bg={i}
                          />
                        ))}
                    </ul>
                  </div>
                  <div className="col-xs-12 col-sm-5">
                    {i18n("colorHelperTooltip1")}
                    <br />
                    {i18n("colorHelperTooltip2")}
                  </div>
                </div>
                <div className="InputHelperModal__Preview">
                  <ColorSpan
                    className="InputHelperModal__Preview__Content"
                    colorState={{
                      fg,
                      bg,
                      blink: isBlink,
                    }}
                    inner={i18n("colorHelperPreview")}
                  />
                </div>
                <div className="row InputHelperModal__ColorActionRow">
                  <div className="col-xs-4">
                    <div className="checkbox" style={{ margin: "5px 0" }}>
                      <label>
                        <input
                          type="checkbox"
                          checked={isBlink}
                          onChange={this.handleBlinkChange}
                        />
                        {i18n("colorHelperBlink")}
                      </label>
                    </div>
                  </div>
                  <div className="col-xs-8 InputHelperModal__SendButtonContainer">
                    <div className="btn-group" style={{ position: "relative" }}>
                      <button
                        type="button"
                        className="btn btn-default"
                        onClick={this.handleSendClick}
                      >
                        {i18n("colorHelperSend")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-default dropdown-toggle"
                        onClick={this.toggleSendDropdown}
                      >
                        <span className="caret" />
                      </button>
                      {sendDropdownOpen && (
                        <ul className="dropdown-menu dropdown-menu-right" style={{ display: "block" }}>
                          <li>
                            <a href="#" onClick={this.handleSendSelect("foreground")}>
                              {i18n("colorHelperSendMenuFore")}
                            </a>
                          </li>
                          <li>
                            <a href="#" onClick={this.handleSendSelect("background")}>
                              {i18n("colorHelperSendMenuBack")}
                            </a>
                          </li>
                          <li className="divider" />
                          <li>
                            <a href="#" onClick={this.handleSendReset}>
                              {i18n("colorHelperSendMenuReset")}
                            </a>
                          </li>
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {Object.keys(SYMBOLS).map((group) =>
              activeTab === `symbols.${group}` ? (
                <div key={group}>
                  <ul className="InputHelperModal__SymbolList">
                    {SYMBOLS[group].map((it, index) => (
                      <li key={index} onClick={this.handleSymEmoClick}>
                        {it}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null
            )}
            {Object.keys(EMOTICONS).map((group) =>
              activeTab === `emoticons.${group}` ? (
                <div key={group}>
                  <ul className="InputHelperModal__EmoticonList">
                    {EMOTICONS[group].map((it, index) => (
                      <li key={index} onClick={this.handleSymEmoClick}>
                        {it}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null
            )}
          </div>
        </div>
      </NativeDialog>
    );
  }
}

export default InputHelperModal;
