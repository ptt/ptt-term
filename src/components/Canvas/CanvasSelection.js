export class CanvasSelection {
  static getGridPos(e, canvas, cols, rows) {
    if (!canvas) return { col: 0, row: 0 };
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { col: 0, row: 0 };

    let col = Math.floor(((e.clientX - rect.left) / rect.width) * cols);
    let row = Math.floor(((e.clientY - rect.top) / rect.height) * rows);
    col = Math.max(0, Math.min(cols - 1, col));
    row = Math.max(0, Math.min(rows - 1, row));
    return { col, row };
  }

  static getNormalizedSelection(selStart, selEnd) {
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

  static getSelectionColRow(selStart, selEnd, lines) {
    const sel = CanvasSelection.getNormalizedSelection(selStart, selEnd);
    if (!sel) return null;
    const line = lines && lines[sel.end.row];
    let endCol = sel.end.col + 1;
    if (line && line[sel.end.col]) {
      if (line[sel.end.col].isDBCSLead) {
        endCol = sel.end.col + 2;
      }
    }
    return {
      start: { row: sel.start.row, col: sel.start.col },
      end: { row: sel.end.row, col: endCol },
    };
  }

  static getSelectedText(selStart, selEnd, lines, cols) {
    const sel = CanvasSelection.getNormalizedSelection(selStart, selEnd);
    if (!sel) return "";
    const { start, end } = sel;
    const result = [];

    for (let r = start.row; r <= end.row; ++r) {
      const line = lines && lines[r];
      if (!line) continue;
      let sc = r === start.row ? start.col : 0;
      let ec = r === end.row ? end.col + 1 : cols;
      if (sc > 0 && line[sc] && (line[sc].isDBCSTrail || line[sc].ch === "") && line[sc - 1] && line[sc - 1].isDBCSLead) {
        sc--;
      }
      if (ec < line.length && line[ec] && (line[ec].isDBCSTrail || line[ec].ch === "") && line[ec - 1] && line[ec - 1].isDBCSLead) {
        ec++;
      }
      let rowText = "";
      for (let c = sc; c < ec && c < line.length; ++c) {
        const ch = line[c];
        if (!ch) continue;
        if (ch.isDBCSTrail || ch.ch === "") {
          continue;
        }
        rowText += ch.ch;
      }
      result.push(rowText.replace(/\s+$/, ""));
    }
    return result.join("\r");
  }

  static getWordSelection(pos, line, cols) {
    if (!line) return { selStart: pos, selEnd: pos };
    let sc = pos.col;
    let ec = pos.col;
    while (
      sc > 0 &&
      line[sc - 1] &&
      line[sc - 1].ch !== " " &&
      line[sc - 1].ch !== "\x00"
    ) {
      sc--;
    }
    while (
      ec < cols - 1 &&
      line[ec + 1] &&
      line[ec + 1].ch !== " " &&
      line[ec + 1].ch !== "\x00"
    ) {
      ec++;
    }
    return {
      selStart: { col: sc, row: pos.row },
      selEnd: { col: ec, row: pos.row },
    };
  }

  static getLineSelection(pos, cols) {
    return {
      selStart: { col: 0, row: pos.row },
      selEnd: { col: cols - 1, row: pos.row },
    };
  }

  static drawSelection(ctx, selStart, selEnd, cols, chw, chh) {
    const sel = CanvasSelection.getNormalizedSelection(selStart, selEnd);
    if (!sel) return;
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
}

export default CanvasSelection;
