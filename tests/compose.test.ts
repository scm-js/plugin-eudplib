import { describe, expect, it } from "vitest";
import { BadRequest, composeEds, normalizeSections, normalizeSources } from "../src/compose";

describe("normalizeSections", () => {
  it("keeps strings, turns numbers into strings and trims", () => {
    expect(normalizeSections({ chatEvent: { __addr__: "0x58C580", "-heal": 2, " k ": " v " } })).toEqual({ chatEvent: { __addr__: "0x58C580", "-heal": "2", k: "v" } });
  });
  it("refuses what is not a section", () => {
    expect(() => normalizeSections({})).toThrow(BadRequest);
    expect(() => normalizeSections([])).toThrow(BadRequest);
    expect(() => normalizeSections({ eudTurbo: "yes" })).toThrow(/must be an object/);
    expect(() => normalizeSections({ "bad name": {} })).toThrow(/Bad plugin name/);
    expect(() => normalizeSections({ main: {} })).toThrow(/library's own/);
  });
  it("refuses keys and values a .eds could not carry", () => {
    expect(() => normalizeSections({ x: { "a:b": "1" } })).toThrow(/Bad setting name/);
    expect(() => normalizeSections({ x: { a: "" } })).toThrow(/Bad value/);
    expect(() => normalizeSections({ x: { a: "one\ntwo" } })).toThrow(/Bad value/);
    expect(() => normalizeSections({ x: { a: true } })).toThrow(/Bad value/);
    expect(() => normalizeSections({ x: { a: Infinity } })).toThrow(/Bad value/);
  });
  it("refuses a value that names a file", () => {
    expect(() => normalizeSections({ x: { a: "C:\\maps/x" } })).toThrow(/may not name a file/);
    expect(() => normalizeSections({ x: { a: "..\\evil.py" } })).toThrow(/may not name a file/);
    expect(normalizeSections({ x: { a: "^-give .*.*$" } }).x.a).toBe("^-give .*.*$");
  });
  it("bounds the size", () => {
    expect(() => normalizeSections({ x: { a: "v".repeat(70_000) } })).toThrow(/too long/);
  });
});

describe("composeEds", () => {
  it("writes one section per plugin in order", () => {
    expect(composeEds({ chatEvent: { __addr__: "0x1", "-heal": "2" }, eudTurbo: {} })).toBe("[chatEvent]\n__addr__ : 0x1\n-heal : 2\n[eudTurbo]\n");
  });
});

describe("normalizeSources", () => {
  it("takes module name → source and nothing else", () => {
    expect(normalizeSources(undefined)).toEqual({});
    expect(normalizeSources({ magenta: "x = 1" })).toEqual({ magenta: "x = 1" });
    expect(() => normalizeSources({ "../x": "" })).toThrow(/module name/);
    expect(() => normalizeSources({ ok: 5 })).toThrow(/Bad source/);
    expect(() => normalizeSources("code")).toThrow(BadRequest);
  });
});
