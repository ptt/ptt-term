export const TRUSTED_IMAGE_DOMAINS = [
  "imgur.com",
  "imgtok.com",
  "meee.com.tw",
  "duk.tw",
  "upload.cc",
  "ibb.co",
  "imgbb.com",
  "postimg.cc",
  "twimg.com",
  "gyazo.com",
];

export function isTrustedImageDomain(hostname) {
  if (!hostname) return false;
  const host = hostname.toLowerCase();
  return TRUSTED_IMAGE_DOMAINS.some(
    (domain) => host === domain || host.endsWith("." + domain)
  );
}

export function resolveImageUrl(href, whitelistOnly = true) {
  if (!href || typeof href !== "string") return null;

  let url;
  try {
    url = new URL(href);
  } catch (e) {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  const isTrusted = isTrustedImageDomain(hostname);

  if (whitelistOnly && !isTrusted) {
    return null;
  }

  // 1. Imgur resolver (supports with or without extension)
  const imgurMatch = href.match(
    /^https?:\/\/(?:[im]\.)?imgur\.com\/(?:gallery\/|a\/)?([a-zA-Z0-9]+)(?:\.([a-zA-Z0-9]+))?(?:[?#].*)?$/i
  );
  if (imgurMatch) {
    const photoId = imgurMatch[1];
    const ext = imgurMatch[2];
    if (ext && !/^(jpe?g|png|gif|webp|bmp)$/i.test(ext)) {
      return null;
    }
    return `https://i.imgur.com/${photoId}.${ext || "jpg"}`;
  }

  // 2. Twitter / X image CDN (pbs.twimg.com)
  if (hostname === "pbs.twimg.com" && url.pathname.startsWith("/media/")) {
    return href;
  }

  // 3. URLs with common image extensions (.jpg, .jpeg, .png, .gif, .webp, .bmp)
  const IMAGE_EXT_REGEX = /\.(jpe?g|png|gif|webp|bmp)(?:[?#].*)?$/i;
  if (IMAGE_EXT_REGEX.test(url.pathname + url.search)) {
    return href;
  }

  return null;
}

export function getImageRenderedSize(
  width,
  height,
  pageWidth = typeof window !== "undefined" ? window.innerWidth : 1024,
  pageHeight = typeof window !== "undefined" ? window.innerHeight : 768
) {
  const safeW = typeof width === "number" && !isNaN(width) && width > 0 ? width : null;
  const safeH = typeof height === "number" && !isNaN(height) && height > 0 ? height : 0;

  const maxW = pageWidth * 0.9;
  const maxH = pageHeight * 0.8;

  if (safeW && safeH) {
    const scale = Math.min(1, maxW / safeW, maxH / safeH);
    return {
      width: safeW * scale,
      height: safeH * scale,
    };
  }

  return {
    width: maxW,
    height: Math.min(maxH, safeH),
  };
}

export function getTop(
  top,
  height,
  pageHeight = typeof window !== "undefined" ? window.innerHeight : 768
) {
  const safeTop = typeof top === "number" && !isNaN(top) ? top : 20;
  const safeHeight = typeof height === "number" && !isNaN(height) ? height : 0;
  const clampedHeight = Math.min(pageHeight * 0.8, safeHeight);

  return Math.max(
    20,
    Math.min(pageHeight - 20 - clampedHeight, safeTop - clampedHeight / 2)
  );
}

export function getLeft(
  left,
  width,
  pageWidth = typeof window !== "undefined" ? window.innerWidth : 1024
) {
  const safeLeft = typeof left === "number" && !isNaN(left) ? left : 20;
  const safeWidth = typeof width === "number" && !isNaN(width) ? width : 0;

  // Place 20px to the right of cursor by default.
  // If placing on the right would exceed the page margin, flip to the left of cursor.
  if (safeLeft + 20 + safeWidth > pageWidth - 20) {
    return Math.max(20, safeLeft - 20 - safeWidth);
  }
  return safeLeft + 20;
}

export function getPopupPosition(
  left,
  top,
  popupWidth = 200,
  popupHeight = 36,
  pageWidth = typeof window !== "undefined" ? window.innerWidth : 1024,
  pageHeight = typeof window !== "undefined" ? window.innerHeight : 768
) {
  const safeLeft = typeof left === "number" && !isNaN(left) ? left : 20;
  const safeTop = typeof top === "number" && !isNaN(top) ? top : 20;

  let x = safeLeft + 20;
  if (x + popupWidth > pageWidth - 20) {
    x = Math.max(20, safeLeft - 20 - popupWidth);
  }

  let y = safeTop - popupHeight / 2;
  y = Math.max(20, Math.min(pageHeight - 20 - popupHeight, y));

  return { left: x, top: y };
}

export const initialImagePreviewState = {
  currentImagePreview: undefined,
  previewHref: undefined,
  left: undefined,
  top: undefined,
};

export const resetImagePreviewState = () => ({
  currentImagePreview: undefined,
  previewHref: undefined,
  left: undefined,
  top: undefined,
});

export const updateImagePreviewMove = (state, clientX, clientY) => {
  if (
    state &&
    state.currentImagePreview &&
    (state.left === undefined || state.top === undefined)
  ) {
    return { left: clientX, top: clientY };
  }
  return null;
};


