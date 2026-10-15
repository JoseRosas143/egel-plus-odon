"use client";

import { useEffect, useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/acceso/domain";
import type { Profile, StudyPreferences } from "@/lib/estudiante/domain";
import { AccessShell } from "./shell";
import styles from "./styles.module.css";

async function updateResource(path: string, body: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch(path, { method: "PATCH", cache: "no-store", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (response.status === 401) window.location.replace("/login?aviso=sesion");
    if (!response.ok || !data.ok) return { ok: false, message: data.error === "INVALID_INPUT" && typeof data.message === "string"
      ? data.message : errorMessage(data.error ?? "DATABASE_UNAVAILABLE") };
    return { ok: true, message: "Cambios guardados." };
  } catch { return { ok: false, message: errorMessage("DATABASE_UNAVAILABLE") }; }
}
function ProfileForm({ profile, onName }: { profile: Profile; onName: (name: string) => void }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = new FormData(event.currentTarget);
    const body = { display_name: String(form.get("display_name") ?? "").trim(), timezone: String(form.get("timezone") ?? "").trim() };
    setPending(true); setResult(null);
    const saved = await updateResource("/api/estudiante/perfil", body);
    setResult(saved); if (saved.ok) onName(body.display_name); setPending(false);
  }
  return <section className={styles.section} aria-labelledby="profile-title">
    <h2 className={styles.sectionTitle} id="profile-title">Tu perfil</h2>
    <form className={styles.form} onSubmit={submit} aria-busy={pending}>
      <fieldset disabled={pending} className={styles.fields}>
        <div className={styles.field}><label className={styles.label} htmlFor="display_name">Nombre visible</label>
          <input className={styles.input} id="display_name" name="display_name" defaultValue={profile.display_name} required maxLength={100} autoComplete="name" /></div>
        <div className={styles.field}><label className={styles.label} htmlFor="timezone">Zona horaria</label>
          <input className={styles.input} id="timezone" name="timezone" defaultValue={profile.timezone} required maxLength={80} aria-describedby="tz-hint" />
          <p className={styles.hint} id="tz-hint">Por ejemplo: America/Mexico_City.</p></div>
        <button className={styles.button} type="submit">{pending ? "Guardando..." : "Guardar perfil"}</button>
      </fieldset>
      {result ? <p role={result.ok ? "status" : "alert"} className={result.ok ? styles.success : styles.error}>{result.message}</p> : null}
    </form>
  </section>;
}
function PreferencesForm({ preferences }: { preferences: StudyPreferences }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = new FormData(event.currentTarget);
    const body = { daily_goal_minutes: Number(form.get("daily_goal_minutes")), exam_date: String(form.get("exam_date") ?? "") || null };
    setPending(true); setResult(null);
    setResult(await updateResource("/api/estudiante/preferencias", body)); setPending(false);
  }
  return <section className={styles.section} aria-labelledby="preferences-title">
    <h2 className={styles.sectionTitle} id="preferences-title">Tu meta de estudio</h2>
    <form className={styles.form} onSubmit={submit} aria-busy={pending}>
      <fieldset disabled={pending} className={styles.fields}>
        <div className={styles.field}><label className={styles.label} htmlFor="daily_goal_minutes">Minutos al d&iacute;a</label>
          <input className={styles.input} id="daily_goal_minutes" name="daily_goal_minutes" type="number" min={5} max={240} step={1} defaultValue={preferences.daily_goal_minutes} required /></div>
        <div className={styles.field}><label className={styles.label} htmlFor="exam_date">Fecha del examen (opcional)</label>
          <input className={styles.input} id="exam_date" name="exam_date" type="date" defaultValue={preferences.exam_date ?? ""} min="1900-01-01" max="2200-12-31" />
          <p className={styles.hint}>Puedes dejarla vac&iacute;a si a&uacute;n no la tienes.</p></div>
        <button className={styles.button} type="submit">{pending ? "Guardando..." : "Guardar meta"}</button>
      </fieldset>
      {result ? <p role={result.ok ? "status" : "alert"} className={result.ok ? styles.success : styles.error}>{result.message}</p> : null}
    </form>
  </section>;
}
export function StudentAccount({ profile, preferences }: { profile: Profile; preferences: StudyPreferences }) {
  const [name, setName] = useState(profile.display_name);
  const [leaving, setLeaving] = useState(false);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    function onShow(event: PageTransitionEvent) { if (event.persisted) window.location.reload(); }
    async function onFocus() {
      try {
        const response = await fetch("/api/auth/sesion", { cache: "no-store", credentials: "same-origin" });
        if (response.status === 401) window.location.replace("/login?aviso=sesion");
      } catch { /* A transient outage must not be treated as a logout. */ }
    }
    window.addEventListener("pageshow", onShow); window.addEventListener("focus", onFocus);
    return () => { window.removeEventListener("pageshow", onShow); window.removeEventListener("focus", onFocus); };
  }, []);
  async function logout() {
    if (leaving) return; setLeaving(true); setFailure("");
    try {
      const response = await fetch("/api/auth/salir", { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await response.json();
      if (!response.ok || !data.ok) { setFailure("No se pudo confirmar el cierre. Intenta de nuevo."); return; }
      window.location.replace("/login?aviso=salida");
    } catch { setFailure("No se pudo confirmar el cierre. Intenta de nuevo."); }
    finally { setLeaving(false); }
  }
  return <AccessShell wide action={<button type="button" className={`${styles.button} ${styles.secondary}`} onClick={logout} disabled={leaving}>{leaving ? "Cerrando..." : "Cerrar sesi\u00f3n"}</button>}>
    <h1 className={styles.title}>Hola, {name}</h1>
    <p className={styles.subtitle}>Esta es tu cuenta personal de EGEL Plus ODON.</p>
    {failure ? <p role="alert" className={styles.error}>{failure}</p> : null}
    <div className={styles.sections}><ProfileForm profile={profile} onName={setName} /><PreferencesForm preferences={preferences} /></div>
    <div className={styles.checks}><a className={styles.link} href="/api/estudiante/perfil" target="_blank" rel="noreferrer">Comprobar mi perfil (JSON)</a>
      <a className={styles.link} href="/api/estudiante/preferencias" target="_blank" rel="noreferrer">Comprobar mis preferencias (JSON)</a></div>
    <p className={styles.hint}>En este bloque solo est&aacute;n habilitados el acceso y las preferencias. El banco de reactivos, los apuntes y los tutores siguen en desarrollo.</p>
  </AccessShell>;
}
