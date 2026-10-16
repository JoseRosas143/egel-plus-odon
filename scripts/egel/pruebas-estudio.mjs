// Offline unit tests. Framework and database explicitly replaced with doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(root,'package.json'));
const ts=require('typescript');
function load(p,imports={}){
 const r=ts.transpileModule(fs.readFileSync(path.join(root,p),'utf8'),{fileName:p,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,strict:true}});
 assert.equal((r.diagnostics??[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
 const m={exports:{}};new Function('require','module','exports',r.outputText)(id=>{if(Object.hasOwn(imports,id))return imports[id];throw new Error('Unmocked: '+id);},m,m.exports);return m.exports;
}
const d=load('src/lib/estudio/domain.ts'),h=load('src/lib/estudio/http.ts',{'./domain':d}),base=load('src/lib/estudiante/http.ts');
const handlers=load('src/lib/estudio/handlers.ts',{'./domain':d,'./http':h,'@/lib/estudiante/http':base});
const question={id:'EGEL-2026-001',bank_id:'BANK-001',position:1,version:1,source_number:1,stem:'Enunciado de prueba con dos opciones y otra mas.',options:['A','B','C'].map(letter=>({id:letter,letter,text:letter})),source_pages:[3],review_flags:[],evidence_eligible:false,scoreable:false};
function request(body,extra={},url='/api/estudio/guardar'){
 return new Request('http://localhost:3000'+url,{method:body===undefined?'GET':'POST',headers:{origin:'http://localhost:3000','content-type':'application/json',...extra},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
}
function fixture(overrides={}){
 const calls=[];const methods={
 status:async()=>({total:469,can_import:false,last_question_id:null}),question:async id=>{calls.push(['question',id]);return question;},note:async()=>null,lastAnswer:async()=>null,
 saveNote:async(q,n,r)=>{calls.push(['saveNote',q.id,n,r]);return {...n,revision:r+1};},answer:async(q,l,id)=>{calls.push(['answer',q.id,l,id]);return {selected_answer:l,created_at:'now'};},remember:async q=>calls.push(['remember',q.id]),notes:async p=>{calls.push(['notes',p]);return {items:[],total:0};},importBank:async text=>{calls.push(['import',text]);return {ok:true,count:469,already_imported:false};},...overrides};
 return {calls,auth:async()=>({ok:true,repository:methods})};
}
const validNote=()=>({question_id:question.id,question_version:1,expected_revision:0,fields:d.blankNote()});
async function code(res,status,value){assert.equal(res.status,status);const b=await res.json();assert.equal(b.error,value);assert.match(res.headers.get('cache-control'),/private.*no-store/);return b;}
for(const v of ['','EGEL-2026-000','EGEL-2026-470','../../../file',null,1,'EGEL-2026-01'])test('invalid ID '+JSON.stringify(v),()=>assert.throws(()=>d.questionId(v)));
test('first and last ID accepted',()=>{assert.equal(d.questionId('EGEL-2026-001'),'EGEL-2026-001');assert.equal(d.questionId('EGEL-2026-469'),'EGEL-2026-469');});
test('blank note accepted',()=>assert.deepEqual(d.noteFields(d.blankNote(),question.stem),d.blankNote()));
for(const [k,v] of [['general_note','x'.repeat(10001)],['note_a','x'.repeat(5001)],['favorite','true'],['personal_verdict','D'],['user_id','other'],['revision',4],['highlights',[{start:0,end:9,quote:'fake quote'}]],['note_b','bad\u0000']])test('reject invalid note '+k,()=>assert.throws(()=>d.noteFields({...d.blankNote(),[k]:v},question.stem)));
test('accept exact selection',()=>assert.equal(d.noteFields({...d.blankNote(),highlights:[{start:0,end:9,quote:'Enunciado'}]},question.stem).highlights.length,1));
test('reject overlap',()=>assert.throws(()=>d.noteFields({...d.blankNote(),highlights:[{start:0,end:9,quote:'Enunciado'},{start:0,end:3,quote:'Enu'}]},question.stem)));
test('merge touching highlights',()=>assert.deepEqual(d.addHighlight([{start:0,end:3,quote:'Enu'}],{start:3,end:9,quote:'nciado'},question.stem),[{start:0,end:9,quote:'Enunciado'}]));
test('UTF16 offset preserved',()=>assert.equal(d.noteFields({...d.blankNote(),highlights:[{start:0,end:2,quote:'\ud83e\uddb7'}]},'\ud83e\uddb7 Test').highlights[0].end,2));
for(const action of ['read','notes','note','answer','remember','import'])test('auth required '+action,async()=>{await code(await handlers.handleStudy(request(action==='read'||action==='notes'?undefined:{}),async()=>({ok:false,code:'AUTH_REQUIRED',status:401}),action),401,'AUTH_REQUIRED');});
for(const origin of ['https://other.invalid','','null'])test('foreign origin denied '+origin,async()=>{let calls=0;await code(await handlers.handleStudy(request(validNote(),{origin}),async()=>{calls++;throw new Error();},'note'),403,'ORIGIN_NOT_ALLOWED');assert.equal(calls,0);});
test('read resumes first question without mutations',async()=>{const f=fixture();const r=await handlers.handleStudy(request(undefined),f.auth,'read');assert.equal(r.status,200);const j=await r.json();assert.equal(j.question.id,question.id);assert.deepEqual(f.calls,[['question',question.id]]);});
test('read empty bank returns honest empty state',async()=>{const f=fixture({status:async()=>({total:0,can_import:false,last_question_id:null})});const r=await handlers.handleStudy(request(undefined),f.auth,'read');assert.equal((await r.json()).question,null);assert.equal(f.calls.length,0);});
test('read bad number rejected',async()=>{await code(await handlers.handleStudy(request(undefined,{},'/api/estudio/reactivo?numero=-1'),fixture().auth,'read'),400,'INVALID_QUESTION');});
test('read valid number mapped to ID',async()=>{const f=fixture();await handlers.handleStudy(request(undefined,{},'/api/estudio/reactivo?numero=42'),f.auth,'read');assert.deepEqual(f.calls[0],['question','EGEL-2026-042']);});
test('notes pagination',async()=>{const f=fixture();await handlers.handleStudy(request(undefined,{},'/api/estudio/apuntes?page=2'),f.auth,'notes');assert.deepEqual(f.calls,[['notes',2]]);});
test('note requires version',async()=>{await code(await handlers.handleStudy(request({...validNote(),question_version:2}),fixture().auth,'note'),409,'QUESTION_VERSION_CHANGED');});
test('note saves expected revision',async()=>{const f=fixture();const r=await handlers.handleStudy(request({...validNote(),expected_revision:2}),f.auth,'note');assert.equal((await r.json()).note.revision,3);assert.equal(f.calls[1][3],2);});
test('note rejects supplied user identity',async()=>{await code(await handlers.handleStudy(request({...validNote(),user_id:'other'}),fixture().auth,'note'),400,'INVALID_INPUT');});
test('note conflict remains 409',async()=>{await code(await handlers.handleStudy(request(validNote()),fixture({saveNote:async()=>{throw new d.StudyError('NOTE_CONFLICT',409);}}).auth,'note'),409,'NOTE_CONFLICT');});
test('raw exception redacted',async()=>{const b=await code(await handlers.handleStudy(request(undefined),fixture({status:async()=>{throw new Error('SECRET');}}).auth,'read'),503,'SERVICE_UNAVAILABLE');assert.equal(JSON.stringify(b).includes('SECRET'),false);});
test('record answer never grades',async()=>{const f=fixture();const r=await handlers.handleStudy(request({question_id:question.id,question_version:1,selected_answer:'B',request_id:'e6210000-0000-4000-8000-000000000010'}),f.auth,'answer');const b=await r.json();assert.equal(b.scoreable,false);assert.equal(b.attempt.selected_answer,'B');assert.equal(Object.hasOwn(b,'correct'),false);});
test('answer rejects fake request identifier',async()=>{await code(await handlers.handleStudy(request({question_id:question.id,question_version:1,selected_answer:'B',request_id:'fake'}),fixture().auth,'answer'),400,'INVALID_INPUT');});
test('remember is explicit mutation',async()=>{const f=fixture();const r=await handlers.handleStudy(request({question_id:question.id,question_version:1}),f.auth,'remember');assert.equal(r.status,200);assert.equal(f.calls[1][0],'remember');});
test('import rejects ordinary student',async()=>{await code(await handlers.handleStudy(request({source_text:'[]'}),fixture().auth,'import'),403,'IMPORT_FORBIDDEN');});
test('import delegates only verified operator',async()=>{const f=fixture({status:async()=>({total:0,can_import:true,last_question_id:null})});const r=await handlers.handleStudy(request({source_text:'[]'}),f.auth,'import');assert.equal(r.status,200);assert.deepEqual(f.calls,[['import','[]']]);});
test('import hash rejection reported',async()=>{const f=fixture({status:async()=>({total:0,can_import:true,last_question_id:null}),importBank:async()=>{throw new d.StudyError('BANK_FILE_MISMATCH');}});await code(await handlers.handleStudy(request({source_text:'changed'}),f.auth,'import'),400,'BANK_FILE_MISMATCH');});
for(const [name,req,expected] of [['invalid media',request('text',{'content-type':'text/plain'}),'JSON_REQUIRED'],['invalid json',request('{'),'INVALID_JSON'],['declared too big',request('{}',{'content-length':'3000000'}),'BODY_TOO_LARGE']])test(name,async()=>assert.rejects(()=>h.readJson(req),e=>e.code===expected));
test('stream limit enforced',async()=>assert.rejects(()=>h.readJson(request('"'+'x'.repeat(20)+'"'),10),e=>e.code==='BODY_TOO_LARGE'));
test('private read responses set Vary Cookie',async()=>{const r=await handlers.handleStudy(request(undefined),fixture().auth,'read');assert.equal(r.headers.get('vary'),'Cookie');});
