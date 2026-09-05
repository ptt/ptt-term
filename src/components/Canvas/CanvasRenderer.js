import { termColors } from "../../js/term_buf";
import { b2u, isDBCSLead } from "../../js/string_util";
import { SmoothAnsi, ANSI_BLOCK_SET, hasAnsiBlock } from "./SmoothAnsi";
import { isBadDBCS, CanvasSelection } from "./CanvasSelection";

// URL underline color matches DOM mode's background-image (src/icon/http.bmp, RGB #ff6600)
const URL_UNDERLINE_COLOR = "#ff6600";

export class CanvasRenderer {
  constructor() {
    this.textBuckets = Array.from({ length: 16 }, () => []);
    this.ansiBlockBuckets = Array.from({ length: 16 }, () => []);
    this.bgBuckets = Array.from({ length: 17 }, () => []);
    this.underlineBuckets = Array.from({ length: 16 }, () => []);
    this.urlUnderlineRuns = [];
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
    this.dirtyRows = null;
    this.hasDrawnBefore = false;
  }

  markDirty(dirtyRows = null) {
    this.contentDirty = true;
    this.dirtyRows = dirtyRows;
  }

  clearFontCache() {
    this.metricsCache.clear();
    this.lastAppliedFont = "";
    this.markDirty();
  }

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

  draw(canvas, options) {
    const t0 =
      options.fpsMeter &&
      options.fpsMeter.enabled &&
      typeof performance !== "undefined"
        ? performance.now()
        : 0;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { cols, rows, chw, chh, selStart, selEnd } = options;
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

    if (canvasResized || bufferResized || !this.hasDrawnBefore) {
      this.dirtyRows = null;
    }

    let dirtyRows = this.dirtyRows;
    if (dirtyRows && dirtyRows.length > 0 && dirtyRows.length <= 6) {
      if (options.smoothAnsi && hasAnsiBlock(options.lines, dirtyRows)) {
        dirtyRows = null;
      }
    } else {
      dirtyRows = null;
    }

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
        bufferResized || canvasResized,
        dirtyRows,
        options
      );
      this.contentDirty = false;
      this.dirtyRows = null;
      this.hasDrawnBefore = true;
    }

    if (this.bufferCanvas) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.bufferCanvas, 0, 0);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    CanvasSelection.drawSelection(ctx, selStart, selEnd, cols, chw, chh);

    if (t0 > 0 && options.fpsMeter) {
      options.fpsMeter.recordFrame(performance.now() - t0, true);
    }
  }

  drawContent(
    ctx,
    cols,
    rows,
    chw,
    chh,
    width,
    height,
    dpr,
    contextResized,
    dirtyRows,
    options
  ) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const fontFace = options.fontFace || "MingLiu, monospace";
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
      options.currentHighlighted !== undefined
        ? options.currentHighlighted
        : options.nowHighlight !== undefined
        ? options.nowHighlight
        : -1;
    const hlColor =
      termColors[options.highlightBG !== undefined ? options.highlightBG : 2] ||
      "#008000";

    this.textPoolIndex = 0;
    this.blockPoolIndex = 0;

    const textBuckets = this.textBuckets;
    const bgBuckets = this.bgBuckets;
    const underlineBuckets = this.underlineBuckets;
    const urlUnderlineRuns = this.urlUnderlineRuns;
    for (let i = 0; i < 16; ++i) {
      textBuckets[i].length = 0;
      underlineBuckets[i].length = 0;
    }
    for (let i = 0; i < 17; ++i) {
      bgBuckets[i].length = 0;
    }
    urlUnderlineRuns.length = 0;

    const smoothAnsi = !!options.smoothAnsi && !dirtyRows;
    const ansiBlockBuckets = this.ansiBlockBuckets;
    let blockGrid = null;
    if (smoothAnsi) {
      for (let i = 0; i < 16; ++i) {
        ansiBlockBuckets[i].length = 0;
      }
      if (!this.blockGrid || this.blockGrid.length !== rows * cols) {
        this.blockGrid = new Array(rows * cols).fill(null);
      } else {
        this.blockGrid.fill(null);
      }
      blockGrid = this.blockGrid;
    }

    const lines = options.lines;
    const targetRows = dirtyRows || null;
    const rowCount = targetRows
      ? targetRows.length
      : lines
      ? Math.min(rows, lines.length)
      : 0;

    if (lines) {
      const isCharsetUtf8 = options.charset === "UTF-8";
      let hasBlink = false;

      for (let idx = 0; idx < rowCount; ++idx) {
        const r = targetRows ? targetRows[idx] : idx;
        if (r < 0 || r >= rows || r >= lines.length) continue;
        const line = lines[r];
        if (!line) continue;
        const isLineHighlighted = r === currentHl;
        const y = r * chh;

        let runBgIdx = 0;
        let runStartCol = 0;
        let runLength = 0;
        let urlStartCol = -1;
        const urlUnderlineY = y + Math.round((chh - 1) * 0.9);

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

          const isUrl = !!(
            ch &&
            typeof ch.isPartOfURL === "function" &&
            ch.isPartOfURL()
          );
          if (isUrl) {
            if (urlStartCol === -1) {
              urlStartCol = c;
            }
          } else if (urlStartCol !== -1) {
            urlUnderlineRuns.push(
              urlStartCol * chw,
              urlUnderlineY,
              (c - urlStartCol) * chw,
              1
            );
            urlStartCol = -1;
          }
        }

        if (runBgIdx !== 0) {
          bgBuckets[runBgIdx].push(runStartCol * chw, y, runLength * chw);
        }
        if (urlStartCol !== -1) {
          urlUnderlineRuns.push(
            urlStartCol * chw,
            urlUnderlineY,
            (cols - urlStartCol) * chw,
            1
          );
        }

        for (let c = 0; c < cols; ++c) {
          const ch = line[c];
          if (!ch) continue;

          if (
            !isCharsetUtf8 &&
            isDBCSLead(ch.ch) &&
            c + 1 < cols &&
            line[c + 1]
          ) {
            const trailCh = line[c + 1];
            const u = b2u(ch.ch + trailCh.ch);
            if (u && u.length === 1 && !isBadDBCS(u)) {
              if (ch.blink || trailCh.blink) {
                hasBlink = true;
              }
              const isLeadHidden = ch.blink && isBlinkHidden;
              const isTrailHidden = trailCh.blink && isBlinkHidden;
              if (!isLeadHidden || !isTrailHidden) {
                const leadFgIndex = ch.getFg() !== undefined ? ch.getFg() : 7;
                const trailFgIndex =
                  trailCh.getFg() !== undefined ? trailCh.getFg() : 7;

                if (
                  leadFgIndex === trailFgIndex &&
                  !isLeadHidden &&
                  !isTrailHidden
                ) {
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
                        h: chh,
                      })
                    );
                  }
                  if (!isTrailHidden) {
                    textBuckets[trailFgIndex].push(
                      this.getTextItem(u, c * chw + chw, y + chh / 2, true, {
                        x: (c + 1) * chw,
                        y,
                        w: chw,
                        h: chh,
                      })
                    );
                  }
                }

                if (ch.underLine && !isLeadHidden) {
                  underlineBuckets[leadFgIndex].push(
                    c * chw,
                    y + chh - 2,
                    chw,
                    1
                  );
                }
                if (trailCh.underLine && !isTrailHidden) {
                  underlineBuckets[trailFgIndex].push(
                    (c + 1) * chw,
                    y + chh - 2,
                    chw,
                    1
                  );
                }
              }
              c++;
              continue;
            }
          }

          if (
            isCharsetUtf8 &&
            c + 1 < cols &&
            line[c + 1] &&
            line[c + 1].ch === "" &&
            ch.ch &&
            ch.ch !== ""
          ) {
            const trailCh = line[c + 1];
            if (ch.blink || trailCh.blink) {
              hasBlink = true;
            }
            const isHidden = (ch.blink || trailCh.blink) && isBlinkHidden;
            if (!isHidden) {
              const fgIndex = ch.getFg() !== undefined ? ch.getFg() : 7;
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
                underlineBuckets[fgIndex].push(
                  c * chw,
                  y + chh - 2,
                  chw * 2,
                  1
                );
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
          const fgIndex = ch.getFg() !== undefined ? ch.getFg() : 7;
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
      if (!targetRows) {
        this.hasBlink = hasBlink;
      } else if (hasBlink) {
        this.hasBlink = true;
      }
    } else {
      this.hasBlink = false;
    }

    if (targetRows) {
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < targetRows.length; ++i) {
        const r = targetRows[i];
        ctx.rect(0, r * chh, width, chh);
      }
      ctx.clip();

      ctx.fillStyle = "#000000";
      for (let i = 0; i < targetRows.length; ++i) {
        const r = targetRows[i];
        ctx.fillRect(0, r * chh, width, chh);
      }
    } else {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);
    }

    for (let bgIdx = 1; bgIdx < 17; ++bgIdx) {
      const runs = bgBuckets[bgIdx];
      if (runs.length === 0) continue;
      ctx.fillStyle = bgIdx === 16 ? hlColor : termColors[bgIdx];
      for (let i = 0; i < runs.length; i += 3) {
        ctx.fillRect(runs[i], runs[i + 1], runs[i + 2], chh);
      }
    }

    if (smoothAnsi) {
      for (let cIdx = 0; cIdx < 16; ++cIdx) {
        const bucket = ansiBlockBuckets[cIdx];
        if (bucket.length === 0) continue;
        ctx.fillStyle = termColors[cIdx];
        ctx.beginPath();
        for (let i = 0; i < bucket.length; ++i) {
          SmoothAnsi.drawBlock(ctx, bucket[i], blockGrid, cols, rows, chw, chh);
        }
        ctx.fill();
      }
    }

    for (let cIdx = 0; cIdx < 16; ++cIdx) {
      const bucket = textBuckets[cIdx];
      if (bucket.length === 0) continue;
      ctx.fillStyle = termColors[cIdx];
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

    for (let uIdx = 0; uIdx < 16; ++uIdx) {
      const uRuns = underlineBuckets[uIdx];
      if (uRuns.length === 0) continue;
      ctx.fillStyle = termColors[uIdx];
      for (let i = 0; i < uRuns.length; i += 4) {
        ctx.fillRect(uRuns[i], uRuns[i + 1], uRuns[i + 2], uRuns[i + 3]);
      }
    }

    if (urlUnderlineRuns.length > 0) {
      ctx.fillStyle = URL_UNDERLINE_COLOR;
      for (let i = 0; i < urlUnderlineRuns.length; i += 4) {
        ctx.fillRect(
          urlUnderlineRuns[i],
          urlUnderlineRuns[i + 1],
          urlUnderlineRuns[i + 2],
          urlUnderlineRuns[i + 3]
        );
      }
    }

    if (targetRows) {
      ctx.restore();
    }
  }
}

export default CanvasRenderer;
