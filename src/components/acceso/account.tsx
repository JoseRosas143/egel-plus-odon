"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { errorMessage } from "@/lib/acceso/domain";
import type { Profile, StudyPreferences } from "@/lib/estudiante/domain";
import type { DashboardStats } from "@/lib/estudiante/dashboard";
import { StudyToast, type ToastMessage } from "@/components/estudio/study-toast";
import { DashboardCards, DashboardIcon } from "./dashboard-cards";
import { AccessShell } from "./shell";
import styles from "./styles.module.css";
import dashboard from "./dashboard.module.css";

async function updateResource<T>(path: string, body: unknown, resource: "profile" | "preferences"): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    const response = await fetch(path, { method: "PATCH", cache: "no-store", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (response.status === 401) window.location.replace("/login?aviso=sesion");
    if (!response.ok || !data.ok) return { ok: false, message: data.error === "INVALID_INPUT" && typeof data.message === "string"
      ? data.message : errorMessage(data.error ?? "DATABASE_UNAVAILABLE") };
    return { ok: true, value: data[resource] as T };
  } catch { return { ok: false, message: errorMessage("DATABASE_UNAVAILABLE") }; }
}
type Notify = (text: string, tone: ToastMessage["tone"]) => void;
function ProfileForm({ profile, onSaved, notify }: { profile: Profile; onSaved: (profile: Profile) => void; notify: Notify }) {
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = new FormData(event.currentTarget);
    const body = { display_name: String(form.get("display_name") ?? "").trim(), timezone: String(form.get("timezone") ?? "").trim() };
    setPending(true);
    const saved = await updateResource<Profile>("/api/estudiante/perfil", body, "profile");
    if (saved.ok) { onSaved(saved.value); notify("Perfil guardado.", "success"); }
    else notify(saved.message, "error");
    setPending(false);
  }
  return <details className={dashboard.accordion}>
    <summary><DashboardIcon kind="profile" />Tu perfil<DashboardIcon kind="chevron" /></summary>
    <form className={styles.form} onSubmit={submit} aria-busy={pending}>
      <fieldset disabled={pending} className={styles.fields}>
        <div className={styles.field}><label className={styles.label} htmlFor="display_name">Nombre visible</label>
          <input className={styles.input} id="display_name" name="display_name" defaultValue={profile.display_name} required maxLength={100} autoComplete="name" /></div>
        <div className={styles.field}><label className={styles.label} htmlFor="timezone">Zona horaria</label>
          <input className={styles.input} id="timezone" name="timezone" defaultValue={profile.timezone} required maxLength={80} aria-describedby="tz-hint" />
          <p className={styles.hint} id="tz-hint">Por ejemplo: America/Mexico_City.</p></div>
        <button className={styles.button} type="submit">{pending ? "Guardando..." : "Guardar perfil"}</button>
      </fieldset>
    </form>
  </details>;
}
function PreferencesForm({ preferences, onSaved, notify, detailsRef }: {
  preferences: StudyPreferences; onSaved: (preferences: StudyPreferences) => void; notify: Notify; detailsRef: RefObject<HTMLDetailsElement | null>;
}) {
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = new FormData(event.currentTarget);
    const body = { daily_goal_minutes: Number(form.get("daily_goal_minutes")), exam_date: String(form.get("exam_date") ?? "") || null };
    setPending(true);
    const saved = await updateResource<StudyPreferences>("/api/estudiante/preferencias", body, "preferences");
    if (saved.ok) { onSaved(saved.value); notify("Meta guardada. Tu dashboard está actualizado.", "success"); }
    else notify(saved.message, "error");
    setPending(false);
  }
  return <details className={dashboard.accordion} ref={detailsRef}>
    <summary><DashboardIcon kind="goal" />Tu meta de estudio<DashboardIcon kind="chevron" /></summary>
    <form className={styles.form} onSubmit={submit} aria-busy={pending}>
      <fieldset disabled={pending} className={styles.fields}>
        <div className={styles.field}><label className={styles.label} htmlFor="daily_goal_minutes">Minutos al d&iacute;a</label>
          <input className={styles.input} id="daily_goal_minutes" name="daily_goal_minutes" type="number" min={5} max={240} step={1} defaultValue={preferences.daily_goal_minutes} required /></div>
        <div className={styles.field}><label className={styles.label} htmlFor="exam_date">Fecha del examen (opcional)</label>
          <input className={styles.input} id="exam_date" name="exam_date" type="date" defaultValue={preferences.exam_date ?? ""} min="1900-01-01" max="2200-12-31" />
          <p className={styles.hint}>Puedes dejarla vac&iacute;a si a&uacute;n no la tienes.</p></div>
        <button className={styles.button} type="submit">{pending ? "Guardando..." : "Guardar meta"}</button>
      </fieldset>
    </form>
  </details>;
}
export function StudentAccount({ profile, preferences, stats, initialNow }: {
  profile: Profile; preferences: StudyPreferences; stats: DashboardStats; initialNow: string;
}) {
  const [currentProfile, setProfile] = useState(profile);
  const [currentPreferences, setPreferences] = useState(preferences);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastSequence = useRef(0);
  const preferencesRef = useRef<HTMLDetailsElement>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  const notify: Notify = (text, tone) => setToast({ id: ++toastSequence.current, text, tone });
  function editGoal() {
    if (!preferencesRef.current) return;
    preferencesRef.current.open = true;
    window.requestAnimationFrame(() => document.getElementById("exam_date")?.focus());
  }
  const [leaving, setLeaving] = useState(false);
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
    if (leaving) return; setLeaving(true);
    try {
      const response = await fetch("/api/auth/salir", { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await response.json();
      if (!response.ok || !data.ok) { notify("No se pudo confirmar el cierre. Intenta de nuevo.", "error"); return; }
      window.location.replace("/login?aviso=salida");
    } catch { notify("No se pudo confirmar el cierre. Intenta de nuevo.", "error"); }
    finally { setLeaving(false); }
  }
  return <AccessShell wide action={<nav className={`${styles.accountNav} ${dashboard.navigation}`} aria-label="Mi cuenta"><a href="/estudio">Estudio</a><a href="/mis-apuntes">Mis apuntes</a><button type="button" className={`${styles.button} ${styles.secondary}`} onClick={logout} disabled={leaving}>{leaving ? "Cerrando..." : "Cerrar sesi\u00f3n"}</button></nav>}>
    <h1 className={styles.title}>Hola, {currentProfile.display_name}</h1>
    <p className={dashboard.subtitle}>Tu espacio para avanzar, un reactivo a la vez.</p>
    <section className={styles.studyEntry} aria-label="Continuar estudiando"><a className={styles.button} href="/estudio">Continuar estudiando</a><p>Retoma el último reactivo y tus notas.</p><a className={styles.link} href="/mis-apuntes">Ver mis apuntes</a></section>
    <DashboardCards stats={stats} preferences={currentPreferences} timezone={currentProfile.timezone} initialNow={initialNow} onEditGoal={editGoal} />
    <div className={dashboard.accordions}>
      <ProfileForm profile={currentProfile} onSaved={setProfile} notify={notify} />
      <PreferencesForm preferences={currentPreferences} onSaved={setPreferences} notify={notify} detailsRef={preferencesRef} />
    </div>
    <StudyToast key={toast?.id ?? 0} message={toast} onDismiss={dismissToast} />
  </AccessShell>;
}
