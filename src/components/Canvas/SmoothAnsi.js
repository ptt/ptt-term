export const LOWER_BLOCK_MAP = {
  "\uff3f": 0.03, // ＿ fullwidth low line
  "\u02cd": 0.07, // ˍ modifier letter low line
  "\u2581": 1 / 8, // ▁ lower 1/8
  "\u2582": 2 / 8, // ▂ lower 1/4
  "\u2583": 3 / 8, // ▃ lower 3/8
  "\u2584": 4 / 8, // ▄ lower 1/2
  "\u2585": 5 / 8, // ▅ lower 5/8
  "\u2586": 6 / 8, // ▆ lower 3/4
  "\u2587": 7 / 8, // ▇ lower 7/8
  "\u2588": 1.0, // █ full block
};

export const UPPER_BLOCK_MAP = {
  "\u2594": 1 / 8, // ▔ upper 1/8
  "\u2580": 4 / 8, // ▀ upper 1/2
  "\u2588": 1.0, // █ full block
};

export const LEFT_BLOCK_MAP = {
  "\u258f": 1 / 8, // ▏ left 1/8
  "\u258e": 2 / 8, // ▎ left 1/4
  "\u258d": 3 / 8, // ▍ left 3/8
  "\u258c": 4 / 8, // ▌ left 1/2
  "\u258b": 5 / 8, // ▋ left 5/8
  "\u258a": 6 / 8, // ▊ left 3/4
  "\u2589": 7 / 8, // ▉ left 7/8
  "\u2588": 1.0, // █ full block
};

export const ANSI_BLOCK_SET = new Set([
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
  "\u2595", // ▕ right 1/8
]);

export function hasAnsiBlock(lines, dirtyRows) {
  if (!dirtyRows || !lines) return false;
  for (let i = 0; i < dirtyRows.length; ++i) {
    const r = dirtyRows[i];
    const line = lines[r];
    if (!line) continue;
    for (let c = 0; c < line.length; ++c) {
      const ch = line[c];
      if (ch && ch.ch && ANSI_BLOCK_SET.has(ch.ch)) {
        return true;
      }
    }
  }
  return false;
}

export class SmoothAnsi {
  static drawBlock(ctx, item, grid, cols, rows, chw, chh) {
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
      ctx.rect(x, y, w, h);
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
        ctx.rect(x + w / 2, y, w / 2, h);
        break;

      case "\u2595": // ▕ right 1/8 block
        ctx.rect(x + (w * 7) / 8, y, w / 8, h);
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
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        break;

      case "\u25bc": // ▼ down triangle
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w / 2, y + h);
        ctx.closePath();
        break;

      default:
        ctx.rect(x, y, w, h);
        break;
    }
  }

  static drawLowerBlockRamp(ctx, item, grid, cols, rows, chw, chh) {
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

    const isPeak =
      leftH !== null && rightH !== null && curH > leftH && curH > rightH;
    const isValley =
      leftH !== null && rightH !== null && curH < leftH && curH < rightH;

    ctx.moveTo(x, y + h - hL * h);
    if (isPeak || isValley) {
      ctx.lineTo(x + w / 2, y + h - curH * h);
    }
    ctx.lineTo(xR, y + h - hR * h);
    ctx.lineTo(xR, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    return true;
  }

  static drawUpperBlockRamp(ctx, item, grid, cols, rows, chw, chh) {
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
    return true;
  }

  static drawLeftBlockRamp(ctx, item, grid, cols, rows, chw, chh) {
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
    return true;
  }

  static drawTriangleLowerRight(ctx, item) {
    const { x, y, w, h } = item;
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  }

  static drawTriangleLowerLeft(ctx, item) {
    const { x, y, w, h } = item;
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  }

  static drawTriangleUpperRight(ctx, item) {
    const { x, y, w, h } = item;
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }

  static drawTriangleUpperLeft(ctx, item) {
    const { x, y, w, h } = item;
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  }
}

export default SmoothAnsi;
