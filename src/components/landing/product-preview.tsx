"use client";

import { useState } from "react";
import { AppIcon } from "@/components/acceso/app-icon";
import { Arrow } from "./arrow";
import styles from "./styles.module.css";

const panels = ["Reactivo", "Tutor IA", "Mis notas"] as const;
const modes = ["Literatura", "2.ª opinión", "Comparar"] as const;
const choices = ["Revisar las fuentes", "Contrastar perspectivas", "Escribir mis apuntes"];
const explanations = [
  "El tutor bibliográfico está en un piloto local limitado. Las explicaciones disponibles identifican las fuentes consultadas.",
  "La segunda opinión muestra un análisis real guardado del piloto. Todavía no es un chat público ni una búsqueda autónoma de artículos.",
  "La comparación permite leer los análisis por separado. No genera un veredicto automático: tu conclusión la decides tú.",
];

export function ProductPreview() {
  const [panel, setPanel] = useState<(typeof panels)[number]>("Reactivo");
  const [mode, setMode] = useState(0);
  const [choice, setChoice] = useState("");
  const [note, setNote] = useState("");
  return <div className={styles.preview} aria-label="Demostración interactiva del espacio de estudio">
    <div className={styles.browserBar}><span className={styles.dots} aria-hidden="true"><i /><i /><i /></span><span>Vista interactiva · ejemplo de uso</span><span className={styles.previewScope}>Sin conexión a IA</span></div>
    <div className={styles.previewTop}><strong><AppIcon name="tooth" /> EGEL Plus ODON</strong><span>Tu espacio de estudio</span><a href="/estudio">Abrir la app <Arrow /></a></div>
    <div className={styles.previewTabs} role="group" aria-label="Panel de la demostración">{panels.map((name) => <button key={name} type="button" aria-pressed={panel === name} onClick={() => setPanel(name)}>{name}</button>)}</div>
    <div className={styles.previewPanels} data-panel={panel}>
      <section className={styles.sampleQuestion} aria-label="Reactivo de demostración"><h3><AppIcon name="notes" /> Reactivo</h3><p className={styles.micro}>Ejemplo de organización, no reactivo del banco</p><h4>Organiza tu sesión de estudio</h4><p>Antes de responder, identifica los datos relevantes. Después, <mark>revisa el fundamento y conserva tu propia conclusión.</mark></p><fieldset><legend>¿Por dónde quieres empezar?</legend>{choices.map((label, i) => <label key={label} data-selected={choice === label}><input type="radio" name="landing-example" checked={choice === label} onChange={() => setChoice(label)} /><span><b>{String.fromCharCode(65 + i)}.</b> {label}</span></label>)}</fieldset><p className={styles.micro}>{choice ? `Elegiste: ${choice}. Esta demo no califica respuestas.` : "Prueba una opción. No se guarda en tu cuenta."}</p></section>
      <section className={styles.sampleTutor} aria-label="Tutor de demostración"><h3><AppIcon name="shield" /> Tutor IA <span className={styles.status}>Piloto limitado</span></h3><div className={styles.modeTabs} role="group" aria-label="Perspectiva del tutor de demostración">{modes.map((name, i) => <button key={name} type="button" aria-pressed={mode === i} onClick={() => setMode(i)}>{name}</button>)}</div><div className={styles.tutorMessage} aria-live="polite"><AppIcon name="book" size={26} /><h4>Revisa el fundamento.<br />Contrasta las fuentes.<br /><span>Tú decides.</span></h4><p>{explanations[mode]}</p></div><p className={styles.micro}>Esta vista explica el funcionamiento. No contiene una respuesta generada por IA.</p></section>
      <section className={styles.sampleNotes} aria-label="Notas de demostración"><h3><AppIcon name="pencil" /> Mis notas</h3><div className={styles.noteSummary}><span>Respuesta inicial <b>{choice ? String.fromCharCode(65 + choices.indexOf(choice)) : "—"}</b></span><span>Mi veredicto <b>Sin decidir</b></span></div><label htmlFor="landing-note">Prueba escribir un apunte</label><textarea id="landing-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Una idea, una duda, algo que quieras recordar…" maxLength={1000} rows={5} /><div className={styles.highlightNote}><AppIcon name="pencil" /><p>Tus ideas, en tus palabras.<br />En la app puedes guardar apuntes por alternativa y volver a ellos.</p></div><p className={styles.micro}>Borrador de demostración. Se conserva al cambiar de panel, no al recargar.</p></section>
    </div>
  </div>;
}
