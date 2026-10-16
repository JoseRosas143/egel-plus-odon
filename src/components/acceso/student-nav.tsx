"use client";
import type { MouseEvent, ReactNode } from "react";
import { AppIcon, type AppIconName } from "./app-icon";
import s from "./styles.module.css";

const links: { label: string; href: string; key: string; icon: AppIconName }[] = [
  { label: "Inicio", href: "/cuenta", key: "inicio", icon: "home" },
  { label: "Reactivos", href: "/estudio", key: "estudio", icon: "book" },
  { label: "Biblioteca", href: "/biblioteca", key: "biblioteca", icon: "book" },
  { label: "Mis apuntes", href: "/mis-apuntes", key: "apuntes", icon: "notes" },
  { label: "Mi progreso", href: "/cuenta#mi-progreso", key: "progreso", icon: "progress" },
];
export function StudentNav({ current, onLeave, children }: { current: string; onLeave?: () => boolean; children?: ReactNode }) {
  function navigate(event: MouseEvent<HTMLAnchorElement>) { if (onLeave && !onLeave()) event.preventDefault(); }
  const items = links.map(item => <a key={item.key} href={item.href} onClick={navigate}
    aria-current={current === item.key ? "page" : undefined}><AppIcon name={item.icon} size={17} />{item.label}</a>);
  return <div className={s.studentNavigation}>
    <nav className={s.desktopNavigation} aria-label="Navegación principal">{items}</nav>
    <details className={s.mobileNavigation}><summary aria-label="Abrir navegación">Menú<AppIcon name="chevron" size={15} /></summary>
      <nav aria-label="Navegación móvil">{items}</nav></details>
    <a className={s.accountLink} href="/cuenta" aria-label="Mi cuenta" onClick={navigate}><span className={s.avatar}><AppIcon name="profile" size={17} /></span><span>Mi cuenta</span></a>
    {children}
  </div>;
}
