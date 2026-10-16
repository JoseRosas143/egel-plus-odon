import { apiError,privateJson,sameOriginMutation } from "@/lib/estudiante/http";
import { StudyError,record,exactKeys,questionId,positiveInteger,letter,noteFields } from "./domain";
import type { StudyAuth } from "./domain";
import { readJson } from "./http";
export type Action="read"|"notes"|"note"|"answer"|"remember"|"import";
export async function handleStudy(request:Request,authenticate:StudyAuth,action:Action):Promise<Response>{
 try{
  const mutation=!["read","notes"].includes(action);
  if(mutation&&!sameOriginMutation(request))return apiError("ORIGIN_NOT_ALLOWED",403);
  const auth=await authenticate();if(!auth.ok)return apiError(auth.code,auth.status);
  const db=auth.repository;
  if(action==="read"){
   const status=await db.status();
   if(status.total===0)return privateJson({ok:true,...status,question:null,note:null,last_answer:null});
   const raw=new URL(request.url).searchParams.get("numero");
   if(raw!==null&&!/^\d{1,3}$/.test(raw))throw new StudyError("INVALID_QUESTION");
   const id=questionId(raw===null?(status.last_question_id??"EGEL-2026-001"):`EGEL-2026-${raw.padStart(3,"0")}`);
   const q=await db.question(id);if(!q)throw new StudyError("QUESTION_NOT_FOUND",404);
   const [note,last]=await Promise.all([db.note(q),db.lastAnswer(q)]);
   return privateJson({ok:true,...status,question:q,note,last_answer:last});
  }
  if(action==="notes"){
   const raw=new URL(request.url).searchParams.get("page")??"0";
   if(!/^\d{1,4}$/.test(raw))throw new StudyError("INVALID_INPUT");
   const page=positiveInteger(Number(raw),0,1000);return privateJson({ok:true,...await db.notes(page),page});
  }
  if(action==="import"){
   const s=await db.status();if(!s.can_import)throw new StudyError("IMPORT_FORBIDDEN",403);
   const b=record(await readJson(request,2000000));exactKeys(b,["source_text"]);
   if(typeof b.source_text!=="string"||b.source_text.length>1500000)throw new StudyError("BANK_FILE_MISMATCH");
   return privateJson(await db.importBank(b.source_text));
  }
  const b=record(await readJson(request));
  exactKeys(b,action==="note"?["question_id","question_version","expected_revision","fields"]:action==="answer"?["question_id","question_version","selected_answer","request_id"]:["question_id","question_version"]);
  const id=questionId(b.question_id);const version=positiveInteger(b.question_version);
  const q=await db.question(id);if(!q)throw new StudyError("QUESTION_NOT_FOUND",404);
  if(q.version!==version)throw new StudyError("QUESTION_VERSION_CHANGED",409);
  if(action==="note"){
   const fields=noteFields(b.fields,q.stem);const expected=positiveInteger(b.expected_revision,0,2147483646);
   return privateJson({ok:true,note:await db.saveNote(q,fields,expected)});
  }
  if(action==="answer"){
   const selection=letter(b.selected_answer);
   if(typeof b.request_id!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.request_id))throw new StudyError("INVALID_INPUT");
   return privateJson({ok:true,attempt:await db.answer(q,selection,b.request_id),scoreable:false});
  }
  await db.remember(q);return privateJson({ok:true});
 }catch(e){return e instanceof StudyError?apiError(e.code,e.status):apiError("SERVICE_UNAVAILABLE",503);}
}
