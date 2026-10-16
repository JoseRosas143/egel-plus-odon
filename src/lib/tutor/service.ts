import "server-only";
import { TutorError, type TutorHistory, type TutorMessage } from "./domain";
import { conversationKey, digest, readConversation, reserveCall, withPilotLock, writeConversation, type Run } from "./storage";
import { askGemini, checkSource, type TutorConfig } from "./gemini";
import type { Question } from "@/lib/estudio/domain";

export async function history(config: TutorConfig | null, uid: string, q: Question): Promise<TutorHistory> {
  const conversation = config ? await readConversation(config.root, conversationKey(uid, q.id, q.version)) : { messages: [], runs: [] };
  return { ok: true, enabled: !!config, covered: q.id === "EGEL-2026-034", messages: conversation.messages,
    pending: conversation.runs.some(r => r.state === "reserved" || r.state === "uncertain"),
    retryable: conversation.runs.some(r => r.id === "initial-v1" && (r.state === "uncertain" || r.state === "rejected")) };
}
export async function generate(config: TutorConfig, uid: string, q: Question, request: { id: string; initial: boolean; prompt: string; retry?: boolean }) {
  if (q.id !== "EGEL-2026-034") throw new TutorError("TUTOR_COVERAGE", 422);
  return withPilotLock(config.root, async () => {
    const key = conversationKey(uid, q.id, q.version), conversation = await readConversation(config.root, key);
    const id = request.initial ? "initial-v1" : request.id;
    const prompt = request.initial ? "Analiza este reactivo: propuesta razonada, comparación de A/B/C, ambigüedades, fuentes y puntos para repasar. No es una clave oficial." : request.prompt;
    const fingerprint = digest({ prompt, id: q.id, version: q.version, stem: q.stem, options: q.options.map(o => [o.letter,o.text]) });
    const old = conversation.runs.find(r => r.id === id);
    if (old) {
      if (old.digest !== fingerprint) throw new TutorError("TUTOR_CONFLICT", 409);
      if (old.state === "completed") return { ok: true as const, messages: conversation.messages, reused: true };
      if (old.state === "reserved" || !request.retry) throw new TutorError(old.state === "rejected" ? "TUTOR_PROVIDER_BUSY" : "TUTOR_UNCERTAIN", 409);
    }
    if (conversation.runs.some(r => r !== old && (r.state === "reserved" || r.state === "uncertain"))) throw new TutorError("TUTOR_UNCERTAIN", 409);
    await checkSource(config);
    await reserveCall(config.root);
    const run: Run = old ?? { id, digest: fingerprint, state: "reserved", attempts: 0, failures: [] };
    if (old && !old.failures?.length && old.state === "uncertain") old.failures = ["TUTOR_UNCERTAIN"];
    run.state = "reserved"; run.attempts = old ? (run.attempts ?? 1) + 1 : 1;
    if (!old) conversation.runs.push(run);
    await writeConversation(config.root, key, conversation);
    try {
      const answer = await askGemini(config, q, conversation.messages, prompt);
      const createdAt = new Date().toISOString();
      const messages: TutorMessage[] = [
        { id: id + "-user", role: "user", text: prompt, citations: [], createdAt },
        { id: id + "-assistant", role: "assistant", ...answer, createdAt },
      ];
      conversation.messages.push(...messages); run.state = "completed";
      await writeConversation(config.root, key, conversation);
      return { ok: true as const, messages: conversation.messages, reused: false };
    } catch(e) {
      const explicitRejection = e instanceof TutorError && ["TUTOR_PROVIDER_BUSY","TUTOR_PROVIDER_REJECTED"].includes(e.code);
      run.state = explicitRejection ? "rejected" : "uncertain";
      run.failures = [...(run.failures ?? []), explicitRejection ? e.code : "TUTOR_UNCERTAIN"];
      await writeConversation(config.root, key, conversation);
      throw explicitRejection ? e : new TutorError("TUTOR_UNCERTAIN", 502);
    }
  });
}
