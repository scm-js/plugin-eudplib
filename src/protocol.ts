/** What crosses between the main thread and the build worker. */
import type { NormalizedSections } from "./compose";

export interface BootMessage { type: "boot"; pyodideBase: string; wheel: string }
export interface BuildMessage {
  type: "build";
  id: number;
  /** The scenario, and the listfile's names, for the archive shim. */
  chk: Uint8Array;
  names: string[];
  /** The archive as it is, for eudplib's own read of the input file. */
  raw: Uint8Array;
  sections: NormalizedSections;
  sources: Record<string, string>;
  /** Data files, written under `/work/files/` for plugin settings to name. */
  files: Record<string, string>;
  shuffle: boolean;
  sectorSize: number;
}
export type ToWorker = BootMessage | BuildMessage;

export interface ReadyMessage { type: "ready" }
export interface StageMessage { type: "stage"; text: string }
export interface FatalMessage { type: "fatal"; message: string }
export interface LogMessage { type: "log"; id: number | null; line: string }
export interface ResultMessage { type: "result"; id: number; members: { name: string; locale: number; data: Uint8Array }[] }
export interface ErrorMessage { type: "error"; id: number; message: string }
export type FromWorker = ReadyMessage | StageMessage | FatalMessage | LogMessage | ResultMessage | ErrorMessage;
