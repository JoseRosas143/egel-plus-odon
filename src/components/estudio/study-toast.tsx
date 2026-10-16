"use client";

import { useEffect, useState } from "react";
import s from "./styles.module.css";

export type ToastMessage = {
  id: number; text: string; tone: "success" | "error" | "info";
  action?: { label: string; href: string };
};

export function StudyToast({ message, onDismiss }: { message: ToastMessage | null; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!message || paused) return;
    const timer = window.setTimeout(onDismiss, message.tone === "error" ? 12000 : 6000);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss, paused]);
  if (!message) return null;
  return <aside className={[s.toast, message.tone === "error" ? s.toastError : message.tone === "success" ? s.toastSuccess : s.toastInfo].join(" ")}
    aria-label="Notificación" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocusCapture={() => setPaused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false); }}>
    <div className={s.toastBody} role={message.tone === "error" ? "alert" : "status"} key={message.id}>
      <p>{message.text}</p>{message.action ? <a href={message.action.href}>{message.action.label}</a> : null}
    </div>
    <button type="button" onClick={onDismiss} className={s.toastClose} aria-label="Cerrar notificación" title="Cerrar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
    </button>
  </aside>;
}
