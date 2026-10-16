import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { TutorError, type TutorMessage } from "./domain";

export type Run = { id: string; digest: string; state: "reserved" | "completed" | "uncertain" | "rejected"; attempts?: number; failures?: string[] };
export type Conversation = { schema: 1; messages: TutorMessage[]; runs: Run[] };
export const emptyConversation = (): Conversation => ({ schema: 1, messages: [], runs: [] });
export function conversationKey(uid: string, id: string, version: number) {
  return createHash("sha256").update(JSON.stringify([uid, id, version])).digest("hex");
}
export function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export async function readConversation(root: string, key: string): Promise<Conversation> {
  try {
    const data = JSON.parse(await readFile(path.join(root, key + ".json"), "utf8"));
    if (data.schema !== 1 || !Array.isArray(data.messages) || !Array.isArray(data.runs)) throw new Error();
    return data;
  } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyConversation(); throw new TutorError("TUTOR_STORAGE", 503); }
}
async function atomicJson(root: string, name: string, data: unknown) {
  const temporary = path.join(root, `${name}.${randomUUID()}.tmp`);
  const file = await open(temporary, "wx", 0o600);
  try { await file.writeFile(JSON.stringify(data)); await file.sync(); } finally { await file.close(); }
  await rename(temporary, path.join(root, name));
}
export function writeConversation(root: string, key: string, data: Conversation) { return atomicJson(root, key + ".json", data); }
export async function withPilotLock<T>(root: string, action: () => Promise<T>): Promise<T> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  let lock;
  try { lock = await open(path.join(root, "pilot.lock"), "wx", 0o600); }
  catch (e) { throw new TutorError((e as NodeJS.ErrnoException).code === "EEXIST" ? "TUTOR_BUSY" : "TUTOR_STORAGE", 503); }
  // A crash leaves the lock in place. Never delete a possibly active/stale lock automatically.
  try { return await action(); }
  finally { await lock.close(); await unlink(path.join(root, "pilot.lock")); }
}
export async function reserveCall(root: string) {
  let ledger: { schema: number; calls: number };
  try { ledger = JSON.parse(await readFile(path.join(root, "quota.json"), "utf8")); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw new TutorError("TUTOR_STORAGE", 503); ledger = { schema: 1, calls: 0 }; }
  if (ledger.schema !== 1 || !Number.isInteger(ledger.calls) || ledger.calls < 0) throw new TutorError("TUTOR_STORAGE", 503);
  // Fixed global lifetime cap, not a per-process resettable counter. Failures count too.
  if (ledger.calls >= 6) throw new TutorError("TUTOR_LIMIT", 429);
  await atomicJson(root, "quota.json", { schema: 1, calls: ledger.calls + 1 });
}
