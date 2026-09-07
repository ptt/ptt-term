

import { b2uTable, u2bTable } from '../conv/uao.js';

/**
 * Only support caret notations (^C, ^H, ^U, ^[, ^?, ...)
 * If you want to show \ and ^, use \\ and \^ respectively
 */ 
export function unescapeStr(it) {
  let result = '';

  for (let i = 0; i < it.length; ++i) {
    const curChar = it.charAt(i);
    const nextChar = it.charAt(i+1);
    
    if (i == it.length - 1) {
      result += curChar;
      break;
    }

    if (curChar == '\\' && (nextChar == '\\' || nextChar == '^')) {
      result += nextChar;
      i++;
    } else if (curChar == '^') {
      if ('@' <= nextChar && nextChar <= '_') {
        const code = it.charCodeAt(i+1) - 64;
        result += String.fromCharCode(code);
        i++;
      } else if (nextChar == '?') {
        result += '\x7f';
        i++;
      } else {
        result += '^';
      }
    } else {
      result += curChar;
    }
  }
  return result;
};

// Wrap text within maxLen without hyphenating English words,
// where the maxLen is generally the screen width.
export function wrapText(it, maxLen, enterChar) {
  // Divide string into non-hyphenated groups
  // classified as \r, \n, single full-width character, an English word,
  // and space characters in the beginning of original line. (indent)
  // Spaces next to a word group are merged into that group
  // to ensure the start of each wrapped line is a word.
  // FIXME: full-width punctuation marks aren't recognized
  const pattern = /\r|\n|([^\x00-\x7f][,.?!:;]?[\t ]*)|([\x00-\x08\x0b\x0c\x0e-\x1f\x21-\x7f]+[\t ]*)|[\t ]+/g;
  const splited = it.match(pattern);

  let result = '';
  let len = 0;
  for (let i = 0; i < splited.length; ++i) {
    // Convert special characters to spaces with the same width
    // and then we can get the width by the length of the converted string
    const grouplen = splited[i].replace(/[^\x00-\x7f]/g,"  ")
                             .replace(/\t/,"    ")
                             .replace(/\r|\n/,"")
                             .length;

    if (splited[i] == '\r' || splited[i] == '\n')
      len = 0;
    if (len + grouplen > maxLen) {
      result += enterChar;
      len = 0;
    }
    result += splited[i];
    len += grouplen;
  }
  return result;
};

export function u2b(it) {
  let data = '';
  for (let i = 0; i < it.length; ++i) {
    if (it.charAt(i) < '\x80') {
      data += it.charAt(i);
      continue;
    }
    const pos = it.charCodeAt(i);
    const b = u2bTable[pos];
    if (b)
      data += String.fromCharCode(b >> 8, b & 0xff);
    else if (!(pos >= 0xd800 && pos <= 0xdbff)) // Not a big5 char nor a UTF-16 high surrogate
      data += '\xA1\xBC'; // '□' (Big5)
  }
  return data;
};

export function b2u(it) {
  if (!it) return '';
  const isArray = it instanceof Uint8Array || Array.isArray(it);
  const len = it.length;
  let str = '';
  for (let i = 0; i < len; ++i) {
    const c1 = isArray ? it[i] : it.charCodeAt(i);
    if (c1 < 0x80 || c1 > 0xff || i === len - 1) {
      str += isArray ? String.fromCharCode(c1) : it[i];
      continue;
    }

    const c2 = isArray ? it[i + 1] : it.charCodeAt(i + 1);
    if (c2 > 0xff) {
      str += isArray ? String.fromCharCode(c1) : it[i];
      continue;
    }

    const pos = (c1 << 8) | c2;
    const code = b2uTable[pos];
    if (code) {
      str += String.fromCharCode(code);
      ++i;
    } else { // Not a big5 char
      str += isArray ? String.fromCharCode(c1) : it[i];
    }
  }
  return str;
};

export function isDBCSLead(ch) {
  let code = ch.charCodeAt(0);
  return code >= 0x81 && code <= 0xfe;
};

export function ansiHalfColorConv(it) {
  let str = '';
  const regex = new RegExp('\x15\\[(([0-9]+)?;)+50m', 'g');
  let result = null;
  const indices = [];
  while ((result = regex.exec(it))) {
    indices.push(result.index + result[0].length - 4);
  }

  if (indices.length === 0) {
    return it;
  }

  let curInd = 0;
  for (let i = 0; i < indices.length; ++i) {
    const ind = indices[i];
    const preEscInd = it.substring(curInd, ind).lastIndexOf('\x15') + curInd;
    str += it.substring(curInd, preEscInd) + '\x00' + it.substring(ind+4, ind+5) + it.substring(preEscInd, ind) + 'm';
    curInd = ind+5;
  }
  str += it.substring(curInd);
  return str;
};
