/**
 * A build request's `plugins` — the .eds sections as data — checked and normalised the
 * way scm-js/eud-server's `compose_eds` did, so a caller that was written for the server
 * gets the same answers: every value a string, no key that could not be a .eds key, no
 * value naming a file (a plugin setting that names a path would be read by euddraft as
 * one, and there is no file system a caller should reach into).
 */
export type PluginSections = Record<string, Record<string, string | number>>;
export type NormalizedSections = Record<string, Record<string, string>>;

export class BadRequest extends Error {}

const KEY = /^[^[\]:=\n\r]{1,200}$/;
export const MAX_PLUGINS_CHARS = 64 * 1024;

/** The sections as euddraft's loader takes them, or a `BadRequest` saying what is wrong. */
export function normalizeSections(plugins: unknown): NormalizedSections {
  if (!plugins || typeof plugins !== "object" || Array.isArray(plugins) || !Object.keys(plugins).length) throw new BadRequest("plugins must be an object with at least one plugin section.");
  if (JSON.stringify(plugins).length > MAX_PLUGINS_CHARS) throw new BadRequest("plugins is too long.");
  const out: NormalizedSections = {};
  for (const [name, settings] of Object.entries(plugins as Record<string, unknown>)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new BadRequest(`Bad plugin name: ${JSON.stringify(name)}.`);
    if (name === "main" || name === "freeze") throw new BadRequest(`The ${name} section is the library's own.`);
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new BadRequest(`Settings for '${name}' must be an object of key: value pairs.`);
    const section: Record<string, string> = {};
    for (const [key, raw] of Object.entries(settings as Record<string, unknown>)) {
      if (!KEY.test(key) || !key.trim()) throw new BadRequest(`Bad setting name in '${name}': ${JSON.stringify(key)}.`);
      const value = typeof raw === "number" && Number.isFinite(raw) ? String(raw) : raw;
      if (typeof value !== "string" || !value.trim() || /[\n\r]/.test(value) || value.length > MAX_PLUGINS_CHARS) throw new BadRequest(`Bad value for '${name}.${key}'.`);
      const v = value.trim();
      if (v.includes("\\") && (v.includes("/") || v.toLowerCase().includes(".py"))) throw new BadRequest(`A value may not name a file: '${name}.${key}'.`);
      section[key.trim()] = v;
    }
    out[name] = section;
  }
  return out;
}

/** The same sections as .eds text — what euddraft would have read; kept for the log. */
export function composeEds(sections: NormalizedSections): string {
  const lines: string[] = [];
  for (const [name, settings] of Object.entries(sections)) {
    lines.push(`[${name}]`);
    for (const [k, v] of Object.entries(settings)) lines.push(`${k} : ${v}`);
  }
  return lines.join("\n") + "\n";
}

const MODULE = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const MAX_SOURCE_CHARS = 512 * 1024;

/** The caller's own euddraft plugins as Python source, checked: a module name and a bounded string each. */
export function normalizeSources(sources: unknown): Record<string, string> {
  if (sources === undefined || sources === null) return {};
  if (typeof sources !== "object" || Array.isArray(sources)) throw new BadRequest("sources must be an object of module name → Python source.");
  const out: Record<string, string> = {};
  for (const [name, code] of Object.entries(sources as Record<string, unknown>)) {
    if (!MODULE.test(name)) throw new BadRequest(`Bad source module name: ${JSON.stringify(name)}.`);
    if (typeof code !== "string" || code.length > MAX_SOURCE_CHARS) throw new BadRequest(`Bad source for '${name}'.`);
    out[name] = code;
  }
  return out;
}
