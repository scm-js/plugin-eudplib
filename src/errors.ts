/**
 * A build that failed in Python arrives as a traceback: the loader's frames, the plugin's,
 * often a second exception raised while handling the first. A person wants the first
 * exception's own sentence — "trigscript: no such unit at main.ts:12:5" — and whoever is
 * debugging wants the rest, so the error's message is the one and `detail` the other.
 */
export class BuildError extends Error {
  /** The whole text as Python wrote it; the same as `message` when it was no traceback. */
  readonly detail: string;
  constructor(text: string) {
    super(rootCause(text));
    this.name = "BuildError";
    this.detail = text;
  }
}

/** The first exception's message out of a Python traceback; any other text as it is. */
export function rootCause(text: string): string {
  if (!/Traceback \(most recent call last\)/.test(text)) return text.trim();
  // A chain reads oldest first: what came before "During handling of…" or "The above exception was…" is the cause.
  const first = text.split(/\n\s*(?:During handling of the above exception|The above exception was the direct cause)/)[0];
  const lines = first.trim().split("\n").map((l) => l.trimEnd());
  // The exception's own lines are the unindented ones at the end; a message may run over several.
  let start = lines.length - 1;
  while (start > 0 && !/^\s/.test(lines[start - 1]) && !/^Traceback /.test(lines[start - 1])) start--;
  const message = lines.slice(start).join(" ").trim();
  // "package.module.ClassName: what went wrong" → what went wrong.
  return message.replace(/^[A-Za-z_][\w.]*(?:Error|Exception|Fail|Warning|Exit)?:\s+(?=\S)/, "") || message;
}
