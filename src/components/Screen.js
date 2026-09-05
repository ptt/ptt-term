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

const LOWER_BLOCK_MAP = {
  "\uff3f": 0.03, // ＿ fullwidth low line
  "\u02cd": 0.07, // ˍ modifier letter low line
  "\u2581": 1 / 8, // ▁ lower 1/8
  "\u2582": 2 / 8, // ▂ lower 1/4
  "\u2583": 3 / 8, // ▃ lower 3/8
  "\u2584": 4 / 8, // ▄ lower 1/2
  "\u2585": 5 / 8, // ▅ lower 5/8
  "\u2586": 6 / 8, // ▆ lower 3/4
  "\u2587": 7 / 8, // ▇ lower 7/8
  "\u2588": 1.0    // █ full block
};

const UPPER_BLOCK_MAP = {
  "\u2594": 1 / 8, // ▔ upper 1/8
  "\u2580": 4 / 8, // ▀ upper 1/2
  "\u2588": 1.0    // █ full block
};

const LEFT_BLOCK_MAP = {
  "\u258f": 1 / 8, // ▏ left 1/8
  "\u258e": 2 / 8, // ▎ left 1/4
  "\u258d": 3 / 8, // ▍ left 3/8
  "\u258c": 4 / 8, // ▌ left 1/2
  "\u258b": 5 / 8, // ▋ left 5/8
  "\u258a": 6 / 8, // ▊ left 3/4
  "\u2589": 7 / 8, // ▉ left 7/8
  "\u2588": 1.0    // █ full block
};

const ANSI_BLOCK_SET = new Set([
  "\u2588", // █ full block
  "\u2584", // ▄ lower half block
  "\u2580", // ▀ upper half block
  "\u258c", // ▌ left half block
  "\u2590", // ▐ right half block
  "\u25e2", // ◢ lower right triangle
  "\u25e3", // ◣ lower left triangle
  "\u25e5", // ◥ upper right triangle
  "\u25e4", // ◤ upper left triangle
  "\u25b2", // ▲ up triangle
  "\u25bc", // ▼ down triangle
  // Lower fractional blocks & low lines
  "\uff3f", // ＿ fullwidth low line
  "\u02cd", // ˍ modifier letter low line
  "\u2581", // ▁ lower 1/8
  "\u2582", // ▂ lower 1/4
  "\u2583", // ▃ lower 3/8
  "\u2585", // ▅ lower 5/8
  "\u2586", // ▆ lower 3/4
  "\u2587", // ▇ lower 7/8
  // Left fractional blocks
  "\u258f", // ▏ left 1/8
  "\u258e", // ▎ left 1/4
  "\u258d", // ▍ left 3/8
  "\u258b", // ▋ left 5/8
  "\u258a", // ▊ left 3/4
  "\u2589", // ▉ left 7/8
  // Upper / right fractional blocks
  "\u2594", // ▔ upper 1/8
  "\u2595"  // ▕ right 1/8
]);

export class Screen extends React.Component {
  constructor(props) {
    super(props);
    this.canvasRef = React.createRef();
    this.isMouseDown = false;
    this.dragStarted = false;
    this.startPos = { col: 0, row: 0 };
    this.textBuckets = Array.from({ length: 17 }, () => []);
    this.ansiBlockBuckets = Array.from({ length: 17 }, () => []);
    this.bgBuckets = Array.from({ length: 17 }, () => []);
    this.underlineBuckets = Array.from({ length: 17 }, () => []);
    this.textPool = [];
    this.textPoolIndex = 0;
    this.blockPool = [];
    this.blockPoolIndex = 0;
    this.blockGrid = null;
    this.metricsCache = new Map();
    this.lastFontKey = "";
    this.lastAppliedFont = "";
    this.hasBlink = false;
    this.bufferCanvas =
      typeof document !== "undefined" ? document.createElement("canvas") : null;
    this.contentDirty = true;
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
      if (typeof document !== "undefined") {
        document.addEventListener("pttchrome-blink", this.handleBlink);
      }
      if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          this.metricsCache.clear();
          this.lastAppliedFont = "";
          this.contentDirty = true;
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
    if (typeof document !== "undefined") {
      document.removeEventListener("pttchrome-blink", this.handleBlink);
    }
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.props.lines !== prevProps.lines && this.state.currentImagePreview) {
      this.setState({
        currentImagePreview: undefined,
        left: undefined,
        top: undefined
      });
    }

    if (
      this.props.lines !== prevProps.lines ||
      this.props.nowHighlight !== prevProps.nowHighlight ||
      this.props.highlightBG !== prevProps.highlightBG ||
      this.props.smoothAnsi !== prevProps.smoothAnsi ||
      this.props.fontFace !== prevProps.fontFace ||
      this.props.chw !== prevProps.chw ||
      this.props.chh !== prevProps.chh ||
      this.props.cols !== prevProps.cols ||
      this.props.rows !== prevProps.rows ||
      this.props.charset !== prevProps.charset ||
      (prevState && this.state.currentHighlighted !== prevState.currentHighlighted)
    ) {
      this.contentDirty = true;
    }

    if (this.props.useCanvas) {
      if (!prevProps.useCanvas) {
        if (typeof window !== "undefined") {
          window.addEventListener("mouseup", this.handleGlobalMouseUp);
          window.addEventListener("mousemove", this.handleGlobalMouseMove);
        }
        if (typeof document !== "undefined") {
          document.addEventListener("pttchrome-blink", this.handleBlink);
        }
      }
      this.draw();
    } else if (prevProps.useCanvas) {
      if (typeof window !== "undefined") {
        window.removeEventListener("mouseup", this.handleGlobalMouseUp);
        window.removeEventListener("mousemove", this.handleGlobalMouseMove);
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("pttchrome-blink", this.handleBlink);
      }
    }
  }

  handleBlink = () => {
    if (this.props.useCanvas && this.hasBlink) {
      this.contentDirty = true;
      this.draw();
    }
  };

  onBlink = () => {
    this.handleBlink();
  };

  setCurrentHighlighted = currentHighlighted => {
    this.setState({ currentHighlighted });
  };

  getTextItem(text, x, y, isDBCS, clip = null) {
    let item = this.textPool[this.textPoolIndex];
    if (!item) {
      item = { text, x, y, isDBCS, clip };
      this.textPool[this.textPoolIndex] = item;
    } else {
      item.text = text;
      item.x = x;
      item.y = y;
      item.isDBCS = isDBCS;
      item.clip = clip;
    }
    this.textPoolIndex++;
    return item;
  }

  getBlockItem(type, r, c, x, y, w, h, fgIndex) {
    let item = this.blockPool[this.blockPoolIndex];
    if (!item) {
      item = { type, r, c, x, y, w, h, fgIndex };
      this.blockPool[this.blockPoolIndex] = item;
    } else {
      item.type = type;
      item.r = r;
      item.c = c;
      item.x = x;
      item.y = y;
      item.w = w;
      item.h = h;
      item.fgIndex = fgIndex;
    }
    this.blockPoolIndex++;
    return item;
  }

  getCharMetrics(ctx, text, isDBCS, chw) {
    const key = isDBCS ? text + "\x01" : text;
    let scale = this.metricsCache.get(key);
    if (scale !== undefined) return scale;

    if (this.metricsCache.size > 20000) {
      this.metricsCache.clear();
    }
    const textWidth = ctx.measureText(text).width;
    const targetWidth = isDBCS ? chw * 2 : chw;
    scale =
      textWidth > 0 && Math.abs(textWidth - targetWidth) > 0.5
        ? targetWidth / textWidth
        : 1;
    this.metricsCache.set(key, scale);
    return scale;
  }

  drawSmoothAnsiBlock(ctx, item, grid, cols, rows, chw, chh) {
    const { type, x, y, w, h } = item;

    if (type === "\u2588") {
      if (this.drawLowerBlockRamp(ctx, item, grid, cols, rows, chw, chh)) {
        return;
      }
      if (this.drawUpperBlockRamp(ctx, item, grid, cols, rows, chw, chh)) {
        return;
      }
      if (this.drawLeftBlockRamp(ctx, item, grid, cols, rows, chw, chh)) {
        return;
      }
      ctx.fillRect(x, y, w, h);
      return;
    }

    if (LOWER_BLOCK_MAP[type] !== undefined) {
      this.drawLowerBlockRamp(ctx, item, grid, cols, rows, chw, chh);
      return;
    }

    if (UPPER_BLOCK_MAP[type] !== undefined) {
      this.drawUpperBlockRamp(ctx, item, grid, cols, rows, chw, chh);
      return;
    }

    if (LEFT_BLOCK_MAP[type] !== undefined) {
      this.drawLeftBlockRamp(ctx, item, grid, cols, rows, chw, chh);
      return;
    }

    switch (type) {
      case "\u2590": // ▐ right half block
        ctx.fillRect(x + w / 2, y, w / 2, h);
        break;

      case "\u2595": // ▕ right 1/8 block
        ctx.fillRect(x + (w * 7) / 8, y, w / 8, h);
        break;

      case "\u25e2": // ◢ lower right triangle
        this.drawTriangleLowerRight(ctx, item);
        break;

      case "\u25e3": // ◣ lower left triangle
        this.drawTriangleLowerLeft(ctx, item);
        break;

      case "\u25e5": // ◥ upper right triangle
        this.drawTriangleUpperRight(ctx, item);
        break;

      case "\u25e4": // ◤ upper left triangle
        this.drawTriangleUpperLeft(ctx, item);
        break;

      case "\u25b2": // ▲ up triangle
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.fill();
        break;

      case "\u25bc": // ▼ down triangle
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w / 2, y + h);
        ctx.closePath();
        ctx.fill();
        break;

      default:
        ctx.fillRect(x, y, w, h);
        break;
    }
  }

  drawLowerBlockRamp(ctx, item, grid, cols, rows, chw, chh) {
    const { x, y, w, h, r, c, fgIndex, type } = item;
    const curH = LOWER_BLOCK_MAP[type];
    if (curH === undefined) return false;

    const leftCol = c - 1;
    const leftCell = leftCol >= 0 ? grid[r * cols + leftCol] : null;
    const isSameLeft =
      leftCell &&
      leftCell.fgIndex === fgIndex &&
      LOWER_BLOCK_MAP[leftCell.type] !== undefined;

    const stepCol = w > chw ? 2 : 1;
    const rightCol = c + stepCol;
    const rightCell = rightCol < cols ? grid[r * cols + rightCol] : null;
    const isSameRight =
      rightCell &&
      rightCell.fgIndex === fgIndex &&
      LOWER_BLOCK_MAP[rightCell.type] !== undefined;

    const leftH = isSameLeft ? LOWER_BLOCK_MAP[leftCell.type] : null;
    const rightH = isSameRight ? LOWER_BLOCK_MAP[rightCell.type] : null;

    if (type === "\u2588") {
      const touchesLowerRamp =
        (leftH !== null && leftH < 1.0) || (rightH !== null && rightH < 1.0);
      if (!touchesLowerRamp) return false;
    }

    const leftW = isSameLeft ? leftCell.w : w;
    const rightW = isSameRight ? rightCell.w : w;

    let hL, hR;
    if (leftH !== null && rightH !== null) {
      hL = (leftH * w + curH * leftW) / (leftW + w);
      hR = (curH * rightW + rightH * w) / (w + rightW);
    } else if (leftH !== null) {
      hL = (leftH * w + curH * leftW) / (leftW + w);
      const delta = (curH - leftH) * (w / (leftW + w));
      hR = Math.min(1.0, Math.max(0.0, curH + delta));
      if (curH >= 0.95 && curH >= leftH) hR = 1.0;
      if (curH <= 0.05 && curH <= leftH) hR = 0.0;
    } else if (rightH !== null) {
      const delta = (rightH - curH) * (w / (w + rightW));
      hL = Math.min(1.0, Math.max(0.0, curH - delta));
      if (curH <= 0.05 && curH <= rightH) hL = 0.0;
      if (curH >= 0.95 && curH >= rightH) hL = 1.0;
      hR = (curH * rightW + rightH * w) / (w + rightW);
    } else {
      hL = curH;
      hR = curH;
    }

    const xR = isSameRight ? x + w + 0.5 : x + w;

    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(xR, y + h);
    ctx.lineTo(xR, y + h - hR * h);

    const isPeak =
      leftH !== null && rightH !== null && curH > leftH && curH > rightH;
    const isValley =
      leftH !== null && rightH !== null && curH < leftH && curH < rightH;

    if (isPeak || isValley) {
      ctx.lineTo(x + w / 2, y + h - curH * h);
    }

    ctx.lineTo(x, y + h - hL * h);
    ctx.closePath();
    ctx.fill();
    return true;
  }

  drawUpperBlockRamp(ctx, item, grid, cols, rows, chw, chh) {
    const { x, y, w, h, r, c, fgIndex, type } = item;
    const curH = UPPER_BLOCK_MAP[type];
    if (curH === undefined) return false;

    const leftCol = c - 1;
    const leftCell = leftCol >= 0 ? grid[r * cols + leftCol] : null;
    const isSameLeft =
      leftCell &&
      leftCell.fgIndex === fgIndex &&
      UPPER_BLOCK_MAP[leftCell.type] !== undefined;

    const stepCol = w > chw ? 2 : 1;
    const rightCol = c + stepCol;
    const rightCell = rightCol < cols ? grid[r * cols + rightCol] : null;
    const isSameRight =
      rightCell &&
      rightCell.fgIndex === fgIndex &&
      UPPER_BLOCK_MAP[rightCell.type] !== undefined;

    const leftH = isSameLeft ? UPPER_BLOCK_MAP[leftCell.type] : null;
    const rightH = isSameRight ? UPPER_BLOCK_MAP[rightCell.type] : null;

    if (type === "\u2588") {
      const touchesUpperRamp =
        (leftH !== null && leftH < 1.0) || (rightH !== null && rightH < 1.0);
      if (!touchesUpperRamp) return false;
    }

    const leftW = isSameLeft ? leftCell.w : w;
    const rightW = isSameRight ? rightCell.w : w;

    let hL, hR;
    if (leftH !== null && rightH !== null) {
      hL = (leftH * w + curH * leftW) / (leftW + w);
      hR = (curH * rightW + rightH * w) / (w + rightW);
    } else if (leftH !== null) {
      hL = (leftH * w + curH * leftW) / (leftW + w);
      const delta = (curH - leftH) * (w / (leftW + w));
      hR = Math.min(1.0, Math.max(0.0, curH + delta));
      if (curH >= 0.95 && curH >= leftH) hR = 1.0;
    } else if (rightH !== null) {
      const delta = (rightH - curH) * (w / (w + rightW));
      hL = Math.min(1.0, Math.max(0.0, curH - delta));
      if (curH >= 0.95 && curH >= rightH) hL = 1.0;
      hR = (curH * rightW + rightH * w) / (w + rightW);
    } else {
      hL = curH;
      hR = curH;
    }

    const xR = isSameRight ? x + w + 0.5 : x + w;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(xR, y);
    ctx.lineTo(xR, y + hR * h);

    const isPeak =
      leftH !== null && rightH !== null && curH > leftH && curH > rightH;
    const isValley =
      leftH !== null && rightH !== null && curH < leftH && curH < rightH;

    if (isPeak || isValley) {
      ctx.lineTo(x + w / 2, y + curH * h);
    }

    ctx.lineTo(x, y + hL * h);
    ctx.closePath();
    ctx.fill();
    return true;
  }

  drawLeftBlockRamp(ctx, item, grid, cols, rows, chw, chh) {
    const { x, y, w, h, r, c, fgIndex, type } = item;
    const curW = LEFT_BLOCK_MAP[type];
    if (curW === undefined) return false;

    const topCell = r > 0 ? grid[(r - 1) * cols + c] : null;
    const isSameTop =
      topCell &&
      topCell.fgIndex === fgIndex &&
      LEFT_BLOCK_MAP[topCell.type] !== undefined;

    const bottomCell = r + 1 < rows ? grid[(r + 1) * cols + c] : null;
    const isSameBottom =
      bottomCell &&
      bottomCell.fgIndex === fgIndex &&
      LEFT_BLOCK_MAP[bottomCell.type] !== undefined;

    const topW = isSameTop ? LEFT_BLOCK_MAP[topCell.type] : null;
    const bottomW = isSameBottom ? LEFT_BLOCK_MAP[bottomCell.type] : null;

    if (type === "\u2588") {
      const touchesLeftRamp =
        (topW !== null && topW < 1.0) || (bottomW !== null && bottomW < 1.0);
      if (!touchesLeftRamp) return false;
    }

    let wT, wB;
    if (topW !== null && bottomW !== null) {
      wT = (topW + curW) / 2;
      wB = (curW + bottomW) / 2;
    } else if (topW !== null) {
      wT = (topW + curW) / 2;
      const delta = (curW - topW) / 2;
      wB = Math.min(1.0, Math.max(0.0, curW + delta));
      if (curW >= 0.95 && curW >= topW) wB = 1.0;
    } else if (bottomW !== null) {
      const delta = (bottomW - curW) / 2;
      wT = Math.min(1.0, Math.max(0.0, curW - delta));
      if (curW >= 0.95 && curW >= bottomW) wT = 1.0;
      wB = (curW + bottomW) / 2;
    } else {
      wT = curW;
      wB = curW;
    }

    const yB = isSameBottom ? y + h + 0.5 : y + h;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + wT * w, y);

    const isPeak =
      topW !== null && bottomW !== null && curW > topW && curW > bottomW;
    const isValley =
      topW !== null && bottomW !== null && curW < topW && curW < bottomW;

    if (isPeak || isValley) {
      ctx.lineTo(x + curW * w, y + h / 2);
    }

    ctx.lineTo(x + wB * w, yB);
    ctx.lineTo(x, yB);
    ctx.closePath();
    ctx.fill();
    return true;
  }

  drawTriangleLowerRight(ctx, item) {
    const { x, y, w, h } = item;
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();
  }

  drawTriangleLowerLeft(ctx, item) {
    const { x, y, w, h } = item;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();
  }

  drawTriangleUpperRight(ctx, item) {
    const { x, y, w, h } = item;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
  }

  drawTriangleUpperLeft(ctx, item) {
    const { x, y, w, h } = item;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();
  }

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
        const selEnd = this.state.selEnd;
        if (!selEnd || selEnd.col !== pos.col || selEnd.row !== pos.row) {
          this.setState({ selEnd: pos });
        }
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
      this.setState({ selStart: null, selEnd: null });
    } else {
      if (this.props.copyOnSelect && typeof this.props.doCopy === "function") {
        const text = this.getSelectedText();
        if (text) {
          this.props.doCopy(text);
        }
      }
    }
  };

  handleMouseMove = ({ clientX, clientY }) => {
    if (this.state.currentImagePreview) {
      this.setState({
        left: clientX,
        top: clientY
      });
    }
  };

  handleHyperLinkMouseOver = e => {
    if (this.props.enableLinkHoverPreview && e && e.currentTarget) {
      const href = e.currentTarget.href;
      this.setState({
        currentImagePreview: of(href)
          .then(resolveSrcToImageUrl)
          .then(resolveWithImageDOM),
        left: e.clientX,
        top: e.clientY
      });
    }
  };

  handleHyperLinkMouseOut = () => {
    this.setState({
      currentImagePreview: undefined,
      left: undefined,
      top: undefined
    });
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

    const canvasResized =
      canvas.width !== targetWidth || canvas.height !== targetHeight;
    if (canvasResized) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      this.contentDirty = true;
    }

    if (!this.bufferCanvas && typeof document !== "undefined") {
      this.bufferCanvas = document.createElement("canvas");
    }

    let bufferResized = false;
    if (this.bufferCanvas) {
      if (
        this.bufferCanvas.width !== targetWidth ||
        this.bufferCanvas.height !== targetHeight
      ) {
        this.bufferCanvas.width = targetWidth;
        this.bufferCanvas.height = targetHeight;
        this.contentDirty = true;
        bufferResized = true;
      }
    }

    const bctx = this.bufferCanvas ? this.bufferCanvas.getContext("2d") : ctx;

    if (this.contentDirty || !this.bufferCanvas) {
      this.drawContent(
        bctx,
        cols,
        rows,
        chw,
        chh,
        width,
        height,
        dpr,
        bufferResized || canvasResized
      );
      this.contentDirty = false;
    }

    if (this.bufferCanvas) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.bufferCanvas, 0, 0);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sel = this.getNormalizedSelection();
    if (sel) {
      const { start, end } = sel;
      ctx.fillStyle = "rgba(100, 150, 255, 0.4)";
      for (let row = start.row; row <= end.row; ++row) {
        const sc = row === start.row ? start.col : 0;
        const ec = row === end.row ? end.col : cols - 1;
        if (sc <= ec) {
          ctx.fillRect(sc * chw, row * chh, (ec - sc + 1) * chw, chh);
        }
      }
    }

    if (t0 > 0 && this.props.fpsMeter) {
      this.props.fpsMeter.recordFrame(performance.now() - t0, true);
    }
  }

  drawContent(ctx, cols, rows, chw, chh, width, height, dpr, contextResized) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const fontFace = this.props.fontFace || "MingLiu, monospace";
    const fontString = `${chh}px ${fontFace}`;
    const fontKey = `${chh}px ${fontFace}:${chw}`;

    if (this.lastFontKey !== fontKey) {
      this.metricsCache.clear();
      this.lastFontKey = fontKey;
    }

    if (contextResized || this.lastAppliedFont !== fontString) {
      ctx.font = fontString;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      this.lastAppliedFont = fontString;
    }

    const isBlinkHidden =
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

    this.textPoolIndex = 0;
    this.blockPoolIndex = 0;

    const textBuckets = this.textBuckets;
    const bgBuckets = this.bgBuckets;
    const underlineBuckets = this.underlineBuckets;
    for (let i = 0; i < 17; ++i) {
      textBuckets[i].length = 0;
      bgBuckets[i].length = 0;
      underlineBuckets[i].length = 0;
    }

    const smoothAnsi = !!this.props.smoothAnsi;
    const ansiBlockBuckets = this.ansiBlockBuckets;
    let blockGrid = null;
    if (smoothAnsi) {
      for (let i = 0; i < 17; ++i) {
        ansiBlockBuckets[i].length = 0;
      }
      if (!this.blockGrid || this.blockGrid.length !== rows * cols) {
        this.blockGrid = new Array(rows * cols).fill(null);
      } else {
        this.blockGrid.fill(null);
      }
      blockGrid = this.blockGrid;
    }

    const lines = this.props.lines;
    if (lines) {
      const isCharsetUtf8 = this.props.charset === "UTF-8";
      let hasBlink = false;

      for (let r = 0; r < rows && r < lines.length; ++r) {
        const line = lines[r];
        if (!line) continue;
        const isLineHighlighted = r === currentHl;
        const y = r * chh;

        let runBgIdx = 0;
        let runStartCol = 0;
        let runLength = 0;

        for (let c = 0; c < cols; ++c) {
          const ch = line[c];
          let bgIdx = ch ? ch.getBg() : 0;
          if (isLineHighlighted && bgIdx === 0) {
            bgIdx = 16;
          }

          if (bgIdx === runBgIdx) {
            runLength++;
          } else {
            if (runBgIdx !== 0) {
              bgBuckets[runBgIdx].push(runStartCol * chw, y, runLength * chw);
            }
            runBgIdx = bgIdx;
            runStartCol = c;
            runLength = 1;
          }
        }

        if (runBgIdx !== 0) {
          bgBuckets[runBgIdx].push(runStartCol * chw, y, runLength * chw);
        }

        for (let c = 0; c < cols; ++c) {
          const ch = line[c];
          if (!ch) continue;

          if (!isCharsetUtf8 && isDBCSLead(ch.ch) && c + 1 < cols && line[c + 1]) {
            const trailCh = line[c + 1];
            const u = b2u(ch.ch + trailCh.ch);
            if (u && u.length === 1 && !isBadDBCS(u)) {
              if (ch.blink || trailCh.blink) {
                hasBlink = true;
              }
              const isLeadHidden = ch.blink && isBlinkHidden;
              const isTrailHidden = trailCh.blink && isBlinkHidden;
              if (!isLeadHidden || !isTrailHidden) {
                const leadFgIndex =
                  typeof ch.isPartOfURL === "function" && ch.isPartOfURL()
                    ? 16
                    : ch.getFg() !== undefined
                    ? ch.getFg()
                    : 7;
                const trailFgIndex =
                  typeof trailCh.isPartOfURL === "function" && trailCh.isPartOfURL()
                    ? 16
                    : trailCh.getFg() !== undefined
                    ? trailCh.getFg()
                    : 7;

                if (leadFgIndex === trailFgIndex && !isLeadHidden && !isTrailHidden) {
                  if (smoothAnsi && ANSI_BLOCK_SET.has(u)) {
                    const blockItem = this.getBlockItem(
                      u,
                      r,
                      c,
                      c * chw,
                      y,
                      chw * 2,
                      chh,
                      leadFgIndex
                    );
                    ansiBlockBuckets[leadFgIndex].push(blockItem);
                    blockGrid[r * cols + c] = blockItem;
                    blockGrid[r * cols + c + 1] = blockItem;
                  } else {
                    textBuckets[leadFgIndex].push(
                      this.getTextItem(u, c * chw + chw, y + chh / 2, true)
                    );
                  }
                } else {
                  if (!isLeadHidden) {
                    textBuckets[leadFgIndex].push(
                      this.getTextItem(u, c * chw + chw, y + chh / 2, true, {
                        x: c * chw,
                        y,
                        w: chw,
                        h: chh
                      })
                    );
                  }
                  if (!isTrailHidden) {
                    textBuckets[trailFgIndex].push(
                      this.getTextItem(u, c * chw + chw, y + chh / 2, true, {
                        x: (c + 1) * chw,
                        y,
                        w: chw,
                        h: chh
                      })
                    );
                  }
                }

                if (ch.underLine && !isLeadHidden) {
                  underlineBuckets[leadFgIndex].push(c * chw, y + chh - 2, chw, 1);
                }
                if (trailCh.underLine && !isTrailHidden) {
                  underlineBuckets[trailFgIndex].push((c + 1) * chw, y + chh - 2, chw, 1);
                }
              }
              c++;
              continue;
            }
          }

          if (isCharsetUtf8 && c + 1 < cols && line[c + 1] && line[c + 1].ch === "" && ch.ch && ch.ch !== "") {
            const trailCh = line[c + 1];
            if (ch.blink || trailCh.blink) {
              hasBlink = true;
            }
            const isHidden = (ch.blink || trailCh.blink) && isBlinkHidden;
            if (!isHidden) {
              const fgIndex =
                typeof ch.isPartOfURL === "function" && ch.isPartOfURL()
                  ? 16
                  : ch.getFg() !== undefined
                  ? ch.getFg()
                  : 7;
              if (smoothAnsi && ANSI_BLOCK_SET.has(ch.ch)) {
                const blockItem = this.getBlockItem(
                  ch.ch,
                  r,
                  c,
                  c * chw,
                  y,
                  chw * 2,
                  chh,
                  fgIndex
                );
                ansiBlockBuckets[fgIndex].push(blockItem);
                blockGrid[r * cols + c] = blockItem;
                blockGrid[r * cols + c + 1] = blockItem;
              } else {
                textBuckets[fgIndex].push(
                  this.getTextItem(ch.ch, c * chw + chw, y + chh / 2, true)
                );
              }
              if (ch.underLine || trailCh.underLine) {
                underlineBuckets[fgIndex].push(c * chw, y + chh - 2, chw * 2, 1);
              }
            }
            c++;
            continue;
          }

          if (ch.blink) {
            hasBlink = true;
          }
          if (ch.blink && isBlinkHidden) continue;
          const charStr = ch.ch;
          const fgIndex =
            typeof ch.isPartOfURL === "function" && ch.isPartOfURL()
              ? 16
              : ch.getFg() !== undefined
              ? ch.getFg()
              : 7;
          if (charStr && charStr !== " " && charStr !== "\x00") {
            if (smoothAnsi && ANSI_BLOCK_SET.has(charStr)) {
              const blockItem = this.getBlockItem(
                charStr,
                r,
                c,
                c * chw,
                y,
                chw,
                chh,
                fgIndex
              );
              ansiBlockBuckets[fgIndex].push(blockItem);
              blockGrid[r * cols + c] = blockItem;
            } else {
              textBuckets[fgIndex].push(
                this.getTextItem(charStr, c * chw + chw / 2, y + chh / 2, false)
              );
            }
          }

          if (ch.underLine) {
            underlineBuckets[fgIndex].push(c * chw, y + chh - 2, chw, 1);
          }
        }
      }
      this.hasBlink = hasBlink;
    } else {
      this.hasBlink = false;
    }

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    for (let bgIdx = 1; bgIdx < 17; ++bgIdx) {
      const runs = bgBuckets[bgIdx];
      if (runs.length === 0) continue;
      ctx.fillStyle = bgIdx === 16 ? hlColor : termColors[bgIdx];
      for (let i = 0; i < runs.length; i += 3) {
        ctx.fillRect(runs[i], runs[i + 1], runs[i + 2], chh);
      }
    }

    if (smoothAnsi) {
      for (let cIdx = 0; cIdx < 17; ++cIdx) {
        const bucket = ansiBlockBuckets[cIdx];
        if (bucket.length === 0) continue;
        ctx.fillStyle = cIdx === 16 ? "#ff00ff" : termColors[cIdx];
        for (let i = 0; i < bucket.length; ++i) {
          this.drawSmoothAnsiBlock(ctx, bucket[i], blockGrid, cols, rows, chw, chh);
        }
      }
    }

    for (let cIdx = 0; cIdx < 17; ++cIdx) {
      const bucket = textBuckets[cIdx];
      if (bucket.length === 0) continue;
      ctx.fillStyle = cIdx === 16 ? "#ff00ff" : termColors[cIdx];
      for (let i = 0; i < bucket.length; ++i) {
        const item = bucket[i];
        if (item.clip) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(item.clip.x, item.clip.y, item.clip.w, item.clip.h);
          ctx.clip();
        }
        const scale = this.getCharMetrics(ctx, item.text, item.isDBCS, chw);
        if (scale === 1) {
          ctx.fillText(item.text, item.x, item.y);
        } else {
          ctx.setTransform(dpr * scale, 0, 0, dpr, dpr * item.x, dpr * item.y);
          ctx.fillText(item.text, 0, 0);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        if (item.clip) {
          ctx.restore();
        }
      }
    }

    for (let uIdx = 0; uIdx < 17; ++uIdx) {
      const uRuns = underlineBuckets[uIdx];
      if (uRuns.length === 0) continue;
      ctx.fillStyle = uIdx === 16 ? "#ff00ff" : termColors[uIdx];
      for (let i = 0; i < uRuns.length; i += 4) {
        ctx.fillRect(uRuns[i], uRuns[i + 1], uRuns[i + 2], uRuns[i + 3]);
      }
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
