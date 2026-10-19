import "server-only";
import { TutorError, type TutorMessage } from "./domain";

export const BASE_PROMPT_VERSION = "literature-base-v1";
export const EDITORIAL_PROMPT_VERSION = "literature-editorial-v1";
export const WEB_EDITORIAL_PROMPT_VERSION = "literature-editorial-web-v1";
export const SHARED_BASE_PROMPT_VERSIONS = [BASE_PROMPT_VERSION, EDITORIAL_PROMPT_VERSION, WEB_EDITORIAL_PROMPT_VERSION];
// The caller uses the verified student's Supabase client. RLS checks that this
// student has answered THIS version and that the review and sources are current.
// No admin key, generation, personal choices, prompts or private notes here.
export function parseSharedBase(value: unknown): TutorMessage | null {
  if (value === null) return null;
  const row = value as Record<string, unknown>;
  const legacy = row?.model === "gemini-3.8-flash" && row.prompt_version === BASE_PROMPT_VERSION && (row.editorial_revision === undefined || row.editorial_revision === false);
  const webEditorial = row?.prompt_version === WEB_EDITORIAL_PROMPT_VERSION;
  const editorial = row?.model === "deepseek-flash" && (row.prompt_version === EDITORIAL_PROMPT_VERSION || webEditorial) && row.editorial_revision === true;
  if (!row || typeof row.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id) || !(legacy || editorial) ||
      typeof row.body !== "string" || row.body.length < 100 || row.body.length > 30000 || typeof row.reviewed_at !== "string" || !Number.isFinite(Date.parse(row.reviewed_at)) ||
      !Array.isArray(row.citations) || !row.citations.length || row.citations.length > 12) throw new TutorError("TUTOR_BASE_UNAVAILABLE", 503);
  const citations: TutorMessage["citations"] = [];
  const seen = new Set<string>();
  for (const value of row.citations) {
    const c = value as Record<string, unknown>;
    if (c?.kind === "reviewed-web") {
      if (!webEditorial || c.url !== "https://www.cun.es/diccionario-medico/terminos/lipotimia" ||
          typeof c.title !== "string" || !c.title.trim() || c.title.length > 500 ||
          typeof c.publisher !== "string" || !c.publisher.trim() || c.publisher.length > 200 ||
          typeof c.verified_at !== "string" || !Number.isFinite(Date.parse(c.verified_at)) ||
          Date.parse(c.verified_at) > Date.now() || Object.hasOwn(c, "pdf_page") || Object.hasOwn(c, "document_id")) throw new TutorError("TUTOR_BASE_UNAVAILABLE", 503);
      if (seen.has(c.url)) throw new TutorError("TUTOR_BASE_UNAVAILABLE", 503);
      seen.add(c.url);
      citations.push({ page: null, printed: null, kind: "reviewed-web", verifiedAt: c.verified_at,
        label: `${c.publisher} · ${c.title} · complemento web · revisión ${new Date(c.verified_at).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })}`, href: c.url });
      continue;
    }
    if (c?.kind !== undefined) throw new TutorError("TUTOR_BASE_UNAVAILABLE", 503);
    if (!c || typeof c.document_id !== "string" || !/^[a-f0-9]{64}$/.test(c.document_id) || typeof c.title !== "string" || !c.title.trim() || c.title.length > 500 ||
        typeof c.pdf_page !== "number" || !Number.isSafeInteger(c.pdf_page) || c.pdf_page < 1 ||
        !(c.catalog_id === null || (typeof c.catalog_id === "string" && /^BIB-\d{3}$/.test(c.catalog_id)))) throw new TutorError("TUTOR_BASE_UNAVAILABLE", 503);
    const key = `${c.document_id}:${c.pdf_page}`;
    if (!seen.has(key)) {
      seen.add(key);
      citations.push({ page: c.pdf_page, printed: null, label: `${c.title} · página PDF ${c.pdf_page}`, href: "/biblioteca" });
    }
  }
  if (webEditorial && (!citations.some(c => c.kind === "reviewed-web") || !citations.some(c => c.page !== null))) throw new TutorError("TUTOR_BASE_UNAVAILABLE", 503);
  return { id: "initial-v1-assistant", role: "assistant", text: row.body, citations, createdAt: row.reviewed_at, origin: "shared-reviewed", baseId: row.id };
}

// Both supported variants may coexist. Prefer the explicitly editorial-reviewed
// variant; an unsupported/malformed row never triggers generation or a fallback.
export function selectSharedBase(value: unknown): TutorMessage | null {
  if (!Array.isArray(value) || value.length > 3) throw new TutorError("TUTOR_BASE_UNAVAILABLE", 503);
  const seen = new Set<unknown>();
  const rows = value.map(row => {
    const message = parseSharedBase(row);
    const prompt = (row as Record<string, unknown>)?.prompt_version;
    if (!message || seen.has(prompt)) throw new TutorError("TUTOR_BASE_UNAVAILABLE", 503);
    seen.add(prompt);
    return { message, rank: prompt === WEB_EDITORIAL_PROMPT_VERSION ? 2 : prompt === EDITORIAL_PROMPT_VERSION ? 1 : 0 };
  });
  return rows.toSorted((a, b) => b.rank - a.rank)[0]?.message ?? null;
}
