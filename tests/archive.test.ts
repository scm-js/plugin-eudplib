import { describe, expect, it } from "vitest";
import { Archive, Creator } from "mopaq";
import { assembleMap, countTriggers, looksLikeMpq, SCENARIO, splitMap } from "../src/archive";

const chkWith = (triggers: number): Uint8Array => {
  const ver = new Uint8Array(8 + 2); ver.set([0x56, 0x45, 0x52, 0x20, 2, 0, 0, 0], 0); ver[8] = 205;
  const trig = new Uint8Array(8 + triggers * 2400); trig.set([0x54, 0x52, 0x49, 0x47], 0); new DataView(trig.buffer).setInt32(4, triggers * 2400, true);
  const out = new Uint8Array(ver.length + trig.length); out.set(ver, 0); out.set(trig, ver.length);
  return out;
};

describe("the archive half", () => {
  it("takes a map apart and puts a built one together, carrying the other members", async () => {
    const c = new Creator({ sectorSize: 4096, listfile: true });
    c.addFile(SCENARIO, chkWith(2), { compress: "pkware" });
    c.addFile("staredit\\wav\\hello.wav", new Uint8Array([1, 2, 3]), { compress: "pkware" });
    c.addFile("magenta\\magenta.json", new TextEncoder().encode("{}"));
    const map = await c.writeAsync();
    expect(looksLikeMpq(map)).toBe(true);

    const split = await splitMap(map);
    expect(countTriggers(split.chk)).toBe(2);
    expect(split.names.map((n) => n.toLowerCase())).toContain(SCENARIO.toLowerCase());
    expect([...split.extras.keys()].sort()).toEqual(["magenta\\magenta.json", "staredit\\wav\\hello.wav"]);
    expect(split.unnamed).toBe(0);

    const built = await assembleMap([
      { name: SCENARIO, locale: 0, data: new Uint8Array() },          // the decoy eudplib writes
      { name: SCENARIO, locale: 0x409, data: chkWith(5) },            // the real one
      { name: "added\\by-plugin.bin", locale: 0, data: new Uint8Array([9]) },
    ], split.extras);
    expect(countTriggers(built.chk)).toBe(5);
    const back = await Archive.openAsync(built.map);
    expect(countTriggers(await back.readFileAsync(SCENARIO))).toBe(5);
    expect(Array.from(await back.readFileAsync("staredit\\wav\\hello.wav"))).toEqual([1, 2, 3]);
    expect(Array.from(await back.readFileAsync("added\\by-plugin.bin"))).toEqual([9]);
    expect((await back.filesAsync())?.length).toBe(4);
  });
  it("takes a bare scenario too", async () => {
    const split = await splitMap(chkWith(1));
    expect(split.names).toEqual([SCENARIO]);
    expect(split.extras.size).toBe(0);
  });
  it("refuses a build with no scenario", async () => {
    await expect(assembleMap([{ name: SCENARIO, locale: 0, data: new Uint8Array() }], new Map())).rejects.toThrow(/no scenario/);
  });
});
