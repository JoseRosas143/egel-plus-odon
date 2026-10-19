"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import s from "./styles.module.css";
import { defaultPanelSizes as defaults, focusedTutorSize, resizePanelSizes } from "@/lib/estudio/panel-layout";

export type StudyPanel = "reactivo" | "tutor" | "notas";
type Drag = { pointerId: number; index: number; x: number; width: number; sizes: number[]; initial: number };

export function ResizablePanels({ active, reactivo, tutor, notas, focused = false, onExitFocus, notification }: {
  active: StudyPanel; reactivo: ReactNode; tutor: ReactNode; notas: ReactNode;
  focused?: boolean; onExitFocus?: () => void;
  notification?: ReactNode;
}) {
  const [sizes, setSizes] = useState(defaults);
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    const container = root.current;
    if (!focused || !container) return;
    // This is an inline layout, not a modal: notes and navigation remain reachable.
    drag.current = null;
    function keyboard(event: globalThis.KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.key === "Escape") {
        // The inner menu owns the first Escape, even when its listener was added later.
        if (container!.querySelector('[aria-controls="study-commands"][aria-expanded="true"]')) return;
        event.preventDefault(); onExitFocus?.();
      }
    }
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
    };
  }, [focused, onExitFocus]);

  function contentWidth() { return Math.max(1, (root.current?.getBoundingClientRect().width ?? 1024) - (focused ? 12 : 24)); }
  function resize(index: number, desired: number, original: number[], width: number) {
    setSizes(resizePanelSizes(original, index, desired, width, focused));
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
    if (focused) {
      const ratio = sizes[0] / focusedTutorSize(sizes);
      const combined = measured[1];
      measured[0] = combined * ratio;
      measured[1] = combined * (1 - ratio);
    }
    drag.current = { pointerId: event.pointerId, index, x: event.clientX, width, sizes: measured, initial: focused ? focusedTutorSize(measured) : measured[index] };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    resize(current.index, current.initial + (event.clientX - current.x) / current.width * 100, current.sizes, current.width);
  }
  function stop(event: PointerEvent<HTMLDivElement>) {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function key(event: KeyboardEvent<HTMLDivElement>, index: number) {
    if (event.key === "Enter") { event.preventDefault(); setSizes(defaults); return; }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    resize(index, (focused ? focusedTutorSize(sizes) : sizes[index]) + (event.key === "ArrowRight" ? 2 : -2), sizes, contentWidth());
  }
  function separator(index: number, name: string) {
    const value = focused ? focusedTutorSize(sizes) : sizes[index];
    return <div role="separator" data-separator-index={index} aria-orientation="vertical" tabIndex={0}
      aria-label={name} aria-controls={index === 0 ? "study-reactivo study-tutor" : "study-tutor study-notas"}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}
      aria-valuetext={`${Math.round(value)} por ciento del espacio`}
      className={s.separator} title="Arrastra para ajustar. Flechas para ajustar con teclado. Doble clic o Enter para restablecer."
      onPointerDown={event => start(event, index)} onPointerMove={move} onPointerUp={stop}
      onPointerCancel={stop} onLostPointerCapture={() => { drag.current = null; }}
      onDoubleClick={() => setSizes(defaults)} onKeyDown={event => key(event, index)}><span aria-hidden="true" /></div>;
  }
  const style: CSSProperties = {
    gridTemplateColumns: focused
      ? `minmax(280px, ${focusedTutorSize(sizes)}fr) 12px minmax(240px, ${sizes[2]}fr)`
      : `minmax(240px, ${sizes[0]}fr) 12px minmax(280px, ${sizes[1]}fr) 12px minmax(240px, ${sizes[2]}fr)`,
  };
  return <div ref={root} className={`${s.workspace} ${focused ? s.focusMode : ""}`} style={style}
    data-focus-mode={focused ? "true" : undefined}>
    <section id="study-reactivo" data-panel="reactivo" aria-label="Reactivo" className={`${s.panel} ${active !== "reactivo" ? s.mobileHidden : ""}`}>{reactivo}</section>
    {separator(0, "Ajustar ancho de Reactivo y Tutor IA")}
    <section id="study-tutor" data-panel="tutor" aria-label="Tutor IA" className={`${s.panel} ${s.tutorPanel} ${active !== "tutor" ? s.mobileHidden : ""}`}>{tutor}</section>
    {separator(1, "Ajustar ancho de Tutor IA y Mis notas")}
    <section id="study-notas" data-panel="notas" aria-label="Mis notas" className={`${s.panel} ${active !== "notas" ? s.mobileHidden : ""}`}>{notas}</section>
    {notification}
  </div>;
}
