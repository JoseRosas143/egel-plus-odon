"use client";
import { Fragment,useCallback,useEffect,useRef,useState } from "react";
import type { ReactNode } from "react";
import { AccessShell } from "@/components/acceso/shell";
import a from "@/components/acceso/styles.module.css";
import s from "./styles.module.css";
import { blankNote,addHighlight } from "@/lib/estudio/domain";
import type { Question,Note,NoteFields,Letter,Attempt } from "@/lib/estudio/domain";
import { studyRequest,errorText,ClientError } from "@/lib/estudio/client";
import { ImportBank } from "./import-bank";
type Loaded={ok:true;total:number;can_import:boolean;question:Question|null;note:Note|null;last_answer:Attempt|null};
export function StudyWorkspace(){
 const [model,setModel]=useState<Loaded|null>(null),[fields,setFields]=useState<NoteFields>(blankNote),[revision,setRevision]=useState(0);
 const [selected,setSelected]=useState<Letter|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[dirty,setDirty]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[number,setNumber]=useState("1"),[authLost,setAuthLost]=useState(false);
 const statement=useRef<HTMLParagraphElement>(null),notebook=useRef<HTMLTextAreaElement>(null),dialog=useRef<HTMLDialogElement>(null);
 const running=useRef(false);
 const showError=useCallback((e:unknown)=>{setError(errorText(e));if(e instanceof ClientError&&e.code==="AUTH_REQUIRED")setAuthLost(true);},[]);
 const accept=useCallback((data:Loaded)=>{setModel(data);setFields(data.note?{general_note:data.note.general_note,note_a:data.note.note_a,note_b:data.note.note_b,note_c:data.note.note_c,personal_verdict:data.note.personal_verdict,favorite:data.note.favorite,highlights:data.note.highlights}:blankNote());setRevision(data.note?.revision??0);setSelected(data.last_answer?.selected_answer??null);setNumber(String(data.question?.position??1));setDirty(false);},[]);
 useEffect(()=>{
  const controller=new AbortController();const n=new URL(window.location.href).searchParams.get("numero");
  studyRequest<Loaded>("/api/estudio/reactivo"+(n?"?numero="+encodeURIComponent(n):""),undefined,controller.signal).then(accept).catch(e=>{if(!controller.signal.aborted)showError(e);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return ()=>controller.abort();
 },[accept,showError]);
 useEffect(()=>{if(!dirty)return;const handler=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler);},[dirty]);
 function change<K extends keyof NoteFields>(key:K,value:NoteFields[K]){setFields(old=>({...old,[key]:value}));setDirty(true);setNotice("");}
 function confirmLeave(){return !dirty||window.confirm("Hay apuntes sin guardar. Cambiar de pantalla los descartara. Continuar?");}
 async function go(n?:number){
  if(running.current||!confirmLeave())return;
  if(n!==undefined&&(!Number.isInteger(n)||n<1||n>((model?.total??0)>0?model!.total:469))){setError("Indica un n\u00famero v\u00e1lido del banco.");return;}
  running.current=true;setBusy(true);setError("");setNotice("");
  try{const data=await studyRequest<Loaded>("/api/estudio/reactivo"+(n!==undefined?"?numero="+n:""));accept(data);
   if(data.question){await studyRequest("/api/estudio/posicion",{question_id:data.question.id,question_version:data.question.version});window.history.replaceState(null,"","/estudio?numero="+data.question.position);}
  }catch(e){showError(e);}finally{running.current=false;setBusy(false);setLoading(false);}
 }
 async function save(){if(!model?.question||running.current)return;running.current=true;setBusy(true);setError("");setNotice("");
  try{const result=await studyRequest<{ok:true;note:Note}>("/api/estudio/guardar",{question_id:model.question.id,question_version:model.question.version,expected_revision:revision,fields});setRevision(result.note.revision);setDirty(false);setNotice("Apuntes guardados en tu cuenta.");}
  catch(e){showError(e);}finally{running.current=false;setBusy(false);}
 }
 async function answer(){if(!model?.question||!selected||running.current)return;running.current=true;setBusy(true);setError("");setNotice("");
  try{const result=await studyRequest<{ok:true;attempt:Attempt}>("/api/estudio/respuesta",{question_id:model.question.id,question_version:model.question.version,selected_answer:selected,request_id:crypto.randomUUID()});setModel({...model,last_answer:result.attempt});setNotice("Elecci\u00f3n guardada. No se ha calificado: la respuesta acad\u00e9mica sigue pendiente de validaci\u00f3n.");}
  catch(e){showError(e);}finally{running.current=false;setBusy(false);}
 }
 function highlight(){
  const root=statement.current,selection=window.getSelection();if(!root||!selection||selection.rangeCount===0||!model?.question)return;
  const range=selection.getRangeAt(0);if(!root.contains(range.startContainer)||!root.contains(range.endContainer)||range.collapsed){setError("Selecciona texto dentro del enunciado y pulsa Resaltar selecci\u00f3n.");return;}
  const before=range.cloneRange();before.selectNodeContents(root);before.setEnd(range.startContainer,range.startOffset);
  const start=before.toString().length,end=start+range.toString().length;
  try{change("highlights",addHighlight(fields.highlights,{start,end,quote:model.question.stem.slice(start,end)},model.question.stem));selection.removeAllRanges();setError("");}catch(e){setError(errorText(e));}
 }
 const q=model?.question;const total=model?.total??0;const lastAnswer=model?.last_answer;
 const pieces:ReactNode[]=[];if(q){let pos=0;fields.highlights.forEach((h,i)=>{pieces.push(<Fragment key={"t"+i}>{q.stem.slice(pos,h.start)}</Fragment>,<mark key={"h"+i}>{q.stem.slice(h.start,h.end)}</mark>);pos=h.end;});pieces.push(<Fragment key="tail">{q.stem.slice(pos)}</Fragment>);}
 function command(fn:()=>void){dialog.current?.close();fn();}
 const nav=<nav className={s.nav} aria-label="Estudio"><a href="/mis-apuntes" onClick={e=>{if(!confirmLeave())e.preventDefault();}}>Mis apuntes</a><a href="/cuenta" onClick={e=>{if(!confirmLeave())e.preventDefault();}}>Mi cuenta</a></nav>;
 return <AccessShell wide action={nav}><h1 className={a.title}>Estudia un reactivo a la vez</h1><p className={a.subtitle}>Lee, elige una respuesta y construye tus propios apuntes.</p>
 {loading?<p role="status">Cargando tu espacio...</p>:null}
 {error?<p role="alert" className={a.error}>{error}{authLost?<> <a href="/login">Volver a iniciar sesi&oacute;n</a>. Copia tus cambios antes de salir.</>:null}</p>:null}
 {!loading&&!model?<button className={a.button} type="button" onClick={()=>void go()}>Volver a intentar</button>:null}
 {model&&total===0?<><p className={a.notice}>Todav&iacute;a no hay reactivos cargados.</p>{model.can_import?<ImportBank done={()=>void go()}/>:<p>El administrador debe completar la carga inicial.</p>}</>:null}
 {q?<>
 <div className={s.toolbar}><button className={`${a.button} ${a.secondary}`} disabled={busy||q.position<=1} onClick={()=>void go(q.position-1)}>Anterior</button><button className={a.button} disabled={busy||q.position>=total} onClick={()=>void go(q.position+1)}>Siguiente</button><button className={`${a.button} ${a.secondary}`} disabled={busy} onClick={()=>void go(total>1?((q.position+Math.floor(Math.random()*(total-1)))%total)+1:q.position)}>Aleatorio</button><label htmlFor="question-number">Ir al reactivo</label><input className={a.input} type="number" id="question-number" min={1} max={total} value={number} disabled={busy} onChange={e=>setNumber(e.target.value)}/><button className={`${a.button} ${a.secondary}`} disabled={busy} onClick={()=>void go(Number(number))}>Ir</button><button className={`${a.button} ${a.secondary}`} disabled={busy} onClick={()=>dialog.current?.showModal()}>/ Comandos</button></div>
 <h2 className={a.sectionTitle}>Reactivo {String(q.position).padStart(3,"0")} de {total}</h2><p className={s.meta}>Fuente {q.source_number} &middot; P&aacute;gina PDF {q.source_pages.join(", ")} &middot; Versi&oacute;n {q.version}</p>
 <p className={a.notice}>Pr&aacute;ctica sin calificaci&oacute;n. La clave y la retroalimentaci&oacute;n bibliogr&aacute;fica a&uacute;n no est&aacute;n habilitadas.</p>
 {q.review_flags.length>0?<p className={a.hint}>Este reactivo tiene una incidencia editorial pendiente; se conserva el texto extra&iacute;do.</p>:null}
 <p ref={statement} className={s.statement}>{pieces}</p><button type="button" className={`${a.button} ${a.secondary}`} disabled={busy} onMouseDown={e=>e.preventDefault()} onClick={highlight}>Resaltar selecci&oacute;n</button>
 <fieldset className={s.options} disabled={busy}><legend className={s.meta}>Elige tu respuesta</legend>{q.options.map(o=><label key={o.id} className={s.answer}><input type="radio" name="answer" value={o.letter} checked={selected===o.letter} onChange={()=>setSelected(o.letter)}/><span><strong>{o.letter}.</strong> {o.text}</span></label>)}</fieldset>
 <div className={s.row}><button className={a.button} disabled={busy||!selected} onClick={answer}>Guardar elecci&oacute;n</button>{lastAnswer?<p className={a.hint}>Elecci&oacute;n registrada: {lastAnswer.selected_answer}. No equivale a respuesta correcta.</p>:null}</div>
 <section className={s.notebook} aria-labelledby="notes-title"><h2 id="notes-title" className={a.sectionTitle}>Mis notas de este reactivo</h2><fieldset className={a.fields} disabled={busy}>
 <label className={a.field}><span className={a.label}>Apuntes generales</span><textarea ref={notebook} className={s.area} value={fields.general_note} maxLength={10000} onChange={e=>change("general_note",e.target.value)}/></label>
 <div className={s.grid}>{(["A","B","C"] as const).map(l=><label key={l} className={a.field}><span className={a.label}>Apuntes sobre la opci&oacute;n {l}</span><textarea className={s.area} maxLength={5000} value={fields[`note_${l.toLowerCase()}` as "note_a"|"note_b"|"note_c"]} onChange={e=>change(`note_${l.toLowerCase()}` as "note_a"|"note_b"|"note_c",e.target.value)}/></label>)}<label className={a.field}><span className={a.label}>Mi veredicto personal</span><select className={a.input} value={fields.personal_verdict??""} onChange={e=>change("personal_verdict",e.target.value?e.target.value as Letter:null)}><option value="">A&uacute;n no lo decido</option><option value="A">Opci&oacute;n A</option><option value="B">Opci&oacute;n B</option><option value="C">Opci&oacute;n C</option></select><span className={a.hint}>Tu conclusi&oacute;n para repasar; no es una clave oficial ni una validaci&oacute;n de la IA.</span><span className={a.hint}>Se guardar&aacute; junto con tus apuntes.</span></label></div>
 <label className={s.check}><input type="checkbox" checked={fields.favorite} onChange={e=>change("favorite",e.target.checked)}/>Marcar como favorito para repasar</label>
 {fields.highlights.length?<div><p className={a.label}>Fragmentos resaltados</p>{fields.highlights.map((h,i)=><div className={s.fragment} key={`${h.start}-${h.end}`}><span>{h.quote}</span><button type="button" onClick={()=>change("highlights",fields.highlights.filter((_,j)=>j!==i))}>Quitar</button></div>)}</div>:null}
 <div className={s.row}><button type="button" className={a.button} onClick={save}>{busy?"Guardando...":"Guardar apuntes"}</button><span className={a.hint}>{dirty?"Cambios sin guardar":revision>0?"Apunte guardado":"Todav\u00eda no has guardado apuntes"}</span></div>
 </fieldset></section>
 {notice?<p role="status" className={a.success}>{notice}</p>:null}
 <dialog ref={dialog} className={s.dialog}><h2>Comandos de estudio</h2><p>Usa los botones sin memorizar instrucciones.</p><div className={s.commands}><button onClick={()=>command(()=>void go(q.position<total?q.position+1:q.position))}><code>/siguiente</code> Siguiente reactivo</button><button onClick={()=>command(()=>void go(q.position>1?q.position-1:1))}><code>/anterior</code> Reactivo anterior</button><button onClick={()=>command(()=>notebook.current?.focus())}><code>/apuntes</code> Escribir notas</button><button onClick={()=>command(()=>void save())}><code>/guardar</code> Guardar apuntes</button></div><p className={a.hint}>Los comandos de evaluaci&oacute;n, profundizaci&oacute;n y segundo veredicto se activar&aacute;n al conectar los tutores.</p><form method="dialog"><button className={a.button}>Cerrar</button></form></dialog>
 </>:null}</AccessShell>;
}
