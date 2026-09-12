/**
 * Browser engine and capability quirks detection.
 *
 * Provides API/engine feature-level detection for browser-specific quirks,
 * avoiding fragile User-Agent sniffing while supporting URL overrides
 * (?safari=1/0, ?firefox=1/0) for testing and debugging.
 */

function getQueryParam(variable) {
  if (typeof window === "undefined" || !window.location) return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(variable);
  } catch (e) {
    return null;
  }
}

/**
 * Detects whether the current environment requires DOM selection preservation
 * (e.g. Gecko / Firefox clearing window.getSelection() when focusing an input element
 * or when right-clicking outside the selected text).
 *
 * Uses Gecko engine feature detection:
 * - CSS.supports("-moz-appearance", "none")
 *
 * Supports ?firefox=1 / ?firefox=0 URL parameter override for debugging.
 */
export function shouldPreserveDomSelection() {
  const param = getQueryParam("firefox");
  if (param === "1" || param === "true") return true;
  if (param === "0" || param === "false") return false;

  if (typeof CSS !== "undefined" && typeof CSS.supports === "function") {
    if (CSS.supports("-moz-appearance", "none")) {
      return true;
    }
  }

  return false;
}
