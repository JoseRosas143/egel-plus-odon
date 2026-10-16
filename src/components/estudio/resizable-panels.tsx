"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import s from "./styles.module.css";

export type StudyPanel = "reactivo" | "tutor" | "notas";
const defaults = [30, 42, 28];
const minimumPixels = [240, 280, 240];
type Drag = { pointerId: number; index: number; x: number; width: number; sizes: number[] };

export function ResizablePanels({ active, reactivo, tutor, notas }: {
  active: StudyPanel; reactivo: ReactNode; tutor: ReactNode; notas: ReactNode;
}) {
  const [sizes, setSizes] = useState(defaults);
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  function contentWidth() { return Math.max(1, (root.current?.getBoundingClientRect().width ?? 1024) - 24); }
  function resize(index: number, desired: number, original: number[], width: number) {
    const total = original[index] + original[index + 1];
    const min = Math.max(18, minimumPixels[index] / width * 100);
    const max = total - Math.max(18, minimumPixels[index + 1] / width * 100);
    const next = [...original];
    next[index] = Math.min(Math.max(desired, min), Math.max(min, max));
    next[index + 1] = total - next[index];
    setSizes(next);
  }
  function start(event: PointerEvent<HTMLDivElement>, index: number) {
    if (event.button !== 0 || !root.current) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    const width = contentWidth();
    const measured = Array.from(root.current.children)
      .filter(element => element.getAttribute("data-panel") !== null)
      .map(element => element.getBoundingClientRect().width / width * 100);
    drag.current = { pointerId: event.pointerId, index, x: event.clientX, width, sizes: measured };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    resize(current.index, current.sizes[current.index] + (event.clientX - current.x) / current.width * 100, current.sizes, current.width);
  }
  function stop(event: PointerEvent<HTMLDivElement>) {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function key(event: KeyboardEvent<HTMLDivElement>, index: number) {
    if (event.key === "Enter") { event.preventDefault(); setSizes(defaults); return; }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    resize(index, sizes[index] + (event.key === "ArrowRight" ? 2 : -2), sizes, contentWidth());
  }
  function separator(index: number, name: string) {
    return <div role="separator" aria-orientation="vertical" tabIndex={0}
      aria-label={name} aria-controls={index === 0 ? "study-reactivo study-tutor" : "study-tutor study-notas"}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(sizes[index])}
      aria-valuetext={`${Math.round(sizes[index])} por ciento del espacio`}
      className={s.separator} title="Arrastra para ajustar. Flechas para ajustar con teclado. Doble clic o Enter para restablecer."
      onPointerDown={event => start(event, index)} onPointerMove={move} onPointerUp={stop}
      onPointerCancel={stop} onLostPointerCapture={() => { drag.current = null; }}
      onDoubleClick={() => setSizes(defaults)} onKeyDown={event => key(event, index)}><span aria-hidden="true" /></div>;
  }
  const style: CSSProperties = {
    gridTemplateColumns: `minmax(240px, ${sizes[0]}fr) 12px minmax(280px, ${sizes[1]}fr) 12px minmax(240px, ${sizes[2]}fr)`,
  };
  return <div ref={root} className={s.workspace} style={style}>
    <section id="study-reactivo" data-panel="reactivo" aria-label="Reactivo" className={`${s.panel} ${active !== "reactivo" ? s.mobileHidden : ""}`}>{reactivo}</section>
    {separator(0, "Ajustar ancho de Reactivo y Tutor IA")}
    <section id="study-tutor" data-panel="tutor" aria-label="Tutor IA" className={`${s.panel} ${s.tutorPanel} ${active !== "tutor" ? s.mobileHidden : ""}`}>{tutor}</section>
    {separator(1, "Ajustar ancho de Tutor IA y Mis notas")}
    <section id="study-notas" data-panel="notas" aria-label="Mis notas" className={`${s.panel} ${active !== "notas" ? s.mobileHidden : ""}`}>{notas}</section>
  </div>;
}
