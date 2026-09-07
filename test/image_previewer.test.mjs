import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRUSTED_IMAGE_DOMAINS,
  isTrustedImageDomain,
  resolveImageUrl,
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
