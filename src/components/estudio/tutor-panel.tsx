"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import a from "@/components/acceso/styles.module.css";
import s from "./styles.module.css";
import { tutorCommands, type TutorCommand } from "@/lib/estudio/tutor-commands";

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

export function TutorPanel({ position, busy, drafts, onDraft, onCommand, onPrepare, onNotice }: {
  position: number; busy: boolean; drafts: ChatDrafts;
  onDraft: (view: TutorView, value: string) => void;
  onCommand: (command: StudyCommand) => Promise<boolean>;
  onPrepare: (command: TutorCommand, view: TutorView) => boolean;
  onNotice: (text: string) => void;
}) {
  const [view, setView] = useState<TutorView>("base");
  const [pending, setPending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const composer = useRef<HTMLFormElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const current = views.find(item => item.key === view)!;
  const draft = drafts[view];
  const command = commands.find(item => item.text === draft.trim().toLowerCase());
  const tutorCommand = tutorCommands.find(item => item.command === draft.trim().toLowerCase());
  const canExecute = !!command || !!tutorCommand;

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
  }
  function prepare(command: TutorCommand) {
    if (busy || pending) return;
    setMenuOpen(false);
    onPrepare(command, view);
  }
  function switchTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % views.length;
    else if (event.key === "ArrowLeft") next = (index + views.length - 1) % views.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = views.length - 1;
    else return;
    event.preventDefault();
    setView(views[next].key);
    setMenuOpen(false);
    document.getElementById("tutor-tab-" + views[next].key)?.focus();
  }
  return <>
    <div className={s.panelHeading}>
      <h2 className={a.sectionTitle}>Tutor IA<span className={s.srOnly}> · Reactivo {position}</span></h2>
      <button type="button" className={s.connection} title="Ver estado del tutor" onClick={() => onNotice("El tutor aún no está conectado. Puedes escribir borradores y usar los comandos de estudio.")}>Sin conexión</button>
    </div>
    <div className={s.tutorTabs} role="tablist" aria-label="Vistas del tutor">
      {views.map((item, index) => <button type="button" key={item.key} id={"tutor-tab-" + item.key}
        role="tab" aria-selected={view === item.key} aria-controls="tutor-content" aria-label={item.full} title={item.full}
        tabIndex={view === item.key ? 0 : -1} onKeyDown={event => switchTab(event, index)}
        onClick={() => { setView(item.key); setMenuOpen(false); }}>{item.label}</button>)}
    </div>
    <div className={s.chatHistory} id="tutor-content" role="tabpanel" aria-labelledby={"tutor-tab-" + view}>
      <p className={s.chatEmpty}>{current.empty}</p>
    </div>
    <form ref={composer} className={s.composer} onSubmit={submit}>
      <label className={s.srOnly} htmlFor="tutor-question">Tu pregunta al tutor</label>
      <textarea className={s.chatInput} id="tutor-question" rows={2} value={draft} maxLength={4000} disabled={busy || pending}
        aria-describedby="tutor-connection-hint" placeholder="Tu pregunta…"
        onChange={event => onDraft(view, event.target.value)} />
      <div className={s.composerTools}>
        <button ref={menuButton} type="button" className={s.commandToggle} aria-expanded={menuOpen} aria-controls="study-commands"
          onClick={() => setMenuOpen(open => !open)}>/ Comandos</button>
        <button type="submit" className={s.sendButton} disabled={busy || pending || !canExecute}
          aria-label={tutorCommand ? "Preparar solicitud" : command ? "Ejecutar comando" : "Enviar al tutor"} title={tutorCommand ? "Preparar solicitud" : command ? "Ejecutar comando" : "Envío pendiente de conexión"}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20V4m-6 6 6-6 6 6" /></svg>
        </button>
      </div>
      <p id="tutor-connection-hint" className={s.srOnly}>El envío de preguntas está pendiente de conexión. Puedes guardar un borrador en esta pantalla o ejecutar un comando de estudio.</p>
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
