import { apiError, privateJson, sameOriginMutation } from "@/lib/estudiante/http";
import { exactKeys, positiveInteger, questionId, record, StudyError } from "@/lib/estudio/domain";
import { readJson } from "@/lib/estudio/http";
import { TutorError } from "./domain";
import type { Question } from "@/lib/estudio/domain";
import type { TutorConfig } from "./gemini";
import { generate, history } from "./service";
type Access = { uid: string; question: (id: string) => Promise<Question | null>; answered: (q: Question) => Promise<boolean> };
export async function handleTutor(request: Request, authenticate: () => Promise<Access | null>, config: TutorConfig | null) {
  try {
    if (request.method === "POST" && !sameOriginMutation(request)) return apiError("ORIGIN_NOT_ALLOWED",403);
    const access = await authenticate(); if (!access) return apiError("AUTH_REQUIRED",401);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname);
    if (!local) config = null; // Local pilot only; no shared disk assumption on hosted instances.
    const value = request.method === "GET" ? Object.fromEntries(new URL(request.url).searchParams) : record(await readJson(request, 18000));
    exactKeys(value, request.method === "GET" ? ["question_id","question_version"] : ["question_id","question_version","request_id","initial","prompt","retry"]);
    const id = questionId(value.question_id);
    const version = positiveInteger(request.method === "GET" ? Number(value.question_version) : value.question_version);
    const q = await access.question(id);
    if (!q) return apiError("QUESTION_NOT_FOUND",404);
    if (q.version !== version) return apiError("QUESTION_VERSION_CHANGED",409);
    if (request.method === "GET") return privateJson(await history(config, access.uid, q));
    if (!config) throw new TutorError("TUTOR_DISABLED",503);
    if ((value.retry !== undefined && typeof value.retry !== "boolean") || typeof value.initial !== "boolean" || typeof value.prompt !== "string" || value.prompt.length > 4000 || value.prompt.includes("\0") ||
        (!value.initial && !value.prompt.trim()) || typeof value.request_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.request_id)) return apiError("INVALID_INPUT",400);
    if (!await access.answered(q)) throw new TutorError("TUTOR_ANSWER_REQUIRED",409);
    return privateJson(await generate(config, access.uid, q, { id: value.request_id, initial: value.initial, prompt: value.prompt, retry: value.retry === true }));
  } catch(e) {
    return e instanceof TutorError || e instanceof StudyError ? apiError(e.code,e.status) : apiError("TUTOR_STORAGE",503);
  }
}
