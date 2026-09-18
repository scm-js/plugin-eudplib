/**
 * What other plugins want built into the map, and the one build that carries all of it.
 *
 * The editor runs a build step whenever the map leaves it (Save, Test Map, an export), and
 * this plugin owns the only eudplib one: TrigScript and Magenta do not build for themselves,
 * they `contribute` — a cheap `applies()` and a `collect()` that answers the same
 * `plugins` / `sources` / `files` a `build()` request takes — and the step merges whatever
 * applies into one request. A map that uses both is built once, with both in it; a map that
 * uses neither never reaches eudplib.
 *
 * No editor API in here, so it runs under vitest: the step's `build` is handed in.
 */
import type { EudplibBuildEvent, EudplibBuildRequest, EudplibBuildResult, EudplibContribution, EudplibInput } from "../contract";

export type BuildPurpose = "save" | "test" | "export";
type Build = (request: EudplibBuildRequest, opts: { signal?: AbortSignal; onLog?: (line: string) => void; reason?: string }) => Promise<EudplibBuildResult>;

export class Contributions {
  private readonly list: EudplibContribution[] = [];
  private readonly listeners = new Set<(event: EudplibBuildEvent) => void>();

  /** The same id again replaces the earlier one, in its place: a plugin registering anew after a reload. */
  add(c: EudplibContribution): { dispose(): void } {
    if (!c || typeof c.id !== "string" || !c.id || typeof c.applies !== "function" || typeof c.collect !== "function") throw new Error("contribute() needs an id, applies() and collect().");
    const entry = { ...c, label: String(c.label || c.id) };
    const at = this.list.findIndex((x) => x.id === c.id);
    if (at >= 0) this.list[at] = entry; else this.list.push(entry);
    return { dispose: () => { const i = this.list.indexOf(entry); if (i >= 0) this.list.splice(i, 1); } };
  }

  onBuild(listener: (event: EudplibBuildEvent) => void): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => { this.listeners.delete(listener); } };
  }

  /** The contributions with something for the open map, in the order they were made. A throwing `applies` is a no. */
  applying(): EudplibContribution[] {
    return this.list.filter((c) => { try { return c.applies() === true; } catch { return false; } });
  }

  private emit(event: EudplibBuildEvent) {
    for (const l of [...this.listeners]) { try { l(event); } catch { /* a listener's trouble is its own */ } }
  }

  /** The editor's step: collect from everyone who applies, build once. Throws in the user's words. */
  async run(input: { map: Uint8Array; purpose: BuildPurpose; signal: AbortSignal }, build: Build, reasonFor: (labels: string) => string): Promise<Uint8Array> {
    const from = this.applying();
    const contributors = from.map((c) => c.id);
    const labels = from.map((c) => c.label).join(", ");
    const lines: string[] = [];
    this.emit({ kind: "start", purpose: input.purpose, contributors });
    try {
      const parts: { from: EudplibContribution; input: EudplibInput }[] = [];
      for (const c of from) {
        try {
          parts.push({ from: c, input: await c.collect({ purpose: input.purpose, signal: input.signal }) });
        } catch (err) {
          throw new ContributionError(c, err);
        }
      }
      const request = { map: input.map, ...mergeInputs(parts) };
      const result = await build(request, { signal: input.signal, reason: reasonFor(labels), onLog: (line) => { lines.push(line); this.emit({ kind: "log", line }); } });
      this.emit({ kind: "done", purpose: input.purpose, contributors, log: result.log, chkBytes: result.chkBytes, ms: result.ms });
      return result.map;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit({ kind: "failed", purpose: input.purpose, contributors, from: err instanceof ContributionError ? err.from.id : null, message, log: lines.join("\n") });
      throw err instanceof ContributionError ? new Error(`${err.from.label}: ${message}`) : err;
    }
  }
}

class ContributionError extends Error {
  readonly from: EudplibContribution;
  constructor(from: EudplibContribution, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.from = from;
  }
}

/**
 * One request's worth of `plugins` / `sources` / `files` out of several. euddraft runs the
 * plugin sections in order, so the order is the contributions'. Two contributions may name
 * the same bundled plugin with the same settings (`eudTurbo: {}`); anything else under one
 * name is a clash, and says who.
 */
export function mergeInputs(parts: { from: { id: string; label: string }; input: EudplibInput }[]): Required<EudplibInput> {
  const out: Required<EudplibInput> = { plugins: {}, sources: {}, files: {} };
  const owner = new Map<string, string>();
  const put = <V>(kind: "plugins" | "sources" | "files", bag: Record<string, V>, name: string, value: V, from: { label: string }) => {
    const key = `${kind}/${name}`;
    const had = owner.get(key);
    if (had !== undefined && JSON.stringify(bag[name]) !== JSON.stringify(value)) throw new Error(`${had} and ${from.label} both bring '${name}' (${kind}) to the build, with different contents.`);
    if (had === undefined) { owner.set(key, from.label); bag[name] = value; }
  };
  for (const { from, input } of parts) {
    if (!input || typeof input !== "object" || !input.plugins || typeof input.plugins !== "object") throw new Error(`${from.label} brought nothing to build.`);
    for (const [name, settings] of Object.entries(input.plugins)) put("plugins", out.plugins, name, settings, from);
    for (const [name, code] of Object.entries(input.sources ?? {})) put("sources", out.sources, name, code, from);
    for (const [name, text] of Object.entries(input.files ?? {})) put("files", out.files, name, text, from);
  }
  return out;
}
