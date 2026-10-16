"use client";

import { useEffect, useState, type ReactNode } from "react";
import { examCountdown, type DashboardStats } from "@/lib/estudiante/dashboard";
import type { StudyPreferences } from "@/lib/estudiante/domain";
import s from "./dashboard.module.css";

export function DashboardIcon({ kind }: { kind: "calendar" | "clock" | "answers" | "notes" | "star" | "profile" | "goal" | "chevron" }) {
  const paths: Record<typeof kind, ReactNode> = {
    calendar: <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4m8-4v4M4 11h16" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l4 2" /></>,
    answers: <><rect x="5" y="3" width="14" height="18" rx="3" /><path d="M9 8h6M9 12h6m-6 4h3" /></>,
    notes: <><path d="m15 4 5 5M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15l-1 5Z" /></>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
    profile: <><circle cx="12" cy="7" r="4" /><path d="M4 21v-3a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v3H4Z" /></>,
    goal: <><circle cx="11" cy="13" r="8" /><circle cx="11" cy="13" r="4" /><path d="m11 13 9-10m-5 0h5v5" /></>,
    chevron: <path d="m6 9 6 6 6-6" />,
  };
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

function Arrow() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>;
}

function MetricCard({ kind, title, value, children, color }: {
  kind: "answers" | "notes" | "star"; title: string; value: number | null; children: ReactNode; color: string;
}) {
  return <article className={`${s.card} ${color}`} aria-label={title}>
    <span className={s.icon}><DashboardIcon kind={kind} /></span>
    <div className={s.cardContent}><h3>{title}</h3><p className={s.metric}>{value ?? "—"}</p><div className={s.caption}>{children}</div></div>
  </article>;
}

export function DashboardCards({ stats, preferences, timezone, initialNow, onEditGoal }: {
  stats: DashboardStats; preferences: StudyPreferences; timezone: string; initialNow: string; onEditGoal: () => void;
}) {
  // The server timestamp gives identical initial markup. Tick after hydration and on focus.
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const refresh = () => setNow(new Date().toISOString());
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  const exam = examCountdown(preferences.exam_date, timezone, new Date(now));
  const incomplete = Object.values(stats).some(value => value === null);
  return <section id="mi-progreso" className={s.dashboard} aria-labelledby="dashboard-heading">
    <h2 id="dashboard-heading">Tu avance</h2>
    <div className={s.primaryGrid}>
      <article className={`${s.card} ${s.exam}`} aria-label="Tu próximo examen">
        <span className={s.icon}><DashboardIcon kind="calendar" /></span>
        <div className={s.cardContent}>
          <h3>Tu próximo examen</h3>
          <p className={s.countdown}>
            {exam.state === "future" ? <><strong>{exam.days}</strong><span>{exam.days === 1 ? "día para tu examen" : "días para tu examen"}</span></>
              : exam.state === "today" ? <strong className={s.examWords}>¡Es hoy!</strong>
              : exam.state === "past" ? <strong className={s.examWords}>Fecha cumplida</strong>
              : <strong>—</strong>}
          </p>
          <p className={s.caption}>{exam.dateLabel ?? (exam.state === "unset" ? "Define la fecha de tu examen" : "Revisa la fecha y tu zona horaria")}</p>
          <button className={s.textAction} type="button" onClick={onEditGoal}>{exam.state === "unset" ? "Configurar meta" : "Editar meta"}<Arrow /></button>
        </div>
      </article>
      <article className={`${s.card} ${s.daily}`} aria-label="Tu meta diaria">
        <span className={s.icon}><DashboardIcon kind="clock" /></span>
        <div className={s.cardContent}><h3>Tu meta diaria</h3><p className={s.metric}>{preferences.daily_goal_minutes}<span> min</span></p>
          <p className={s.caption}>Un paso constante cada día.</p>
          <button className={s.textAction} type="button" onClick={onEditGoal}>Editar meta<Arrow /></button>
        </div>
      </article>
    </div>
    <div className={s.metricsGrid}>
      <MetricCard kind="answers" title="Reactivos respondidos" value={stats.answered} color={s.answers}>
        {stats.total === null ? "Banco no disponible" : `De ${stats.total} en el banco`}<span className={s.metricDetail}>Cada reactivo cuenta una vez; no es calificación.</span>
      </MetricCard>
      <MetricCard kind="notes" title="Mis apuntes" value={stats.notes} color={s.notes}>Reactivos con apuntes guardados</MetricCard>
      <MetricCard kind="star" title="Favoritos" value={stats.favorites} color={s.favorites}>Reactivos marcados para volver</MetricCard>
    </div>
    {incomplete ? <p className={s.loadWarning} role="status">Algunos datos no pudieron cargarse. <a href="/cuenta">Volver a intentar</a></p> : null}
  </section>;
}
