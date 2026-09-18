/**
 * eudplib — a library plugin for the scmJS map editor (https://github.com/scm-js/scm-js):
 * eudplib, the EUD trigger compiler behind euddraft, run inside the editor in a Web
 * Worker with Pyodide. It has no editor of its own; it holds one service,
 * `eudplib.build`, that other plugins (Magenta, TrigScript) build EUD maps through, and a
 * status page under Plugins ▸ eudplib…. The runtime is downloaded once, on the first
 * build, after asking — unless the editor carries it (the desktop app, the container image). See `contract.d.ts` for the service and README.md for the rest.
 */
import type { PluginApi } from "@scm-js/plugin-api";
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
  const bundled = override?.trim() || servedFromRepository(ENTRY_URL) || typeof document === "undefined" ? null : findBundled(document.baseURI);
  const runtime = new Runtime(api, runtimeUrls(ENTRY_URL, override), bundled ?? undefined);
  void runtime.dropOld();
  const service = createService(api, runtime);
  const provided = api.services.provide("build", service, { version: 1 });
  api.commands.register({ id: "status", title: "eudplib", run: () => openStatus(api, runtime, service.refresh, service.state) });
  api.menu.add("Plugins", { label: t("eudplib…"), icon: "plugin", command: "status" });
  return () => { provided.dispose(); runtime.terminate(); };
}
