import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(root,'package.json')),ts=require('typescript');
const source=await fs.readFile(path.join(root,'src/lib/biblioteca/retrieval.ts'),'utf8');
function loader({user={id:'verified-owner'},error=null,rows=[],rpcError=null}={}) {
  const calls=[],loaded={exports:{}};
  const imports={'server-only':{},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user},error})}})},
    '@supabase/supabase-js':{createClient:(url,key,options)=>{calls.push({url,key,options});return {rpc:async(name,args)=>{calls.push({name,args});return {data:rows,error:rpcError};}};}}};
  new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{if(!(name in imports))throw Error(name);return imports[name];},loaded,loaded.exports);
  return {...loaded.exports,calls};
}
const envNames=['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_LIBRARY_SECRET_KEY','EGEL_COMMON_LIBRARY_ENABLED'];
const saved=Object.fromEntries(envNames.map(k=>[k,process.env[k]]));
test('common library access boundaries, no network or AI',async t=>{
 try{
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://zbfgcfajiwhfhewkstvi.supabase.co';
  process.env.SUPABASE_LIBRARY_SECRET_KEY='test-only-not-a-real-key';
  process.env.EGEL_COMMON_LIBRARY_ENABLED='true';
  await t.test('feature is off unless explicitly configured',async()=>{delete process.env.EGEL_COMMON_LIBRARY_ENABLED;const x=loader();assert.equal((await x.retrieveLibraryEvidence('anestesia')).status,'not_configured');assert.equal(x.calls.length,0);process.env.EGEL_COMMON_LIBRARY_ENABLED='true';});
  for(const query of ['', 'aa','x'.repeat(401),null]) await t.test('invalid bounded query '+String(query).slice(0,15),async()=>{const x=loader();assert.equal((await x.retrieveLibraryEvidence(query)).status,'invalid_query');assert.equal(x.calls.length,0);});
  for(const user of [null,{id:'anonymous',is_anonymous:true}]) await t.test('no anonymous evidence',async()=>{const x=loader({user});assert.equal((await x.retrieveLibraryEvidence('anestesia')).status,'unauthenticated');assert.equal(x.calls.length,0);});
  await t.test('getUser failure denies before admin client',async()=>{const x=loader({error:{message:'not-a-session'}});assert.equal((await x.retrieveLibraryEvidence('anestesia')).status,'unauthenticated');assert.equal(x.calls.length,0);});
  await t.test('owner is exclusively from validated session',async()=>{const x=loader();assert.equal((await x.retrieveLibraryEvidence('  anestesia  ')).status,'empty');assert.deepEqual(x.calls[1],{name:'search_tutor_library',args:{p_user_id:'verified-owner',p_query:'anestesia',p_limit:6}});});
  await t.test('DB error is redacted',async()=>{const x=loader({rpcError:{message:'private raw provider error'}});const r=await x.retrieveLibraryEvidence('anestesia');assert.equal(r.status,'unavailable');assert(!JSON.stringify(r).includes('private raw'));});
  const row={document_id:'a'.repeat(64),catalog_id:'BIB-002',title:'Source metadata',pdf_page:157,ordinal:2,body:'Synthetic test evidence',body_sha256:'b'.repeat(64)};
  await t.test('provenance preserved; no PDF URL or credentials',async()=>{const x=loader({rows:[row]});const r=await x.retrieveLibraryEvidence('anestesia');assert.equal(r.status,'available');assert.equal(r.evidence[0].pdfPage,157);assert.equal(r.evidence[0].textSha256,row.body_sha256);assert(!JSON.stringify(r).includes('test-only'));assert(!JSON.stringify(r).includes('http'));});
  for(const rows of [[{...row,pdf_page:0}],[{...row,document_id:'../file'}],[{...row,body:'x'.repeat(8001)}],Array(7).fill(row)]) await t.test('unexpected evidence fails closed',async()=>assert.equal((await loader({rows}).retrieveLibraryEvidence('anestesia')).status,'unavailable'));
  await t.test('never use a different project',async()=>{process.env.NEXT_PUBLIC_SUPABASE_URL='https://different.invalid';const x=loader();assert.equal((await x.retrieveLibraryEvidence('anestesia')).status,'not_configured');assert.equal(x.calls.length,0);});
 } finally {for(const k of envNames){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}}
});
test('migration revokes direct student/raw text/PDF-part access and RPC execution',async()=>{
 const files=['20261017044119_shared_tutor_library.sql','20261017044951_library_multipart_storage.sql'];
 for(const file of files){const sql=await fs.readFile(path.join(root,'supabase/migrations',file),'utf8');assert.match(sql,/enable row level security/i);assert.match(sql,/revoke all[\s\S]*from public, anon, authenticated/i);assert(!/to authenticated/i.test(sql));}
 const sql=await fs.readFile(path.join(root,'supabase/migrations/20261017044612_library_validate_profile.sql'),'utf8');
 assert.match(sql,/security invoker/i);assert.match(sql,/d\.visibility = 'common' or \(d\.visibility = 'personal' and d\.owner_id = p_user_id\)/);assert.match(sql,/d\.source_kind = 'literature'/);assert.match(sql,/least\(greatest[\s\S]*8\)/);
});
