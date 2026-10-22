import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {hashText} from './lib/pilot-candidates.mjs';
import {startEditorialPreview} from './lib/editorial-preview-server.mjs';
import {editorialPreviewRenderer,editorialPreviewAssets} from './lib/editorial-preview-renderer.mjs';
const hash=v=>hashText(JSON.stringify(v));
function input(){
 const question={id:'EGEL-2026-001',version:1,stem:'Synthetic case only',options:['A','B','C'].map(letter=>({letter,text:'Synthetic '+letter}))};
 const r={schema:'egel-imported-editorial-preparation-v1',number:'001',question,editorial:{markdown:'Private synthetic explanation, not clinical advice. '.repeat(3),sha256:null},
   sources:[{referenceId:'R2',title:'Synthetic source',url:'https://example.org/source',scope:'Synthetic scoped check',read:'Synthetic section',license:null,commercialReuse:'not-cleared-by-this-preparation'}],
   provenance:{questionSha256:hash(question)},publicationAllowed:false,cloudCompatible:false,humanPublicationApproved:false,clinicalExpertApproved:false};
 r.editorial.sha256=hashText(r.editorial.markdown);r.preparationSha256=hash(r);
 const prepared={schema:'egel-private-imported-editorial-batch-v1',records:[r],sourceBatchId:'a'.repeat(64),bankSnapshotSha256:'b'.repeat(64),
   numbers:['001'],publicationAllowed:false,cloudWrites:0,paidModelCalls:0,studentWrites:0};prepared.preparationBatchSha256=hash(prepared);
 return {prepared,inputManifestSha256:'c'.repeat(64)};
}
async function start(){let current=input(),loads=0;const app=await startEditorialPreview({load:async()=>{loads++;if(current instanceof Error)throw current;return structuredClone(current);},
 render:text=>'<p>'+text+'</p>',assets:new Map([['/',{body:'Public shell, no question or explanation',type:'text/html'}]])});
 return {...app,set:v=>{current=v;},loads:()=>loads};}
async function login(app){const token=app.launchUrl.split('#')[1];const r=await fetch(app.origin+'/api/session',{method:'POST',headers:{Origin:app.origin,'Content-Type':'application/json'},body:JSON.stringify({token})});
 assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}

test('shell reveals no data and all private GETs require the capability session',async()=>{
 const app=await start();try{
   assert.equal(app.server.address().address,'127.0.0.1');
   const shell=await fetch(app.origin+'/');assert.equal(shell.status,200);assert(!(await shell.text()).includes('Synthetic case'));
   for(const route of ['/api/records','/api/records/001','/api/records/001/explanation'])assert.equal((await fetch(app.origin+route)).status,401);
   assert.equal(app.loads(),1);
 }finally{await app.close();}
});
test('private exchange requires same origin and valid token; cookie is HttpOnly and SameSite Strict',async()=>{
 const app=await start();try{
   for(const [origin,token,expected]of [['https://foreign.invalid','bad',403],[undefined,'bad',403],[app.origin,'bad',401]]){
     const r=await fetch(app.origin+'/api/session',{method:'POST',headers:{...(origin?{Origin:origin}:{}),'Content-Type':'application/json'},body:JSON.stringify({token})});assert.equal(r.status,expected);assert.equal(r.headers.get('set-cookie'),null);
   }
   const r=await fetch(app.origin+'/api/session',{method:'POST',headers:{Origin:app.origin,'Content-Type':'application/json'},body:JSON.stringify({token:app.launchUrl.split('#')[1]})});
   assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);assert(!(await r.text()).includes(app.launchUrl.split('#')[1]));
 }finally{await app.close();}
});
test('operator can read originals, explicitly open text and view source scope without publication',async()=>{
 const app=await start();try{const cookie=await login(app),get=route=>fetch(app.origin+route,{headers:{Cookie:cookie}});
   const list=await (await get('/api/records')).json();assert.deepEqual(list.records,[{number:'001',id:'EGEL-2026-001'}]);
   const q=await (await get('/api/records/001')).json();assert.equal(q.question.stem,'Synthetic case only');assert.equal(q.question.options.length,3);assert.equal(q.sources[0].scope,'Synthetic scoped check');assert(!Object.hasOwn(q,'html'));assert(!Object.hasOwn(q,'provenance'));
   const result=await get('/api/records/001/explanation'),body=await result.json();assert(body.html.includes('Private synthetic explanation'));assert.equal(body.publicationAllowed,false);assert.equal(body.clinicalExpertApproved,false);
   assert.match(result.headers.get('cache-control'),/private, no-store/);assert.match(result.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(result.headers.get('access-control-allow-origin'),null);
   assert.equal((await get('/api/records/002')).status,404);assert.equal((await get('/api/records/034/explanation')).status,404);
 }finally{await app.close();}
});
test('cross-site, DNS rebinding, forwarding and unknown request parameters rejected',async()=>{
 const app=await start();try{const cookie=await login(app);
   for(const patch of [{Origin:'https://other.invalid'},{Host:'other.invalid'},{'X-Forwarded-Host':'other.invalid'},{'Sec-Fetch-Site':'cross-site'}]){
     // Raw HTTP is intentional: fetch rewrites protected headers such as Host.
     const status=await new Promise((resolve,reject)=>{const req=http.get(app.origin+'/api/records',{headers:{Cookie:cookie,...patch}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});
     assert.equal(status,403,JSON.stringify(patch));
   }
   assert.equal((await fetch(app.origin+'/api/records?path=secret',{headers:{Cookie:cookie}})).status,400);
   for(const method of ['POST','PUT','DELETE'])assert.equal((await fetch(app.origin+'/api/records/001',{method,headers:{Cookie:cookie}})).status,405);
 }finally{await app.close();}
});
test('changed or unreadable inputs fail closed, without stale HTML or raw exception details',async()=>{
 const app=await start();try{const cookie=await login(app),get=()=>fetch(app.origin+'/api/records/001/explanation',{headers:{Cookie:cookie}});
   const changed=input();changed.inputManifestSha256='d'.repeat(64);app.set(changed);assert.equal((await get()).status,503);
   app.set(Error('PRIVATE LOCAL PATH OR SECRET'));const r=await get();assert.equal(r.status,503);assert(!(await r.text()).includes('PRIVATE'));
   assert(app.loads()>=3);
 }finally{await app.close();}
});
test('body size bounded and private launch capability never appears in shell or GET data',async()=>{
 const app=await start();try{
   const r=await fetch(app.origin+'/api/session',{method:'POST',headers:{Origin:app.origin,'Content-Type':'application/json'},body:'x'.repeat(2000)});assert.equal(r.status,413);
   const cookie=await login(app),text=await (await fetch(app.origin+'/api/records',{headers:{Cookie:cookie}})).text();assert(!text.includes(app.launchUrl.split('#')[1]));
 }finally{await app.close();}
});
test('viewer reuses actual renderer: tables and math work, active content does not',async()=>{
 const render=await editorialPreviewRenderer(),html=render('**Offline**\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n$1+1=2$');
 assert(html.includes('<table>'));assert(html.includes('katex'));assert(html.includes('<strong>Offline</strong>'));
 const unsafe=render('<script>bad()</script>\n\n[link](https://foreign.invalid/) ![pixel](https://foreign.invalid/x)');assert(!unsafe.includes('<script'));assert(!unsafe.includes('href='));assert(!unsafe.includes('<img'));
 const assets=await editorialPreviewAssets();assert(assets.has('/'));assert(assets.has('/viewer.js'));assert(assets.has('/katex.css'));
});
test('viewer has no production route, credentials, provider call, approval or persistent write',async()=>{
 const root=path.resolve(import.meta.dirname,'../..');
 for(const file of ['scripts/egel/lib/editorial-preview-server.mjs','scripts/egel/visor-editorial.mjs']){
   const code=await fs.readFile(path.join(root,file),'utf8');assert(!/process\.env|dotenv|@supabase|writeFile|appendFile|execute_sql/.test(code));
 }
 const js=await fs.readFile(path.join(root,'scripts/egel/editorial-preview/viewer.js'),'utf8');assert(!/localStorage|sessionStorage|api\/estudio/.test(js));
});
