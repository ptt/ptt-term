import React from "react";
import ImagePreviewer, {
  initialImagePreviewState,
  resetImagePreviewState,
  updateImagePreviewMove,
  createImagePreviewRequest,
} from "../ImagePreviewer";
import CanvasRenderer from "./CanvasRenderer";
import CanvasSelection from "./CanvasSelection";

export class CanvasScreen extends React.Component {
  constructor(props) {
    super(props);
    this.canvasRef = React.createRef();
    this.renderer = new CanvasRenderer();
    this.isMouseDown = false;
    this.dragStarted = false;
    this.startPos = { col: 0, row: 0 };
  }

  state = {
    currentHighlighted: undefined,
    ...initialImagePreviewState,
    selStart: null,
    selEnd: null,
  };

  componentDidMount() {
    this.draw();
    if (typeof window !== "undefined") {
      window.addEventListener("mouseup", this.handleGlobalMouseUp);
      window.addEventListener("mousemove", this.handleGlobalMouseMove);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("term-blink", this.handleBlink);
    }
    if (
      typeof document !== "undefined" &&
      document.fonts &&
      document.fonts.ready
    ) {
      (async () => {
        await document.fonts.ready;
        this.renderer.clearFontCache();
        this.draw();
      })();
    }
  }

  componentWillUnmount() {
    if (typeof window !== "undefined") {
      window.removeEventListener("mouseup", this.handleGlobalMouseUp);
      window.removeEventListener("mousemove", this.handleGlobalMouseMove);
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("term-blink", this.handleBlink);
    }
  }

  componentDidUpdate(prevProps, prevState) {
    if (
      this.props.lines !== prevProps.lines &&
      this.state.currentImagePreview
    ) {
      this.setState(resetImagePreviewState());
    }

    const layoutOrStyleChanged =
      this.props.nowHighlight !== prevProps.nowHighlight ||
      this.props.highlightBG !== prevProps.highlightBG ||
      this.props.smoothAnsiArt !== prevProps.smoothAnsiArt ||
      this.props.fontFace !== prevProps.fontFace ||
      this.props.chw !== prevProps.chw ||
      this.props.chh !== prevProps.chh ||
      this.props.cols !== prevProps.cols ||
      this.props.rows !== prevProps.rows ||
      this.props.charset !== prevProps.charset ||
      (prevState &&
        this.state.currentHighlighted !== prevState.currentHighlighted);

    if (layoutOrStyleChanged) {
      this.renderer.markDirty(null);
    } else if (
      this.props.lines !== prevProps.lines ||
      this.props.changedRows !== prevProps.changedRows
    ) {
      if (Array.isArray(this.props.changedRows)) {
        this.renderer.markDirty(this.props.changedRows);
      } else {
        this.renderer.markDirty(null);
      }
    }

    this.draw();
  }

  handleBlink = () => {
    if (this.renderer.hasBlink) {
      this.renderer.markDirty(null);
      this.draw();
    }
  };

  onBlink = () => {
    this.handleBlink();
  };

  setCurrentHighlighted = (currentHighlighted) => {
    this.setState({ currentHighlighted });
  };

  getCols() {
    return (
      this.props.cols ||
      (this.props.lines && this.props.lines[0]
        ? this.props.lines[0].length
        : 80)
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

  getGridPos = (e) => {
    return CanvasSelection.getGridPos(
      e,
      this.canvasRef.current,
      this.getCols(),
      this.getRows()
    );
  };

  getNormalizedSelection() {
    return CanvasSelection.getNormalizedSelection(
      this.state.selStart,
      this.state.selEnd
    );
  }

  getSelectionColRow = () => {
    return CanvasSelection.getSelectionColRow(
      this.state.selStart,
      this.state.selEnd,
      this.props.lines,
      this.props.charset
    );
  };

  getSelectedText = () => {
    return CanvasSelection.getSelectedText(
      this.state.selStart,
      this.state.selEnd,
      this.props.lines,
      this.getCols(),
      this.props.charset
    );
  };

  selectAll = () => {
    const cols = this.getCols();
    const rows = this.getRows();
    this.setState(
      {
        selStart: { col: 0, row: 0 },
        selEnd: { col: cols - 1, row: rows - 1 },
      },
      () => {
        this.props.setInputAreaFocus();
      }
    );
  };

  handleMouseDown = (e) => {
    if (e.button !== 0) return;
    this.props.setInputAreaFocus();
    if (e.target && e.target.tagName !== "A") {
      e.preventDefault();
    }
    const pos = this.getGridPos(e);

    if (e.detail === 2) {
      const line = this.props.lines && this.props.lines[pos.row];
      const cols = this.getCols();
      this.setState(CanvasSelection.getWordSelection(pos, line, cols), () => {
        this.props.setInputAreaFocus();
      });
      return;
    } else if (e.detail === 3) {
      const cols = this.getCols();
      this.setState(CanvasSelection.getLineSelection(pos, cols), () => {
        this.props.setInputAreaFocus();
      });
      return;
    }

    this.isMouseDown = true;
    this.dragStarted = false;
    this.startPos = pos;
    this.setState({ selStart: pos, selEnd: pos });
  };

  handleGlobalMouseMove = (e) => {
    if (this.isMouseDown) {
      const pos = this.getGridPos(e);
      if (
        !this.dragStarted &&
        (pos.col !== this.startPos.col || pos.row !== this.startPos.row)
      ) {
        this.dragStarted = true;
      }
      if (this.dragStarted) {
        const selEnd = this.state.selEnd;
        if (!selEnd || selEnd.col !== pos.col || selEnd.row !== pos.row) {
          this.setState({ selEnd: pos });
        }
      }
    }
  };

  handleGlobalMouseUp = (e) => {
    if (e.button !== 0 || !this.isMouseDown) return;
    this.isMouseDown = false;
    this.props.setInputAreaFocus();
    if (!this.dragStarted) {
      this.setState({ selStart: null, selEnd: null });
    } else {
      if (this.props.copyOnSelect) {
        const text = this.getSelectedText();
        if (text) {
          this.props.doCopy(text);
        }
      }
    }
  };

  handleMouseMove = ({ clientX, clientY }) => {
    const nextPos = updateImagePreviewMove(this.state, clientX, clientY);
    if (nextPos) {
      this.setState(nextPos);
    }
  };

  handleHyperLinkMouseOver = (e) => {
    if (this.props.enableLinkHoverPreview && e && e.currentTarget) {
      const href = e.currentTarget.href;
      if (href) {
        const whitelistOnly = this.props.picPreviewWhitelistOnly !== false;
        const request = createImagePreviewRequest(href, whitelistOnly);
        if (request) {
          this.setState({
            currentImagePreview: request,
            left: e.clientX,
            top: e.clientY,
          });
        }
      }
    }
  };

  handleHyperLinkMouseOut = () => {
    this.setState(resetImagePreviewState());
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
        if (ch && ch.isStartOfURL()) {
          const startCol = c;
          const href = ch.getFullURL();
          while (c < cols && line[c] && line[c].isPartOfURL()) {
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
              onDragStart={(e) => e.preventDefault()}
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
                opacity: 0,
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
    const canvas = this.canvasRef.current;
    if (!canvas) return;

    this.renderer.draw(canvas, {
      cols: this.getCols(),
      rows: this.getRows(),
      chw: this.getChw(),
      chh: this.getChh(),
      lines: this.props.lines,
      charset: this.props.charset,
      currentHighlighted: this.state.currentHighlighted,
      nowHighlight: this.props.nowHighlight,
      highlightBG: this.props.highlightBG,
      smoothAnsiArt: this.props.smoothAnsiArt,
      fontFace: this.props.fontFace,
      fpsMeter: this.props.fpsMeter,
      selStart: this.state.selStart,
      selEnd: this.state.selEnd,
    });
  }

  render() {
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
          WebkitUserSelect: "none",
        }}
      >
        <canvas
          ref={this.canvasRef}
          style={{
            display: "block",
            width: `${width}px`,
            height: `${height}px`,
          }}
        />
        {this.renderLinkOverlays()}
        <ImagePreviewer.HoverPreview
          request={this.state.currentImagePreview}
          left={this.state.left}
          top={this.state.top}
        />
      </div>
    );
  }
}

export default CanvasScreen;
