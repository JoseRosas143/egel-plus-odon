"use client";
import { useEffect,useState } from "react";
import type { NoteListItem } from "@/lib/estudio/domain";
import { studyRequest,errorText } from "@/lib/estudio/client";
import { AccessShell } from "@/components/acceso/shell";
import a from "@/components/acceso/styles.module.css";
import s from "./styles.module.css";
export function NotesList(){
 const [page,setPage]=useState(0),[data,setData]=useState<{items:NoteListItem[];total:number}|null>(null),[error,setError]=useState("");
 useEffect(()=>{const c=new AbortController();studyRequest<{ok:true;items:NoteListItem[];total:number}>("/api/estudio/apuntes?page="+page,undefined,c.signal).then(setData).catch(e=>{if(!c.signal.aborted)setError(errorText(e));});return()=>c.abort();},[page]);
 return <AccessShell wide action={<nav className={s.nav}><a href="/estudio">Reactivos</a><a href="/cuenta">Mi cuenta</a></nav>}><h1 className={a.title}>Mis apuntes</h1><p className={a.subtitle}>Tus comentarios y resaltados, vinculados a cada reactivo.</p>{error?<p className={a.error} role="alert">{error} <a href="/login">Iniciar sesi&oacute;n</a></p>:null}{!data&&!error?<p role="status">Cargando apuntes...</p>:null}
 {data?<><p className={a.hint}>{data.total} apuntes guardados.</p>{data.items.length===0?<p className={a.notice}>A&uacute;n no hay apuntes en esta p&aacute;gina. Abre un reactivo y pulsa Guardar apuntes.</p>:null}<ul className={s.list}>{data.items.map(n=><li key={n.question_id+":"+n.question_version} className={s.item}><h2>Reactivo {String(n.position).padStart(3,"0")}{n.favorite?" \u00b7 Favorito":""}</h2><p>{n.stem.slice(0,240)}{n.stem.length>240?"...":""}</p><p>{n.general_note||"Sin nota general."}</p><details><summary>Ver apuntes por opci&oacute;n y resaltados</summary>{(["a","b","c"] as const).map(l=><p key={l}><strong>Opci&oacute;n {l.toUpperCase()}: </strong>{n[`note_${l}`]||"Sin comentarios."}</p>)}<p>Veredicto personal: {n.personal_verdict??"Sin decidir"} (no validado).</p>{n.highlights.map((h,i)=><p key={i} className={s.fragment}>{h.quote}</p>)}</details><p><a href={"/estudio?numero="+n.position}>Abrir y editar este apunte</a></p></li>)}</ul><div className={s.row}><button className={`${a.button} ${a.secondary}`} disabled={page===0} onClick={()=>{setData(null);setError("");setPage(page-1);}}>Anterior</button><span className={a.hint}>P&aacute;gina {page+1}</span><button className={`${a.button} ${a.secondary}`} disabled={(page+1)*20>=data.total} onClick={()=>{setData(null);setError("");setPage(page+1);}}>Siguiente</button></div></>:null}</AccessShell>;
}
