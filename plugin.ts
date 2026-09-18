/**
 * eudplib — a library plugin for the scmJS map editor (https://github.com/scm-js/scm-js):
 * eudplib, the EUD trigger compiler behind euddraft, run inside the editor in a Web
 * Worker with Pyodide. It has no editor of its own; it holds one service,
 * `eudplib.build`, that other plugins (Magenta, TrigScript) build EUD maps through — by
 * contributing to the build step it registers with the editor, which runs on Save — and a
 * status page under Plugins ▸ eudplib…. The runtime is downloaded once, on the first
 * build, after asking — unless the editor carries it (the desktop app, the container image). See `contract.d.ts` for the service and README.md for the rest.
 */
import type { PluginApi } from "@scm-js/plugin-api";
import { Contributions } from "./src/contributions";
import { openStatus } from "./src/dialogs";
import { Runtime } from "./src/runtime";
import { createService } from "./src/service";
import { findBundled, runtimeUrls, servedFromRepository } from "./src/urls";

/** Where this module was loaded from: a `blob:`, an editor's own chunk, or a dev server serving the repository. */
const ENTRY_URL: string = import.meta.url;

export function activate(api: PluginApi): () => void {
  const t = api.i18n.t;
  const override = api.storage.get<string | null>("runtimeBase", null);
  // A development address wins over a copy the editor carries; otherwise that copy wins over the CDN.
  const page = typeof document === "undefined" ? undefined : document.baseURI;
  const bundled = override?.trim() || servedFromRepository(ENTRY_URL, page) || !page ? null : findBundled(page);
  const runtime = new Runtime(api, runtimeUrls(ENTRY_URL, override, page), bundled ?? undefined);
  void runtime.dropOld();
  const contributions = new Contributions();
  const service = createService(api, runtime, contributions);
  const provided = api.services.provide("build", service, { version: 2 });
  // The one eudplib step: whatever TrigScript, Magenta and the rest contribute, built once as the map leaves the editor.
  // An editor from before build steps has no `buildSteps`: the service still works there, through `build()`.
  api.document.buildSteps?.add({
    id: "build",
    label: "eudplib",
    applies: () => contributions.applying().length > 0,
    run: ({ map, purpose, signal }) => contributions.run({ map, purpose, signal }, service.build, (labels) => t("{labels} needs it to build this map.", { labels })),
  });
  api.commands.register({ id: "status", title: "eudplib", run: () => openStatus(api, runtime, service.refresh, service.state) });
  api.menu.add("Plugins", { label: t("eudplib…"), icon: "plugin", command: "status" });
  return () => { provided.dispose(); runtime.terminate(); };
}
