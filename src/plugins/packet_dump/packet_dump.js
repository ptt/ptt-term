import { PluginBase } from "../PluginBase.js";
import { _ } from "../../js/i18n.js";
import { isBrowser } from "../../js/util.js";
import { TermChar } from "../../js/term_buf.js";
import { b2uTable } from "../../conv/uao.js";
import {
  SE,
  NOP,
  DATA_MARK,
  BREAK,
  INTERRUPT_PROCESS,
  ABORT_OUTPUT,
  ARE_YOU_THERE,
  ERASE_CHARACTER,
  ERASE_LINE,
  GO_AHEAD,
  SB,
  WILL,
  WONT,
  DO,
  DONT,
  IAC,
  BINARY,
  ECHO,
  SUPRESS_GO_AHEAD,
  TIMING_MARK,
  TERM_TYPE,
  IS,
  SEND,
  NAWS,
} from "../../js/telnet.js";

if (isBrowser()) {
  import("./packet_dump.css");
}

const ANSI_COLOR_NAMES = [
  "Black",
  "Red",
  "Green",
  "Yellow",
  "Blue",
  "Magenta",
  "Cyan",
  "White",
];

const TELNET_CMD_NAMES = {
  [SE]: "SE",
  [NOP]: "NOP",
  [DATA_MARK]: "DATA_MARK",
  [BREAK]: "BREAK",
  [INTERRUPT_PROCESS]: "IP",
  [ABORT_OUTPUT]: "AO",
  [ARE_YOU_THERE]: "AYT",
  [ERASE_CHARACTER]: "EC",
  [ERASE_LINE]: "EL",
  [GO_AHEAD]: "GA",
  [SB]: "SB",
  [WILL]: "WILL",
  [WONT]: "WONT",
  [DO]: "DO",
  [DONT]: "DONT",
  [IAC]: "IAC",
};

const TELNET_OPT_NAMES = {
  [BINARY]: "BINARY (0)",
  [ECHO]: "ECHO (1)",
  [SUPRESS_GO_AHEAD]: "SUPPRESS_GO_AHEAD (3)",
  [TIMING_MARK]: "TIMING_MARK (6)",
  [TERM_TYPE]: "TERM_TYPE (24)",
  [NAWS]: "NAWS (31)",
};

const DEC_MOUSE_MODE_NAMES = {
  9: "X10 Mouse (9)",
  1000: "VT200 Mouse (1000)",
  1001: "Highlight Mouse (1001)",
  1002: "Button-Event Mouse (1002)",
  1003: "Any-Event Mouse (1003)",
  1005: "UTF-8 Mouse Mode (1005)",
  1006: "SGR Extended Mouse Mode (1006)",
  1015: "URXVT Mouse Mode (1015)",
};

const DEC_MODE_NAMES = {
  ...DEC_MOUSE_MODE_NAMES,
  1: "Application Cursor Keys (1)",
  25: "Cursor Visible (25)",
  47: "Alt Screen Buffer (47)",
  1047: "Alt Screen Buffer (1047)",
  1048: "Save Cursor (1048)",
  1049: "Alt Screen + Save Cursor (1049)",
  2004: "Bracketed Paste (2004)",
  2026: "Synchronized Update (2026)",
};

const CTRL_NAMES = {
  0x00: "NUL",
  0x07: "BEL",
  0x08: "BS",
  0x09: "TAB",
  0x0a: "LF",
  0x0b: "VT",
  0x0c: "FF",
  0x0d: "CR",
  0x1b: "ESC",
  0x7f: "DEL",
};

const utf8Decoder =
  typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8") : null;

export function bytesToHex(bytes) {
  if (!bytes || bytes.length === 0) return "";
  const hex = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = (bytes[i] & 0xff).toString(16).toUpperCase();
    hex.push(b.length === 1 ? "0" + b : b);
  }
  return hex.join(" ");
}

function isPrintableUnicodeChar(ch) {
  if (!ch) return false;
  const cp = ch.codePointAt(0);
  if (cp === undefined || cp < 0x20) return false;
  if (cp === 0x7f || (cp >= 0x80 && cp <= 0x9f)) return false;
  if (cp === 0xfffd) return false;
  return true;
}

function getTelnetOptName(opt) {
  return TELNET_OPT_NAMES[opt] || `OPT_${opt}`;
}

function describeTelnetSubnegotiation(sbBytes) {
  if (!sbBytes || sbBytes.length === 0) {
    return "IAC: SB (empty)";
  }
  const opt = sbBytes[0];
  if (opt === TERM_TYPE) {
    const subCmd = sbBytes[1];
    if (subCmd === SEND) {
      return "IAC: SB TERM_TYPE SEND";
    }
    if (subCmd === IS) {
      const str = String.fromCharCode(...sbBytes.slice(2));
      return `IAC: SB TERM_TYPE IS "${str}"`;
    }
  }
  if (opt === NAWS) {
    const unescaped = [];
    for (let i = 1; i < sbBytes.length; i++) {
      unescaped.push(sbBytes[i]);
      if (sbBytes[i] === IAC && sbBytes[i + 1] === IAC) {
        i++;
      }
    }
    if (unescaped.length >= 4) {
      const cols = (unescaped[0] << 8) | unescaped[1];
      const rows = (unescaped[2] << 8) | unescaped[3];
      return `IAC: SB NAWS ${cols}x${rows}`;
    }
  }
  return `IAC: SB ${getTelnetOptName(opt)}`;
}

function describeXtermLocatorSGR(body, finalChar) {
  const parts = body.slice(1).split(";").map((s) => parseInt(s, 10) || 0);
  const cb = parts[0] ?? 0;
  const cx = parts[1] ?? 1;
  const cy = parts[2] ?? 1;

  const mods = [];
  if (cb & 4) mods.push("Shift");
  if (cb & 8) mods.push("Alt");
  if (cb & 16) mods.push("Ctrl");
  const modPrefix = mods.length > 0 ? mods.join("+") + "+" : "";

  let actionDesc = "";
  if (cb & 64) {
    const wheelBtn = cb & 3;
    actionDesc =
      wheelBtn === 0
        ? "Wheel Up"
        : wheelBtn === 1
          ? "Wheel Down"
          : `Wheel (${wheelBtn})`;
  } else {
    const btnCode = cb & 3;
    const btnName =
      btnCode === 0
        ? "Left"
        : btnCode === 1
          ? "Middle"
          : btnCode === 2
            ? "Right"
            : "Button";
    if (cb & 32) {
      actionDesc = `${btnName} Drag`;
    } else if (finalChar === "m") {
      actionDesc = `${btnName} Release`;
    } else {
      actionDesc = `${btnName} Press`;
    }
  }

  return `XTerm Locator SGR: ${modPrefix}${actionDesc} (Col=${cx}, Row=${cy})`;
}

function describeSGR(body, attrState) {
  const rawParams = body === "" ? ["0"] : body.split(";");
  const flags = [];
  let isReset = false;
  let hasHalfAttr = false;

  for (let i = 0; i < rawParams.length; i++) {
    const raw = rawParams[i];
    const v = raw === "" ? 0 : parseInt(raw, 10);
    if (!Number.isFinite(v)) continue;
    if (v === 0) isReset = true;
    if (v === 66) {
      hasHalfAttr = true;
    } else {
      attrState.assignParams([v]);
    }
  }

  const fg = attrState.fg;
  const bg = attrState.bg;
  const fgName = ANSI_COLOR_NAMES[fg] || String(fg);
  const bgName = ANSI_COLOR_NAMES[bg] || String(bg);

  if (isReset && rawParams.length === 1) flags.push("Reset");
  if (attrState.bright) flags.push("Bright");
  if (attrState.underLine) flags.push("Underline");
  if (attrState.blink) flags.push("Blink");
  if (attrState.invert) flags.push("Invert");
  if (hasHalfAttr) flags.push("HalfAttr(66)");

  const flagSuffix = flags.length > 0 ? ` [${flags.join(", ")}]` : "";
  return `Color: FG=${fg} (${fgName}), BG=${bg} (${bgName})${flagSuffix}`;
}

function describeCSI(body, finalChar) {
  const rawParams = body.split(";");
  const getParam = (idx, fallback = 1) => {
    const v = parseInt(rawParams[idx], 10);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  const getRawParam = (idx, fallback = 0) => {
    const v = parseInt(rawParams[idx], 10);
    return Number.isFinite(v) ? v : fallback;
  };

  switch (finalChar) {
    case "H":
    case "f": {
      const row = getParam(0, 1);
      const col = getParam(1, 1);
      return `ANSI CSI: Cursor Position (Row=${row}, Col=${col})`;
    }
    case "A":
      return `ANSI CSI: Cursor Up (${getParam(0, 1)})`;
    case "B":
    case "e":
      return `ANSI CSI: Cursor Down (${getParam(0, 1)})`;
    case "C":
    case "a":
      return `ANSI CSI: Cursor Forward (${getParam(0, 1)})`;
    case "D":
      return `ANSI CSI: Cursor Backward (${getParam(0, 1)})`;
    case "E":
      return `ANSI CSI: Cursor Next Line (${getParam(0, 1)})`;
    case "F":
      return `ANSI CSI: Cursor Preceding Line (${getParam(0, 1)})`;
    case "G":
    case "`":
      return `ANSI CSI: Cursor Horizontal Absolute (Col=${getParam(0, 1)})`;
    case "d":
      return `ANSI CSI: Line Position Absolute (Row=${getParam(0, 1)})`;
    case "J": {
      const mode = getRawParam(0, 0);
      const desc =
        mode === 0
          ? "Below Cursor"
          : mode === 1
            ? "Above Cursor"
            : mode === 2
              ? "Entire Screen"
              : String(mode);
      return `ANSI CSI: Erase in Display (${desc})`;
    }
    case "K": {
      const mode = getRawParam(0, 0);
      const desc =
        mode === 0
          ? "To Right"
          : mode === 1
            ? "To Left"
            : mode === 2
              ? "Entire Line"
              : String(mode);
      return `ANSI CSI: Erase in Line (${desc})`;
    }
    case "L":
      return `ANSI CSI: Insert Line (${getParam(0, 1)})`;
    case "M":
      return `ANSI CSI: Delete Line (${getParam(0, 1)})`;
    case "P":
      return `ANSI CSI: Delete Character (${getParam(0, 1)})`;
    case "@":
      return `ANSI CSI: Insert Character (${getParam(0, 1)})`;
    case "X":
      return `ANSI CSI: Erase Character (${getParam(0, 1)})`;
    case "I":
      return `ANSI CSI: Forward Tab (${getParam(0, 1)})`;
    case "Z":
      return `ANSI CSI: Backward Tab (${getParam(0, 1)})`;
    case "S":
      return `ANSI CSI: Scroll Up (${getParam(0, 1)})`;
    case "T":
      return `ANSI CSI: Scroll Down (${getParam(0, 1)})`;
    case "r": {
      const top = getParam(0, 1);
      const bottom = rawParams.length >= 2 ? getParam(1, 24) : "end";
      return `ANSI CSI: Set Scroll Region (${top}..${bottom})`;
    }
    case "s":
      return "ANSI CSI: Save Cursor Position";
    case "u":
      return "ANSI CSI: Restore Cursor Position";
    case "n":
      if (getRawParam(0, 0) === 6) {
        return "ANSI CSI: Device Status Report (Query Cursor Pos)";
      }
      return `ANSI CSI: Device Status Report (${body}n)`;
    case "R":
      return `ANSI CSI: Cursor Position Report (Row=${getParam(0, 1)}, Col=${getParam(1, 1)})`;
    case "~": {
      const keyMap = {
        1: "Home",
        2: "Insert",
        3: "Delete",
        4: "End",
        5: "PageUp",
        6: "PageDown",
        11: "F1",
        12: "F2",
        13: "F3",
        14: "F4",
        15: "F5",
        17: "F6",
        18: "F7",
        19: "F8",
        20: "F9",
        21: "F10",
        23: "F11",
        24: "F12",
      };
      const code = getRawParam(0, 0);
      const keyName = keyMap[code] || `Key ${code}`;
      return `ANSI CSI: Key ${keyName} (ESC[${body}~)`;
    }
    default:
      return `ANSI CSI: ESC[${body}${finalChar}`;
  }
}

function describeSingleByte(b) {
  if (CTRL_NAMES[b]) {
    return `ASCII: ${CTRL_NAMES[b]} (0x${b.toString(16).toUpperCase().padStart(2, "0")})`;
  }
  if (b < 0x20) {
    const ctrlChar = String.fromCharCode(b + 0x40);
    return `ASCII: Ctrl+${ctrlChar} (0x${b.toString(16).toUpperCase().padStart(2, "0")})`;
  }
  if (b >= 0x20 && b <= 0x7e) {
    return `ASCII: "${String.fromCharCode(b)}"`;
  }
  return `Byte: 0x${b.toString(16).toUpperCase().padStart(2, "0")}`;
}

/**
 * Parse raw packet bytes into annotated tokens with hover tooltips.
 * Contiguous printable ASCII runs and contiguous printable UTF-8 / Big5 runs
 * are grouped into single blocks.
 *
 * @param {Uint8Array | number[]} inputBytes
 * @param {object} [options]
 * @param {boolean} [options.isUtf8=true]
 * @param {TermChar} [options.attrState]
 * @returns {Array<{ type: string, bytes: Uint8Array, hex: string, tooltip: string }>}
 */
export function parsePacket(inputBytes, options = {}) {
  if (!inputBytes || inputBytes.length === 0) return [];
  const bytes =
    inputBytes instanceof Uint8Array ? inputBytes : new Uint8Array(inputBytes);
  const n = bytes.length;
  const isUtf8 = options.isUtf8 !== undefined ? Boolean(options.isUtf8) : true;
  const attrState = options.attrState || new TermChar(" ");
  const tokens = [];

  let i = 0;
  while (i < n) {
    const b = bytes[i];

    // 1. Telnet IAC (0xFF)
    if (b === IAC) {
      if (i + 1 < n) {
        const cmd = bytes[i + 1];
        if (cmd === IAC) {
          const slice = bytes.subarray(i, i + 2);
          tokens.push({
            type: "iac",
            bytes: slice,
            hex: bytesToHex(slice),
            tooltip: "IAC: Escaped 0xFF",
          });
          i += 2;
          continue;
        }
        if (cmd === WILL || cmd === WONT || cmd === DO || cmd === DONT) {
          const cmdName = TELNET_CMD_NAMES[cmd];
          if (i + 2 < n) {
            const opt = bytes[i + 2];
            const slice = bytes.subarray(i, i + 3);
            tokens.push({
              type: "iac",
              bytes: slice,
              hex: bytesToHex(slice),
              tooltip: `IAC: ${cmdName} ${getTelnetOptName(opt)}`,
            });
            i += 3;
            continue;
          }
        }
        if (cmd === SB) {
          let end = i + 2;
          while (end < n) {
            if (bytes[end] === IAC && bytes[end + 1] === SE) {
              end += 2;
              break;
            }
            end++;
          }
          const slice = bytes.subarray(i, end);
          const sbPayload =
            end >= i + 4 && bytes[end - 2] === IAC && bytes[end - 1] === SE
              ? bytes.subarray(i + 2, end - 2)
              : bytes.subarray(i + 2, end);
          tokens.push({
            type: "iac",
            bytes: slice,
            hex: bytesToHex(slice),
            tooltip: describeTelnetSubnegotiation(sbPayload),
          });
          i = end;
          continue;
        }
        const cmdName =
          TELNET_CMD_NAMES[cmd] || `0x${cmd.toString(16).toUpperCase()}`;
        const slice = bytes.subarray(i, i + 2);
        tokens.push({
          type: "iac",
          bytes: slice,
          hex: bytesToHex(slice),
          tooltip: `IAC: ${cmdName}`,
        });
        i += 2;
        continue;
      }
      const slice = bytes.subarray(i, i + 1);
      tokens.push({
        type: "iac",
        bytes: slice,
        hex: bytesToHex(slice),
        tooltip: "IAC (0xFF)",
      });
      i += 1;
      continue;
    }

    // 2. ANSI Escape Sequence (0x1B)
    if (b === 0x1b && i + 1 < n) {
      const next = bytes[i + 1];

      // 2a. CSI Sequence: ESC [ ... finalByte (0x40..0x7E)
      if (next === 0x5b) {
        let j = i + 2;
        while (j < n && (bytes[j] < 0x40 || bytes[j] > 0x7e)) {
          j++;
        }
        if (j < n) {
          const finalChar = String.fromCharCode(bytes[j]);
          const body = String.fromCharCode(...bytes.subarray(i + 2, j));
          const slice = bytes.subarray(i, j + 1);

          // XTerm Locator SGR Mouse Report: ESC [ < Cb ; Cx ; Cy M/m
          if (body.startsWith("<") && (finalChar === "M" || finalChar === "m")) {
            tokens.push({
              type: "locator",
              bytes: slice,
              hex: bytesToHex(slice),
              tooltip: describeXtermLocatorSGR(body, finalChar),
            });
            i = j + 1;
            continue;
          }

          // DEC Private Mode Set / Reset: ESC [ ? Pm h / l
          if (body.startsWith("?") && (finalChar === "h" || finalChar === "l")) {
            const modes = body
              .slice(1)
              .split(";")
              .map((s) => parseInt(s, 10))
              .filter((v) => Number.isFinite(v));
            const actionWord = finalChar === "h" ? "Enable" : "Disable";

            if (modes.includes(2026)) {
              tokens.push({
                type: "dec2026",
                bytes: slice,
                hex: bytesToHex(slice),
                tooltip:
                  finalChar === "h"
                    ? "DEC 2026: Begin Synchronized Update (CSI ? 2026 h)"
                    : "DEC 2026: End Synchronized Update (CSI ? 2026 l)",
              });
              i = j + 1;
              continue;
            }

            if (modes.some((m) => DEC_MOUSE_MODE_NAMES[m])) {
              const modeLabels = modes.map(
                (m) => DEC_MOUSE_MODE_NAMES[m] || `?${m}`
              );
              tokens.push({
                type: "locator",
                bytes: slice,
                hex: bytesToHex(slice),
                tooltip: `XTerm Locator: ${actionWord} ${modeLabels.join(", ")}`,
              });
              i = j + 1;
              continue;
            }

            const modeLabels = modes.map((m) => DEC_MODE_NAMES[m] || `?${m}`);
            tokens.push({
              type: "ansi",
              bytes: slice,
              hex: bytesToHex(slice),
              tooltip: `ANSI DEC${finalChar === "h" ? "SET" : "RST"}: ${modeLabels.join(", ")}`,
            });
            i = j + 1;
            continue;
          }

          // SGR Color / Rendition: ESC [ ... m
          if (finalChar === "m") {
            tokens.push({
              type: "sgr",
              bytes: slice,
              hex: bytesToHex(slice),
              tooltip: describeSGR(body, attrState),
            });
            i = j + 1;
            continue;
          }

          // Standard CSI Cursor / Screen / Keyboard commands
          tokens.push({
            type: "ansi",
            bytes: slice,
            hex: bytesToHex(slice),
            tooltip: describeCSI(body, finalChar),
          });
          i = j + 1;
          continue;
        }
      }

      // 2b. OSC Sequence: ESC ] ... BEL (0x07) or ST (ESC \)
      if (next === 0x5d) {
        let j = i + 2;
        let endIdx = -1;
        let payloadEnd = -1;
        while (j < n) {
          if (bytes[j] === 0x07) {
            payloadEnd = j;
            endIdx = j + 1;
            break;
          }
          if (bytes[j] === 0x1b && j + 1 < n && bytes[j + 1] === 0x5c) {
            payloadEnd = j;
            endIdx = j + 2;
            break;
          }
          j++;
        }
        if (endIdx !== -1) {
          const slice = bytes.subarray(i, endIdx);
          const oscBody = String.fromCharCode(
            ...bytes.subarray(i + 2, payloadEnd)
          );
          const semi = oscBody.indexOf(";");
          let tooltip = `ANSI OSC: ${oscBody}`;
          if (semi !== -1) {
            const code = oscBody.slice(0, semi);
            const arg = oscBody.slice(semi + 1);
            if (code === "0" || code === "2") {
              tooltip = `ANSI OSC: Set Window Title "${arg}"`;
            }
          }
          tokens.push({
            type: "ansi",
            bytes: slice,
            hex: bytesToHex(slice),
            tooltip,
          });
          i = endIdx;
          continue;
        }
      }

      // 2c. SS3 Sequence: ESC O <final>
      if (next === 0x4f && i + 2 < n) {
        const ch = String.fromCharCode(bytes[i + 2]);
        const ss3Map = {
          A: "ArrowUp",
          B: "ArrowDown",
          C: "ArrowRight",
          D: "ArrowLeft",
          H: "Home",
          F: "End",
          P: "F1",
          Q: "F2",
          R: "F3",
          S: "F4",
        };
        const slice = bytes.subarray(i, i + 3);
        tokens.push({
          type: "ansi",
          bytes: slice,
          hex: bytesToHex(slice),
          tooltip: `ANSI SS3: ${ss3Map[ch] || ch} (ESC O ${ch})`,
        });
        i += 3;
        continue;
      }

      // 2d. Single-character C1 / ESC sequences
      const c1Char = String.fromCharCode(next);
      const c1Map = {
        "7": "Save Cursor (DECSC)",
        "8": "Restore Cursor (DECRC)",
        D: "Index / Scroll Down (IND)",
        E: "Next Line (NEL)",
        M: "Reverse Index / Scroll Up (RI)",
      };
      const slice = bytes.subarray(i, i + 2);
      tokens.push({
        type: "ansi",
        bytes: slice,
        hex: bytesToHex(slice),
        tooltip: `ANSI ESC: ${c1Map[c1Char] || `ESC ${c1Char}`}`,
      });
      i += 2;
      continue;
    }

    // 3. Contiguous Printable UTF-8 Multi-byte Characters
    if (isUtf8 && b >= 0xc0) {
      let cur = i;
      let decodedRun = "";
      while (cur < n && bytes[cur] >= 0xc0) {
        const lead = bytes[cur];
        let expectedLen = 0;
        if ((lead & 0xe0) === 0xc0) expectedLen = 2;
        else if ((lead & 0xf0) === 0xe0) expectedLen = 3;
        else if ((lead & 0xf8) === 0xf0) expectedLen = 4;

        if (expectedLen < 2 || cur + expectedLen > n) break;
        let validCont = true;
        for (let k = 1; k < expectedLen; k++) {
          if ((bytes[cur + k] & 0xc0) !== 0x80) {
            validCont = false;
            break;
          }
        }
        if (!validCont) break;
        const charSlice = bytes.subarray(cur, cur + expectedLen);
        const decodedChar = utf8Decoder ? utf8Decoder.decode(charSlice) : "";
        if (!isPrintableUnicodeChar(decodedChar)) break;
        decodedRun += decodedChar;
        cur += expectedLen;
      }

      if (cur > i) {
        const slice = bytes.subarray(i, cur);
        tokens.push({
          type: "utf8",
          bytes: slice,
          hex: bytesToHex(slice),
          tooltip: `UTF8:${decodedRun}`,
        });
        i = cur;
        continue;
      }
    }

    // 4. Contiguous Printable Big5 / UAO Double-byte Characters (when in Big5 mode)
    if (!isUtf8 && b >= 0x81 && b <= 0xfe && i + 1 < n) {
      let cur = i;
      let decodedRun = "";
      while (cur + 1 < n && bytes[cur] >= 0x81 && bytes[cur] <= 0xfe) {
        const lead = bytes[cur];
        const trail = bytes[cur + 1];
        const isTrail =
          trail >= 0x40 && trail <= 0xfe && (trail <= 0x7e || trail >= 0xa1);
        const u = isTrail ? b2uTable[(lead << 8) | trail] : 0;
        if (!u) break;
        const decodedChar = String.fromCharCode(u);
        if (!isPrintableUnicodeChar(decodedChar)) break;
        decodedRun += decodedChar;
        cur += 2;
      }

      if (cur > i) {
        const slice = bytes.subarray(i, cur);
        tokens.push({
          type: "utf8",
          bytes: slice,
          hex: bytesToHex(slice),
          tooltip: `Big5:${decodedRun}`,
        });
        i = cur;
        continue;
      }
    }

    // 5. Contiguous Printable ASCII Characters (0x20..0x7E)
    if (b >= 0x20 && b <= 0x7e) {
      let end = i + 1;
      while (end < n && bytes[end] >= 0x20 && bytes[end] <= 0x7e) {
        end++;
      }
      const slice = bytes.subarray(i, end);
      const asciiStr = String.fromCharCode(...slice);
      tokens.push({
        type: "ascii",
        bytes: slice,
        hex: bytesToHex(slice),
        tooltip: `ASCII: "${asciiStr}"`,
      });
      i = end;
      continue;
    }

    // 6. Control Character / Unrecognized Single Byte
    const slice = bytes.subarray(i, i + 1);
    tokens.push({
      type: "ctrl",
      bytes: slice,
      hex: bytesToHex(slice),
      tooltip: describeSingleByte(b),
    });
    i += 1;
  }

  return tokens;
}

export class PacketDump extends PluginBase {
  static id = "packet_dump";
  static name = "packet_dump";
  static prefKey = "enablePacketDump";
  static group = "debug";
  static icon = "terminal";
  static defaultPrefs = {
    enablePacketDump: false,
  };

  static get title() {
    return _("plugin_packet_dump_title");
  }

  static get description() {
    return _("plugin_packet_dump_desc");
  }

  constructor(app, options = {}) {
    super(app, options);
    this.collapsed = false;
    this.overlay = null;
    this._createdOverlay = false;
    this.contentEl = null;
    this.tooltipEl = null;
    this.toggleBtn = null;
    this.currentSocket = null;
    this._recvAttrState = new TermChar(" ");
    this._sendAttrState = new TermChar(" ");
    this._onRecvBound = (e) => this._onRecv(e);
    this._onSendBound = (e) => this._onSend(e);
    this._onClearClickBound = (e) => {
      e.stopPropagation();
      this.clear();
    };
    this._onToggleClickBound = (e) => {
      e.stopPropagation();
      this.toggleCollapse();
    };
    this._onHeaderClickBound = (e) => {
      if (e.target && e.target.tagName !== "BUTTON") {
        this.toggleCollapse();
      }
    };
    this._onCloseClickBound = (e) => {
      e.stopPropagation();
      this.close();
    };
    this._onMouseOverBound = (e) => this._onTokenHover(e);
    this._onMouseMoveBound = (e) => this._onMouseMove(e);
    this._onMouseOutBound = (e) => this._onTokenOut(e);
  }

  onInit() {
    this.registerInputInterceptorWhileEnabled(this);
    this.listenApp("term:socket", (e) => {
      const socket = e?.socket ?? e?.detail?.socket;
      if (socket) {
        this.attachSocket(socket);
      }
    });
    const sock = this.app?.conn?.rawSocket || this.app?.conn;
    if (sock) {
      this.attachSocket(sock);
    }
  }

  scrollBottom() {
    if (this.contentEl) {
      this.contentEl.scrollTop = this.contentEl.scrollHeight;
    }
  }

  onEnable() {
    if (!this.currentSocket) {
      const sock = this.app?.conn?.rawSocket || this.app?.conn;
      if (sock) {
        this.attachSocket(sock);
      }
    }
    const overlay = this.ensureElement();
    if (overlay) {
      this.updateCharset();
      overlay.style.display = "flex";
      this.scrollBottom();
    }
  }

  onDisable() {
    this.hideTooltip();
    const el =
      this.overlay ||
      (typeof document !== "undefined"
        ? document.getElementById("packetDumpOverlay")
        : null);
    if (el) {
      el.style.display = "none";
    }
  }

  onDestroy() {
    this.hideTooltip();
    this.attachSocket(null);
    if (this.overlay) {
      if (this._createdOverlay && this.overlay.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay);
      } else {
        this.overlay.classList?.remove("collapsed");
        this.overlay.style.display = "none";
        this.overlay.innerHTML = "";
      }
    }
    this.collapsed = false;
    this.overlay = null;
    this._createdOverlay = false;
    this.contentEl = null;
    this.tooltipEl = null;
    this.charsetEl = null;
    this.toggleBtn = null;
  }

  isUtf8Mode() {
    const cs = String(
      this.app?.stream?.charset || this.app?.site?.charset || "big5"
    ).toLowerCase();
    return cs === "utf-8" || cs === "utf8";
  }

  getCharsetLabel() {
    const cs = String(
      this.app?.stream?.charset || this.app?.site?.charset || "big5"
    ).toLowerCase();
    return cs === "utf-8" || cs === "utf8" ? "UTF-8" : cs.toUpperCase();
  }

  updateCharset() {
    if (this.charsetEl) {
      this.charsetEl.textContent = this.getCharsetLabel();
    }
  }

  ensureElement() {
    if (this.overlay && this.contentEl) return this.overlay;
    if (typeof document === "undefined") return null;

    let overlay = document.getElementById("packetDumpOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "packetDumpOverlay";
      overlay.className = "nomouse_command";
      overlay.style.display = "none";
      document.body.appendChild(overlay);
      this._createdOverlay = true;
    } else if (overlay.classList) {
      if (!overlay.classList.contains("nomouse_command")) {
        overlay.classList.add("nomouse_command");
      }
    } else if (!String(overlay.className || "").includes("nomouse_command")) {
      overlay.className = `${overlay.className || ""} nomouse_command`.trim();
    }

    if (!overlay.querySelector || !overlay.querySelector("#packetDumpContent")) {
      overlay.innerHTML = `
        <div id="packetDumpHeader" class="nomouse_command">
          <div class="packet-dump-header-left nomouse_command">
            <span class="packet-dump-title nomouse_command">Packet Dump</span>
            <span id="packetDumpCharset" class="packet-dump-charset nomouse_command"></span>
            <span class="packet-dump-legend nomouse_command">
              <span class="packet-dump-legend-recv nomouse_command">■ Recv</span>
              <span class="packet-dump-legend-send nomouse_command">■ Send</span>
              <span class="packet-dump-badge packet-dump-token-sgr nomouse_command" title="ANSI SGR Color / Attributes">SGR</span>
              <span class="packet-dump-badge packet-dump-token-ansi nomouse_command" title="ANSI Escape Sequences (CSI / OSC / ESC)">ANSI</span>
              <span class="packet-dump-badge packet-dump-token-dec2026 nomouse_command" title="DEC 2026 Synchronized Update">DEC 2026</span>
              <span class="packet-dump-badge packet-dump-token-locator nomouse_command" title="XTerm Locator SGR Mouse Reporting">Locator</span>
              <span class="packet-dump-badge packet-dump-token-iac nomouse_command" title="Telnet IAC Commands & Negotiation">IAC</span>
              <span class="packet-dump-badge packet-dump-token-utf8 nomouse_command" title="UTF-8 / DBCS Multi-byte Characters">UTF-8</span>
            </span>
          </div>
          <div class="packet-dump-header-right nomouse_command">
            <button type="button" class="packet-dump-btn nomouse_command" id="packetDumpClearBtn" title="Clear">Clear</button>
            <button type="button" class="packet-dump-btn nomouse_command" id="packetDumpToggleBtn" title="Collapse / Expand">▼</button>
            <button type="button" class="packet-dump-btn nomouse_command" id="packetDumpCloseBtn" title="Close">✕</button>
          </div>
        </div>
        <div id="packetDumpContent" class="nomouse_command"></div>
        <div id="packetDumpTooltip" class="packet-dump-tooltip nomouse_command" style="display: none;"></div>
      `;
    }

    this.overlay = overlay;
    this.contentEl = overlay.querySelector("#packetDumpContent");
    this.tooltipEl = overlay.querySelector("#packetDumpTooltip");
    this.charsetEl = overlay.querySelector("#packetDumpCharset");
    this.toggleBtn = overlay.querySelector("#packetDumpToggleBtn");
    this.updateCharset();

    const clearBtn = overlay.querySelector("#packetDumpClearBtn");
    if (clearBtn) {
      this.listenWhileEnabled(clearBtn, "click", this._onClearClickBound);
    }

    if (this.toggleBtn) {
      this.listenWhileEnabled(this.toggleBtn, "click", this._onToggleClickBound);
    }

    const header = overlay.querySelector("#packetDumpHeader");
    if (header) {
      this.listenWhileEnabled(header, "click", this._onHeaderClickBound);
    }

    const closeBtn = overlay.querySelector("#packetDumpCloseBtn");
    if (closeBtn) {
      this.listenWhileEnabled(closeBtn, "click", this._onCloseClickBound);
    }

    if (this.contentEl) {
      this.listenWhileEnabled(this.contentEl, "mouseover", this._onMouseOverBound);
      this.listenWhileEnabled(this.contentEl, "mousemove", this._onMouseMoveBound);
      this.listenWhileEnabled(this.contentEl, "mouseout", this._onMouseOutBound);
    }

    return this.overlay;
  }

  _positionTooltip(tokenEl, e) {
    if (!this.tooltipEl || typeof tokenEl.getBoundingClientRect !== "function") return;
    const rect = tokenEl.getBoundingClientRect();
    const tipRect = this.tooltipEl.getBoundingClientRect();
    const vw = typeof window !== "undefined" ? window.innerWidth : 800;
    const vh = typeof window !== "undefined" ? window.innerHeight : 600;
    let left;
    let top;

    if (tokenEl.classList?.contains("packet-dump-rail")) {
      left = rect.right + 6;
      const mouseY = typeof e?.clientY === "number" ? e.clientY : rect.top + 10;
      top = mouseY - tipRect.height / 2;
    } else {
      left = rect.left + rect.width / 2 - tipRect.width / 2;
      top = rect.top - tipRect.height - 6;
    }

    left = Math.max(6, Math.min(vw - tipRect.width - 6, left));
    top = Math.max(6, Math.min(vh - tipRect.height - 6, top));
    this.tooltipEl.style.left = `${Math.round(left)}px`;
    this.tooltipEl.style.top = `${Math.round(top)}px`;
  }

  _onTokenHover(e) {
    if (!this.tooltipEl || !e?.target?.closest) return;
    const tokenEl = e.target.closest(".packet-dump-token, .packet-dump-rail");
    if (!tokenEl) {
      this.hideTooltip();
      return;
    }
    const text = tokenEl.getAttribute("data-tooltip") || tokenEl.getAttribute("title");
    if (!text) {
      this.hideTooltip();
      return;
    }
    this.tooltipEl.textContent = text;
    this.tooltipEl.style.display = "block";
    this._positionTooltip(tokenEl, e);
  }

  _onMouseMove(e) {
    if (!this.tooltipEl || this.tooltipEl.style.display === "none") return;
    const railEl = e?.target?.closest?.(".packet-dump-rail");
    if (!railEl) return;
    this._positionTooltip(railEl, e);
  }

  _onTokenOut(e) {
    if (!this.tooltipEl) return;
    const related = e?.relatedTarget;
    if (
      related?.closest &&
      related.closest(".packet-dump-token, .packet-dump-rail")
    ) {
      return;
    }
    this.hideTooltip();
  }

  hideTooltip() {
    if (this.tooltipEl) {
      this.tooltipEl.style.display = "none";
    }
  }

  attachSocket(socket) {
    if (this.currentSocket === socket) {
      return;
    }
    if (this.currentSocket) {
      this.unlisten(this.currentSocket, "rawRecv", this._onRecvBound);
      this.unlisten(this.currentSocket, "rawSend", this._onSendBound);
    }
    this.currentSocket = socket;
    if (this.currentSocket) {
      this.listenWhileEnabled(this.currentSocket, "rawRecv", this._onRecvBound);
      this.listenWhileEnabled(this.currentSocket, "rawSend", this._onSendBound);
    }
  }

  _onRecv(e) {
    if (!this.enabled) return;
    const data = e?.detail?.data ?? e?.data;
    if (data !== undefined) {
      this.log("recv", data);
    }
  }

  _onSend(e) {
    if (!this.enabled) return;
    const data = e?.detail?.data ?? e?.data;
    if (data !== undefined) {
      this.log("send", data);
    }
  }

  toggleCollapse() {
    this.collapsed = !this.collapsed;
    this.hideTooltip();
    if (this.overlay) {
      if (this.collapsed) {
        this.overlay.classList.add("collapsed");
      } else {
        this.overlay.classList.remove("collapsed");
      }
    }
    if (this.toggleBtn) {
      this.toggleBtn.textContent = this.collapsed ? "▲" : "▼";
    }
  }

  close() {
    this.setEnabled(false);
  }

  clear() {
    this.hideTooltip();
    this._recvAttrState.resetAttr();
    this._sendAttrState.resetAttr();
    if (this.contentEl) {
      this.contentEl.innerHTML = "";
    }
  }

  contains(target) {
    if (!this.overlay || !target) return false;
    return this.overlay === target || this.overlay.contains(target);
  }

  isActive() {
    return this.hasSelection();
  }

  getSelectionColRow() {
    return this.hasSelection() ? null : undefined;
  }

  getSelectedText() {
    if (this.hasSelection()) {
      return window.getSelection().toString();
    }
    return null;
  }

  hasSelection() {
    if (!this.overlay || typeof window === "undefined") return false;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return false;
    if (sel.anchorNode && this.overlay.contains(sel.anchorNode)) return true;
    if (sel.focusNode && this.overlay.contains(sel.focusNode)) return true;
    return false;
  }

  log(direction, data) {
    if (!this.enabled) return;
    this.ensureElement();
    this.updateCharset();
    if (!this.contentEl) return;

    let bytes = data;
    if (typeof data === "string") {
      bytes = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) {
        bytes[i] = data.charCodeAt(i) & 0xff;
      }
    } else if (data instanceof ArrayBuffer) {
      bytes = new Uint8Array(data);
    }

    if (!bytes || bytes.length === 0) return;

    const attrState =
      direction === "send" ? this._sendAttrState : this._recvAttrState;
    const tokens = parsePacket(bytes, {
      isUtf8: this.isUtf8Mode(),
      attrState,
    });
    if (tokens.length === 0) return;

    const item = document.createElement("div");
    item.className =
      "packet-dump-item packet-dump-" + direction + " nomouse_command";

    // Hover target over the left direction border showing the packet size.
    const rail = document.createElement("span");
    rail.className = "packet-dump-rail nomouse_command";
    const dirLabel = direction === "send" ? "Send" : "Recv";
    const sizeLabel = `${dirLabel}: ${bytes.length} byte${bytes.length === 1 ? "" : "s"}`;
    if (typeof rail.setAttribute === "function") {
      rail.setAttribute("data-tooltip", sizeLabel);
    } else {
      rail.title = sizeLabel;
    }
    item.appendChild(rail);

    for (let idx = 0; idx < tokens.length; idx++) {
      const tok = tokens[idx];
      const span = document.createElement("span");
      span.className = `packet-dump-token packet-dump-token-${tok.type} nomouse_command`;
      span.textContent = tok.hex;
      if (tok.tooltip) {
        if (typeof span.setAttribute === "function") {
          span.setAttribute("title", tok.tooltip);
          span.setAttribute("data-tooltip", tok.tooltip);
        } else {
          span.title = tok.tooltip;
        }
      }
      item.appendChild(span);
    }

    const isAtBottom =
      this.contentEl.scrollHeight -
        this.contentEl.scrollTop -
        this.contentEl.clientHeight <
      40;

    // Cap maximum log entries in DOM
    const MAX_ENTRIES = 2000;
    while (this.contentEl.childNodes.length >= MAX_ENTRIES) {
      this.contentEl.removeChild(this.contentEl.firstChild);
    }

    this.contentEl.appendChild(item);

    if (isAtBottom) {
      this.contentEl.scrollTop = this.contentEl.scrollHeight;
    }
  }
}

export default PacketDump;
