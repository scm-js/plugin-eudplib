import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EUDPLIB_VERSION, VERSION, WHEEL_FILE } from "../src/version";

describe("the version", () => {
  it("is the manifest's and the package's", () => {
    const manifest = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(manifest.version).toBe(VERSION);
    expect(pkg.version).toBe(VERSION);
  });
  it("names the wheel that is in dist/", () => {
    expect(WHEEL_FILE).toContain(EUDPLIB_VERSION);
    expect(() => readFileSync(new URL(`../dist/${WHEEL_FILE}`, import.meta.url))).not.toThrow();
  });
});
