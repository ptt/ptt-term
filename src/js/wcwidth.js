// Unicode Character Width and Column Calculation (wcwidth / stringWidth)
// Tailored for East Asian terminals (PTT / BBS) supporting standard CJK,
// East Asian Wide/Fullwidth forms, UAO (Unicode at On), and box drawing/symbols.

// Optimized with a 64KB Uint8Array lookup table for O(1) BMP character width resolution.

import { forceWidthCodes } from './symbol_table.js';
import { u2bTable, addUAOInitListener } from '../conv/uao.js';

export const widthTable = new Uint8Array(65536);

function setRange(start, end, val) {
  for (let i = start; i <= end; i++) {
    widthTable[i] = val;
  }
}

/**
 * Applies UAO table mappings to the width table.
 * Any non-zero entry in u2bTable (characters mapped by Big5/UAO) is marked as fullwidth (2 columns),
 * excluding zero-width formatting characters like soft hyphen (0x00ad).
 */
export function applyUAOToWidthTable() {
  if (!u2bTable) return;
  for (let i = 0x20; i < 65536; i++) {
    if (u2bTable[i] > 0 && i !== 0x00ad) {
      widthTable[i] = 2;
    }
  }
}

/**
 * Initializes or resets the 64KB BMP character width lookup table.
 */
export function initWidthTable() {
  // Default to standard printable half-width (1 column)
  widthTable.fill(1);

  // 1. East Asian Wide, Fullwidth, CJK, and UAO (2 columns)
  setRange(0x0370, 0x04ff, 2); // Greek, Cyrillic (Wide in Big5 BBS)
  setRange(0x1100, 0x115f, 2); // Hangul Jamo
  setRange(0x2000, 0x243f, 2); // General punctuation, arrows, math, enclosed alphanumerics
  setRange(0x2329, 0x232a, 2);
  setRange(0x2500, 0x27bf, 2); // Box drawing, block elements, geometric shapes, misc symbols
  setRange(0x2e80, 0xa4cf, 2); // CJK radicals, CJK symbols/punctuation, ideographs, Hangul
  setRange(0xac00, 0xd7a3, 2); // Hangul syllables
  setRange(0xe000, 0xf8ff, 2); // UAO Private Use Area
  setRange(0xf900, 0xfaff, 2); // CJK Compatibility Ideographs
  setRange(0xfe10, 0xfe6f, 2); // CJK compatibility forms, small variants
  setRange(0xff01, 0xff60, 2); // Fullwidth Forms
  setRange(0xffe0, 0xffe6, 2); // Fullwidth signs

  // 2. Forced width symbols from symbol_table
  if (Array.isArray(forceWidthCodes)) {
    for (const code of forceWidthCodes) {
      if (code < 65536) widthTable[code] = 2;
    }
  }

  // 3. Control characters & DEL (0 columns)
  setRange(0x00, 0x1f, 0);
  setRange(0x7f, 0x9f, 0);

  // 4. Zero-width spaces, joiners, formatting, and combining marks (0 columns)
  widthTable[0x00ad] = 0; // Soft Hyphen
  setRange(0x0300, 0x036f, 0); // Combining Diacritical Marks
  setRange(0x1dc0, 0x1dff, 0); // Combining Diacritical Marks Supplement
  setRange(0x200b, 0x200f, 0); // Zero-width spaces, directional marks
  setRange(0x2028, 0x202e, 0); // Line/Paragraph separators, BiDi controls
  setRange(0x2060, 0x206f, 0); // Invisible operators, word joiner
  setRange(0x20d0, 0x20ff, 0); // Combining Marks for Symbols
  setRange(0xfe20, 0xfe2f, 0); // Combining Half Marks
  widthTable[0xfeff] = 0; // Zero Width No-Break Space (BOM)
  setRange(0xfff9, 0xfffb, 0); // Interlinear annotation

  // 5. Finally, apply UAO (Unicode at On / Big5 terminal mapping overrides)
  applyUAOToWidthTable();
}

// Automatically initialize table on module load
initWidthTable();

// Keep in sync if UAO tables are re-initialized
addUAOInitListener(applyUAOToWidthTable);

/**
 * Determines the display column width of a Unicode character or code point
 * in an East Asian terminal context (PTT BBS).
 *
 * Returns:
 * - 0: Null, control characters, combining characters, zero-width characters
 * - 2: Full-width / Wide characters (CJK, UAO, box drawing, symbols, fullwidth forms)
 * - 1: Standard half-width printable characters (ASCII, Latin-1, halfwidth forms)
 *
 * @param {number | string} codeOrChar Code point number or single character string
 * @returns {number} 0, 1, or 2
 */
export function wcwidth(codeOrChar) {
  if (typeof codeOrChar === 'number') {
    if (codeOrChar >= 0 && codeOrChar < 65536) {
      return widthTable[codeOrChar];
    }
    if (!Number.isFinite(codeOrChar) || codeOrChar < 0) return 0;
    if (
      (codeOrChar >= 0x1f300 && codeOrChar <= 0x1faff) ||
      (codeOrChar >= 0x20000 && codeOrChar <= 0x3fffd)
    ) {
      return 2;
    }
    return 1;
  }

  if (typeof codeOrChar === 'string') {
    const len = codeOrChar.length;
    if (len === 1) {
      return widthTable[codeOrChar.charCodeAt(0)];
    }
    if (len === 0) return 0;
    console.assert(
      len <= 2,
      `wcwidth() expects a single character string (length <= 2), got length ${len}: "${codeOrChar}". Use stringWidth() for multi-character strings.`
    );
    const code = codeOrChar.codePointAt(0);
    if (code < 65536) {
      return widthTable[code];
    }
    if (
      (code >= 0x1f300 && code <= 0x1faff) ||
      (code >= 0x20000 && code <= 0x3fffd)
    ) {
      return 2;
    }
    return 1;
  }

  return 0;
}

/**
 * Checks if a character is full-width (occupies 2 columns).
 * @param {number | string} codeOrChar
 * @returns {boolean}
 */
export function isFullWidth(codeOrChar) {
  return wcwidth(codeOrChar) === 2;
}

/**
 * Calculates the total terminal column width of a string.
 * Accurately handles surrogate pairs (codePointAt).
 *
 * @param {string} str
 * @returns {number}
 */
export function stringWidth(str) {
  if (!str || typeof str !== 'string') return 0;
  let width = 0;
  const len = str.length;
  for (let i = 0; i < len; i++) {
    const code = str.codePointAt(i);
    width += wcwidth(code);
    if (code > 0xffff) {
      i++; // Skip trail surrogate
    }
  }
  return width;
}

/**
 * Standard POSIX alias for string width calculation.
 */
export const wcswidth = stringWidth;
