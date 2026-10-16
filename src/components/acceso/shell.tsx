import type { ReactNode } from "react";
import styles from "./styles.module.css";
import { AppIcon } from "./app-icon";

export function AccessShell({ children, wide = false, study = false, action }: { children: ReactNode; wide?: boolean; study?: boolean; action?: ReactNode }) {
  return (
    <div lang="es" className={`${styles.shell} ${study ? styles.studyShell : ""}`}>
      <header className={styles.header}>
        <a className={styles.brand} href={wide ? "/cuenta" : "/login"}><span className={styles.brandIcon}><AppIcon name="tooth" size={23} /></span>EGEL Plus ODON</a>
        {action}
      </header>
      <main className={wide ? styles.wide : styles.main}>{children}</main>
      <footer className={styles.footer}>Piloto de estudio. Preparaci&oacute;n independiente, no afiliada a CENEVAL.</footer>
    </div>
  );
}
