import { B2U_PATCH, U2B_PATCH } from "./uao_patch.js";

export const b2uTable = new Uint16Array(65536);
export const u2bTable = new Uint16Array(65536);

let isInitialized = false;
const initListeners = [];

export function addUAOInitListener(listener) {
  if (typeof listener !== "function") return;
  if (isInitialized) {
    listener();
  }
  initListeners.push(listener);
}

function decodeBase64ToUint16(b64) {
  if (typeof Uint8Array.fromBase64 === "function") {
    const bytes = Uint8Array.fromBase64(b64);
    return new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  }
  if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
    const buf = Buffer.from(b64, "base64");
    return new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
  }
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}

export function initUAO() {
  if (isInitialized) {
    return;
  }

  const td = new TextDecoder("big5");
  const chunk = new Uint8Array(2);

  // Scan standard Big5 ranges with native TextDecoder
  for (let hi = 0x81; hi <= 0xfe; hi++) {
    chunk[0] = hi;
    for (let lo = 0x40; lo <= 0xfe; lo++) {
      if (lo > 0x7e && lo < 0xa1) continue;
      chunk[1] = lo;
      const s = td.decode(chunk);
      if (s.length === 1 && s !== "\ufffd") {
        const u = s.charCodeAt(0);
        const b = (hi << 8) | lo;
        b2uTable[b] = u;
        u2bTable[u] = b;
      }
    }
  }

  // Apply UAO 2.50 b2u patch (and invert into u2b)
  const b2uPatchData = decodeBase64ToUint16(B2U_PATCH);
  for (let i = 0; i < b2uPatchData.length; i += 2) {
    const b = b2uPatchData[i];
    const u = b2uPatchData[i + 1];
    b2uTable[b] = u;
    if (u) u2bTable[u] = b;
  }

  // Apply UAO 2.50 u2b alias patch
  const u2bPatchData = decodeBase64ToUint16(U2B_PATCH);
  for (let i = 0; i < u2bPatchData.length; i += 2) {
    const u = u2bPatchData[i];
    const b = u2bPatchData[i + 1];
    u2bTable[u] = b;
  }

  // Setup window.lib backward compatibility
  if (typeof window !== "undefined") {
    window.lib = window.lib || {};
    window.lib.b2uTable = b2uTable;
    window.lib.u2bTable = u2bTable;

    let _b2uArray = null;
    let _u2bArray = null;

    if (!window.lib.b2uArray) {
      Object.defineProperty(window.lib, "b2uArray", {
        configurable: true,
        enumerable: true,
        get() {
          if (!_b2uArray) {
            _b2uArray = new Uint8Array(131072);
            for (let i = 0; i < 65536; i++) {
              const c = b2uTable[i];
              _b2uArray[2 * i] = c >> 8;
              _b2uArray[2 * i + 1] = c & 0xff;
            }
          }
          return _b2uArray;
        }
      });
    }

    if (!window.lib.u2bArray) {
      Object.defineProperty(window.lib, "u2bArray", {
        configurable: true,
        enumerable: true,
        get() {
          if (!_u2bArray) {
            _u2bArray = new Uint8Array(131072);
            for (let i = 0; i < 65536; i++) {
              const c = u2bTable[i] || 0xfffd;
              _u2bArray[2 * i] = c >> 8;
              _u2bArray[2 * i + 1] = c & 0xff;
            }
          }
          return _u2bArray;
        }
      });
    }
  }

  isInitialized = true;
  for (const listener of initListeners) {
    try {
      listener();
    } catch (err) {
      console.error("Error in UAO init listener:", err);
    }
  }
}

// Automatically initialize tables on module load
initUAO();
