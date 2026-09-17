/**
 * The two dialogs: the install question a build raises when the runtime is absent, and
 * Plugins ▸ eudplib…, the status page with Install and Remove.
 */
import type { PluginApi } from "@scm-js/plugin-api";
import type { Runtime } from "./runtime";
import { CDN_HOST, downloadBytes } from "./urls";
import { EUDDRAFT_COMMIT, EUDPLIB_VERSION, PYODIDE_VERSION, VERSION } from "./version";

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(bytes >= 10e6 ? 0 : 1)} MB`;

/** What the runtime is, in plain words: the same paragraph on both dialogs. */
function about(api: PluginApi): string {
  const t = api.i18n.t;
  return t("eudplib is the trigger compiler behind euddraft, the tool StarCraft: Remastered EUD maps are built with. This plugin runs it inside the editor, so a map is built here and nothing about it leaves the machine.");
}

/** Ask, download with a bar, answer true once the runtime is in; false on Cancel. */
export function askInstall(api: PluginApi, runtime: Runtime, reason: string | null): Promise<boolean> {
  const t = api.i18n.t;
  const w = api.ui.widgets;
  return new Promise<boolean>((resolve) => {
    let answered = false;
    const answer = (ok: boolean) => { if (!answered) { answered = true; resolve(ok); } };
    let controller: AbortController | null = null;
    const bar = w.progressBar({ value: 0, percent: true, label: t("Waiting to start") });
    bar.hidden = true;
    const status = w.statusLine();
    const handle = api.ui.dialog({
      title: t("Install the local build runtime?"),
      size: "sm",
      mount(body) {
        if (reason) body.append(w.hint(reason));
        body.append(
          w.hint(about(api)),
          w.hint(t("It is a one-time download of about {size} from {host} (Pyodide, a Python for the browser, and eudplib {eudplib}), kept by the browser for the next build. Remove it any time under Plugins ▸ eudplib….", { size: mb(downloadBytes(runtime.urls)), host: CDN_HOST, eudplib: EUDPLIB_VERSION })),
          bar, status,
        );
        return () => { controller?.abort(); answer(false); };
      },
      buttons: [
        { label: t("Install"), primary: true, closes: false, run: async (dialog) => {
          controller = new AbortController();
          bar.hidden = false;
          status.busy(t("Downloading…"));
          try {
            await runtime.install((p) => bar.set(p.done / p.total, t("{file} — {done} of {total}", { file: p.file, done: mb(p.done), total: mb(p.total) })), controller.signal);
            answer(true);
            dialog.close();
          } catch (err) {
            if (controller.signal.aborted) return;
            status.set(t("The download failed: {why}", { why: String((err as Error).message ?? err) }), "error");
            bar.set(0, t("Try again"));
          }
        } },
        { label: t("Cancel") },
      ],
    });
    void handle;
  });
}

/** Plugins ▸ eudplib…: what is installed, the versions, Install / Remove. */
export function openStatus(api: PluginApi, runtime: Runtime, refresh: () => Promise<void>, state: () => string): void {
  const t = api.i18n.t;
  const w = api.ui.widgets;
  const line = w.statusLine();
  const versions = w.hint(t("Plugin {plugin}, eudplib {eudplib}, Pyodide {pyodide}, euddraft {euddraft}.", { plugin: VERSION, eudplib: EUDPLIB_VERSION, pyodide: PYODIDE_VERSION, euddraft: EUDDRAFT_COMMIT.slice(0, 7) }));
  let install: HTMLButtonElement, remove: HTMLButtonElement;
  const render = async () => {
    await refresh();
    const s = state();
    const size = mb(downloadBytes(runtime.urls));
    if (s === "ready") line.set(t("Installed ({size}). Each build starts a fresh Python from it, about two seconds.", { size }), "ok");
    else if (s === "failed") line.set(t("The runtime failed to start: {why}", { why: runtime.failed ?? "" }), "error");
    else line.set(t("Not installed. The first build downloads about {size}.", { size }), "warn");
    install.hidden = s === "ready";
    remove.hidden = s !== "ready" && s !== "failed";
  };
  api.ui.dialog({
    title: t("eudplib"),
    size: "sm",
    mount(body) {
      install = w.button(t("Install now…"), { onClick: async () => { await askInstall(api, runtime, null); await render(); } });
      remove = w.button(t("Remove the download"), { danger: true, onClick: async () => { await runtime.remove(); await render(); } });
      body.append(w.hint(about(api)), versions, line, w.row(install, remove));
      void render();
    },
  });
}
