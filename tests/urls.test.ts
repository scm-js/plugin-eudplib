import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUNDLED_PATH, bundledUrls, CACHE_NAME, downloadBytes, findBundled, PYODIDE_BASE, RELEASE_BASE, runtimeFiles, runtimeManifest, runtimeUrls } from "../src/urls";
import { PYODIDE_VERSION, VERSION, WHEEL_FILE } from "../src/version";

describe("runtimeUrls", () => {
  it("fetches from this release's tag when the plugin was loaded through a blob or compiled in", () => {
    for (const entry of ["blob:https://editor.scmjs.dev/abc", "app://scmjs/assets/plugin-eudplib-1a2b.js", "https://editor.scmjs.dev/assets/plugin-l5040aOV.js", "http://intranet:8080/scmjs/assets/plugin-1a2b.js"]) {
      const u = runtimeUrls(entry, null);
      expect(u.worker).toBe(`${RELEASE_BASE}dist/worker.js`);
      expect(u.wheel).toBe(`${RELEASE_BASE}dist/${WHEEL_FILE}`);
      expect(u.pyodideBase).toBe(PYODIDE_BASE);
    }
    expect(RELEASE_BASE).toContain(`@v${VERSION}/`);
    expect(PYODIDE_BASE).toContain(`/v${PYODIDE_VERSION}/`);
  });
  it("follows an http(s) module URL for a plugin served from a dev server", () => {
    for (const entry of ["http://localhost:5174/plugin-eudplib/dist/plugin.js", "http://localhost:5174/plugin-eudplib/plugin.ts", "http://localhost:5174/plugin-eudplib/plugin.ts?t=1726650000"]) {
      const u = runtimeUrls(entry, undefined);
      expect(u.worker).toBe("http://localhost:5174/plugin-eudplib/dist/worker.js");
      expect(u.wheel).toBe(`http://localhost:5174/plugin-eudplib/dist/${WHEEL_FILE}`);
    }
  });
  it("follows a dev server on another origin than the editor's page", () => {
    const u = runtimeUrls("http://localhost:5174/plugin-eudplib/plugin.ts", null, "http://localhost:5173/?nosplash");
    expect(u.worker).toBe("http://localhost:5174/plugin-eudplib/dist/worker.js");
  });
  it("takes the editor's own copy of the source, on the page's origin, for a compiled-in plugin", () => {
    for (const entry of ["http://localhost:5173/plugins/eudplib/plugin.ts", "http://localhost:5173/plugins/eudplib/plugin.ts?t=1726650000"]) {
      const u = runtimeUrls(entry, null, "http://localhost:5173/?nosplash");
      expect(u.worker).toBe(`${RELEASE_BASE}dist/worker.js`);
      expect(u.wheel).toBe(`${RELEASE_BASE}dist/${WHEEL_FILE}`);
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

describe("runtime.json", () => {
  it("is current: npm run manifest writes it", () => {
    expect(JSON.parse(readFileSync(new URL("../runtime.json", import.meta.url), "utf8"))).toEqual(runtimeManifest());
  });
  it("puts every file a build fetches where the bundled addresses look for it", () => {
    const base = "app://scmjs/plugin-runtime/eudplib/x/";
    const wanted = runtimeFiles(bundledUrls(base)).map((f) => f.url);
    const loaded = runtimeManifest().files.filter((f) => !f.path.startsWith("licenses/"));
    expect(loaded.map((f) => base + f.path)).toEqual(wanted);
  });
  it("gets each file from the address a download would use", () => {
    const cdn = runtimeFiles(runtimeUrls("blob:x", null)).map((f) => f.url);
    const loaded = runtimeManifest().files.filter((f) => !f.path.startsWith("licenses/"));
    expect(loaded.map((f) => new URL(f.from, RELEASE_BASE).href)).toEqual(cdn);
  });
  it("carries the licences of what it redistributes, each a file in this repository or at a pinned address", () => {
    const licenses = runtimeManifest().files.filter((f) => f.path.startsWith("licenses/"));
    expect(licenses.map((f) => f.path.split("/").pop())).toEqual(["LICENSE", "ATTRIBUTION.md", "euddraft-LICENSE.txt", "pyodide-LICENSE"]);
    for (const f of licenses) {
      if (f.from.startsWith("https://")) expect(f.from).toContain(PYODIDE_VERSION);
      else expect(() => readFileSync(new URL(`../${f.from}`, import.meta.url))).not.toThrow();
    }
  });
});

describe("findBundled", () => {
  const manifest = JSON.stringify(runtimeManifest());
  const answering = (status: number, body: string) => {
    const asked: string[] = [];
    const fetcher = (async (url: string) => { asked.push(url); return new Response(body, { status }); }) as unknown as typeof fetch;
    return { asked, fetcher };
  };
  it("finds this release's copy beside the page", async () => {
    const { asked, fetcher } = answering(200, manifest);
    const found = await findBundled("app://scmjs/?layer=units", fetcher);
    expect(asked).toEqual([`app://scmjs/${BUNDLED_PATH}runtime.json`]);
    expect(found).toEqual(bundledUrls(`app://scmjs/${BUNDLED_PATH}`));
    expect(found!.worker).toBe(`app://scmjs/${BUNDLED_PATH}dist/worker.js`);
  });
  it("follows a page served under a path", async () => {
    const { asked, fetcher } = answering(200, manifest);
    await findBundled("http://intranet/scmjs/", fetcher);
    expect(asked).toEqual([`http://intranet/scmjs/${BUNDLED_PATH}runtime.json`]);
  });
  it("is null for a miss, another release, a page answering with index.html, or no network", async () => {
    expect(await findBundled("http://x/", answering(404, "Not found").fetcher)).toBeNull();
    expect(await findBundled("http://x/", answering(200, JSON.stringify({ ...runtimeManifest(), version: "0.0.1" })).fetcher)).toBeNull();
    expect(await findBundled("http://x/", answering(200, "<!doctype html><title>scmJS</title>").fetcher)).toBeNull();
    expect(await findBundled("http://x/", (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch)).toBeNull();
  });
});
