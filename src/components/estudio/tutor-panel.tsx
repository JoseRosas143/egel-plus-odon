"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import a from "@/components/acceso/styles.module.css";
import s from "./styles.module.css";
import { tutorCommands, type TutorCommand } from "@/lib/estudio/tutor-commands";
import { AppIcon } from "@/components/acceso/app-icon";
import dynamic from "next/dynamic";
import type { Literature } from "./use-literature";
import type { Opinion } from "./use-opinion";
import { ComparisonPanel } from "./comparison-panel";
const TutorRichText = dynamic(() => import("./tutor-rich-text").then(m => m.TutorRichText), { loading: () => <p>Preparando formato…</p> });

export type TutorView = "base" | "segunda" | "comparar";
export type ChatDrafts = Record<TutorView, string>;
export const emptyChatDrafts = (): ChatDrafts => ({ base: "", segunda: "", comparar: "" });
const views = [
  { key: "base", label: "Literatura", full: "Base de conocimientos", empty: "Tus consultas y referencias aparecerán aquí." },
  { key: "segunda", label: "2.ª opinión", full: "Segunda opinión", empty: "La segunda opinión aparecerá aquí." },
  { key: "comparar", label: "Comparar", full: "Comparar dictámenes", empty: "Aquí podrás contrastar los dos dictámenes." },
] as const;
const commands = [
  { text: "/siguiente", label: "Siguiente reactivo" },
  { text: "/anterior", label: "Reactivo anterior" },
  { text: "/apuntes", label: "Ir a Mis notas" },
  { text: "/guardar", label: "Guardar apuntes" },
] as const;
export type StudyCommand = typeof commands[number]["text"];

export function TutorPanel({ position, busy, drafts, onDraft, onCommand, onPrepare, onNotice, literature, opinion, answered, view, onView, onVerdict, focused, onToggleFocus }: {
  position: number; busy: boolean; drafts: ChatDrafts;
  literature: Literature; answered: boolean;
  opinion: Opinion;
  view: TutorView; onView: (view: TutorView) => void;
  focused: boolean; onToggleFocus: () => void;
  onVerdict: () => void;
  onDraft: (view: TutorView, value: string) => void;
  onCommand: (command: StudyCommand) => Promise<boolean>;
  onPrepare: (command: TutorCommand, view: TutorView) => boolean;
  onNotice: (text: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [retryConfirmation, setRetryConfirmation] = useState<number | null>(null);
  const composer = useRef<HTMLFormElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const draft = drafts[view];
  const shared = literature.messages.some(message => message.origin === "shared-reviewed");
  const baseNotice = shared ? "Explicación base revisada y compartida. Leerla o volver a abrirla no consulta a Gemini/OpenAI. Las referencias indican páginas del PDF, sin distribuir los libros. No es una clave oficial ni cambia tu veredicto; las dudas personales todavía no están conectadas aquí." : literature.sharedBase && !literature.enabled ? "Las explicaciones comunes deben revisarse antes de publicarse. Guarda tu respuesta para consultar la que esté disponible; si falta, no se genera automáticamente. Las dudas personales siguen pendientes de conexión." : "Piloto local: Malamed 5.ª ed. (2006), solo PDF 61–70 y reactivo 034. Hasta 6 consultas en total; sin llamadas a OpenAI. No es una clave oficial.";
  const command = commands.find(item => item.text === draft.trim().toLowerCase());
  const tutorCommand = tutorCommands.find(item => item.command === draft.trim().toLowerCase());
  const canExecute = !!command || !!tutorCommand || (view === "base" && answered && literature.enabled && literature.covered && !literature.pending && !!draft.trim());

  useEffect(() => {
    if (!menuOpen) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !composer.current?.contains(event.target)) setMenuOpen(false);
    }
    function escape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenuOpen(false);
      menuButton.current?.focus();
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  async function run(text: StudyCommand) {
    if (busy || pending) return;
    setPending(true);
    setMenuOpen(false);
    try { if (await onCommand(text) && draft.trim().toLowerCase() === text) onDraft(view, ""); }
    finally { setPending(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (tutorCommand) prepare(tutorCommand.command);
    else if (command) void run(command.text);
    else if (canExecute && !literature.sending) {
      const sent = draft;
      void literature.send(sent).then(ok => { if (ok) onDraft(view, ""); });
    }
  }
  function prepare(command: TutorCommand) {
    if (busy || pending || literature.sending) return;
    setMenuOpen(false);
    onPrepare(command, view);
  }
  function openIndividualView(next: "base" | "segunda") {
    onView(next);
    requestAnimationFrame(() => document.getElementById("tutor-tab-" + next)?.focus());
  }
  function expandComparison() {
    document.getElementById("tutor-focus-toggle")?.focus();
    onToggleFocus();
  }
  function switchTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % views.length;
    else if (event.key === "ArrowLeft") next = (index + views.length - 1) % views.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = views.length - 1;
    else return;
    event.preventDefault();
    onView(views[next].key);
    setMenuOpen(false);
    document.getElementById("tutor-tab-" + views[next].key)?.focus();
  }
  return <>
    <div className={s.panelHeading}>
      <h2 className={a.sectionTitle}><AppIcon name="shield" />Tutor IA<span className={s.srOnly}> · Reactivo {position}</span></h2>
      <div className={s.headingTools}><button type="button" className={s.connection} title="Ver alcance del tutor" onClick={() => onNotice(view === "base" ? baseNotice : view === "segunda" ? "Segunda opinión: lectura de un análisis real de OpenAI guardado durante el piloto del 034, independiente de Gemini y de tu elección. No es una consulta nueva, búsqueda en vivo ni chat conectado. No consume créditos al abrirlo. No es una clave oficial." : "Comparación de lectura de los análisis existentes: no se genera un resumen ni un dictamen de IA, no consume consultas y no cambia tu veredicto. Revisa las fuentes y decide tú.")}>{view === "base" && shared ? "Base revisada" : view === "base" && literature.enabled ? "Piloto · Malamed" : view === "base" && literature.sharedBase ? "Base común" : view === "segunda" && opinion.enabled ? "Piloto guardado" : view === "comparar" ? "Lectura" : "Sin conexión"}</button>
      <button id="tutor-focus-toggle" className={s.focusToggle} type="button" aria-pressed={focused} aria-controls="study-reactivo study-tutor study-notas"
        aria-label={focused ? "Salir del modo concentración" : "Ampliar Tutor"} title={focused ? "Volver a los tres paneles (Esc)" : "Amplía el tutor manteniendo Mis notas disponible"} onClick={onToggleFocus}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {focused ? <path d="M4 9h5V4m11 5h-5V4M4 15h5v5m11-5h-5v5" /> : <path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5" />}
        </svg><span className={s.focusLabel}>{focused ? "Volver" : "Ampliar"}</span>
      </button></div>
    </div>
    <div className={s.tutorTabs} role="tablist" aria-label="Vistas del tutor">
      {views.map((item, index) => <button type="button" key={item.key} id={"tutor-tab-" + item.key}
        role="tab" aria-selected={view === item.key} aria-controls="tutor-content" aria-label={item.full} title={item.full}
        tabIndex={view === item.key ? 0 : -1} onKeyDown={event => switchTab(event, index)}
        onClick={() => { onView(item.key); setMenuOpen(false); }}>{item.label}</button>)}
    </div>
    <div className={s.chatHistory} id="tutor-content" role="tabpanel" aria-labelledby={"tutor-tab-" + view} aria-busy={view === "base" && literature.sending}>
      {preview && draft.trim() ? null : view === "base" ? <>
        {literature.messages.map(message => <article className={message.role === "assistant" ? s.tutorAnswer : s.tutorQuestion} key={message.id}>
          <span className={s.messageAuthor}>{message.origin === "shared-reviewed" ? "Literatura · base revisada" : message.role === "assistant" ? "Literatura · Gemini" : "Tú"}</span>
          {message.origin === "shared-reviewed" ? <p className={s.savedProvenance}>Revisión: <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleDateString("es-MX", { timeZone: "UTC" })}</time> · Lectura compartida, sin nueva consulta</p> : null}
          <div data-tutor-response={message.role === "assistant" ? "true" : undefined}><TutorRichText text={message.text} /></div>
          {message.citations.length ? <details className={s.citationList}><summary>Fuentes {message.origin === "shared-reviewed" ? "revisadas" : "recuperadas"} · {message.citations.length} páginas</summary><p>{message.origin === "shared-reviewed" ? "Se indican páginas del PDF, no páginas impresas deducidas. Los enlaces llevan al catálogo bibliográfico, no a una descarga de los libros." : "Abre estos enlaces para revisar el respaldo. Los números escritos por el modelo no sustituyen estos metadatos. Es una edición histórica."}</p>
            {message.citations.map(c => <a key={c.href + c.label} href={c.href} target="_blank" rel="noopener noreferrer">{c.label} ↗</a>)}</details> : null}
        </article>)}
        {literature.loading ? <p role="status">Cargando historial…</p> : null}
        {!literature.loading && !literature.messages.length ? <div className={s.chatWelcome}><span className={s.welcomeIcon}><AppIcon name="book" size={34} /></span>
          <h3>Primero, tu razonamiento</h3><p>{!literature.enabled && literature.sharedBase ? answered ? "Aún no hay una explicación revisada para este reactivo. Tu respuesta está guardada; no se consultó a la IA." : "Guarda tu respuesta inicial para consultar la explicación revisada que esté disponible." : !literature.enabled ? "El piloto no está habilitado en este servidor." : !literature.covered ? "Este tema aún no tiene bibliografía habilitada. El piloto está disponible en el reactivo 034." : answered ? "Tu respuesta inicial está guardada. Puedes iniciar el análisis o reintentarlo más tarde si el proveedor no respondió." : "Guarda tu respuesta inicial para iniciar el análisis de Literatura."}</p>
          {answered && literature.enabled && literature.covered ? <button id="retry-analysis" className={a.button} type="button" disabled={busy || literature.sending} aria-expanded={retryConfirmation === position} aria-controls="retry-confirmation" onClick={() => {
            if (literature.pending) {
              setRetryConfirmation(position);
              requestAnimationFrame(() => document.getElementById("retry-cancel")?.focus());
              return;
            }
            void literature.send("",true,literature.retryable);
          }}>{literature.retryable ? "Reintentar análisis" : "Analizar respuesta guardada"}</button> : null}</div> : null}
        {retryConfirmation === position && answered && literature.enabled && literature.covered ? <div id="retry-confirmation" role="group" aria-label="Confirmar reintento de Literatura" className={s.retryConfirmation}
          onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); setRetryConfirmation(null); document.getElementById("retry-analysis")?.focus(); } }}>
          <p id="retry-warning" role="alert">La consulta anterior pudo haberse procesado. Reintentar usará otra consulta del límite del piloto. Tu respuesta y tus notas no cambian.</p>
          <div className={s.row}><button id="retry-cancel" type="button" className={`${a.button} ${a.secondary}`} disabled={literature.sending} onClick={() => { setRetryConfirmation(null); document.getElementById("retry-analysis")?.focus(); }}>Cancelar</button>
            <button type="button" className={a.button} aria-describedby="retry-warning" disabled={busy || literature.sending} onClick={() => { setRetryConfirmation(null); void literature.send("",true,true); }}>Confirmar reintento</button></div>
        </div> : null}
        {literature.sending ? <p role="status" className={s.tutorStatus}>Consultando el fragmento de Malamed… Tu respuesta ya está guardada.</p> : null}
        {literature.error ? <p role="alert" className={s.tutorError}>{literature.error}</p> : null}
        {literature.pending ? <p className={s.tutorError}>Hay una consulta sin cierre verificable. No se repetirá automáticamente.</p> : null}
        <button type="button" className={s.historyRefresh} disabled={literature.sending || literature.loading} onClick={() => void literature.refresh()}>Actualizar historial</button>
      </> : view === "segunda" ? <>
        {opinion.loading ? <p role="status">Abriendo análisis guardado…</p> : opinion.error ? <p role="alert" className={s.tutorError}>{opinion.error}</p> : opinion.analysis ? <article className={s.tutorAnswer}>
          <span className={s.messageAuthor}>OpenAI · {opinion.analysis.model} · piloto guardado</span>
          <p className={s.savedProvenance}><time dateTime={opinion.analysis.generatedAt}>{new Date(opinion.analysis.generatedAt).toLocaleDateString("es-MX",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"})}</time> · Lectura de un análisis previo; chat en vivo pendiente.</p>
          <div data-tutor-response="true"><TutorRichText text={opinion.analysis.text} /></div>
          <details className={s.citationList}><summary>Fuentes proporcionadas al piloto · {opinion.analysis.references.length}</summary><p>No fueron buscadas por el modelo en esta consulta. Comprueba su alcance antes de adoptar una conclusión.</p>
            {opinion.analysis.references.map(c=><a key={c.id} href={c.href} target="_blank" rel="noopener noreferrer">[{c.id}] {c.label} ↗</a>)}
          </details>
        </article> : <div className={s.chatWelcome}><span className={s.welcomeIcon}><AppIcon name="book" size={34} /></span><h3>Segunda opinión</h3>
          <p>{!opinion.enabled ? "El análisis guardado del piloto no está habilitado en este servidor." : !opinion.covered ? "Este piloto solo incluye el reactivo 034. No se generó una respuesta para este tema." : !answered || opinion.requiresAnswer ? "Guarda tu respuesta inicial antes de abrir el análisis." : "No hay un análisis guardado disponible."}</p>
        </div>}
        <button type="button" className={s.historyRefresh} disabled={opinion.loading} onClick={opinion.refresh}>Actualizar análisis guardado</button>
      </> : <ComparisonPanel literature={literature} opinion={opinion} answered={answered} focused={focused} disabled={busy || literature.sending} onExpand={expandComparison} onView={openIndividualView} onVerdict={onVerdict} />}
      {preview && draft.trim() ? <aside className={s.questionPreview} aria-label="Vista previa de tu pregunta"><div className={s.previewHeading}><strong>Tu pregunta · vista previa</strong><button type="button" aria-label="Cerrar vista previa" onClick={() => setPreview(false)}>×</button></div><TutorRichText text={draft} /></aside> : null}
    </div>
    <form ref={composer} className={s.composer} onSubmit={submit}>
      <label className={s.srOnly} htmlFor="tutor-question">Tu pregunta al tutor</label>
      <textarea className={s.chatInput} id="tutor-question" rows={2} value={draft} maxLength={4000} disabled={busy || pending || literature.sending}
        aria-describedby="tutor-connection-hint" placeholder={view === "segunda" ? "Borrador · el chat de segunda opinión aún no está conectado" : view === "comparar" ? "Borrador de comparación · sin envío a IA" : literature.sharedBase && !literature.enabled ? "Borrador · dudas personales pendientes de conexión" : "Haz una pregunta o pide otra perspectiva…"}
        onChange={event => onDraft(view, event.target.value)} />
      <div className={s.composerTools}>
        <button ref={menuButton} type="button" className={s.commandToggle} aria-expanded={menuOpen} aria-controls="study-commands"
          onClick={() => setMenuOpen(open => !open)}>/ Comandos</button>
        <div className={s.quickCommands}>{tutorCommands.map(item => <button type="button" key={item.command} disabled={busy || pending} title={item.label} onClick={() => prepare(item.command)}>{item.command}</button>)}
          <button type="button" disabled={busy || pending} title="Ir a Mis notas sin perder tu pregunta" onClick={() => void run("/apuntes")}>/apuntes</button></div>
        <div className={s.composerSendTools}>
        <button type="button" className={s.previewToggle} aria-label="Vista previa de tu pregunta" title="Vista previa: tablas y fórmulas" aria-pressed={preview} disabled={!draft.trim()} onClick={() => setPreview(old => !old)}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
        </button>
        <button type="submit" className={s.sendButton} disabled={busy || pending || literature.sending || !canExecute}
          aria-label={tutorCommand ? "Preparar solicitud" : command ? "Ejecutar comando" : "Enviar al tutor"} title={tutorCommand ? "Preparar solicitud" : command ? "Ejecutar comando" : "Enviar al tutor"}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20V4m-6 6 6-6 6 6" /></svg>
        </button>
        </div>
      </div>
      <p id="tutor-connection-hint" className={s.srOnly}>Literatura admite Markdown, tablas y fórmulas. Primero guarda tu respuesta. {literature.sharedBase && !literature.enabled ? "Las explicaciones comunes requieren revisión; abrirlas no genera una nueva consulta. Dudas personales pendientes de conexión." : "Piloto limitado al reactivo 034."} Segunda opinión solo muestra un análisis previo, sin chat en vivo. Comparar permite leer los originales, sin síntesis de IA ni envío de preguntas. Los comandos de navegación y apuntes siguen disponibles.</p>
      {menuOpen ? <div className={s.commandPopover} id="study-commands" role="group" aria-label="Comandos de estudio">
        {tutorCommands.map(item => <button type="button" key={item.command} disabled={busy || pending}
          aria-label={item.label} onClick={() => prepare(item.command)}><span>{item.label}</span><code>{item.command}</code></button>)}
        <div className={s.commandDivider} role="separator" aria-label="Comandos de navegación y notas" />
        {commands.map(item => <button type="button" key={item.text} disabled={busy || pending} onClick={() => void run(item.text)}>
          <code>{item.text}</code><span>{item.label}</span>
        </button>)}
      </div> : null}
    </form>
  </>;
}
