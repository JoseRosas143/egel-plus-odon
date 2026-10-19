import "server-only";
import { createClient as createBackendClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/lib/supabase/server";

export type LibraryEvidence = {
  documentId: string;
  catalogId: string | null;
  title: string;
  pdfPage: number;
  ordinal: number;
  text: string;
  textSha256: string;
};
export type LibrarySearchResult =
  | { status: "available"; evidence: LibraryEvidence[] }
  | { status: "not_configured" | "unauthenticated" | "invalid_query" | "unavailable" | "empty"; evidence: [] };

// Internal context builder only. Do NOT return evidence bodies or backend keys
// from a student route, and never accept a client-selected owner identifier.
export async function retrieveLibraryEvidence(query: string): Promise<LibrarySearchResult> {
  if (typeof query !== "string" || query.trim().length < 3 || query.length > 400) return { status: "invalid_query", evidence: [] };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_LIBRARY_SECRET_KEY;
  if (process.env.EGEL_COMMON_LIBRARY_ENABLED !== "true" || !secret || url !== "https://zbfgcfajiwhfhewkstvi.supabase.co") {
    return { status: "not_configured", evidence: [] };
  }
  try {
    const session = await createSessionClient();
    const auth = await session.auth.getUser();
    if (auth.error || !auth.data.user || auth.data.user.is_anonymous) return { status: "unauthenticated", evidence: [] };
    const backend = createBackendClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(12000) }) },
    });
    const result = await backend.rpc("search_tutor_library", { p_user_id: auth.data.user.id, p_query: query.trim(), p_limit: 6 });
    if (result.error || !Array.isArray(result.data) || result.data.length > 6) return { status: "unavailable", evidence: [] };
    const evidence: LibraryEvidence[] = [];
    for (const row of result.data) {
      if (!row || typeof row.document_id !== "string" || !/^[a-f0-9]{64}$/.test(row.document_id) ||
          !(row.catalog_id === null || (typeof row.catalog_id === "string" && /^BIB-\d{3}$/.test(row.catalog_id))) ||
          typeof row.title !== "string" || row.title.length > 500 || !Number.isSafeInteger(row.pdf_page) || row.pdf_page < 1 ||
          !Number.isSafeInteger(row.ordinal) || row.ordinal < 0 || typeof row.body !== "string" || row.body.length > 8000 ||
          typeof row.body_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(row.body_sha256)) return { status: "unavailable", evidence: [] };
      evidence.push({ documentId: row.document_id, catalogId: row.catalog_id, title: row.title,
        pdfPage: row.pdf_page, ordinal: row.ordinal, text: row.body, textSha256: row.body_sha256 });
    }
    return evidence.length ? { status: "available", evidence } : { status: "empty", evidence: [] };
  } catch { return { status: "unavailable", evidence: [] }; }
}
