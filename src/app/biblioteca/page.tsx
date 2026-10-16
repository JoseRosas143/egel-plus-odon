import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { authenticateStudent } from "@/lib/estudiante/repository";
import { AccessShell } from "@/components/acceso/shell";
import { LibraryWorkspace } from "@/components/biblioteca/workspace";
import { libraryBooks } from "@/lib/biblioteca/catalog";
export const metadata: Metadata = { title: "Biblioteca | EGEL Plus ODON", robots: { index: false, follow: false } };
async function PrivatePage() {
  await connection();
  const auth = await authenticateStudent();
  if (!auth.ok) { if (auth.status === 401) redirect("/login?aviso=sesion"); return <AccessShell><p role="alert">No se pudo comprobar tu sesión. Intenta recargar.</p></AccessShell>; }
  return <LibraryWorkspace books={libraryBooks} localReading={Boolean(process.env.EGEL_LIBRARY_ROOT)} />;
}
export default function Page() { return <Suspense fallback={<AccessShell><p role="status">Comprobando tu sesión...</p></AccessShell>}><PrivatePage /></Suspense>; }
