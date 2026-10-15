/** Respuestas privadas, sin cache compartida y sin informacion de excepciones. */
export function privateJson(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
      "Vary": "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function apiError(code: string, status: number, message?: string): Response {
  return privateJson(message ? { ok: false, error: code, message } : { ok: false, error: code }, status);
}
export function sameOriginMutation(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try {
    // No confiar en Host ni X-Forwarded-Host enviados por el cliente.
    return origin === new URL(request.url).origin;
  } catch { return false; }
}
export class BodyError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}
export async function readSmallJson(request: Request): Promise<unknown> {
  const mediaType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") throw new BodyError("JSON_REQUIRED", 415);
  const maximum = 4096;
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximum)) {
    throw new BodyError("BODY_TOO_LARGE", 413);
  }
  if (!request.body) throw new BodyError("INVALID_JSON", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > maximum) {
        await reader.cancel();
        throw new BodyError("BODY_TOO_LARGE", 413);
      }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of chunks) { bytes.set(chunk, cursor); cursor += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new BodyError("INVALID_JSON", 400); }
}
