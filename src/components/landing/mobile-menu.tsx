"use client";
import { useRef, type ReactNode } from "react";
import { AppIcon } from "@/components/acceso/app-icon";
import styles from "./styles.module.css";

export function MobileMenu({ children }: { children: ReactNode }) {
  const menu = useRef<HTMLDetailsElement>(null);
  return <details ref={menu} className={styles.mobileMenu}
    onClick={(event) => { if ((event.target as Element).closest("a") && menu.current) menu.current.open = false; }}
    onKeyDown={(event) => { if (event.key === "Escape" && menu.current?.open) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } }}
    onBlur={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node) && menu.current) menu.current.open = false; }}>
    <summary>Menú <AppIcon name="chevron" size={18} /></summary>{children}
  </details>;
}
