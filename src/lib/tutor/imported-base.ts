import "server-only";
import { TutorError, type TutorMessage } from "./domain";

export const IMPORTED_EDITORIAL_IDS = ["EGEL-2026-001", "EGEL-2026-003", "EGEL-2026-006"];
const urls: Record<string, string[]> = {
  "EGEL-2026-001": ["https://www.kidney.org/kidney-topics/creatinine", "https://cdho.org/factsheets/chronic-kidney-disease/", "https://kdigo.org/wp-content/uploads/2026/05/KDIGO-2024-CKD-Guideline-Summary-Recommendations-and-Practice-Points.pdf"],
  "EGEL-2026-003": ["https://pubmed.ncbi.nlm.nih.gov/36246819/", "https://digitalhistology.org/organs-systems/digestive/oral-cavity/tooth/tooth-development/tooth-development-6/", "https://digitalhistology.org/organs-systems/digestive/oral-cavity/tooth/tooth-development/tooth-development-9/"],
  "EGEL-2026-006": ["https://www.cdc.gov/epstein-barr/about/mononucleosis.html", "https://www.cdc.gov/measles/hcp/clinical-overview/index.html", "https://medlineplus.gov/ency/article/000969.htm"],
};
// Session client + RLS is required by the caller. No provider identity is inferred
// from a chat export, and no source PDF/printed page is invented from a URL.
export function selectImportedEditorial(value: unknown, questionId: string, now = Date.now()): TutorMessage | null {
  const unavailable = (): never => { throw new TutorError("TUTOR_BASE_UNAVAILABLE", 503); };
  if (!Array.isArray(value) || value.length > 1 || !urls[questionId]) return unavailable();
  if (!value.length) return null;
  const row = value[0] as Record<string, unknown>;
  if (!row || typeof row.id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(row.id) ||
      row.format_version !== "imported-editorial-v1" || typeof row.body !== "string" || row.body.length < 100 || row.body.length > 30000 ||
      typeof row.reviewed_at !== "string" || typeof row.valid_until !== "string" ||
      !Number.isFinite(Date.parse(row.reviewed_at)) || !Number.isFinite(Date.parse(row.valid_until)) || Date.parse(row.reviewed_at) > now ||
      Date.parse(row.valid_until) <= now || Date.parse(row.valid_until) > Date.parse(row.reviewed_at) + 90 * 86400000 ||
      !Array.isArray(row.citations) || row.citations.length !== 3) return unavailable();
  const seen = new Set<string>();
  const citations: TutorMessage["citations"] = row.citations.map(value => {
    const c = value as Record<string, unknown>;
    if (!c || c.kind !== "editorial-reference" || typeof c.reference_id !== "string" || !/^R[234]$/.test(c.reference_id) || seen.has(c.reference_id) ||
        c.url !== urls[questionId][Number(c.reference_id.slice(1)) - 2] || typeof c.title !== "string" || !c.title.trim() || c.title.length > 500 ||
        typeof c.review_scope !== "string" || !c.review_scope.trim() || c.review_scope.length > 4000 || Object.keys(c).length !== 5) return unavailable();
    seen.add(c.reference_id);
    return { page: null, printed: null, href: c.url as string, label: `[${c.reference_id}] ${c.title} · ${c.review_scope}` };
  });
  return { id: "initial-v1-assistant", role: "assistant", text: row.body, citations, createdAt: row.reviewed_at,
    origin: "shared-reviewed", editorialImport: true, baseId: row.id };
}
