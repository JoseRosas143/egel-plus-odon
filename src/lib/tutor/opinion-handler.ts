import { apiError, privateJson } from "@/lib/estudiante/http";
import { exactKeys, positiveInteger, questionId, StudyError, type Question } from "@/lib/estudio/domain";
import { TutorError } from "./domain";
import { readSavedOpinion } from "./opinion-pilot";
import type { OpinionHistory } from "./opinion-domain";
type Access = { uid: string; question: (id: string) => Promise<Question | null>; answered: (q: Question) => Promise<boolean> };
export async function handleOpinion(request: Request, authenticate: () => Promise<Access | null>, root: string | null) {
  try {
    if (request.method !== "GET") return apiError("METHOD_NOT_ALLOWED",405);
    const access = await authenticate(); if (!access) return apiError("AUTH_REQUIRED",401);
    const url = new URL(request.url), params = url.searchParams;
    if (!["localhost","127.0.0.1","[::1]"].includes(url.hostname)) root = null;
    exactKeys(Object.fromEntries(params),["question_id","question_version"]);
    if (params.getAll("question_id").length !== 1 || params.getAll("question_version").length !== 1) return apiError("INVALID_INPUT",400);
    const id = questionId(params.get("question_id")), version = positiveInteger(Number(params.get("question_version")));
    const q = await access.question(id);
    if (!q) return apiError("QUESTION_NOT_FOUND",404);
    if (q.version !== version) return apiError("QUESTION_VERSION_CHANGED",409);
    const covered = q.id === "EGEL-2026-034" && q.version === 1;
    const requiresAnswer = !await access.answered(q);
    const analysis = root && covered && !requiresAnswer ? await readSavedOpinion(root,q) : null;
    return privateJson({ ok: true, enabled: !!root, covered, requiresAnswer, analysis } satisfies OpinionHistory);
  } catch(e) {
    return e instanceof TutorError || e instanceof StudyError ? apiError(e.code,e.status) : apiError("OPINION_UNAVAILABLE",503);
  }
}
