/**
 * Parses a CSS font-family string into an array of clean font names.
 * Supports single-quoted, double-quoted, and unquoted font names.
 *
 * @param {string} fontFaceStr - e.g. "MingLiu, 'Noto Sans Mono CJK TC', monospace"
 * @returns {string[]} Array of font family names
 */
export function parseFontList(fontFaceStr) {
  if (!fontFaceStr || typeof fontFaceStr !== "string") {
    return [];
  }
  const result = [];
  const regex = /\s*(?:['"]([^'"]+)['"]|([^,]+))\s*(?:,|$)/g;
  let match;
  while ((match = regex.exec(fontFaceStr)) !== null) {
    const font = (match[1] !== undefined ? match[1] : match[2] || "").trim();
    if (font) {
      result.push(font);
    }
  }
  return result;
}

/**
 * Serializes an array of font names into a valid CSS font-family string.
 * Quotes font names that contain spaces or special characters if not already quoted.
 *
 * @param {string[]} fontList - e.g. ["MingLiu", "Noto Sans Mono CJK TC", "monospace"]
 * @returns {string} e.g. "MingLiu, 'Noto Sans Mono CJK TC', monospace"
 */
export function serializeFontList(fontList) {
  if (!Array.isArray(fontList)) {
    return "";
  }
  return fontList
    .map((f) => {
      const trimmed = (f || "").trim();
      if (!trimmed) return "";
      if (
        (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
        (trimmed.startsWith('"') && trimmed.endsWith('"'))
      ) {
        return trimmed;
      }
      if (/[ \t\r\n]/.test(trimmed)) {
        return `'${trimmed}'`;
      }
      return trimmed;
    })
    .filter(Boolean)
    .join(", ");
}

/**
 * Curated preset fonts popular for BBS and terminal rendering.
 */
export const PRESET_FONTS = [
  "MingLiu",
  "SymMingLiu",
  "Noto Sans Mono CJK TC",
  "PingFang TC",
  "Microsoft JhengHei",
  "Sarasa Mono TC",
  "Iosevka",
  "Cascadia Code",
  "Consolas",
  "Courier New",
  "Fira Code",
  "JetBrains Mono",
  "Ubuntu Mono",
  "Source Code Pro",
  "monospace",
];
