import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { authenticateStudent } from "@/lib/estudiante/repository";
import { StudentAccount } from "@/components/acceso/account";
import { AccessShell } from "@/components/acceso/shell";
import styles from "@/components/acceso/styles.module.css";

export const metadata: Metadata = { title: "Mi cuenta | EGEL Plus ODON", robots: { index: false, follow: false } };
function Problem({ message }: { message: string }) {
  return <AccessShell><h1 className={styles.title}>No se pudo abrir tu cuenta</h1><p role="alert" className={styles.error}>{message}</p><a className={styles.link} href="/cuenta">Volver a intentar</a></AccessShell>;
}
async function PrivateAccount() {
  // Runtime data inside Suspense: compatible with Cache Components. Never use cache here.
  await connection();
  const auth = await authenticateStudent();
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login?aviso=sesion");
    return <Problem message="El servicio de acceso no responde. No vuelvas a registrarte; intenta de nuevo en unos momentos." />;
  }
  const [profile, preferences] = await Promise.all([auth.repository.profile.read(), auth.repository.preferences.read()]);
  if (profile.failed || preferences.failed) return <Problem message="La base de datos no responde. Tus datos no se han modificado." />;
  if (!profile.data || !preferences.data) return <Problem message="Tu sesi&oacute;n existe, pero faltan datos de tu perfil. Comunica este mensaje al administrador; no crees otra cuenta." />;
  return <StudentAccount profile={profile.data} preferences={preferences.data} />;
}
export default function AccountPage() {
  return <Suspense fallback={<AccessShell><p role="status">Comprobando tu sesi&oacute;n...</p></AccessShell>}><PrivateAccount /></Suspense>;
}
