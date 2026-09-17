import { describe, expect, it } from "vitest";
import { CACHE_NAME, downloadBytes, PYODIDE_BASE, RELEASE_BASE, runtimeFiles, runtimeUrls } from "../src/urls";
import { PYODIDE_VERSION, VERSION, WHEEL_FILE } from "../src/version";

describe("runtimeUrls", () => {
  it("fetches from this release's tag when the plugin was loaded through a blob or compiled in", () => {
    for (const entry of ["blob:https://editor.scmjs.dev/abc", "app://scmjs/assets/plugin-eudplib-1a2b.js"]) {
      const u = runtimeUrls(entry, null);
      expect(u.worker).toBe(`${RELEASE_BASE}dist/worker.js`);
      expect(u.wheel).toBe(`${RELEASE_BASE}dist/${WHEEL_FILE}`);
      expect(u.pyodideBase).toBe(PYODIDE_BASE);
    }
    expect(RELEASE_BASE).toContain(`@v${VERSION}/`);
    expect(PYODIDE_BASE).toContain(`/v${PYODIDE_VERSION}/`);
  });
  it("follows an http(s) module URL for a plugin served from a dev server", () => {
    for (const entry of ["http://localhost:5174/plugin-eudplib/dist/plugin.js", "http://localhost:5174/plugin-eudplib/plugin.ts"]) {
      const u = runtimeUrls(entry, undefined);
      expect(u.worker).toBe("http://localhost:5174/plugin-eudplib/dist/worker.js");
      expect(u.wheel).toBe(`http://localhost:5174/plugin-eudplib/dist/${WHEEL_FILE}`);
    }
  });
  it("lets the runtimeBase setting win", () => {
    const u = runtimeUrls("blob:x", "http://localhost:8080");
    expect(u.worker).toBe("http://localhost:8080/dist/worker.js");
    expect(u.wheel).toBe(`http://localhost:8080/dist/${WHEEL_FILE}`);
  });
});

describe("runtimeFiles", () => {
  it("lists every file a first build fetches, each with a size", () => {
    const files = runtimeFiles(runtimeUrls("blob:x", null));
    const names = files.map((f) => f.url.split("/").pop());
    expect(names).toEqual(["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json", "typing_extensions-4.15.0-py3-none-any.whl", WHEEL_FILE, "worker.js"]);
    expect(new Set(files.map((f) => f.url)).size).toBe(files.length);
    for (const f of files) expect(f.bytes).toBeGreaterThan(0);
    const mb = downloadBytes(runtimeUrls("blob:x", null)) / 1e6;
    expect(mb).toBeGreaterThan(13);
    expect(mb).toBeLessThan(16);
  });
  it("names the cache after the versions that decide its contents", () => {
    expect(CACHE_NAME).toContain(VERSION);
    expect(CACHE_NAME).toContain(PYODIDE_VERSION);
  });
});
