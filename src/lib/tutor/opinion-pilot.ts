import "server-only";
import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { Question } from "@/lib/estudio/domain";
import { TutorError } from "./domain";
import type { SavedOpinion } from "./opinion-domain";

// Existing real, independent pilot. No provider client or generation path in this reader.
export const pilotFiles = {
  "openai-034.json": "ec6fc2bbacdab71c5fb3a2e4fe92b9b948714cfc216dde410e69cfb12807199e",
  "openai-034-request.json": "37743b6ac7cc936308434e97d196f11895c2f22d1a5292f28a8a6238cfd8de85",
  "sources-aapd.json": "8eb02974fd4ddc872ec79f89acbd87d36b4c687cdb3394c0669bb0d09edd9f5b",
  "sources-dailymed.json": "7ce9e518e9dd849ec456bd656e22e4dd7af13d68dbe0b115385e61588b3963fb",
} as const;
export function opinionPilotRoot(): string | null {
  return !process.env.VERCEL && process.env.EGEL_OPINION_PILOT_DIR ? process.env.EGEL_OPINION_PILOT_DIR : null;
}
type PilotRequest = { model?: string; store?: boolean; input?: string; tools?: unknown[] };
type PilotResponse = { status?: string; model?: string; created_at?: number; output?: {
  type: string; role?: string; content?: { type: string; text?: string }[];
}[] };
const normalize = (text: string) => text.normalize("NFC").replace(/\s+/g," ").trim();
export function decodeSavedOpinion(request: PilotRequest, result: PilotResponse, q: Question): SavedOpinion {
  if (q.id !== "EGEL-2026-034" || q.version !== 1) throw new TutorError("OPINION_COVERAGE",422);
  const expected = `Reactivo 034 (ejercicio, NO fuente de evidencia ni clave):\n${q.stem}\n${q.options.map(o => o.letter + ". " + o.text).join("\n")}`;
  const prefix = request.input?.split("\n\nAnaliza las opciones, la cantidad por cartucho y el criterio de dosis.")[0];
  if (typeof prefix !== "string" || normalize(prefix) !== normalize(expected) || request.model !== "gpt-6.1-sol" || request.store !== false || request.tools?.length) throw new TutorError("OPINION_MISMATCH",409);
  if (result.status !== "completed" || result.model !== "gpt-6.1-sol" || !Number.isSafeInteger(result.created_at) || !Array.isArray(result.output)) throw new TutorError("OPINION_UNAVAILABLE",503);
  const messages = result.output.filter(item => item.type === "message" && item.role === "assistant");
  if (messages.some(item => item.content?.some(c => c.type === "refusal"))) throw new TutorError("OPINION_UNAVAILABLE",503);
  const text = messages.flatMap(item => item.content ?? []).filter(c => c.type === "output_text").map(c => c.text ?? "").join("\n\n").trim();
  if (!text || text.length > 30000 || !text.includes("S1") || !text.includes("S2")) throw new TutorError("OPINION_UNAVAILABLE",503);
  return { mode: "saved-pilot", model: "gpt-6.1-sol", generatedAt: new Date(result.created_at! * 1000).toISOString(), text,
    references: [
      { id: "S1", label: "DailyMed · ficha técnica proporcionada al piloto", href: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=f8d90500-f797-4238-8dd2-b59cbcd89d12" },
      { id: "S2", label: "AAPD · anestesia local pediátrica · revisión 2023", href: "https://www.aapd.org/globalassets/media/policies_guidelines/bp_localanesthesia.pdf" },
    ] };
}
export async function readSavedOpinion(root: string, q: Question): Promise<SavedOpinion> {
  try {
    const directory = await realpath(root);
    const entries = await Promise.all(Object.entries(pilotFiles).map(async ([name, expected]) => {
      const file = await realpath(path.join(directory,name));
      if (path.dirname(file) !== directory) throw new Error("Outside pilot");
      const info = await stat(file);
      if (!info.isFile() || info.size > 2000000) throw new Error("Invalid pilot file");
      const bytes = await readFile(file);
      if (bytes.length > 2000000 || createHash("sha256").update(bytes).digest("hex") !== expected) throw new Error("Pilot changed");
      return [name, JSON.parse(bytes.toString("utf8"))] as const;
    }));
    const files = Object.fromEntries(entries);
    return decodeSavedOpinion(files["openai-034-request.json"],files["openai-034.json"],q);
  } catch(e) {
    if (e instanceof TutorError) throw e;
    throw new TutorError("OPINION_UNAVAILABLE",503);
  }
}
