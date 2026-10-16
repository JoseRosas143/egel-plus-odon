import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { authenticateStudent } from "@/lib/estudiante/repository";
import { AccessShell } from "@/components/acceso/shell";
import { NotesList } from "@/components/estudio/notes-list";
export const metadata:Metadata={title:"Mis apuntes | EGEL Plus ODON",robots:{index:false,follow:false}};
async function PrivatePage(){
 await connection();const auth=await authenticateStudent();
 if(!auth.ok){if(auth.status===401)redirect("/login?aviso=sesion");return <AccessShell><p role="alert">El servicio de acceso no responde. Intenta recargar; no crees otra cuenta.</p></AccessShell>;}
 return <NotesList/>;
}
export default function Page(){return <Suspense fallback={<AccessShell><p role="status">Comprobando tu sesi&oacute;n...</p></AccessShell>}><PrivatePage/></Suspense>;}
