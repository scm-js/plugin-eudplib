import { describe, expect, it } from "vitest";
import { BuildError, rootCause } from "../src/errors";

const CHAIN = `Traceback (most recent call last):
  File "/ed/pluginLoader.py", line 212, in loadPluginsFromConfig
    loader.exec_module(pluginModule)
    ~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^
  File "/ed/plugins/trigscript.py", line 620, in owner_slots
    raise Fail("trigscript: no human or computer player of this map is among the program's owners%s" % where(program))
trigscript.Fail: trigscript: no human or computer player of this map is among the program's owners at main.ts:40:15

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "/py/driver.py", line 38, in build
    hooks = loadPluginsFromConfig(ep, config)
  File "/ed/pluginLoader.py", line 225, in loadPluginsFromConfig
    raise RuntimeError('Error loading plugin "%s"' % pluginName)
RuntimeError: Error loading plugin "trigscript"
`;

describe("rootCause", () => {
  it("is the first exception's own sentence, its class left out", () => {
    expect(rootCause(CHAIN)).toBe("trigscript: no human or computer player of this map is among the program's owners at main.ts:40:15");
  });
  it("takes a single traceback, a message over several lines, and an exception with no message", () => {
    expect(rootCause('Traceback (most recent call last):\n  File "x.py", line 1, in <module>\n    boom()\neudplib.utils.eperror.EPError: Must put Trigger into onPluginStart')).toBe("Must put Trigger into onPluginStart");
    expect(rootCause('Traceback (most recent call last):\n  File "x.py", line 1, in <module>\nValueError: first line\nsecond line')).toBe("first line second line");
    expect(rootCause('Traceback (most recent call last):\n  File "x.py", line 1, in <module>\nKeyboardInterrupt')).toBe("KeyboardInterrupt");
  });
  it("leaves what is not a traceback alone", () => {
    expect(rootCause("The build was stopped.")).toBe("The build was stopped.");
    expect(rootCause("plugins must be an object with at least one plugin section.")).toBe("plugins must be an object with at least one plugin section.");
  });
  it("BuildError keeps the whole text beside the sentence", () => {
    const e = new BuildError(CHAIN);
    expect(e.message).toMatch(/^trigscript: no human/);
    expect(e.detail).toBe(CHAIN);
  });
});
