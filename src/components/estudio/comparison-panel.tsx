"use client";
import dynamic from "next/dynamic";
import { initialLiterature } from "@/lib/estudio/comparison";
import type { Literature } from "./use-literature";
import type { Opinion } from "./use-opinion";
import a from "@/components/acceso/styles.module.css";
import s from "./styles.module.css";
const TutorRichText = dynamic(() => import("./tutor-rich-text").then(m => m.TutorRichText),{loading:()=> <p>Preparando formato…</p>});

export function ComparisonPanel({literature,opinion,answered,focused,disabled,onExpand,onView,onVerdict}:{
  literature: Literature; opinion: Opinion; answered: boolean; focused: boolean; disabled: boolean;
  onExpand: () => void; onView: (view: "base" | "segunda") => void; onVerdict: () => void;
}) {
  const initial = initialLiterature(literature.messages);
  if (!answered) return <div className={s.comparison}><h3>Comparación de lectura</h3><p>Guarda tu respuesta inicial para consultar los análisis disponibles. No se generará una comparación simulada.</p></div>;
  return <div className={s.comparison}>
    <div className={s.comparisonHeading}><div><h3>Contrasta los originales</h3><p>Sin resumen nuevo ni veredicto automático.</p></div>
      {!focused ? <button type="button" className={`${a.button} ${a.secondary} ${s.compareExpand}`} onClick={onExpand}>Leer lado a lado</button> : null}
    </div>
    <div className={s.comparisonGrid}>
      <section className={s.comparisonCard} aria-label="Análisis inicial de Literatura">
        <h4>Literatura · Gemini</h4><p className={s.savedProvenance}>Análisis inicial · fragmento de Malamed, 5.ª ed. (2006)</p>
        {initial ? <>
          <details open={focused} className={s.comparisonText}><summary>Leer análisis de Literatura</summary><div data-tutor-response="true"><TutorRichText text={initial.text} /></div></details>
          {initial.citations.length ? <details className={s.citationList}><summary>Fuentes de Literatura · {initial.citations.length}</summary><p>Referencias recuperadas del fragmento histórico; no validan por sí solas cada afirmación.</p>{initial.citations.map(c=><a key={c.href} href={c.href} target="_blank" rel="noopener noreferrer">{c.label} ↗</a>)}</details> : <p className={s.savedProvenance}>Este análisis no contiene citas de página verificables.</p>}
        </> : <p role={literature.loading || literature.sending ? "status" : undefined}>{literature.loading ? "Cargando el historial…" : literature.sending ? "La consulta de Literatura sigue en curso." : literature.error || "No hay un análisis inicial de Literatura disponible. No se sustituirá por una respuesta de seguimiento."}</p>}
        <button type="button" className={s.historyRefresh} onClick={()=>onView("base")}>Abrir Literatura</button>
      </section>
      <section className={s.comparisonCard} aria-label="Segunda opinión guardada de OpenAI">
        <h4>2.ª opinión · OpenAI</h4><p className={s.savedProvenance}>Análisis guardado del piloto · no es una consulta nueva</p>
        {opinion.analysis ? <>
          <details open={focused} className={s.comparisonText}><summary>Leer segunda opinión</summary><div data-tutor-response="true"><TutorRichText text={opinion.analysis.text} /></div></details>
          <details className={s.citationList}><summary>Fuentes del piloto · {opinion.analysis.references.length}</summary><p>Documentos proporcionados al piloto, no una búsqueda en vivo del modelo.</p>{opinion.analysis.references.map(c=><a key={c.id} href={c.href} target="_blank" rel="noopener noreferrer">[{c.id}] {c.label} ↗</a>)}</details>
        </> : <p role={opinion.loading ? "status" : undefined}>{opinion.loading ? "Abriendo el análisis guardado…" : opinion.error || (!opinion.enabled ? "El piloto guardado no está habilitado en este servidor." : !opinion.covered ? "No hay segunda opinión habilitada para este reactivo." : "No hay una segunda opinión guardada disponible.")}</p>}
        <button type="button" className={s.historyRefresh} onClick={()=>onView("segunda")}>Abrir segunda opinión</button>
      </section>
    </div>
    <details className={s.comparisonGuide}><summary>Preguntas para contrastar</summary><ul>
      <li>¿Qué afirmaciones coinciden y cuáles se contradicen?</li>
      <li>¿Usan los mismos supuestos, unidades y población?</li>
      <li>¿La fuente citada respalda esa afirmación o solo está relacionada?</li>
      <li>¿Qué sigue siendo incierto y qué necesitas investigar?</li>
    </ul></details>
    <div className={s.comparisonFooter}><p>Tu decisión se registra en Mis notas; ninguna opinión se aplica automáticamente.</p><button type="button" className={a.button} disabled={disabled} onClick={onVerdict}>Ir a mi veredicto</button></div>
  </div>;
}
