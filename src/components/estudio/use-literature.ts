"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Question } from "@/lib/estudio/domain";
import { tutorErrors, type TutorHistory, type TutorMessage, type SharedBaseStatus } from "@/lib/tutor/domain";

type State = { identity: string; messages: TutorMessage[]; enabled: boolean; covered: boolean; pending: boolean; retryable: boolean; error: string; loading: boolean; sharedBase?: SharedBaseStatus };
const empty: State = { identity: "", messages: [], enabled: false, covered: false, pending: false, retryable: false, error: "", loading: true };
export function useLiterature(q: Question | null | undefined) {
  const [state, setState] = useState<State>(empty);
  const [sending, setSending] = useState(false);
  const current = useRef("");
  const posting = useRef(false);
  const readController = useRef<AbortController | null>(null);
  const id = q?.id, version = q?.version;
  const identity = id && version ? `${id}:${version}` : "";
  const refresh = useCallback(async () => {
    if (!id || !version) return;
    readController.current?.abort();
    const controller = new AbortController(); readController.current = controller;
    try {
      const r = await fetch(`/api/estudio/tutor?question_id=${id}&question_version=${version}`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
      const data = await r.json();
      if (!r.ok) throw new Error(tutorErrors[data.error] ?? "No se pudo cargar el historial. Tus borradores siguen en pantalla.");
      if (current.current === identity) setState({ ...(data as TutorHistory), identity, error: "", loading: false });
    } catch(e) {
      if (!controller.signal.aborted && current.current === identity) setState(old => ({ ...(old.identity === identity ? old : empty), identity, loading: false, error: e instanceof Error ? e.message : "No se pudo cargar el historial." }));
    }
  }, [id, version, identity]);
  useEffect(() => {
    current.current = identity;
    void refresh();
    return () => { current.current = ""; readController.current?.abort(); };
  }, [identity, refresh]);
  async function send(prompt: string, initial = false, retry = false): Promise<boolean> {
    if (posting.current || !id || !version) return false;
    posting.current = true; setSending(true);
    readController.current?.abort();
    setState(old => ({ ...old, error: "" }));
    try {
      const r = await fetch("/api/estudio/tutor", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: id, question_version: version, request_id: crypto.randomUUID(), initial, prompt, retry }) });
      const data = await r.json();
      if (!r.ok) {
        if (current.current === identity) setState(old => ({ ...(old.identity === identity ? old : empty), identity, loading: false,
          retryable: data.error === "TUTOR_UNCERTAIN" || data.error === "TUTOR_PROVIDER_BUSY",
          pending: data.error === "TUTOR_UNCERTAIN", error: tutorErrors[data.error] ?? "No se completó la consulta. Tu respuesta y tus apuntes siguen guardados." }));
        return false;
      }
      if (current.current === identity) {
        setState(old => ({ ...old, identity, messages: data.messages, sharedBase: data.sharedBase ?? old.sharedBase, loading: false, error: "", pending: false, retryable: false }));
        return true;
      }
    } catch(e) {
      if (current.current === identity) setState(old => ({ ...(old.identity === identity ? old : empty), identity, loading: false, error: e instanceof Error ? e.message : "No se completó la consulta." }));
    } finally { posting.current = false; setSending(false); }
    return false;
  }
  // Never flash another question's private history while the new request loads.
  const visible = state.identity === identity ? state : empty;
  return { ...visible, sending, refresh, send };
}
export type Literature = ReturnType<typeof useLiterature>;
