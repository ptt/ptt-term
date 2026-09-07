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
