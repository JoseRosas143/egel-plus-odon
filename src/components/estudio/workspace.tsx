"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AccessShell } from "@/components/acceso/shell";
import a from "@/components/acceso/styles.module.css";
import s from "./styles.module.css";
import { blankNote, addHighlight } from "@/lib/estudio/domain";
import type { Question, Note, NoteFields, Letter, Attempt } from "@/lib/estudio/domain";
import { studyRequest, errorText, ClientError } from "@/lib/estudio/client";
import { ResizablePanels, type StudyPanel } from "./resizable-panels";
import { TutorPanel, emptyChatDrafts, type StudyCommand, type TutorView } from "./tutor-panel";
import { StudyToast, type ToastMessage } from "./study-toast";
import { prepareTutorRequest, type TutorCommand } from "@/lib/estudio/tutor-commands";

type Loaded = { ok: true; total: number; can_import: boolean; question: Question | null; note: Note | null; last_answer: Attempt | null };
const panels = [{ key: "reactivo", label: "Reactivo" }, { key: "tutor", label: "Tutor IA" }, { key: "notas", label: "Mis notas" }] as const;

function PanelIcon({ name }: { name: StudyPanel }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "reactivo" ? <><path d="M14 3H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9z" /><path d="M14 3v6h6M8 13h8M8 17h6" /></> :
      name === "tutor" ? <><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M7 8h10M7 12h7" /></> :
        <><path d="M16 4H5a2 2 0 0 0-2 2v14a1 1 0 0 0 1 1h13a2 2 0 0 0 2-2v-9M7 4v17" /><path d="m12 14 1-4 7-7 3 3-7 7-4 1z" /></>}
  </svg>;
}


function NavigationIcon({ name }: { name: "previous" | "next" | "shuffle" | "info" }) {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "previous" ? <path d="M20 12H4m6-6-6 6 6 6" /> : name === "next" ? <path d="M4 12h16m-6-6 6 6-6 6" /> :
      name === "shuffle" ? <><path d="m4 4 5 5m5 5 7 7M4 20 21 3M16 3h5v5M16 21h5v-5" /></> :
        <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>}
  </svg>;
}

export function StudyWorkspace() {
  const [model, setModel] = useState<Loaded | null>(null);
  const [fields, setFields] = useState<NoteFields>(blankNote);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Letter | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [panel, setPanel] = useState<StudyPanel>("reactivo");
  const [chatDrafts, setChatDrafts] = useState(emptyChatDrafts);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastSequence = useRef(0);
  const [number, setNumber] = useState("1");
  const statement = useRef<HTMLParagraphElement>(null);
  const notebook = useRef<HTMLTextAreaElement>(null);
  const running = useRef(false);
  const selectionContext = useRef<{ questionId: string; version: number; text: string } | null>(null);
  const q = model?.question;
  const questionId = q?.id, questionVersion = q?.version;
  const total = model?.total ?? 0;
  const lastAnswer = model?.last_answer;
  const unsaved = dirty || selected !== (lastAnswer?.selected_answer ?? null) || Object.values(chatDrafts).some(value => value.trim().length > 0);

  const dismissToast = useCallback(() => setToast(null), []);
  const notify = useCallback((text: string, tone: ToastMessage["tone"] = "info", action?: ToastMessage["action"]) => {
    setToast({ id: ++toastSequence.current, text, tone, action });
  }, []);
  const showError = useCallback((e: unknown) => {
    const expired = e instanceof ClientError && e.code === "AUTH_REQUIRED";
    notify(errorText(e) + (expired ? " Copia tus cambios antes de salir." : ""), "error",
      expired ? { label: "Iniciar sesión", href: "/login" } : undefined);
  }, [notify]);
  const accept = useCallback((data: Loaded) => {
    selectionContext.current = null;
    setModel(data);
    setFields(data.note ? {
      general_note: data.note.general_note, note_a: data.note.note_a, note_b: data.note.note_b, note_c: data.note.note_c,
      personal_verdict: data.note.personal_verdict, favorite: data.note.favorite, highlights: data.note.highlights,
    } : blankNote());
    setRevision(data.note?.revision ?? 0);
    setSelected(data.last_answer?.selected_answer ?? null);
    setNumber(String(data.question?.position ?? 1));
    setDirty(false);
    setChatDrafts(emptyChatDrafts());
  }, []);
  const change = useCallback(<K extends keyof NoteFields,>(key: K, value: NoteFields[K]) => {
    setFields(old => ({ ...old, [key]: value }));
    setDirty(true);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const n = new URL(window.location.href).searchParams.get("numero");
    studyRequest<Loaded>("/api/estudio/reactivo" + (n ? "?numero=" + encodeURIComponent(n) : ""), undefined, controller.signal)
      .then(accept).catch(e => { if (!controller.signal.aborted) showError(e); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [accept, showError]);
  useEffect(() => {
    if (!unsaved) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [unsaved]);

  useEffect(() => {
    if (!questionId || questionVersion === undefined) return;
    const identity = { questionId, version: questionVersion };
    function rememberSelection() {
      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement && active.selectionStart !== active.selectionEnd) {
        selectionContext.current = null;
        return;
      }
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
      const range = selection.getRangeAt(0);
      function context(node: Node) {
        const element = node instanceof Element ? node : node.parentElement;
        return element?.closest('#tutor-content [data-tutor-response]');
      }
      const start = context(range.startContainer), end = context(range.endContainer);
      if (start && start === end && selection.toString().trim()) {
        selectionContext.current = { ...identity, text: selection.toString() };
      } else selectionContext.current = null;
    }
    document.addEventListener("selectionchange", rememberSelection);
    document.addEventListener("select", rememberSelection, true);
    return () => {
      document.removeEventListener("selectionchange", rememberSelection);
      document.removeEventListener("select", rememberSelection, true);
    };
  }, [questionId, questionVersion]);

  const highlight = useCallback(() => {
    if (running.current) return;
    const root = statement.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0 || !q) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer) || range.collapsed) {
      notify("Selecciona texto del enunciado y haz clic en Resaltar o presiona R.");
      return;
    }
    const before = range.cloneRange();
    before.selectNodeContents(root);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length, end = start + range.toString().length;
    try {
      change("highlights", addHighlight(fields.highlights, { start, end, quote: q.stem.slice(start, end) }, q.stem));
      selection.removeAllRanges();
    } catch (e) { showError(e); }
  }, [change, fields.highlights, q, notify, showError]);
  useEffect(() => {
    function keyHandler(event: globalThis.KeyboardEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (event.defaultPrevented || event.repeat || event.isComposing || event.key.toLowerCase() !== "r" ||
        event.ctrlKey || event.metaKey || event.altKey ||
        target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
      const root = statement.current, selection = window.getSelection();
      if (!root || !selection || selection.rangeCount === 0 || running.current) return;
      const range = selection.getRangeAt(0);
      if (!root.contains(range.startContainer) || !root.contains(range.endContainer) || range.collapsed) return;
      event.preventDefault();
      highlight();
    }
    window.addEventListener("keydown", keyHandler);
    return () => window.removeEventListener("keydown", keyHandler);
  }, [highlight]);

  function confirmLeave(command?: StudyCommand) {
    const pendingChat = Object.values(chatDrafts).some(value => value.trim().length > 0 && value.trim().toLowerCase() !== command);
    const pending = dirty || selected !== (lastAnswer?.selected_answer ?? null) || pendingChat;
    return !pending || window.confirm("Hay apuntes, una respuesta o una pregunta pendientes. Cambiar de pantalla descartará los cambios sin guardar. ¿Continuar?");
  }
  async function go(n?: number, command?: StudyCommand): Promise<boolean> {
    if (running.current || !confirmLeave(command)) return false;
    if (n !== undefined && (!Number.isInteger(n) || n < 1 || n > (total > 0 ? total : 469))) {
      notify("Indica un número válido del banco.", "error");
      return false;
    }
    running.current = true; setBusy(true);
    try {
      const data = await studyRequest<Loaded>("/api/estudio/reactivo" + (n !== undefined ? "?numero=" + n : ""));
      accept(data);
      if (data.question) {
        window.history.replaceState(null, "", "/estudio?numero=" + data.question.position);
        await studyRequest("/api/estudio/posicion", { question_id: data.question.id, question_version: data.question.version });
      }
      return true;
    } catch (e) { showError(e); return false; }
    finally { running.current = false; setBusy(false); setLoading(false); }
  }
  async function save(): Promise<boolean> {
    if (!q || running.current) return false;
    running.current = true; setBusy(true);
    try {
      const result = await studyRequest<{ ok: true; note: Note }>("/api/estudio/guardar", {
        question_id: q.id, question_version: q.version, expected_revision: revision, fields,
      });
      setRevision(result.note.revision); setDirty(false); notify("Apuntes guardados.", "success");
      return true;
    } catch (e) { showError(e); return false; }
    finally { running.current = false; setBusy(false); }
  }
  async function answer() {
    if (!q || !selected || !model || running.current) return;
    running.current = true; setBusy(true);
    try {
      const result = await studyRequest<{ ok: true; attempt: Attempt }>("/api/estudio/respuesta", {
        question_id: q.id, question_version: q.version, selected_answer: selected, request_id: crypto.randomUUID(),
      });
      setModel({ ...model, last_answer: result.attempt });
      notify("Respuesta guardada. Sin calificar.", "success");
    } catch (e) { showError(e); }
    finally { running.current = false; setBusy(false); }
  }
  function updateDraft(view: TutorView, value: string) { setChatDrafts(old => ({ ...old, [view]: value })); }
  function prepareCommand(command: TutorCommand, view: TutorView): boolean {
    if (!q || running.current) return false;
    const remembered = selectionContext.current;
    const selection = remembered?.questionId === q.id && remembered.version === q.version ? remembered.text : "";
    if (command === "/investigar" && !selection) {
      notify("Selecciona texto de una respuesta del tutor. Podrás investigarlo cuando haya respuestas del servicio conectado.");
      return false;
    }
    try {
      const request = prepareTutorRequest(command, q.position, chatDrafts[view], selection);
      setChatDrafts(old => ({ ...old, [view]: request }));
      setPanel("tutor");
      requestAnimationFrame(() => document.getElementById("tutor-question")?.focus());
      notify("Solicitud preparada. El tutor sigue sin conexión.");
      return true;
    } catch (e) { notify(errorText(e)); return false; }
  }
  async function runCommand(command: StudyCommand): Promise<boolean> {
    if (busy || !q) return false;
    if (command === "/guardar") return save();
    if (command === "/apuntes") {
      setPanel("notas");
      requestAnimationFrame(() => notebook.current?.focus());
      return true;
    }
    if (command === "/siguiente" && q.position < total) return go(q.position + 1, command);
    if (command === "/anterior" && q.position > 1) return go(q.position - 1, command);
    notify(command === "/siguiente" ? "Estás en el último reactivo." : "Estás en el primer reactivo.");
    return false;
  }
  function switchPanel(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % panels.length;
    else if (event.key === "ArrowLeft") next = (index + panels.length - 1) % panels.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = panels.length - 1;
    else return;
    event.preventDefault();
    setPanel(panels[next].key);
    document.getElementById("panel-tab-" + panels[next].key)?.focus();
  }

  const pieces: ReactNode[] = [];
  if (q) {
    let pos = 0;
    fields.highlights.forEach((h, i) => {
      pieces.push(<Fragment key={"t" + i}>{q.stem.slice(pos, h.start)}</Fragment>, <mark key={"h" + i}>{q.stem.slice(h.start, h.end)}</mark>);
      pos = h.end;
    });
    pieces.push(<Fragment key="tail">{q.stem.slice(pos)}</Fragment>);
  }
  const nav = <nav className={s.nav} aria-label="Estudio">
    <a href="/mis-apuntes" onClick={event => { if (!confirmLeave()) event.preventDefault(); }}>Mis apuntes</a>
    <a href="/cuenta" onClick={event => { if (!confirmLeave()) event.preventDefault(); }}>Mi cuenta</a>
  </nav>;

  return <AccessShell wide study action={nav}>
    <h1 className={s.srOnly}>Espacio de estudio</h1>
    <StudyToast key={toast?.id ?? 0} message={toast} onDismiss={dismissToast} />
    {loading ? <p role="status">Cargando tu espacio...</p> : null}
    {!loading && !model ? <button className={a.button} type="button" onClick={() => void go()}>Volver a intentar</button> : null}
    {model && total === 0 ? <p className={a.notice}>Todavía no hay reactivos disponibles. La carga inicial del banco se administra fuera del área de estudio.</p> : null}
    {q ? <>
      <div className={[s.toolbar, panel !== "reactivo" ? s.mobileToolbarHidden : ""].join(" ")}>
        <button type="button" className={[a.button, a.secondary, s.iconButton].join(" ")} disabled={busy || q.position <= 1} aria-label="Reactivo anterior" title="Anterior" onClick={() => void go(q.position - 1)}><NavigationIcon name="previous" /></button>
        <button type="button" className={[a.button, s.iconButton].join(" ")} disabled={busy || q.position >= total} aria-label="Siguiente reactivo" title="Siguiente" onClick={() => void go(q.position + 1)}><NavigationIcon name="next" /></button>
        <button type="button" className={[a.button, a.secondary, s.iconButton].join(" ")} disabled={busy} aria-label="Reactivo aleatorio" title="Aleatorio" onClick={() => void go(total > 1 ? ((q.position + Math.floor(Math.random() * (total - 1))) % total) + 1 : q.position)}><NavigationIcon name="shuffle" /></button>
        <form className={s.jump} onSubmit={event => { event.preventDefault(); void go(Number(number)); }}>
          <label htmlFor="question-number">Reactivo</label>
          <input className={a.input} type="number" id="question-number" min={1} max={total} value={number} disabled={busy} onChange={event => setNumber(event.target.value)} />
          <button className={[a.button, a.secondary].join(" ")} disabled={busy}>Ir</button>
        </form>
      </div>
      <div className={s.mobileTabs} role="tablist" aria-label="Paneles de estudio">
        {panels.map((item, index) => <button type="button" role="tab" id={"panel-tab-" + item.key} key={item.key}
          aria-selected={panel === item.key} aria-controls={"study-" + item.key} tabIndex={panel === item.key ? 0 : -1}
          onKeyDown={event => switchPanel(event, index)} onClick={() => setPanel(item.key)}><PanelIcon name={item.key} /><span>{item.label}</span></button>)}
      </div>
      <ResizablePanels active={panel}
        reactivo={<>
          <div className={s.panelHeading}>
            <h2 className={a.sectionTitle}>Reactivo {String(q.position).padStart(3, "0")} <span className={s.counter}>/ {total}</span></h2>
            <details className={s.questionInfo}><summary aria-label="Información del reactivo" title="Información del reactivo"><NavigationIcon name="info" /></summary>
              <div className={s.infoPopover}><p>Fuente {q.source_number} · PDF {q.source_pages.join(", ")} · v{q.version}</p>
                <p>Práctica sin calificación. La clave oficial y el tutor todavía no están habilitados.</p>
                <p>Preparación independiente, sin afiliación a CENEVAL.</p>
                {q.review_flags.length > 0 ? <p>Incidencia editorial pendiente; se conserva el texto extraído.</p> : null}</div>
            </details>
          </div>
          <p ref={statement} className={s.statement}>{pieces}</p>
          <button type="button" className={[a.button, a.secondary, s.highlightButton].join(" ")} disabled={busy}
            onMouseDown={event => event.preventDefault()} onClick={highlight}>
            <span>Resaltar selección</span><small>(haz clic o presiona R)</small>
          </button>
          <fieldset className={s.options} disabled={busy}>
            <legend className={s.srOnly}>Tu respuesta inicial</legend>
            {q.options.map(option => <label key={option.id} className={s.answer}>
              <input type="radio" name="answer" value={option.letter} checked={selected === option.letter} onChange={() => setSelected(option.letter)} />
              <span><strong>{option.letter}.</strong> {option.text}</span>
            </label>)}
          </fieldset>
          <div className={s.row}><button type="button" className={a.button} disabled={busy || !selected} onClick={() => void answer()}>Guardar respuesta</button></div>
        </>}
        tutor={<TutorPanel position={q.position} busy={busy} drafts={chatDrafts} onDraft={updateDraft} onCommand={runCommand} onPrepare={prepareCommand} onNotice={notify} />}
        notas={<>
          <div className={s.panelHeading}><h2 className={a.sectionTitle}>Mis notas</h2>
            <span className={s.recordedChoice} title="Respuesta inicial registrada, sin calificación">Inicial: {lastAnswer?.selected_answer ?? "—"}</span></div>
          <fieldset className={a.fields} disabled={busy}>
            <label className={a.field}><span className={a.label}>Apuntes generales</span>
              <textarea ref={notebook} className={s.area} value={fields.general_note} maxLength={10000} onChange={event => change("general_note", event.target.value)} /></label>
            <div className={s.grid}>{(["A", "B", "C"] as const).map(letter => {
              const key = ("note_" + letter.toLowerCase()) as "note_a" | "note_b" | "note_c";
              return <label key={letter} className={a.field}><span className={a.label}>Opción {letter}</span>
                <span className={s.optionCaption}>{q.options.find(option => option.letter === letter)?.text ?? "Texto no disponible"}</span>
                <textarea className={s.area} maxLength={5000} value={fields[key]} onChange={event => change(key, event.target.value)} /></label>;
            })}</div>
            <label className={a.field}><span className={a.label} title="Tu conclusión personal; no es una clave oficial ni un veredicto de IA">Mi veredicto personal</span>
              <select className={a.input} value={fields.personal_verdict ?? ""} onChange={event => change("personal_verdict", event.target.value ? event.target.value as Letter : null)}>
                <option value="">Aún no lo decido</option><option value="A">Opción A</option><option value="B">Opción B</option><option value="C">Opción C</option>
              </select></label>
            <label className={s.check}><input type="checkbox" checked={fields.favorite} onChange={event => change("favorite", event.target.checked)} />Marcar como favorito para repasar</label>
            {fields.highlights.length > 0 ? <div><p className={a.label}>Fragmentos resaltados</p>
              {fields.highlights.map((h, i) => <div className={s.fragment} key={h.start + "-" + h.end}><span>{h.quote}</span>
                <button type="button" onClick={() => change("highlights", fields.highlights.filter((_, j) => j !== i))}>Quitar</button></div>)}</div> : null}
            <div className={s.saveBar}><button type="button" className={a.button} onClick={() => void save()}>{busy ? "Guardando..." : "Guardar apuntes"}</button>
              {dirty ? <span className={s.draftIndicator} role="status" aria-label="Cambios sin guardar" title="Cambios sin guardar" /> : null}</div>
          </fieldset>
        </>} />
    </> : null}
  </AccessShell>;
}
