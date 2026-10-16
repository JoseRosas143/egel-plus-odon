export type Letter = "A" | "B" | "C";
export type Highlight = { start: number; end: number; quote: string };
export type Question = {
 id: string; bank_id: string; position: number; version: number; source_number: number;
 stem: string; options: { id: string; letter: Letter; text: string; source_pdf_pages: number[] }[];
 source_pages: number[]; review_flags: string[]; evidence_eligible: false; scoreable: false;
};
export type NoteFields = {
 general_note: string; note_a: string; note_b: string; note_c: string;
 personal_verdict: Letter | null; favorite: boolean; highlights: Highlight[];
};
export type Note = NoteFields & { question_id: string; question_version: number; revision: number; updated_at: string };
export type Attempt = { selected_answer: Letter; created_at: string };
export type NoteListItem = Note & { position: number; stem: string };
export class StudyError extends Error {
 constructor(public code: string, public status = 400) { super(code); }
}
export const BANK_ID = "BANK-001";
export const IMPORT_SHA256 = "d357368c555c23feb647af67156a534d6277185a95cfb2d1ae3fdf6d7fc4d62c";
export const blankNote = (): NoteFields => ({general_note:"",note_a:"",note_b:"",note_c:"",personal_verdict:null,favorite:false,highlights:[]});
export function record(value: unknown): Record<string, unknown> {
 if (!value || typeof value !== "object" || Array.isArray(value)) throw new StudyError("INVALID_INPUT");
 return value as Record<string, unknown>;
}
export function exactKeys(value: Record<string,unknown>, allowed: string[]) {
 if (Object.keys(value).some(k=>!allowed.includes(k))) throw new StudyError("INVALID_INPUT");
}
export function questionId(value: unknown): string {
 if (typeof value!=="string" || !/^EGEL-2026-\d{3}$/.test(value)) throw new StudyError("INVALID_QUESTION");
 const n=Number(value.slice(-3)); if(n<1||n>469) throw new StudyError("INVALID_QUESTION"); return value;
}
export function positiveInteger(value: unknown, min=1, max=32767): number {
 if(typeof value!=="number"||!Number.isInteger(value)||value<min||value>max) throw new StudyError("INVALID_INPUT"); return value;
}
export function letter(value: unknown): Letter {
 if(value!=="A"&&value!=="B"&&value!=="C") throw new StudyError("INVALID_ANSWER");return value;
}
export function noteFields(input: unknown, stem: string): NoteFields {
 const b=record(input);exactKeys(b,["general_note","note_a","note_b","note_c","personal_verdict","favorite","highlights"]);
 for(const [k,max] of [["general_note",10000],["note_a",5000],["note_b",5000],["note_c",5000]] as const) {
  if(typeof b[k]!=="string" || b[k].length>max || b[k].includes("\u0000"))throw new StudyError("INVALID_NOTE");
 }
 if(typeof b.favorite!=="boolean" || !Array.isArray(b.highlights) || b.highlights.length>50) throw new StudyError("INVALID_NOTE");
 let previousEnd=0;
 const highlights=b.highlights.map((item):Highlight=>{
  const h=record(item);exactKeys(h,["start","end","quote"]);
  const start=positiveInteger(h.start,0,stem.length),end=positiveInteger(h.end,1,stem.length);
  if(start<previousEnd||end<=start||end-start>1000||typeof h.quote!=="string"||h.quote!==stem.slice(start,end)) throw new StudyError("INVALID_HIGHLIGHT");
  previousEnd=end;return {start,end,quote:h.quote};
 });
 return {general_note:b.general_note as string,note_a:b.note_a as string,note_b:b.note_b as string,note_c:b.note_c as string,
 personal_verdict:b.personal_verdict===null?null:letter(b.personal_verdict),favorite:b.favorite,highlights};
}
export function addHighlight(old: Highlight[], candidate: Highlight, stem: string): Highlight[] {
 if(candidate.start<0||candidate.end>stem.length||candidate.start>=candidate.end) throw new StudyError("INVALID_HIGHLIGHT");
 const sorted=[...old,candidate].sort((a,b)=>a.start-b.start), merged:Highlight[]=[];
 for(const h of sorted){const last=merged[merged.length-1];if(last&&h.start<=last.end){last.end=Math.max(last.end,h.end);last.quote=stem.slice(last.start,last.end);}else merged.push({...h,quote:stem.slice(h.start,h.end)});}
 // Reuse save validator to bound and validate ranges, including UTF-16 offsets.
 return noteFields({...blankNote(),highlights:merged},stem).highlights;
}
export interface StudyRepository {
 status(): Promise<{total:number;can_import:boolean;last_question_id:string|null}>;
 question(id:string): Promise<Question|null>;
 note(q:Question):Promise<Note|null>;
 lastAnswer(q:Question):Promise<Attempt|null>;
 saveNote(q:Question,fields:NoteFields,expected:number):Promise<Note>;
 answer(q:Question,selection:Letter,requestId:string):Promise<Attempt>;
 remember(q:Question):Promise<void>;
 notes(page:number):Promise<{items:NoteListItem[];total:number}>;
 importBank(text:string):Promise<{ok:true;count:number;already_imported:boolean}>;
}
export type StudyAuth = () => Promise<{ok:true;repository:StudyRepository}|{ok:false;code:string;status:number}>;
export function readableError(code: string): string {
 const messages:Record<string,string>={
 AUTH_REQUIRED:"Tu sesi\u00f3n termin\u00f3. Vuelve a iniciar sesi\u00f3n antes de guardar.",
 NOTE_CONFLICT:"Este apunte cambi\u00f3 en otra pesta\u00f1a. Copia tus cambios antes de recargar; no se sobrescribi\u00f3 la otra versi\u00f3n.",
 BANK_FILE_MISMATCH:"El archivo no coincide con los reactivos preparados. Selecciona el JSON original de este paquete, sin editarlo.",
 IMPORT_FORBIDDEN:"Esta cuenta no tiene permiso para importar el banco.",
 BANK_EMPTY:"El banco todav\u00eda no est\u00e1 importado.",
 INVALID_HIGHLIGHT:"Selecciona hasta 1,000 caracteres dentro del enunciado. Se permiten hasta 50 resaltados.",
 INVALID_INPUT:"Revisa los datos del formulario.", INVALID_NOTE:"El apunte excede los l\u00edmites permitidos o contiene datos no v\u00e1lidos.",
 DATABASE_UNAVAILABLE:"No se pudo completar la consulta. Tus notas visibles no se han borrado. Intenta de nuevo.",
 };
 return messages[code] ?? "No se complet\u00f3 la operaci\u00f3n. Conserva tus notas e intenta de nuevo.";
}
