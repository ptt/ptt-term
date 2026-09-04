import Row from "./Row";
import ImagePreviewer, {
  of,
  resolveSrcToImageUrl,
  resolveWithImageDOM
} from "./ImagePreviewer";
import { termColors } from "../js/term_buf";
import { b2u, isDBCSLead } from "../js/string_util";
import { symbolTable } from "../js/symbol_table";

function isBadDBCS(u) {
  if (!u || u.length === 0) return true;
  return symbolTable["x" + u.charCodeAt(0).toString(16)] == 3;
}

export class Screen extends React.Component {
  constructor(props) {
    super(props);
    this.canvasRef = React.createRef();
    this.isMouseDown = false;
    this.dragStarted = false;
    this.startPos = { col: 0, row: 0 };
  }

  state = {
    currentHighlighted: undefined,
    currentImagePreview: undefined,
    left: undefined,
    top: undefined,
    selStart: null,
    selEnd: null
  };

  componentDidMount() {
    if (this.props.useCanvas) {
      this.draw();
      if (typeof window !== "undefined") {
        window.addEventListener("mouseup", this.handleGlobalMouseUp);
        window.addEventListener("mousemove", this.handleGlobalMouseMove);
      }
      if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          this.draw();
        });
      }
    }
  }

  componentWillUnmount() {
    if (typeof window !== "undefined") {
      window.removeEventListener("mouseup", this.handleGlobalMouseUp);
      window.removeEventListener("mousemove", this.handleGlobalMouseMove);
    }
  }

  componentDidUpdate(prevProps) {
    if (this.props.useCanvas) {
      if (!prevProps.useCanvas) {
        if (typeof window !== "undefined") {
          window.addEventListener("mouseup", this.handleGlobalMouseUp);
          window.addEventListener("mousemove", this.handleGlobalMouseMove);
        }
      }
      this.draw();
    } else if (prevProps.useCanvas) {
      if (typeof window !== "undefined") {
        window.removeEventListener("mouseup", this.handleGlobalMouseUp);
        window.removeEventListener("mousemove", this.handleGlobalMouseMove);
      }
    }
  }

  setCurrentHighlighted = currentHighlighted => {
    this.setState({ currentHighlighted }, () => {
      if (this.props.useCanvas) {
        this.draw();
      }
    });
  };

  getCols() {
    return (
      this.props.cols ||
      (this.props.lines && this.props.lines[0] ? this.props.lines[0].length : 80)
    );
  }

  getRows() {
    return this.props.rows || (this.props.lines ? this.props.lines.length : 24);
  }

  getChw() {
    if (this.props.chw) return this.props.chw;
    const chh = this.getChh();
    return Math.floor(chh / 2);
  }

  getChh() {
    return this.props.chh || this.props.forceWidth || 24;
  }

  getGridPos = e => {
    const canvas = this.canvasRef.current;
    if (!canvas) return { col: 0, row: 0 };
    const rect = canvas.getBoundingClientRect();
    const cols = this.getCols();
    const rows = this.getRows();
    if (rect.width === 0 || rect.height === 0) return { col: 0, row: 0 };

    let col = Math.floor(((e.clientX - rect.left) / rect.width) * cols);
    let row = Math.floor(((e.clientY - rect.top) / rect.height) * rows);
    col = Math.max(0, Math.min(cols - 1, col));
    row = Math.max(0, Math.min(rows - 1, row));
    return { col, row };
  };

  getNormalizedSelection() {
    const { selStart, selEnd } = this.state;
    if (!selStart || !selEnd) return null;
    if (selStart.row === selEnd.row && selStart.col === selEnd.col) return null;

    let start = selStart;
    let end = selEnd;
    if (start.row > end.row || (start.row === end.row && start.col > end.col)) {
      start = selEnd;
      end = selStart;
    }
    return { start, end };
  }

  getSelectionColRow = () => {
    if (!this.props.useCanvas) return null;
    const sel = this.getNormalizedSelection();
    if (!sel) return null;
    const line = this.props.lines && this.props.lines[sel.end.row];
    let endCol = sel.end.col + 1;
    const isCharsetUtf8 = this.props.charset === "UTF-8";
    if (!isCharsetUtf8 && line && line[sel.end.col] && isDBCSLead(line[sel.end.col].ch)) {
      endCol = sel.end.col + 2;
    }
    return {
      start: { row: sel.start.row, col: sel.start.col },
      end: { row: sel.end.row, col: endCol }
    };
  };

  getSelectedText = () => {
    const sel = this.getNormalizedSelection();
    if (!sel) return "";
    const { start, end } = sel;
    const cols = this.getCols();
    const isCharsetUtf8 = this.props.charset === "UTF-8";
    const result = [];

    for (let r = start.row; r <= end.row; ++r) {
      const line = this.props.lines && this.props.lines[r];
      if (!line) continue;
      let sc = r === start.row ? start.col : 0;
      let ec = r === end.row ? end.col + 1 : cols;
      if (!isCharsetUtf8) {
        if (sc > 0 && line[sc - 1] && isDBCSLead(line[sc - 1].ch)) {
          sc--;
        }
        if (ec < line.length && line[ec - 1] && isDBCSLead(line[ec - 1].ch)) {
          ec++;
        }
      }
      let rowText = "";
      for (let c = sc; c < ec && c < line.length; ++c) {
        const ch = line[c];
        if (!ch) continue;
        if (!isCharsetUtf8 && isDBCSLead(ch.ch) && c + 1 < line.length && line[c + 1]) {
          const u = b2u(ch.ch + line[c + 1].ch);
          rowText += u && u.length === 1 && !isBadDBCS(u) ? u : ch.ch + line[c + 1].ch;
          c++;
        } else {
          rowText += ch.ch;
        }
      }
      result.push(rowText.replace(/\s+$/, ""));
    }
    return result.join("\r");
  };

  selectAll = () => {
    if (!this.props.useCanvas) return;
    const cols = this.getCols();
    const rows = this.getRows();
    this.setState(
      {
        selStart: { col: 0, row: 0 },
        selEnd: { col: cols - 1, row: rows - 1 }
      },
      () => {
        this.draw();
        if (typeof this.props.setInputAreaFocus === "function") {
          this.props.setInputAreaFocus();
        }
      }
    );
  };

  handleMouseDown = e => {
    if (!this.props.useCanvas) return;
    if (e.button !== 0) return;
    if (typeof this.props.setInputAreaFocus === "function") {
      this.props.setInputAreaFocus();
    }
    if (e.target && e.target.tagName !== "A") {
      e.preventDefault();
    }
    const pos = this.getGridPos(e);

    if (e.detail === 2) {
      const line = this.props.lines && this.props.lines[pos.row];
      const cols = this.getCols();
      if (line) {
        let sc = pos.col;
        let ec = pos.col;
        while (sc > 0 && line[sc - 1] && line[sc - 1].ch !== " " && line[sc - 1].ch !== "\x00") {
          sc--;
        }
        while (ec < cols - 1 && line[ec + 1] && line[ec + 1].ch !== " " && line[ec + 1].ch !== "\x00") {
          ec++;
        }
        this.setState(
          {
            selStart: { col: sc, row: pos.row },
            selEnd: { col: ec, row: pos.row }
          },
          () => {
            this.draw();
            if (typeof this.props.setInputAreaFocus === "function") {
              this.props.setInputAreaFocus();
            }
          }
        );
        return;
      }
    } else if (e.detail === 3) {
      const cols = this.getCols();
      this.setState(
        {
          selStart: { col: 0, row: pos.row },
          selEnd: { col: cols - 1, row: pos.row }
        },
        () => {
          this.draw();
          if (typeof this.props.setInputAreaFocus === "function") {
            this.props.setInputAreaFocus();
          }
        }
      );
      return;
    }

    this.isMouseDown = true;
    this.dragStarted = false;
    this.startPos = pos;
    this.setState({ selStart: pos, selEnd: pos });
  };

  handleGlobalMouseMove = e => {
    if (this.isMouseDown) {
      const pos = this.getGridPos(e);
      if (!this.dragStarted && (pos.col !== this.startPos.col || pos.row !== this.startPos.row)) {
        this.dragStarted = true;
      }
      if (this.dragStarted) {
        this.setState({ selEnd: pos }, () => {
          this.draw();
        });
      }
    }
  };

  handleGlobalMouseUp = e => {
    if (e.button !== 0 || !this.isMouseDown) return;
    this.isMouseDown = false;
    if (typeof this.props.setInputAreaFocus === "function") {
      this.props.setInputAreaFocus();
    }
    if (!this.dragStarted) {
      this.setState({ selStart: null, selEnd: null }, () => {
        this.draw();
      });
    } else {
      this.draw();
      if (this.props.copyOnSelect && typeof this.props.doCopy === "function") {
        const text = this.getSelectedText();
        if (text) {
          this.props.doCopy(text);
        }
      }
    }
  };

  componentWillReceiveProps(nextProps) {
    if (this.props.lines !== nextProps.lines) {
      this.setState({ currentImagePreview: undefined });
    }
  }

  handleMouseMove = ({ clientX, clientY }) => {
    if (this.state.currentImagePreview) {
      this.setState({
        left: clientX,
        top: clientY
      });
    }
  };

  handleHyperLinkMouseOver = ({ currentTarget: { href } }) => {
    if (this.props.enableLinkHoverPreview) {
      this.setState({
        currentImagePreview: of(href)
          .then(resolveSrcToImageUrl)
          .then(resolveWithImageDOM)
      });
    }
  };

  handleHyperLinkMouseOut = () => {
    this.setState({ currentImagePreview: undefined });
  };

  renderLinkOverlays() {
    const { lines } = this.props;
    if (!lines) return null;
    const cols = this.getCols();
    const chw = this.getChw();
    const chh = this.getChh();
    const links = [];

    for (let r = 0; r < lines.length; ++r) {
      const line = lines[r];
      if (!line) continue;
      let c = 0;
      while (c < cols) {
        const ch = line[c];
        if (ch && typeof ch.isStartOfURL === "function" && ch.isStartOfURL()) {
          const startCol = c;
          const href = typeof ch.getFullURL === "function" ? ch.getFullURL() : "";
          while (c < cols && line[c] && typeof line[c].isPartOfURL === "function" && line[c].isPartOfURL()) {
            c++;
          }
          const endCol = c;
          links.push(
            <a
              key={`link-${r}-${startCol}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              data-srow={r}
              data-scol={startCol}
              draggable="false"
              onDragStart={e => e.preventDefault()}
              onMouseOver={this.handleHyperLinkMouseOver}
              onMouseOut={this.handleHyperLinkMouseOut}
              style={{
                position: "absolute",
                left: `${startCol * chw}px`,
                top: `${r * chh}px`,
                width: `${(endCol - startCol) * chw}px`,
                height: `${chh}px`,
                display: "block",
                cursor: "pointer",
                zIndex: 2,
                opacity: 0
              }}
            />
          );
        } else {
          c++;
        }
      }
    }
    return links;
  }

  draw() {
    const t0 =
      this.props.fpsMeter &&
      this.props.fpsMeter.enabled &&
      typeof performance !== "undefined"
        ? performance.now()
        : 0;
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cols = this.getCols();
    const rows = this.getRows();
    const chw = this.getChw();
    const chh = this.getChh();
    const width = cols * chw;
    const height = rows * chh;

    const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    const targetWidth = Math.round(width * dpr);
    const targetHeight = Math.round(height * dpr);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const isBlinkActive =
      typeof document !== "undefined" &&
      document.body.classList.contains("blink--active");

    const currentHl =
      this.state.currentHighlighted !== undefined
        ? this.state.currentHighlighted
        : this.props.nowHighlight !== undefined
        ? this.props.nowHighlight
        : -1;
    const hlColor =
      termColors[
        this.props.highlightBG !== undefined ? this.props.highlightBG : 2
      ] || "#008000";

    const fontFace = this.props.fontFace || "MingLiu, monospace";
    ctx.font = `${chh}px ${fontFace}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const lines = this.props.lines;
    const bgRuns = [];
    const textItems = [];
    const underlineItems = [];

    if (lines) {
      const isCharsetUtf8 = this.props.charset === "UTF-8";

      for (let r = 0; r < rows && r < lines.length; ++r) {
        const line = lines[r];
        if (!line) continue;
        const isLineHighlighted = r === currentHl;
        const y = r * chh;

        let runBg = null;
        let runStartCol = 0;
        let runLength = 0;

        for (let c = 0; c < cols; ++c) {
          const ch = line[c];
          let bg = ch ? termColors[ch.getBg()] : termColors[0];
          if (isLineHighlighted && ch && ch.getBg() === 0) {
            bg = hlColor;
          }

          if (bg === runBg) {
            runLength++;
          } else {
            if (runBg !== null) {
              bgRuns.push({
                bg: runBg,
                x: runStartCol * chw,
                y,
                w: runLength * chw,
                h: chh
              });
            }
            runBg = bg;
            runStartCol = c;
            runLength = 1;
          }
        }

        if (runBg !== null) {
          bgRuns.push({
            bg: runBg,
            x: runStartCol * chw,
            y,
            w: runLength * chw,
            h: chh
          });
        }

        for (let c = 0; c < cols; ++c) {
          const ch = line[c];
          if (!ch) continue;

          if (!isCharsetUtf8 && isDBCSLead(ch.ch) && c + 1 < cols && line[c + 1]) {
            const trailCh = line[c + 1];
            const u = b2u(ch.ch + trailCh.ch);
            if (u && u.length === 1 && !isBadDBCS(u)) {
              const isLeadBlink = ch.blink && !isBlinkActive;
              const isTrailBlink = trailCh.blink && !isBlinkActive;
              if (!isLeadBlink || !isTrailBlink) {
                const leadFg =
                  typeof ch.isPartOfURL === "function" && ch.isPartOfURL()
                    ? "#ff00ff"
                    : termColors[ch.getFg()];
                const trailFg =
                  typeof trailCh.isPartOfURL === "function" && trailCh.isPartOfURL()
                    ? "#ff00ff"
                    : termColors[trailCh.getFg()];

                if (leadFg === trailFg && !isLeadBlink && !isTrailBlink) {
                  textItems.push({
                    text: u,
                    x: c * chw + chw,
                    y: y + chh / 2,
                    fg: leadFg,
                    isDBCS: true
                  });
                } else {
                  if (!isLeadBlink) {
                    textItems.push({
                      text: u,
                      x: c * chw + chw,
                      y: y + chh / 2,
                      fg: leadFg,
                      isDBCS: true,
                      clip: { x: c * chw, y, w: chw, h: chh }
                    });
                  }
                  if (!isTrailBlink) {
                    textItems.push({
                      text: u,
                      x: c * chw + chw,
                      y: y + chh / 2,
                      fg: trailFg,
                      isDBCS: true,
                      clip: { x: (c + 1) * chw, y, w: chw, h: chh }
                    });
                  }
                }

                if (ch.underLine) {
                  underlineItems.push({
                    fg: leadFg,
                    x: c * chw,
                    y: y + chh - 2,
                    w: chw,
                    h: 1
                  });
                }
                if (trailCh.underLine) {
                  underlineItems.push({
                    fg: trailFg,
                    x: (c + 1) * chw,
                    y: y + chh - 2,
                    w: chw,
                    h: 1
                  });
                }
              }
              c++;
              continue;
            }
          }

          if (isCharsetUtf8 && c + 1 < cols && line[c + 1] && line[c + 1].ch === "" && ch.ch && ch.ch !== "") {
            const trailCh = line[c + 1];
            const isBlink = (ch.blink || trailCh.blink) && !isBlinkActive;
            if (!isBlink) {
              const fg =
                typeof ch.isPartOfURL === "function" && ch.isPartOfURL()
                  ? "#ff00ff"
                  : termColors[ch.getFg()];
              textItems.push({
                text: ch.ch,
                x: c * chw + chw,
                y: y + chh / 2,
                fg,
                isDBCS: true
              });
              if (ch.underLine || trailCh.underLine) {
                underlineItems.push({
                  fg,
                  x: c * chw,
                  y: y + chh - 2,
                  w: chw * 2,
                  h: 1
                });
              }
            }
            c++;
            continue;
          }

          if (ch.blink && !isBlinkActive) continue;
          const charStr = ch.ch;
          let fg = termColors[ch.getFg()];
          if (typeof ch.isPartOfURL === "function" && ch.isPartOfURL()) {
            fg = "#ff00ff";
          }
          if (charStr && charStr !== " " && charStr !== "\x00") {
            textItems.push({
              text: charStr,
              x: c * chw + chw / 2,
              y: y + chh / 2,
              fg,
              isDBCS: false
            });
          }

          if (ch.underLine) {
            underlineItems.push({
              fg,
              x: c * chw,
              y: y + chh - 2,
              w: chw,
              h: 1
            });
          }
        }
      }
    }

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    bgRuns.sort((a, b) => (a.bg < b.bg ? -1 : a.bg > b.bg ? 1 : 0));
    let lastBg = null;
    for (let i = 0; i < bgRuns.length; ++i) {
      const run = bgRuns[i];
      if (run.bg === "#000000") continue;
      if (run.bg !== lastBg) {
        ctx.fillStyle = run.bg;
        lastBg = run.bg;
      }
      ctx.fillRect(run.x, run.y, run.w, run.h);
    }

    textItems.sort((a, b) => (a.fg < b.fg ? -1 : a.fg > b.fg ? 1 : 0));
    let lastFg = null;
    for (let i = 0; i < textItems.length; ++i) {
      const item = textItems[i];
      if (item.fg !== lastFg) {
        ctx.fillStyle = item.fg;
        lastFg = item.fg;
      }
      if (item.clip) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(item.clip.x, item.clip.y, item.clip.w, item.clip.h);
        ctx.clip();
      }
      if (item.isDBCS) {
        const textWidth = ctx.measureText(item.text).width;
        const targetWidth = chw * 2;
        if (textWidth > 0 && Math.abs(textWidth - targetWidth) > 0.5) {
          ctx.save();
          ctx.translate(item.x, item.y);
          ctx.scale(targetWidth / textWidth, 1);
          ctx.fillText(item.text, 0, 0);
          ctx.restore();
        } else {
          ctx.fillText(item.text, item.x, item.y);
        }
      } else {
        const textWidth = ctx.measureText(item.text).width;
        if (textWidth > 0 && Math.abs(textWidth - chw) > 0.5) {
          ctx.save();
          ctx.translate(item.x, item.y);
          ctx.scale(chw / textWidth, 1);
          ctx.fillText(item.text, 0, 0);
          ctx.restore();
        } else {
          ctx.fillText(item.text, item.x, item.y);
        }
      }
      if (item.clip) {
        ctx.restore();
      }
    }

    for (let i = 0; i < underlineItems.length; ++i) {
      const u = underlineItems[i];
      if (u.fg !== lastFg) {
        ctx.fillStyle = u.fg;
        lastFg = u.fg;
      }
      ctx.fillRect(u.x, u.y, u.w, u.h);
    }

    const sel = this.getNormalizedSelection();
    if (sel) {
      const { start, end } = sel;
      ctx.save();
      ctx.fillStyle = "rgba(100, 150, 255, 0.4)";
      for (let row = start.row; row <= end.row; ++row) {
        const sc = row === start.row ? start.col : 0;
        const ec = row === end.row ? end.col : cols - 1;
        if (sc <= ec) {
          ctx.fillRect(sc * chw, row * chh, (ec - sc + 1) * chw, chh);
        }
      }
      ctx.restore();
    }

    if (t0 > 0 && this.props.fpsMeter) {
      this.props.fpsMeter.recordFrame(performance.now() - t0, true);
    }
  }

  render() {
    if (!this.props.useCanvas) {
      return (
        <div id="mainContainer" onMouseMove={this.handleMouseMove}>
          {this.props.lines.map((chars, row) => (
            <Row
              key={row}
              chars={chars}
              row={row}
              forceWidth={this.props.forceWidth}
              enableLinkInlinePreview={this.props.enableLinkInlinePreview}
              highlighted={this.state.currentHighlighted === row}
              onHyperLinkMouseOver={this.handleHyperLinkMouseOver}
              onHyperLinkMouseOut={this.handleHyperLinkMouseOut}
            />
          ))}
          {this.state.currentImagePreview && (
            <ImagePreviewer
              request={this.state.currentImagePreview}
              component={ImagePreviewer.OnHover}
              left={this.state.left}
              top={this.state.top}
            />
          )}
        </div>
      );
    }

    const cols = this.getCols();
    const rows = this.getRows();
    const chw = this.getChw();
    const chh = this.getChh();
    const width = cols * chw;
    const height = rows * chh;

    return (
      <div
        id="mainContainer"
        onMouseMove={this.handleMouseMove}
        onMouseDown={this.handleMouseDown}
        style={{
          position: "relative",
          width: `${width}px`,
          height: `${height}px`,
          userSelect: "none",
          WebkitUserSelect: "none"
        }}
      >
        <canvas
          ref={this.canvasRef}
          style={{
            display: "block",
            width: `${width}px`,
            height: `${height}px`
          }}
        />
        {this.renderLinkOverlays()}
        {this.state.currentImagePreview && (
          <ImagePreviewer
            request={this.state.currentImagePreview}
            component={ImagePreviewer.OnHover}
            left={this.state.left}
            top={this.state.top}
          />
        )}
      </div>
    );
  }
}

export default Screen;
