// Offline contract/security tests. Never contacts OpenAI, Gemini or Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(root,'package.json')),ts=require('typescript');
async function load(file,imports={}){
 const code=ts.transpileModule(await fs.readFile(path.join(root,file),'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const loaded={exports:{}};new Function('require','module','exports',code)(name=>{if(Object.hasOwn(imports,name))return imports[name];throw Error('Unexpected import '+name);},loaded,loaded.exports);return loaded.exports;
}
const domain=await load('src/lib/tutor/domain.ts'),study=await load('src/lib/estudio/domain.ts'),http=await load('src/lib/estudiante/http.ts');
const baseImports={'server-only':{},'node:crypto':crypto,'node:fs/promises':fs,'node:path':path,'./domain':domain};
const pilot=await load('src/lib/tutor/opinion-pilot.ts',baseImports);
const q={id:'EGEL-2026-034',version:1,stem:'Enunciado del ejercicio',options:[{letter:'A',text:'Uno'},{letter:'B',text:'Dos'},{letter:'C',text:'Tres'}]};
const request={model:'gpt-6.1-sol',store:false,input:`Reactivo 034 (ejercicio, NO fuente de evidencia ni clave):\n${q.stem}\nA. Uno\nB. Dos\nC. Tres\n\nAnaliza las opciones, la cantidad por cartucho y el criterio de dosis. Documentos`};
const result={model:'gpt-6.1-sol',status:'completed',created_at:1792133917,output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Offline fixture [S1] y [S2]'}]}]};
test('saved pilot metadata is explicit and only controlled reference URLs escape renderer',()=>{
 const analysis=pilot.decodeSavedOpinion(request,result,q);assert.equal(analysis.mode,'saved-pilot');assert.equal(analysis.model,'gpt-6.1-sol');assert.equal(analysis.references.length,2);
 assert.equal(new URL(analysis.references[0].href).hostname,'dailymed.nlm.nih.gov');assert.equal(new URL(analysis.references[1].href).hostname,'www.aapd.org');
 assert(!('input' in analysis));assert(!('usage' in analysis));assert(!('responseId' in analysis));
});
for(const patch of [{model:'other'},{store:true},{tools:[{type:'web_search'}]},{input:request.input.replace('A. Uno','A. Changed')},{input:request.input.replace(q.stem,'Wrong question')}])test('reject changed provenance '+JSON.stringify(patch).slice(0,50),()=>assert.throws(()=>pilot.decodeSavedOpinion({...request,...patch},result,q),/OPINION_MISMATCH/));
for(const patch of [{status:'incomplete'},{model:'other'},{created_at:undefined},{output:[]},{output:[{type:'message',role:'assistant',content:[{type:'refusal'}]}]},{output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Missing references'}]}]}])test('reject incomplete/unattributed result '+JSON.stringify(patch).slice(0,50),()=>assert.throws(()=>pilot.decodeSavedOpinion(request,{...result,...patch},q),/OPINION_UNAVAILABLE/));
for(const patch of [{id:'EGEL-2026-035'},{version:2}])test('no reuse across question or version '+JSON.stringify(patch),()=>assert.throws(()=>pilot.decodeSavedOpinion(request,result,{...q,...patch}),/OPINION_COVERAGE/));
test('file reader fails closed on changed payload without contacting a provider',async()=>{
 const reader=await load('src/lib/tutor/opinion-pilot.ts',{...baseImports,'node:fs/promises':{realpath:async p=>path.resolve(p),stat:async()=>({size:2,isFile:()=>true}),readFile:async()=>Buffer.from('{}')}});
 await assert.rejects(()=>reader.readSavedOpinion(path.resolve('offline-private-pilot'),q),/OPINION_UNAVAILABLE/);
});
test('file reader denies escaped symlink and oversized file, redacts filesystem failure',async()=>{
 for(const fake of [
  {realpath:async p=>String(p).endsWith('.json')?path.resolve('elsewhere/file.json'):path.resolve(p),stat:async()=>{throw Error('Unexpected stat');}},
  {realpath:async p=>path.resolve(p),stat:async()=>({size:2000001,isFile:()=>true})},
  {realpath:async()=>{throw Error('SECRET PATH');}},
 ]){const reader=await load('src/lib/tutor/opinion-pilot.ts',{...baseImports,'node:fs/promises':fake});await assert.rejects(()=>reader.readSavedOpinion(path.resolve('offline-private-pilot'),q),e=>e.message==='OPINION_UNAVAILABLE');}
});
let reads=0;
const handler=await load('src/lib/tutor/opinion-handler.ts',{'@/lib/estudiante/http':http,'@/lib/estudio/domain':study,'./domain':domain,'./opinion-pilot':{readSavedOpinion:async()=>{reads++;return pilot.decodeSavedOpinion(request,result,q);}}});
const url='http://localhost:3002/api/estudio/segunda-opinion?question_id=EGEL-2026-034&question_version=1';
const access=(answered=true,question=q)=>async()=>({uid:'authenticated-owner',question:async()=>question,answered:async()=>answered});
test('authentication precedes file reads',async()=>{reads=0;assert.equal((await handler.handleOpinion(new Request(url),async()=>null,'private')).status,401);assert.equal(reads,0);});
test('GET only: POST cannot trigger generation or read',async()=>{reads=0;assert.equal((await handler.handleOpinion(new Request(url,{method:'POST'}),access(),'private')).status,405);assert.equal(reads,0);});
for(const suffix of ['&user_id=victim','&question_id=EGEL-2026-035','&question_version=2'])test('reject supplied owner or duplicate parameters '+suffix,async()=>{reads=0;assert.equal((await handler.handleOpinion(new Request(url+suffix),access(),'private')).status,400);assert.equal(reads,0);});
test('saved answer is required by server, no pilot read',async()=>{reads=0;const r=await handler.handleOpinion(new Request(url),access(false),'private');const data=await r.json();assert(data.requiresAnswer);assert.equal(data.analysis,null);assert.equal(reads,0);});
test('disabled and hosted fail closed without reading private file',async()=>{reads=0;for(const [target,config]of [[url,null],[url.replace('http://localhost:3002','https://host.invalid'),'private']]){const data=await(await handler.handleOpinion(new Request(target),access(),config)).json();assert.equal(data.enabled,false);assert.equal(data.analysis,null);}assert.equal(reads,0);});
test('version conflict and missing question do not read',async()=>{reads=0;assert.equal((await handler.handleOpinion(new Request(url),access(true,{...q,version:2}),'private')).status,409);assert.equal((await handler.handleOpinion(new Request(url),access(true,null),'private')).status,404);assert.equal(reads,0);});
test('other question has honest unavailable coverage',async()=>{reads=0;const r=await handler.handleOpinion(new Request(url.replace('034','035')),access(true,{...q,id:'EGEL-2026-035'}),'private');const data=await r.json();assert.equal(data.covered,false);assert.equal(data.analysis,null);assert.equal(reads,0);});
test('authenticated saved answer exposes analysis only with private headers',async()=>{reads=0;const r=await handler.handleOpinion(new Request(url),access(),'private');const data=await r.json();assert.equal(r.status,200);assert.equal(data.analysis.mode,'saved-pilot');assert.equal(reads,1);assert.equal(r.headers.get('Vary'),'Cookie');assert.match(r.headers.get('Cache-Control'),/private.*no-store/);});
test('route rejects anonymous sessions and scopes saved answer to verified owner',async()=>{const source=await fs.readFile(path.join(root,'src/app/api/estudio/segunda-opinion/route.ts'),'utf8');assert(source.includes('db.auth.getUser()'));assert(source.includes('data.user.is_anonymous'));assert(source.includes('.eq("user_id",uid)'));assert(!source.includes('service_role'));});
test('reader has no credentials, fetch or write path; UI does not advertise live chat',async()=>{const server=await fs.readFile(path.join(root,'src/lib/tutor/opinion-pilot.ts'),'utf8');assert(!server.includes('fetch('));assert(!server.includes('API_KEY'));assert(!server.includes('writeFile'));const ui=await fs.readFile(path.join(root,'src/components/estudio/tutor-panel.tsx'),'utf8');assert(ui.includes('Lectura de un análisis previo; chat en vivo pendiente.'));assert(ui.includes('data-tutor-response="true"'));});
