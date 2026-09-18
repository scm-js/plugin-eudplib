/**
 * The runtime on the main thread: whether it is installed (the Cache API holds every file
 * of the download), installing it with progress, and the worker that runs builds. The
 * worker is a bootstrap of one line that imports `dist/worker.js` from the CDN, so the
 * plugin's own module — a `blob:` URL, or a chunk of the editor's — never runs in it.
 *
 * One build per worker: eudplib keeps the map and its main loop in module state and
 * refuses a second `LoadMap` in the same interpreter ("Game loop start is already set"),
 * so the worker is thrown away after every build and the next one starts a fresh
 * Python — about two seconds from the browser's cache.
 *
 * The Cache API entries are what "installed" means; the worker's own fetches go to the
 * same addresses and land in the browser's HTTP cache, which the install pass has just
 * filled (every address is versioned and immutable on the CDN). Where there is no Cache
 * API (an origin the browser will not give one to), a storage flag stands in.
 *
 * An editor that carries the runtime (`findBundled`) is installed from the start: the
 * worker loads it from beside the page, nothing is downloaded, and there is nothing to
 * remove but a download from before the editor carried it.
 */
import type { PluginApi } from "@scm-js/plugin-api";
import type { NormalizedSections } from "./compose";
import type { FromWorker, ToWorker } from "./protocol";
import { CACHE_NAME, CACHE_PREFIX, runtimeFiles, type RuntimeUrls } from "./urls";

const INSTALLED_KEY = "installed";

export interface InstallProgress { done: number; total: number; file: string }

export class Runtime {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private seq = 0;
  private pending = new Map<number, { resolve(v: { name: string; locale: number; data: Uint8Array }[]): void; reject(e: Error): void; onLog?: (line: string) => void }>();
  private stage = "";
  onStage: ((text: string) => void) | null = null;
  failed: string | null = null;

  private readonly api: PluginApi;
  /** The CDN's addresses until `located` settles, then the bundled copy's if there is one. */
  urls: RuntimeUrls;
  /** Whether the editor carries this release's runtime. */
  bundled = false;
  /** Settles once the bundled copy has been looked for. */
  readonly located: Promise<void>;

  constructor(api: PluginApi, urls: RuntimeUrls, bundled: Promise<RuntimeUrls | null> = Promise.resolve(null)) {
    this.api = api;
    this.urls = urls;
    this.located = bundled.then((local) => { if (local) { this.urls = local; this.bundled = true; } }, () => {});
  }

  private cache(): Promise<Cache> | null {
    return typeof caches === "undefined" ? null : caches.open(CACHE_NAME);
  }

  /** Whether every file of the download is here. */
  async installed(): Promise<boolean> {
    await this.located;
    if (this.bundled) return true;
    const c = this.cache();
    if (!c) return this.api.storage.get<boolean>(INSTALLED_KEY, false) === true;
    const cache = await c;
    for (const f of runtimeFiles(this.urls)) if (!(await cache.match(f.url))) return false;
    return true;
  }

  /** Fetch every file into the cache, reporting bytes as they arrive. */
  async install(progress: (p: InstallProgress) => void, signal?: AbortSignal): Promise<void> {
    await this.located;
    if (this.bundled) return;
    const files = runtimeFiles(this.urls);
    const total = files.reduce((n, f) => n + f.bytes, 0);
    let done = 0;
    const c = this.cache();
    const cache = c ? await c : null;
    for (const f of files) {
      const name = f.url.split("/").pop() ?? f.url;
      if (cache && (await cache.match(f.url))) { done += f.bytes; progress({ done, total, file: name }); continue; }
      const res = await fetch(f.url, { signal });
      if (!res.ok) throw new Error(`${name}: the CDN answered ${res.status}.`);
      const chunks: Uint8Array[] = [];
      let got = 0;
      if (res.body) {
        const reader = res.body.getReader();
        for (;;) {
          const { value, done: end } = await reader.read();
          if (end) break;
          chunks.push(value); got += value.length;
          progress({ done: done + Math.min(got, f.bytes), total, file: name });
        }
      } else {
        const all = new Uint8Array(await res.arrayBuffer()); chunks.push(all); got = all.length;
      }
      if (cache) {
        const headers = new Headers();
        for (const h of ["content-type", "cache-control", "etag"]) { const v = res.headers.get(h); if (v) headers.set(h, v); }
        await cache.put(f.url, new Response(new Blob(chunks as BlobPart[]), { status: 200, headers }));
      }
      done += f.bytes;
      progress({ done, total, file: name });
    }
    this.failed = null;
    if (!cache) this.api.storage.set(INSTALLED_KEY, true);
  }

  /** Drop the download; the worker with it. */
  async remove(): Promise<void> {
    this.terminate();
    if (typeof caches !== "undefined") for (const name of await caches.keys()) if (name.startsWith(CACHE_PREFIX)) await caches.delete(name);
    this.api.storage.set(INSTALLED_KEY, false);
  }

  /** Caches of earlier releases, gone — and this one's too when the editor carries the runtime. */
  async dropOld(): Promise<void> {
    await this.located;
    if (typeof caches === "undefined") return;
    for (const name of await caches.keys()) if (name.startsWith(CACHE_PREFIX) && (this.bundled || name !== CACHE_NAME)) await caches.delete(name);
  }

  private setStage(text: string) { this.stage = text; this.onStage?.(text); }
  currentStage() { return this.stage; }

  /** The worker, started if need be: resolves once Python and eudplib are in. */
  private ensureWorker(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = this.located.then(() => new Promise<void>((resolve, reject) => {
      let w: Worker;
      try {
        w = new Worker(URL.createObjectURL(new Blob([BOOTSTRAP], { type: "text/javascript" })), { type: "module" });
      } catch (err) { this.ready = null; reject(err instanceof Error ? err : new Error(String(err))); return; }
      this.worker = w;
      let up = false;
      w.onerror = (e) => {
        const err = new Error(e.message || "The build worker stopped.");
        if (!up) { this.ready = null; reject(err); }
        for (const p of this.pending.values()) p.reject(err);
        this.pending.clear();
      };
      w.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        switch (m.type) {
          case "stage": this.setStage(m.text); break;
          case "ready": up = true; this.setStage(""); resolve(); break;
          case "fatal": this.failed = m.message; this.terminate(); reject(new Error(m.message)); break;
          case "log": (m.id === null ? [...this.pending.values()] : [this.pending.get(m.id)]).forEach((p) => p?.onLog?.(m.line)); break;
          case "result": { const p = this.pending.get(m.id); this.pending.delete(m.id); p?.resolve(m.members); break; }
          case "error": { const p = this.pending.get(m.id); this.pending.delete(m.id); p?.reject(new Error(m.message)); break; }
        }
      };
      const boot: ToWorker = { type: "boot", pyodideBase: this.urls.pyodideBase, wheel: this.urls.wheel };
      w.postMessage({ ...boot, worker: this.urls.worker });
    }));
    return this.ready;
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    const err = new Error("The build was stopped.");
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  running(): boolean { return this.ready !== null; }

  async build(
    input: { chk: Uint8Array; names: string[]; raw: Uint8Array; sections: NormalizedSections; sources: Record<string, string>; files: Record<string, string>; shuffle: boolean; sectorSize: number },
    opts: { signal?: AbortSignal; onLog?: (line: string) => void } = {},
  ): Promise<{ name: string; locale: number; data: Uint8Array }[]> {
    if (opts.signal?.aborted) throw abortError();
    const onAbort = () => this.terminate();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      await this.ensureWorker();
      if (opts.signal?.aborted) throw abortError();
      const id = ++this.seq;
      const answer = new Promise<{ name: string; locale: number; data: Uint8Array }[]>((resolve, reject) => this.pending.set(id, { resolve, reject, onLog: opts.onLog }));
      const msg: ToWorker = { type: "build", id, chk: input.chk, names: input.names, raw: input.raw, sections: input.sections, sources: input.sources, files: input.files, shuffle: input.shuffle, sectorSize: input.sectorSize };
      this.worker!.postMessage(msg);
      return await answer;
    } catch (err) {
      if (opts.signal?.aborted) throw abortError();
      throw err;
    } finally {
      opts.signal?.removeEventListener("abort", onAbort);
      this.terminate();
    }
  }
}

const abortError = () => { const e = new Error("The build was stopped."); e.name = "AbortError"; return e; };

/**
 * The bootstrap: a worker of one message handler that imports the real module from the
 * address the boot message names. A module worker from a cross-origin URL is refused by
 * browsers, a `blob:` worker importing one is not.
 */
const BOOTSTRAP = `self.onmessage = (e) => {
  const m = e.data;
  if (m.type !== "boot") return;
  import(m.worker).then((mod) => mod.start(self, m)).catch((err) => self.postMessage({ type: "fatal", message: "Could not load the build worker from " + m.worker + ": " + String((err && err.message) || err) }));
};`;
