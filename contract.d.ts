/**
 * The `eudplib.build` service, as other plugins see it. Types only: take this file (or
 * the `@scm-js/plugin-eudplib` copy in the README) with `import type` and reach the object
 * through `api.services.watch("eudplib.build", …)`. The provider's `ServiceInfo.version` is
 * 2 for this shape; 1 had `build` alone, without `contribute` and `onBuild`.
 */

export interface EudplibBuildRequest {
  /** The map as a .scm/.scx archive (a bare .chk is taken too). */
  map: Uint8Array;
  /** euddraft plugin sections, name → settings: the .eds sections, values strings or numbers. */
  plugins: Record<string, Record<string, string | number>>;
  /**
   * Extra euddraft plugins the caller brings as Python source, module name → code. A name
   * here may also appear in `plugins` with its settings; it is loaded like a bundled one
   * (`settings` in its globals, `onPluginStart` / `beforeTriggerExec` / `afterTriggerExec`).
   */
  sources?: Record<string, string>;
  /**
   * Data files the caller brings, file name → text (an IR as JSON, say). Each is written to
   * `/work/files/<name>` before the build, which is the path a plugin setting names to
   * reach it: `{ plugins: { mine: { ir: "/work/files/ir.json" } }, files: { "ir.json": … } }`.
   */
  files?: Record<string, string>;
  options?: {
    /** Shuffle the payload's objects, as euddraft does by default. */
    shufflePayload?: boolean;
    /** euddraft's `sectorSize` (the archive sector is 512 << n); 15 by default. */
    sectorSize?: number;
  };
}

export interface EudplibBuildResult {
  /** The built map, an archive every StarCraft build reads. */
  map: Uint8Array;
  /** eudplib's and the plugins' output, line by line. */
  log: string;
  /** The built scenario's size. */
  chkBytes: number;
  /** Wall time of the build, the runtime's start included when it had to start. */
  ms: number;
}

/** What one plugin brings to a build: the request's `plugins`, `sources` and `files`, without the map. */
export interface EudplibInput {
  plugins: EudplibBuildRequest["plugins"];
  sources?: EudplibBuildRequest["sources"];
  files?: EudplibBuildRequest["files"];
}

/**
 * A standing offer to take part in the map's build. The library owns the editor's build
 * step: whenever the map is saved, tested or exported, every contribution that `applies`
 * is asked to `collect`, the answers are merged, and the map is built once. Nothing
 * contributes → nothing is built and Save is what it always was.
 */
export interface EudplibContribution {
  /** Yours alone; the same id again replaces the earlier contribution. */
  id: string;
  /** Your plugin's name, for the install question and a failure notice ("TrigScript: main.ts:3 — …"). */
  label: string;
  /** Whether the open map has anything of yours to build. Asked on every save: cheap, synchronous, no side effects. */
  applies(): boolean;
  /**
   * Your part of the request, for the open map as it is now — compile here. Throw an
   * `Error` worded for the user and the save goes through without the build, with your
   * message in the notice. Two contributions may not bring different things under one name.
   */
  collect(ctx: { purpose: "save" | "test" | "export"; signal: AbortSignal }): Promise<EudplibInput>;
}

/** A build the library ran for the editor's step, as it goes; `contributors` are contribution ids. */
export type EudplibBuildEvent =
  | { kind: "start"; purpose: "save" | "test" | "export"; contributors: string[] }
  | { kind: "log"; line: string }
  | { kind: "done"; purpose: "save" | "test" | "export"; contributors: string[]; log: string; chkBytes: number; ms: number }
  /** `from` is the contribution whose `collect` threw, null when the build itself failed. */
  | { kind: "failed"; purpose: "save" | "test" | "export"; contributors: string[]; from: string | null; message: string; log: string };

export type EudplibState = "absent" | "installing" | "ready" | "failed";

export interface EudplibService {
  /** The plugin's version, eudplib's, Pyodide's, and the euddraft commit its loader and plugins come from. */
  versions: { plugin: string; eudplib: string; pyodide: string; euddraft: string };
  state(): EudplibState;
  /** Size of the first-use download in bytes, for a caller that wants to say it before `ensure()`. */
  downloadBytes: number;
  /**
   * Make the runtime available: true when it is, false when the user declined. When the
   * runtime is absent this opens the install dialog (with `reason` as one line, "Magenta
   * needs it to build this map"); concurrent callers share one install.
   */
  ensure(opts?: { reason?: string }): Promise<boolean>;
  /**
   * Build. Calls `ensure()` itself. `signal` stops the build (the runtime is thrown away
   * and started again for the next one); `onLog` gets each output line as it is written.
   */
  build(request: EudplibBuildRequest, opts?: { signal?: AbortSignal; onLog?: (line: string) => void }): Promise<EudplibBuildResult>;
  /** Take part in the map's build on Save, Test Map and export. Dispose when your plugin goes. */
  contribute(contribution: EudplibContribution): { dispose(): void };
  /** Hear about the builds the step runs: to show a log, or put a marker where a failure points. */
  onBuild(listener: (event: EudplibBuildEvent) => void): { dispose(): void };
}
