import "server-only";
import { TutorError, type TutorMessage } from "./domain";

export const BASE_PROMPT_VERSION = "literature-base-v1";
export const EDITORIAL_PROMPT_VERSION = "literature-editorial-v1";
export const SHARED_BASE_PROMPT_VERSIONS = [BASE_PROMPT_VERSION, EDITORIAL_PROMPT_VERSION];
// The caller uses the verified student's Supabase client. RLS checks that this
// student has answered THIS version and that the review and sources are current.
// No admin key, generation, personal choices, prompts or private notes here.
export function parseSharedBase(value: unknown): TutorMessage | null {
  if (value === null) return null;
  const row = value as Record<string, unknown>;
  const legacy = row?.model === "gemini-3.8-flash" && row.prompt_version === BASE_PROMPT_VERSION && (row.editorial_revision === undefined || row.editorial_revision === false);
  const editorial = row?.model === "deepseek-flash" && row.prompt_version === EDITORIAL_PROMPT_VERSION && row.editorial_revision === true;
  if (!row || typeof row.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id) || !(legacy || editorial) ||
      typeof row.body !== "string" || row.body.length < 100 || row.body.length > 30000 || typeof row.reviewed_at !== "string" || !Number.isFinite(Date.parse(row.reviewed_at)) ||
      !Array.isArray(row.citations) || !row.citations.length || row.citations.length > 12) throw new TutorError("TUTOR_BASE_UNAVAILABLE", 503);
  const citations: TutorMessage["citations"] = [];
  const seen = new Set<string>();
  for (const value of row.citations) {
    const c = value as Record<string, unknown>;
    if (!c || typeof c.document_id !== "string" || !/^[a-f0-9]{64}$/.test(c.document_id) || typeof c.title !== "string" || !c.title.trim() || c.title.length > 500 ||
        typeof c.pdf_page !== "number" || !Number.isSafeInteger(c.pdf_page) || c.pdf_page < 1 ||
        !(c.catalog_id === null || (typeof c.catalog_id === "string" && /^BIB-\d{3}$/.test(c.catalog_id)))) throw new TutorError("TUTOR_BASE_UNAVAILABLE", 503);
    const key = `${c.document_id}:${c.pdf_page}`;
    if (!seen.has(key)) {
      seen.add(key);
      citations.push({ page: c.pdf_page, printed: null, label: `${c.title} · página PDF ${c.pdf_page}`, href: "/biblioteca" });
    }
  }
  return { id: "initial-v1-assistant", role: "assistant", text: row.body, citations, createdAt: row.reviewed_at, origin: "shared-reviewed", baseId: row.id };
}

// Both supported variants may coexist. Prefer the explicitly editorial-reviewed
// variant; an unsupported/malformed row never triggers generation or a fallback.
export function selectSharedBase(value: unknown): TutorMessage | null {
  if (!Array.isArray(value) || value.length > 2) throw new TutorError("TUTOR_BASE_UNAVAILABLE", 503);
  const seen = new Set<unknown>();
  const rows = value.map(row => {
    const message = parseSharedBase(row);
    const prompt = (row as Record<string, unknown>)?.prompt_version;
    if (!message || seen.has(prompt)) throw new TutorError("TUTOR_BASE_UNAVAILABLE", 503);
    seen.add(prompt);
    return { message, editorial: prompt === EDITORIAL_PROMPT_VERSION };
  });
  return rows.find(row => row.editorial)?.message ?? rows[0]?.message ?? null;
}
