// Offline fixtures only: never publishes a sample or calls a provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(root,'package.json')),ts=require('typescript');
async function load(file,imports={}){const code=ts.transpileModule(await fs.readFile(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;const loaded={exports:{}};new Function('require','module','exports',code)(name=>{if(Object.hasOwn(imports,name))return imports[name];throw Error(name);},loaded,loaded.exports);return loaded.exports;}
const domain=await load('src/lib/tutor/domain.ts'),study=await load('src/lib/estudio/domain.ts');
const shared=await load('src/lib/tutor/shared-base.ts',{'server-only':{},'./domain':domain});
const row={id:'12345678-1234-4234-8234-123456789abc',model:'gemini-3.8-flash',prompt_version:'literature-base-v1',body:'Offline structural fixture, not a clinical explanation. '.repeat(3),reviewed_at:'2026-10-16T12:00:00Z',citations:[{document_id:'a'.repeat(64),catalog_id:'BIB-001',title:'Offline source',pdf_page:10}]};
test('empty publication remains empty',()=>assert.equal(shared.parseSharedBase(null),null));

const editorialRow={...row,id:'22345678-1234-4234-8234-123456789abc',model:'deepseek-flash',prompt_version:'literature-editorial-v1',editorial_revision:true};
test('editorial DeepSeek has an explicit supported pair and revision marker',()=>{
  assert.equal(shared.parseSharedBase(editorialRow).baseId,editorialRow.id);
  for(const patch of [{editorial_revision:false},{editorial_revision:undefined},{model:'gemini-3.8-flash'},{prompt_version:'literature-draft-v2'}])
    assert.throws(()=>shared.parseSharedBase({...editorialRow,...patch}),/TUTOR_BASE_UNAVAILABLE/);
  assert.throws(()=>shared.parseSharedBase({...row,editorial_revision:true}),/TUTOR_BASE_UNAVAILABLE/);
});
test('editorial variant takes precedence independently of database row order',()=>{
  for(const rows of [[row,editorialRow],[editorialRow,row]])assert.equal(shared.selectSharedBase(rows).baseId,editorialRow.id);
  assert.equal(shared.selectSharedBase([]),null);assert.equal(shared.selectSharedBase([row]).baseId,row.id);
});
test('ambiguous or malformed shared rows deny access instead of silently falling back',()=>{
  for(const rows of [null,[null],[row,row],[row,editorialRow,row],[row,{...editorialRow,model:'other'}]])
    assert.throws(()=>shared.selectSharedBase(rows),/TUTOR_BASE_UNAVAILABLE/);
});
test('reviewed provenance has no invented printed page or PDF URL',()=>{const message=shared.parseSharedBase(row);assert.equal(message.origin,'shared-reviewed');assert.equal(message.id,'initial-v1-assistant');assert.equal(message.baseId,row.id);assert.equal(message.citations[0].printed,null);assert.equal(message.citations[0].href,'/biblioteca');});
for(const patch of [{model:'different'},{prompt_version:'outdated'},{body:'short'},{reviewed_at:'invalid'},{citations:[]},{citations:[{...row.citations[0],pdf_page:0}]},{citations:[{...row.citations[0],document_id:'../../secret'}]}])test('malformed cache fails closed '+Object.keys(patch),()=>assert.throws(()=>shared.parseSharedBase({...row,...patch}),/TUTOR_BASE_UNAVAILABLE/));
test('deduplicate identical document/page without merging different books',()=>{const r=shared.parseSharedBase({...row,citations:[...row.citations,...row.citations,{...row.citations[0],document_id:'b'.repeat(64)}]});assert.equal(r.citations.length,2);});
const http=await load('src/lib/estudiante/http.ts'),body=await load('src/lib/estudio/http.ts',{'./domain':study});
let generations=0,baseReads=0;
const handler=await load('src/lib/tutor/handler.ts',{'@/lib/estudiante/http':http,'@/lib/estudio/domain':study,'@/lib/estudio/http':body,'./domain':domain,
 './service':{history:async()=>({ok:true,messages:[],enabled:false,covered:false,pending:false,retryable:false}),generate:async()=>{generations++;throw Error('NO NETWORK ALLOWED');}}});
const q={id:'EGEL-2026-001',version:1},message=shared.parseSharedBase(row);
const access=(answered=true,base=message)=>async()=>({uid:'verified-session-user',question:async()=>q,answered:async()=>answered,sharedBase:async()=>{baseReads++;return base;}});
const request=(method='POST',patch={})=>new Request('https://app.invalid/api/estudio/tutor'+(method==='GET'?'?question_id=EGEL-2026-001&question_version=1':''),{method,headers:{Origin:'https://app.invalid','Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify({question_id:q.id,question_version:q.version,request_id:row.id,initial:true,prompt:'',...patch})}:{})});
test('before saving, GET does not reveal or even read the shared base',async()=>{baseReads=0;const r=await handler.handleTutor(request('GET'),access(false),null);const data=await r.json();assert.deepEqual(data.messages,[]);assert.equal(data.sharedBase,'answer-required');assert.equal(baseReads,0);});
test('saved answer prerequisite also applies to shared POST',async()=>{baseReads=0;const r=await handler.handleTutor(request(),access(false),null);assert.equal(r.status,409);assert.equal(baseReads,0);});
test('different student sessions reuse the approved base without generation',async()=>{for(let i=0;i<3;i++){const r=await handler.handleTutor(request(),access(),null);const data=await r.json();assert.equal(data.reused,true);assert.equal(data.messages[0].baseId,row.id);assert.equal(data.sharedBase,'available');}assert.equal(generations,0);});
test('missing publication is honest and never invokes a provider',async()=>{const r=await handler.handleTutor(request(),access(true,null),null);const data=await r.json();assert.equal(r.status,200);assert.equal(data.sharedBase,'pending');assert.deepEqual(data.messages,[]);assert.equal(generations,0);});
test('followup cannot silently fall back to a paid model',async()=>{const r=await handler.handleTutor(request('POST',{initial:false,prompt:'Personal question'}),access(),null);assert.equal((await r.json()).error,'TUTOR_FOLLOWUP_DISABLED');assert.equal(generations,0);});
test('cache is not public HTTP caching of private context',async()=>{const r=await handler.handleTutor(request('GET'),access(),null);assert.match(r.headers.get('Cache-Control'),/private.*no-store/);assert.equal(r.headers.get('Vary'),'Cookie');});
test('failed cache lookup must not generate a replacement',async()=>{const r=await handler.handleTutor(request(),async()=>({...await access()(),sharedBase:async()=>{throw new domain.TutorError('TUTOR_BASE_UNAVAILABLE',503);}}),null);assert.equal(r.status,503);assert.equal(generations,0);});
test('new provider/client identity/prompt fields are rejected',async()=>{for(const patch of [{user_id:'other'},{model:'gpt-expensive'},{personal_verdict:'C'},{question_version:2}])assert((await handler.handleTutor(request('POST',patch),access(),null)).status>=400);assert.equal(generations,0);});
test('shared cache has no write to study notes, history or verdict',async()=>{const source=await fs.readFile(path.join(root,'src/lib/tutor/shared-base.ts'),'utf8');for(const forbidden of ['.insert(','.update(','.upsert(','askGemini(','writeConversation('])assert(!source.includes(forbidden));});

let routeRows=[editorialRow],routeAnswered=true;const queries=[];
const routeDb={auth:{getUser:async()=>({data:{user:{id:'verified-session-user',is_anonymous:false}},error:null})},from(table){
  const query={table,filters:[],columns:null,versions:null};queries.push(query);
  return {select(columns){query.columns=columns;return this;},eq(key,value){query.filters.push([key,value]);return this;},
    in(key,values){query.versions=[key,values];return this;},
    async maybeSingle(){return {data:q,error:null};},
    async limit(n){query.limit=n;return {data:table==='question_attempts'?(routeAnswered?[{request_id:row.id}]:[]):routeRows,error:null};}};
}};
const route=await load('src/app/api/estudio/tutor/route.ts',{'next/server':{connection:async()=>{}},'@/lib/supabase/server':{createClient:async()=>routeDb},
  '@/lib/estudio/domain':study,'@/lib/tutor/handler':handler,'@/lib/tutor/gemini':{tutorConfig:()=>null},'@/lib/tutor/shared-base':shared,'@/lib/tutor/domain':domain});
test('actual route uses the session client and selects only supported shared variants',async()=>{
  queries.length=0;routeRows=[editorialRow,row];routeAnswered=true;
  const result=await route.POST(request());assert.equal(result.status,200);assert.equal((await result.json()).messages[0].baseId,editorialRow.id);
  const lookup=queries.find(q=>q.table==='tutor_base_explanations');assert.deepEqual(lookup.versions,['prompt_version',['literature-base-v1','literature-editorial-v1']]);
  assert.deepEqual(lookup.filters,[['question_id',q.id],['question_version',q.version]]);assert.equal(lookup.limit,3);
  assert(!lookup.columns.includes('sources'));assert(!lookup.columns.includes('provenance'));assert.equal(generations,0);
});
test('actual route refuses malformed rows and never reads a base before the saved answer',async()=>{
  queries.length=0;routeAnswered=false;assert.equal((await route.GET(request('GET'))).status,200);
  assert(!queries.some(q=>q.table==='tutor_base_explanations'));
  routeAnswered=true;routeRows=[{...editorialRow,editorial_revision:false}];assert.equal((await route.POST(request())).status,503);assert.equal(generations,0);
  routeRows=[editorialRow];
});
