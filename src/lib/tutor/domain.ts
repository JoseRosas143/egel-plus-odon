export type Citation = { page: number | null; printed: number | null; label: string; href: string; kind?: "reviewed-web"; verifiedAt?: string };
export type TutorMessage = { id: string; role: "user" | "assistant"; text: string; citations: Citation[]; createdAt: string; origin?: "shared-reviewed"; baseId?: string };
export type SharedBaseStatus = "available" | "pending" | "answer-required" | "legacy";
export type TutorHistory = { ok: true; messages: TutorMessage[]; enabled: boolean; covered: boolean; pending: boolean; retryable: boolean; sharedBase?: SharedBaseStatus };
export class TutorError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export const tutorErrors: Record<string, string> = {
  TUTOR_DISABLED: "El piloto de Literatura no está habilitado en este servidor.",
  TUTOR_BASE_UNAVAILABLE: "No se pudo comprobar la explicación revisada. No se generó otra respuesta ni se consumió una consulta de IA.",
  TUTOR_FOLLOWUP_DISABLED: "Las dudas personales aún no están conectadas en este servidor. Tu borrador sigue en pantalla; leer la explicación revisada no genera una nueva consulta.",
  TUTOR_COVERAGE: "Este piloto solo cubre el reactivo 034 con un fragmento de Malamed. Tu respuesta permanece guardada; aún falta habilitar bibliografía para este tema.",
  TUTOR_ANSWER_REQUIRED: "Primero selecciona y guarda tu respuesta inicial.",
  TUTOR_BUSY: "Hay una consulta en curso. Consulta el historial antes de volver a enviar.",
  TUTOR_LIMIT: "Se alcanzó el límite de consultas del piloto. No se hicieron más solicitudes.",
  TUTOR_UNCERTAIN: "La consulta no terminó de forma verificable. No se reintentará automáticamente; revisa el historial. Tu respuesta y tus notas siguen intactas.",
  TUTOR_SOURCE: "El fragmento bibliográfico no está disponible o cambió. No se consultó al modelo.",
  TUTOR_CONFLICT: "Esta solicitud ya existe con otro contenido. Actualiza el historial antes de continuar.",
  TUTOR_STORAGE: "No se pudo acceder al historial privado. No se iniciará otra consulta sin comprobarlo.",
  TUTOR_PROVIDER_BUSY: "Gemini está temporalmente saturado o alcanzó su cuota. Tu respuesta está guardada; puedes intentarlo manualmente más tarde. No se reintentará solo.",
  TUTOR_PROVIDER_REJECTED: "Gemini rechazó la configuración de la consulta. Requiere revisión; tus apuntes y respuesta siguen intactos.",
};
export const source = {
  label: "Malamed · 5.ª ed. española (2006)",
  fragmentName: "BIB-002 FRAGMENTO - Malamed 5a 2006 - PDF original 61-70, impresas 55-64",
  documentSuffix: "/documents/bib002-fragmento-malamed-5a-4ds1kltwcly1",
  failedDocumentSuffix: "/documents/bib002-malamed-manual-de-an-fb3n894qq4o7",
};
type Annotation = { type?: unknown; document_uri?: unknown; file_name?: unknown; page_number?: unknown };
export function mapCitation(a: Annotation, store: string): Citation | null {
  // Only the identified fragment is mapped; never guess a page from model prose/name.
  if (a.type !== "file_citation" || a.document_uri !== store || a.file_name !== source.fragmentName ||
      typeof a.page_number !== "number" || !Number.isInteger(a.page_number) || a.page_number < 1 || a.page_number > 10) return null;
  const page = a.page_number + 60, printed = a.page_number + 54;
  return { page, printed, label: `${source.label} · PDF ${page} / impresa ${printed}`, href: `/api/biblioteca/BIB-002#page=${page}` };
}
export function parseGemini(value: unknown, store: string): { text: string; citations: Citation[] } {
  const data = value as { status?: string; steps?: { type: string; content?: { type: string; text?: string; annotations?: Annotation[] }[] }[] };
  if (data?.status !== "completed" || !Array.isArray(data.steps)) throw new TutorError("TUTOR_UNCERTAIN", 502);
  const blocks = data.steps.filter(s => s.type === "model_output").flatMap(s => s.content ?? []).filter(b => b.type === "text");
  const text = blocks.map(b => b.text ?? "").join("\n\n").trim();
  if (!text || text.length > 30000) throw new TutorError("TUTOR_UNCERTAIN", 502);
  const citations = [...new Map(blocks.flatMap(b => b.annotations ?? []).map(a => mapCitation(a, store)).filter((c): c is Citation => c !== null).map(c => [c.page, c])).values()];
  // Unsupported generated conclusions are not displayed as grounded analysis.
  return citations.length ? { text, citations } : { text: "No obtuve citas de página verificables del fragmento habilitado. No puedo sustentar una propuesta de respuesta con esta consulta.", citations: [] };
}
