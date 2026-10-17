"use client";
import { useEffect, useState } from "react";
import type { Question } from "@/lib/estudio/domain";
import type { OpinionHistory } from "@/lib/tutor/opinion-domain";
type State = OpinionHistory & { identity: string; loading: boolean; error: string };
const empty: State = { ok: true, enabled: false, covered: false, requiresAnswer: true, analysis: null, identity: "", loading: true, error: "" };
export function useOpinion(q: Question | null | undefined, active: boolean, answered: boolean) {
  const [state,setState] = useState<State>(empty);
  const [revision,setRevision] = useState(0);
  const id = q?.id, version = q?.version;
  const identity = id && version ? `${id}:${version}:${answered}` : "";
  useEffect(() => {
    if (!active || !id || !version) return;
    const controller = new AbortController();
    async function read() {
      try {
        const r = await fetch(`/api/estudio/segunda-opinion?question_id=${id}&question_version=${version}`,{cache:"no-store",credentials:"same-origin",signal:controller.signal});
        if (!r.ok) throw new Error();
        const data: OpinionHistory = await r.json();
        if (!controller.signal.aborted) setState({...data,identity,loading:false,error:""});
      } catch {
        if (!controller.signal.aborted) setState({...empty,identity,loading:false,error:"No se pudo abrir el análisis guardado del piloto. No se generó otra respuesta ni se consumió una consulta."});
      }
    }
    void read();
    return () => controller.abort();
  },[id,version,identity,active,revision]);
  return { ...(state.identity === identity ? state : empty), refresh: () => setRevision(old=>old+1) };
}
export type Opinion = ReturnType<typeof useOpinion>;
