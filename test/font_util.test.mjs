import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseFontList,
  serializeFontList,
  PRESET_FONTS,
} from "../src/js/font_util.js";

test("parseFontList correctly handles quoted and unquoted font names", () => {
  const input =
    "MingLiu,SymMingLiu,'Noto Sans Mono CJK TC',\"PingFang TC\",monospace";
  const expected = [
    "MingLiu",
    "SymMingLiu",
    "Noto Sans Mono CJK TC",
    "PingFang TC",
    "monospace",
  ];
  assert.deepEqual(parseFontList(input), expected);
});

test("parseFontList handles spaces and empty segments gracefully", () => {
  const input = "  MingLiu , ,  'Noto Sans' ,   monospace  ";
  const expected = ["MingLiu", "Noto Sans", "monospace"];
  assert.deepEqual(parseFontList(input), expected);
});

test("parseFontList handles empty or non-string inputs", () => {
  assert.deepEqual(parseFontList(""), []);
  assert.deepEqual(parseFontList(null), []);
  assert.deepEqual(parseFontList(undefined), []);
  assert.deepEqual(parseFontList(123), []);
});

test("serializeFontList quotes names with spaces and preserves existing quotes", () => {
  const list = [
    "MingLiu",
    "Noto Sans Mono CJK TC",
    '"PingFang TC"',
    "monospace",
  ];
  const expected =
    "MingLiu, 'Noto Sans Mono CJK TC', \"PingFang TC\", monospace";
  assert.equal(serializeFontList(list), expected);
});

test("serializeFontList handles empty or non-array inputs", () => {
  assert.equal(serializeFontList([]), "");
  assert.equal(serializeFontList(null), "");
  assert.equal(serializeFontList(undefined), "");
});

test("parseFontList and serializeFontList round-trip without data loss", () => {
  const original = [
    "MingLiu",
    "SymMingLiu",
    "Noto Sans Mono CJK TC",
    "PingFang TC",
    "monospace",
  ];
  const serialized = serializeFontList(original);
  const reParsed = parseFontList(serialized);
  assert.deepEqual(reParsed, original);
});

test("PRESET_FONTS includes standard terminal fonts", () => {
  assert(PRESET_FONTS.includes("MingLiu"));
  assert(PRESET_FONTS.includes("SymMingLiu"));
  assert(PRESET_FONTS.includes("Noto Sans Mono CJK TC"));
  assert(PRESET_FONTS.includes("monospace"));
});
