import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRUSTED_IMAGE_DOMAINS,
  isTrustedImageDomain,
  resolveImageUrl,
  getImageRenderedSize,
  getTop,
  getLeft,
  getPopupPosition,
  updateImagePreviewMove,
  initialImagePreviewState,
  resetImagePreviewState,
} from "../src/js/image_preview_util.js";

test("isTrustedImageDomain correctly identifies trusted image domains and subdomains", () => {
  // Direct trusted domains
  assert.equal(isTrustedImageDomain("imgur.com"), true);
  assert.equal(isTrustedImageDomain("i.imgur.com"), true);
  assert.equal(isTrustedImageDomain("m.imgur.com"), true);
  assert.equal(isTrustedImageDomain("imgtok.com"), true);
  assert.equal(isTrustedImageDomain("i.imgtok.com"), true);
  assert.equal(isTrustedImageDomain("meee.com.tw"), true);
  assert.equal(isTrustedImageDomain("i.meee.com.tw"), true);
  assert.equal(isTrustedImageDomain("duk.tw"), true);
  assert.equal(isTrustedImageDomain("upload.cc"), true);
  assert.equal(isTrustedImageDomain("ibb.co"), true);
  assert.equal(isTrustedImageDomain("i.ibb.co"), true);
  assert.equal(isTrustedImageDomain("imgbb.com"), true);
  assert.equal(isTrustedImageDomain("postimg.cc"), true);
  assert.equal(isTrustedImageDomain("i.postimg.cc"), true);
  assert.equal(isTrustedImageDomain("pbs.twimg.com"), true);
  assert.equal(isTrustedImageDomain("gyazo.com"), true);
  assert.equal(isTrustedImageDomain("i.gyazo.com"), true);

  // Untrusted / spoofed domains
  assert.equal(isTrustedImageDomain("fakeimgur.com"), false);
  assert.equal(isTrustedImageDomain("notmeee.com.tw"), false);
  assert.equal(isTrustedImageDomain("evil.com"), false);
  assert.equal(isTrustedImageDomain("192.168.1.1"), false);
  assert.equal(isTrustedImageDomain("localhost"), false);
  assert.equal(isTrustedImageDomain(""), false);
  assert.equal(isTrustedImageDomain(null), false);
});

test("resolveImageUrl resolves Imgur links with or without extension", () => {
  // With extension
  assert.equal(
    resolveImageUrl("https://i.imgur.com/abc1234.png"),
    "https://i.imgur.com/abc1234.png"
  );
  // Without extension (defaults to jpg)
  assert.equal(
    resolveImageUrl("https://imgur.com/abc1234"),
    "https://i.imgur.com/abc1234.jpg"
  );
  assert.equal(
    resolveImageUrl("http://m.imgur.com/gallery/xyz987"),
    "https://i.imgur.com/xyz987.jpg"
  );
});

test("resolveImageUrl resolves modern PTT trusted hosts when whitelist is ON", () => {
  assert.equal(
    resolveImageUrl("https://meee.com.tw/photo1.png", true),
    "https://meee.com.tw/photo1.png"
  );
  assert.equal(
    resolveImageUrl("https://imgtok.com/i/abc.jpg", true),
    "https://imgtok.com/i/abc.jpg"
  );
  assert.equal(
    resolveImageUrl("https://duk.tw/demo.webp", true),
    "https://duk.tw/demo.webp"
  );
  assert.equal(
    resolveImageUrl("https://upload.cc/i1/2024/test.jpg", true),
    "https://upload.cc/i1/2024/test.jpg"
  );
  assert.equal(
    resolveImageUrl(
      "https://pbs.twimg.com/media/F12345?format=jpg&name=orig",
      true
    ),
    "https://pbs.twimg.com/media/F12345?format=jpg&name=orig"
  );
});

test("resolveImageUrl blocks untrusted domains when whitelist is ON", () => {
  assert.equal(resolveImageUrl("https://evil.com/tracker.jpg", true), null);
  assert.equal(resolveImageUrl("http://192.168.1.1/reboot.png", true), null);
  assert.equal(resolveImageUrl("https://unknown-host.org/pic.png", true), null);
});

test("resolveImageUrl allows untrusted image extensions when whitelist is OFF", () => {
  assert.equal(
    resolveImageUrl("https://arbitrary-host.com/picture.jpg", false),
    "https://arbitrary-host.com/picture.jpg"
  );
  assert.equal(
    resolveImageUrl("https://arbitrary-host.com/picture.png?w=800", false),
    "https://arbitrary-host.com/picture.png?w=800"
  );
});

test("resolveImageUrl rejects non-image or invalid URLs regardless of whitelist", () => {
  assert.equal(resolveImageUrl("https://google.com", false), null);
  assert.equal(resolveImageUrl("https://imgur.com/evil.html", false), null);
  assert.equal(resolveImageUrl("javascript:alert(1)", false), null);
  assert.equal(resolveImageUrl("not-a-url", false), null);
  assert.equal(resolveImageUrl("", false), null);
  assert.equal(resolveImageUrl(null, false), null);
});

test("getImageRenderedSize accurately scales images based on aspect ratio and viewport", () => {
  // 1. Image fits within bounds (no scaling)
  const fit = getImageRenderedSize(400, 300, 1000, 1000);
  assert.equal(fit.width, 400);
  assert.equal(fit.height, 300);

  // 2. Tall portrait mobile screenshot (1080x2400) constrained by maxH (80% of 1080 = 864)
  const tall = getImageRenderedSize(1080, 2400, 1920, 1080);
  assert.equal(tall.height, 864);
  assert.equal(tall.width, 1080 * (864 / 2400));

  // 3. Wide landscape image (2000x1000) constrained by maxW (90% of 1000 = 900)
  const wide = getImageRenderedSize(2000, 1000, 1000, 800);
  assert.equal(wide.width, 900);
  assert.equal(wide.height, 450);

  // 4. Missing width fallback
  const fallback = getImageRenderedSize(undefined, 2000, 1000, 800);
  assert.equal(fallback.height, 640);
  assert.equal(fallback.width, 900);
});

test("getTop fixes Issue #120 and cleanly clamps image preview within page bounds", () => {
  const pageHeight = 900;

  // Issue #120 regression test: tall image hovered near bottom
  // Old logic returned negative numbers (e.g. 900 - 20 - 2400 = -1520), jumping outside the top border.
  // New logic clamps properly to stay inside [20, pageHeight - 20 - height]
  const topBottomHover = getTop(850, 720, pageHeight);
  assert.equal(topBottomHover, 160); // 900 - 20 - 720 = 160 >= 20
  assert(topBottomHover >= 20);

  // Unscaled height passed directly
  const unscaled = getTop(850, 2400, pageHeight);
  assert.equal(unscaled, 160);
  assert(unscaled >= 20);

  // Hover near top boundary: clamped to top margin 20
  const topNearTop = getTop(50, 300, pageHeight);
  assert.equal(topNearTop, 20);

  // Hover in middle: perfectly centered on cursor
  const topMiddle = getTop(500, 300, pageHeight);
  assert.equal(topMiddle, 350); // 500 - 150 = 350
});

test("getLeft keeps preview in viewport and flips to cursor left if exceeding page width", () => {
  const pageWidth = 1000;

  // Normal position: 20px right of cursor
  assert.equal(getLeft(200, 300, pageWidth), 220);

  // Near right edge: flips to left of cursor
  // 800 + 20 + 300 = 1120 > 980 -> flips to 800 - 20 - 300 = 480
  assert.equal(getLeft(800, 300, pageWidth), 480);

  // Very wide image near right edge: clamped to minimum margin 20
  assert.equal(getLeft(900, 950, pageWidth), 20);
});

test("getPopupPosition positions popup next to cursor and flips if near right edge", () => {
  const pageWidth = 1000;
  const pageHeight = 800;

  // Normal position: 20px right of cursor
  const normal = getPopupPosition(200, 300, 200, 36, pageWidth, pageHeight);
  assert.equal(normal.left, 220);
  assert.equal(normal.top, 282); // 300 - 18

  // Near right edge: flips to left of cursor
  const flipped = getPopupPosition(850, 300, 200, 36, pageWidth, pageHeight);
  assert.equal(flipped.left, 630); // 850 - 20 - 200 = 630

  // Clamped at top and bottom margins
  const topClamped = getPopupPosition(100, 10, 200, 36, pageWidth, pageHeight);
  assert.equal(topClamped.top, 20);

  const bottomClamped = getPopupPosition(100, 790, 200, 36, pageWidth, pageHeight);
  assert.equal(bottomClamped.top, 744); // 800 - 20 - 36 = 744
});

test("updateImagePreviewMove anchors position and avoids jittering on mouse move", () => {
  const activeState = {
    currentImagePreview: Promise.resolve({ src: "test.jpg" }),
    previewHref: "https://example.com/test.jpg",
    left: 200,
    top: 300,
  };

  // Once left and top are anchored, mouse move should return null (no re-render or canvas redraw)
  assert.equal(updateImagePreviewMove(activeState, 205, 305), null);

  // If left or top is undefined (unanchored), updates position
  const unanchoredState = {
    currentImagePreview: Promise.resolve({ src: "test.jpg" }),
    previewHref: "https://example.com/test.jpg",
    left: undefined,
    top: undefined,
  };
  assert.deepEqual(updateImagePreviewMove(unanchoredState, 205, 305), {
    left: 205,
    top: 305,
  });

  // If no preview is active, returns null
  assert.equal(updateImagePreviewMove(initialImagePreviewState, 205, 305), null);
});

