// Offline adversarial and concurrency tests. Never contacts a model or Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(root,'package.json')),ts=require('typescript');
async function load(file,imports={}){const code=ts.transpileModule(await fs.readFile(path.join(root,file),'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;const loaded={exports:{}};new Function('require','module','exports',code)(name=>{if(Object.hasOwn(imports,name))return imports[name];throw Error('Unexpected import '+name);},loaded,loaded.exports);return loaded.exports;}
const domain=await load('src/lib/tutor/domain.ts');
const study=await load('src/lib/estudio/domain.ts');
const http=await load('src/lib/estudiante/http.ts');
const body=await load('src/lib/estudio/http.ts',{'./domain':study});
const store='fileSearchStores/egel-piloto-bib002-malamed--c3weev8bbdac';
const annotation={type:'file_citation',document_uri:store,file_name:domain.source.fragmentName,page_number:4};
for(const [fragment,pdf,printed] of [[1,61,55],[4,64,58],[8,68,62],[10,70,64]])test('deterministic page '+fragment,()=>{const c=domain.mapCitation({...annotation,page_number:fragment},store);assert.equal(c.page,pdf);assert.equal(c.printed,printed);assert.equal(c.href,`/api/biblioteca/BIB-002#page=${pdf}`);});
for(const patch of [{page_number:0},{page_number:11},{page_number:70},{page_number:'4'},{page_number:1.5},{document_uri:'other'},{file_name:'BIB-002 — Malamed'},{type:'url_citation'}])test('reject untrusted citation '+JSON.stringify(patch),()=>assert.equal(domain.mapCitation({...annotation,...patch},store),null));
test('grounded parser deduplicates, ignores thoughts and unrelated names',()=>{const r=domain.parseGemini({status:'completed',steps:[{type:'thought',content:[{type:'text',text:'PRIVATE'}]},{type:'model_output',content:[{type:'text',text:'Analysis',annotations:[annotation,annotation,{...annotation,file_name:'wrong'}]}]}]},store);assert.equal(r.text,'Analysis');assert.equal(r.citations.length,1);});
test('no valid metadata withholds unsupported generated conclusion',()=>{const r=domain.parseGemini({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:'A ES OFICIAL',annotations:[]}]}]},store);assert(!r.text.includes('OFICIAL'));assert.equal(r.citations.length,0);});
for(const result of [{status:'in_progress',steps:[]},{status:'completed',steps:[]},{}])test('incomplete output rejected '+JSON.stringify(result),()=>assert.throws(()=>domain.parseGemini(result,store),/TUTOR_UNCERTAIN/));
const config={root:'offline',store,key:'NEVER-SENT'};
const q={id:'EGEL-2026-034',version:1,stem:'Enunciado real leído del servidor',options:[{letter:'A',text:'A'},{letter:'B',text:'B'},{letter:'C',text:'C'}]};
const reqId='12345678-1234-4234-8234-123456789abc';
let calls=0;
const handler=await load('src/lib/tutor/handler.ts',{'@/lib/estudiante/http':http,'@/lib/estudio/domain':study,'@/lib/estudio/http':body,'./domain':domain,'./service':{history:async(c,uid)=>({ok:true,uid,enabled:!!c}),generate:async(c,uid,question)=>{calls++;return {ok:true,uid,stem:question.stem};}}});
function request(patch={},headers={},method='POST'){return new Request('http://localhost:3000/api/estudio/tutor'+(method==='GET'?'?question_id=EGEL-2026-034&question_version=1':''),{method,headers:{origin:'http://localhost:3000','content-type':'application/json',...headers},...(method==='POST'?{body:JSON.stringify({question_id:q.id,question_version:1,request_id:reqId,initial:true,prompt:'',...patch})}:{})});}
function access(answered=true){return async()=>({uid:'verified-owner',question:async()=>q,answered:async()=>answered});}
test('unauthenticated before generation',async()=>{calls=0;assert.equal((await handler.handleTutor(request(),async()=>null,config)).status,401);assert.equal(calls,0);});
test('foreign origin blocked before authentication',async()=>{let auth=false;const r=await handler.handleTutor(request({},{origin:'https://evil.invalid'}),async()=>{auth=true;return null;},config);assert.equal(r.status,403);assert(!auth);});
for(const patch of [{user_id:'victim'},{question_version:2},{request_id:'bad'},{initial:'true'},{prompt:'a'.repeat(4001)},{initial:false,prompt:' '},{stem:'injected'}])test('API rejects '+Object.keys(patch).join(','),async()=>{const old=calls;const r=await handler.handleTutor(request(patch),access(),config);assert(r.status>=400);assert.equal(calls,old);});
test('saved answer prerequisite is server enforced',async()=>assert.equal((await handler.handleTutor(request(),access(false),config)).status,409));
test('disabled fails closed',async()=>assert.equal((await handler.handleTutor(request(),access(),null)).status,503));
test('hosted requests cannot use local pilot',async()=>{const r=new Request('https://host.invalid/api/estudio/tutor',{method:'POST',headers:{origin:'https://host.invalid','content-type':'application/json'},body:JSON.stringify({question_id:q.id,question_version:1,initial:true,prompt:'',request_id:reqId})});assert.equal((await handler.handleTutor(r,access(),config)).status,503);});
test('server-owned identity and question, private headers',async()=>{const r=await handler.handleTutor(request(),access(),config);const data=await r.json();assert.equal(data.uid,'verified-owner');assert.equal(data.stem,q.stem);assert.equal(r.headers.get('Vary'),'Cookie');assert.match(r.headers.get('Cache-Control'),/private.*no-store/);});
test('GET history requires authentication, never generates',async()=>{const before=calls;assert.equal((await handler.handleTutor(request({}, {}, 'GET'),async()=>null,config)).status,401);assert.equal((await handler.handleTutor(request({}, {}, 'GET'),access(),config)).status,200);assert.equal(calls,before);});
const storage=await load('src/lib/tutor/storage.ts',{'server-only':{},'node:crypto':crypto,'node:fs/promises':fs,'node:path':path,'./domain':domain});
test('private persistence, idempotency, uncertainty, quota and process lock',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'egel-tutor-test-'));const conf={...config,root:dir};let generated=0,sourceChecks=0,fail=false;
 const gemini={checkSource:async()=>{sourceChecks++;},askGemini:async()=>{generated++;if(fail)throw Error('private upstream detail');return {text:'Response with real metadata in live service; test double here',citations:[]};}};
 const service=await load('src/lib/tutor/service.ts',{'server-only':{},'./domain':domain,'./storage':storage,'./gemini':gemini});
 const input={id:reqId,initial:true,prompt:''};
 try{
  await t.test('read does not mutate',async()=>{assert.equal((await service.history(conf,'alice',q)).messages.length,0);assert.equal((await fs.readdir(dir)).length,0);});
  await t.test('one initial call persisted',async()=>{const r=await service.generate(conf,'alice',q,input);assert.equal(r.messages.length,2);assert.equal(generated,1);});
  await t.test('repeated save returns existing analysis, no call',async()=>{const r=await service.generate(conf,'alice',q,{...input,id:crypto.randomUUID()});assert(r.reused);assert.equal(generated,1);});
  await t.test('other owner cannot read alice history',async()=>assert.equal((await service.history(conf,'bob',q)).messages.length,0));
  await t.test('version separation',async()=>assert.equal((await service.history(conf,'alice',{...q,version:2})).messages.length,0));
  await t.test('outside coverage makes no call',async()=>{await assert.rejects(()=>service.generate(conf,'alice',{...q,id:'EGEL-2026-035'},input),/TUTOR_COVERAGE/);assert.equal(generated,1);});
  await t.test('exclusive lock blocks parallel process',async()=>{await storage.withPilotLock(dir,()=>assert.rejects(()=>service.generate(conf,'alice',q,{...input,initial:false,prompt:'new'}),/TUTOR_BUSY/));assert.equal(generated,1);});
  await t.test('followup successful with idempotent ID',async()=>{const follow={...input,initial:false,prompt:'Explain'};await service.generate(conf,'alice',q,follow);await service.generate(conf,'alice',q,follow);assert.equal(generated,2);await assert.rejects(()=>service.generate(conf,'alice',q,{...follow,prompt:'Changed'}),/TUTOR_CONFLICT/);});
  await t.test('unknown outcome persisted and not retried',async()=>{fail=true;await assert.rejects(()=>service.generate(conf,'bob',q,input),/TUTOR_UNCERTAIN/);assert.equal(generated,3);await assert.rejects(()=>service.generate(conf,'bob',q,{...input,id:crypto.randomUUID()}),/TUTOR_UNCERTAIN/);assert.equal(generated,3);assert((await service.history(conf,'bob',q)).pending);fail=false;});
  await t.test('six lifetime calls, including uncertain; restart does not reset',async()=>{for(let i=0;i<3;i++)await service.generate(conf,'alice',q,{initial:false,id:crypto.randomUUID(),prompt:'follow'+i});assert.equal(generated,6);await assert.rejects(()=>service.generate(conf,'alice',q,{initial:false,id:crypto.randomUUID(),prompt:'over'}),/TUTOR_LIMIT/);assert.equal(generated,6);assert.equal(JSON.parse(await fs.readFile(path.join(dir,'quota.json'))).calls,6);assert(sourceChecks>=6);});
 }finally{for(const name of await fs.readdir(dir))await fs.unlink(path.join(dir,name));await fs.rmdir(dir);}
});
test('markdown renderer does not enable HTML, images, model URLs or trusted macros',async()=>{const source=await fs.readFile(path.join(root,'src/components/estudio/tutor-rich-text.tsx'),'utf8');assert(source.includes('skipHtml'));assert(source.includes('trust: false'));assert(source.includes('maxExpand: 100'));assert(source.includes('img: () => null'));assert(!source.includes('rehype-raw'));});
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const renderer=await load('src/components/estudio/tutor-rich-text.tsx',{'react':React,'react/jsx-runtime':require('react/jsx-runtime'),'react-markdown':require('react-markdown'),'remark-gfm':require('remark-gfm'),'remark-math':require('remark-math'),'rehype-katex':require('rehype-katex'),'./styles.module.css':{}});
function render(text){return renderToStaticMarkup(React.createElement(renderer.TutorRichText,{text}));}
test('actual renderer supports GFM table and emphasis',()=>{const html=render('**Dato**\n\n| A | B |\n|---|---|\n| 1 | 2 |');assert(html.includes('<table>'));assert(html.includes('<strong>Dato</strong>'));assert(html.includes('role="region"'));});
for(const text of ['$20 \\times 1.8 = 36$','$$\n\\frac{252}{36}=7\n$$','\\[\\frac{252}{36}=7\\]','\\(x^2\\)'])test('actual math render '+text,()=>{const html=render(text);assert(html.includes('class="katex"'));assert(html.includes('<math'));if(text.startsWith('$$')||text.startsWith('\\['))assert(html.includes('katex-display'));});
test('malformed formula does not crash rendering',()=>assert.doesNotThrow(()=>render('$\\notARealMacro{1}$')));
test('actual renderer blocks HTML, script links, remote images and LaTeX URLs',()=>{const html=render('<script>alert(1)</script>\n\n[bad](javascript:alert(1)) ![pixel](https://evil.invalid/pixel)\n\n$\\href{https://evil.invalid/}{x}$');assert(!html.includes('<script'));assert(!html.includes('<img'));assert(!html.includes('href="'));assert(!html.includes('src="'));});
test('explicit rejected/unknown retries are bounded, never automatic',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'egel-tutor-retry-'));let fail=true,calls=0;
 const service=await load('src/lib/tutor/service.ts',{'server-only':{},'./domain':domain,'./storage':storage,'./gemini':{checkSource:async()=>{},askGemini:async()=>{calls++;if(fail)throw new domain.TutorError('TUTOR_PROVIDER_BUSY',503);return {text:'test response',citations:[]};}}});
 const c={...config,root:dir},r={id:reqId,initial:true,prompt:''};
 try{await assert.rejects(()=>service.generate(c,'alice',q,r),/TUTOR_PROVIDER_BUSY/);await assert.rejects(()=>service.generate(c,'alice',q,r),/TUTOR_PROVIDER_BUSY/);assert.equal(calls,1);assert((await service.history(c,'alice',q)).retryable);fail=false;await service.generate(c,'alice',q,{...r,retry:true});assert.equal(calls,2);const saved=await storage.readConversation(dir,storage.conversationKey('alice',q.id,q.version));assert.equal(saved.runs[0].attempts,2);assert.deepEqual(saved.runs[0].failures,['TUTOR_PROVIDER_BUSY']);assert.equal(saved.messages.length,2);}finally{for(const name of await fs.readdir(dir))await fs.unlink(path.join(dir,name));await fs.rmdir(dir);}
});
const gemini=await load('src/lib/tutor/gemini.ts',{'server-only':{},'./domain':domain});
test('Gemini request contract, no billing/tools beyond known file search; overload is explicit',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://generativelanguage.googleapis.com/v1beta/interactions');assert.equal(options.headers['x-goog-api-key'],'NEVER-SENT');const b=JSON.parse(options.body);assert.equal(b.store,false);assert.equal(b.model,'gemini-3.8-flash');assert.equal(b.tools.length,1);assert.deepEqual(b.tools[0].file_search_store_names,[store]);assert(!b.input.includes('selected_answer'));return Response.json({error:{code:'service_unavailable'}},{status:503});};
  await assert.rejects(()=>gemini.askGemini(config,q,[],'question'),/TUTOR_PROVIDER_BUSY/);
 }finally{globalThis.fetch=original;}
});
test('source preflight rejects other active/pending documents or pagination',async()=>{
 const original=globalThis.fetch;const approved={name:store+domain.source.documentSuffix,state:'STATE_ACTIVE'};
 try{for(const response of [{documents:[approved,{name:'unknown',state:'STATE_PENDING'}]},{documents:[approved],nextPageToken:'more'},{documents:[]}]){globalThis.fetch=async()=>Response.json(response);await assert.rejects(()=>gemini.checkSource(config),/TUTOR_SOURCE/);}globalThis.fetch=async()=>Response.json({documents:[approved,{name:store+domain.source.failedDocumentSuffix,state:'STATE_FAILED'}]});await gemini.checkSource(config);}finally{globalThis.fetch=original;}
});
