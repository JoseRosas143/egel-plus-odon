"use client";
import { useState } from "react";
import { IMPORT_SHA256 } from "@/lib/estudio/domain";
import { studyRequest,errorText } from "@/lib/estudio/client";
import a from "@/components/acceso/styles.module.css";
import s from "./styles.module.css";
export function ImportBank({done}:{done:()=>void}){
 const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function upload(){
  if(!file||busy)return;setBusy(true);setError("");
  try{
   if(file.size>1500000)throw new Error("Selecciona el archivo JSON del banco, no un PDF ni un ZIP.");
   const buffer=await file.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",buffer))).map(x=>x.toString(16).padStart(2,"0")).join("");
   if(hash!==IMPORT_SHA256)throw new Error("Este archivo no coincide con el banco preparado. Usa datos/reactivos_469_staging.json del paquete sin editarlo.");
   const text=new TextDecoder("utf-8",{fatal:true}).decode(buffer);
   const result=await studyRequest<{ok:true;count:number}>("/api/estudio/importar",{source_text:text});
   if(result.count!==469)throw new Error("La cantidad importada no coincide. No vuelvas a cargar el archivo; comunica el resultado.");
   done();
  }catch(e){setError(errorText(e));}finally{setBusy(false);}
 }
 return <section className={s.import}><h2 className={a.sectionTitle}>Carga inicial del banco</h2><p>Selecciona el JSON que est&aacute; en la carpeta <code>datos</code> del paquete. Se cargar&aacute;n 469 reactivos una sola vez. No se cargar&aacute;n libros ni claves de respuestas.</p><p className={a.hint}>Este permiso se asign&oacute; a tu cuenta de administraci&oacute;n de la importaci&oacute;n; los alumnos no pueden cargar o modificar el banco com&uacute;n.</p><input type="file" aria-label="Archivo del banco de reactivos" accept=".json,application/json" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]??null);setError("");}}/>{error?<p role="alert" className={a.error}>{error}</p>:null}<button type="button" className={a.button} disabled={!file||busy} onClick={upload}>{busy?"Importando...":"Importar 469 reactivos"}</button></section>;
}
