import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";

// Micro-USD integers; deliberately charge peak rates and ignore cache discounts.
export const PILOT_CAP = 1_000_000;
export const PRICE_VERSION = "deepseek-flash-2026-10-18-peak";
export const PRICE_EXPIRES = "2026-10-25T00:00:00Z";
export const MAX_INPUT_TOKENS = 2_000_000; // Above the documented 1M context; no guessed tokenizer ratio.
export const MAX_OUTPUT_TOKENS = 4096; // Includes reasoning, not just visible text.
export const RESERVATION = Math.ceil(MAX_INPUT_TOKENS * 0.3 + MAX_OUTPUT_TOKENS * 1.2);
export class PilotError extends Error {
  constructor(public code: string) { super(code); }
}
export type PilotUsage = { input: number; output: number; reasoning: number; cacheHit: number; microUsd: number };
type Run = { fingerprint: string; state: "reserved" | "completed" | "invalid" | "uncertain"; charge: number; usage?: PilotUsage; result?: unknown };
type Ledger = { schema: 1; priceVersion: string; priorSpend: number; runs: Run[] };
export function fingerprint(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
const integer = (value: unknown, max: number): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;

export function priceUsage(value: unknown): PilotUsage {
  const u = value as Record<string, unknown> | null;
  const details = u?.completion_tokens_details as Record<string, unknown> | undefined;
  const reasoning = details?.reasoning_tokens ?? 0;
  const hit = u?.prompt_cache_hit_tokens ?? 0;
  if (!u || !integer(u.prompt_tokens, MAX_INPUT_TOKENS) || u.prompt_tokens === 0 || !integer(u.completion_tokens, MAX_OUTPUT_TOKENS) ||
      !integer(reasoning, MAX_OUTPUT_TOKENS) || reasoning > u.completion_tokens || !integer(hit, u.prompt_tokens) ||
      u.total_tokens !== u.prompt_tokens + u.completion_tokens ||
      (u.prompt_cache_miss_tokens !== undefined && u.prompt_cache_miss_tokens !== u.prompt_tokens - hit)) throw new PilotError("PILOT_USAGE_UNKNOWN");
  return { input: u.prompt_tokens, output: u.completion_tokens, reasoning, cacheHit: hit,
    microUsd: Math.ceil((u.prompt_tokens * 3 + u.completion_tokens * 12) / 10) };
}

async function writeLedger(directory: string, ledger: Ledger) {
  const temporary = path.join(directory, `${randomUUID()}.tmp`);
  const file = await open(temporary, "wx", 0o600);
  try { await file.writeFile(JSON.stringify(ledger)); await file.sync(); } finally { await file.close(); }
  await rename(temporary, path.join(directory, "budget.json"));
}

export async function initializeBudget(directory: string, priorSpend: number) {
  if (!integer(priorSpend, PILOT_CAP)) throw new PilotError("PILOT_PRIOR_SPEND_REQUIRED");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // Explicit initialization only. Missing/corrupt files never silently reset a budget.
  const file = await open(path.join(directory, "budget.json"), "wx", 0o600);
  try { await file.writeFile(JSON.stringify({ schema: 1, priceVersion: PRICE_VERSION, priorSpend, runs: [] })); await file.sync(); }
  finally { await file.close(); }
}

export async function readBudget(directory: string): Promise<Ledger> {
  try {
    const ledger = JSON.parse(await readFile(path.join(directory, "budget.json"), "utf8")) as Ledger;
    if (ledger.schema !== 1 || ledger.priceVersion !== PRICE_VERSION || !integer(ledger.priorSpend, PILOT_CAP) ||
        !Array.isArray(ledger.runs) || ledger.runs.length > 10) throw new Error();
    const seen = new Set<string>();
    for (const run of ledger.runs) {
      if (!/^[a-f0-9]{64}$/.test(run.fingerprint) || seen.has(run.fingerprint) || !integer(run.charge, RESERVATION) ||
          !["reserved", "completed", "invalid", "uncertain"].includes(run.state)) throw new Error();
      seen.add(run.fingerprint);
      if (run.state === "reserved" || run.state === "uncertain") {
        if (run.charge !== RESERVATION || run.usage !== undefined || run.result !== undefined) throw new Error();
      } else {
        const u = run.usage;
        if (!u || !integer(u.input, MAX_INPUT_TOKENS) || !u.input || !integer(u.output, MAX_OUTPUT_TOKENS) ||
            !integer(u.reasoning, u.output) || !integer(u.cacheHit, u.input) ||
            u.microUsd !== Math.ceil((u.input * 3 + u.output * 12) / 10) || run.charge !== u.microUsd ||
            (run.state === "completed" ? run.result === undefined : run.result !== undefined)) throw new Error();
      }
    }
    if (ledger.priorSpend + ledger.runs.reduce((n, r) => n + r.charge, 0) > PILOT_CAP) throw new Error();
    return ledger;
  } catch { throw new PilotError("PILOT_BUDGET_UNAVAILABLE"); }
}

export async function budgetStatus(directory: string) {
  const ledger = await readBudget(directory);
  const charged = ledger.priorSpend + ledger.runs.reduce((n, r) => n + r.charge, 0);
  return { capMicroUsd: PILOT_CAP, chargedMicroUsd: charged, remainingMicroUsd: PILOT_CAP - charged,
    calls: ledger.runs.length, blockedByUnknown: ledger.runs.some(r => r.state === "reserved" || r.state === "uncertain"),
    priceVersion: PRICE_VERSION, priceExpires: PRICE_EXPIRES };
}

export async function runBudgeted<T>(directory: string, key: string, execute: () => Promise<{ usage: PilotUsage; result: T | null }>) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new PilotError("PILOT_INVALID_FINGERPRINT");
  let lock;
  try { lock = await open(path.join(directory, "pilot.lock"), "wx", 0o600); }
  catch { throw new PilotError("PILOT_BUSY_OR_UNINITIALIZED"); }
  try {
    const ledger = await readBudget(directory);
    const old = ledger.runs.find(r => r.fingerprint === key);
    if (old?.state === "completed") return { reused: true, result: old.result as T, usage: old.usage! };
    if (old) throw new PilotError("PILOT_NO_AUTOMATIC_RETRY");
    if (ledger.runs.some(r => r.state === "reserved" || r.state === "uncertain")) throw new PilotError("PILOT_RECONCILIATION_REQUIRED");
    if (Date.now() >= Date.parse(PRICE_EXPIRES)) throw new PilotError("PILOT_PRICE_REVIEW_REQUIRED");
    if (ledger.runs.length >= 10 || ledger.priorSpend + ledger.runs.reduce((n, r) => n + r.charge, 0) + RESERVATION > PILOT_CAP) throw new PilotError("PILOT_BUDGET_LIMIT");
    const run: Run = { fingerprint: key, state: "reserved", charge: RESERVATION };
    ledger.runs.push(run);
    await writeLedger(directory, ledger); // Durable before ANY network transmission.
    let response;
    try { response = await execute(); }
    catch {
      run.state = "uncertain";
      await writeLedger(directory, ledger);
      throw new PilotError("PILOT_RECONCILIATION_REQUIRED");
    }
    const usage = response.usage;
    // Validate even the adapter's usage before releasing any reservation.
    const priced = priceUsage({ prompt_tokens: usage.input, completion_tokens: usage.output, total_tokens: usage.input + usage.output,
      prompt_cache_hit_tokens: usage.cacheHit, completion_tokens_details: { reasoning_tokens: usage.reasoning } });
    if (priced.microUsd !== usage.microUsd) throw new PilotError("PILOT_USAGE_UNKNOWN"); // Reserved state remains fail-closed.
    run.charge = priced.microUsd; run.usage = priced;
    run.state = response.result === null ? "invalid" : "completed";
    if (response.result !== null) run.result = response.result;
    await writeLedger(directory, ledger);
    if (response.result === null) throw new PilotError("PILOT_OUTPUT_WITHHELD");
    return { reused: false, result: response.result, usage: priced };
  } finally {
    await lock.close();
    await unlink(path.join(directory, "pilot.lock"));
    // A killed process leaves a lock and reservation: manual reconciliation, never automatic removal.
  }
}
