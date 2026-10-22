// PostgreSQL-in-memory, synthetic content only. Never contacts production or AI.
import {PGlite} from '@electric-sql/pglite';
import test,{before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {hashText} from './lib/pilot-candidates.mjs';
import {buildImportedEditorialPublication} from './lib/imported-editorial-publication.mjs';
const root=path.resolve(import.meta.dirname,'../..'),hash=v=>hashText(JSON.stringify(v));
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const numbers=['001','003','006'],body='Synthetic editorial fixture; not clinical content. '.repeat(4)+' [R2] [R3] [R4]';
const urls={
 '001':['https://www.kidney.org/kidney-topics/creatinine','https://cdho.org/factsheets/chronic-kidney-disease/','https://kdigo.org/wp-content/uploads/2026/05/KDIGO-2024-CKD-Guideline-Summary-Recommendations-and-Practice-Points.pdf'],
 '003':['https://pubmed.ncbi.nlm.nih.gov/36246819/','https://digitalhistology.org/organs-systems/digestive/oral-cavity/tooth/tooth-development/tooth-development-6/','https://digitalhistology.org/organs-systems/digestive/oral-cavity/tooth/tooth-development/tooth-development-9/'],
 '006':['https://www.cdc.gov/epstein-barr/about/mononucleosis.html','https://www.cdc.gov/measles/hcp/clinical-overview/index.html','https://medlineplus.gov/ency/article/000969.htm']};
function fixture(){
 const records=numbers.map(number=>{const question={id:'EGEL-2026-'+number,version:1,stem:'Synthetic '+number,options:['A','B','C'].map(letter=>({letter,text:'Synthetic '+letter}))};
   const r={schema:'egel-imported-editorial-preparation-v1',number,question,editorial:{markdown:body,sha256:hashText(body)},sources:urls[number].map((url,i)=>({referenceId:'R'+(i+2),title:'Synthetic source',url,scope:'Synthetic scoped evidence check, not clinical certification',read:'Synthetic section',license:null})),
     provenance:{questionSha256:hash(question),sourceBatchId:'a'.repeat(64),sourceRecordSha256:'b'.repeat(64),sourcePacketSha256:'c'.repeat(64)},publicationAllowed:false,cloudCompatible:false,humanPublicationApproved:false};
   return {...r,preparationSha256:hash(r)};
 });
 const b={schema:'egel-private-imported-editorial-batch-v1',records,sourceBatchId:'a'.repeat(64),bankSnapshotSha256:'d'.repeat(64),numbers,publicationAllowed:false,cloudWrites:0,paidModelCalls:0,studentWrites:0};
 const prepared={...b,preparationBatchSha256:hash(b)};
 const approval={schema:'egel-user-content-sharing-approval-v1',recordedVia:'direct-user-chat',scope:'existing-editorial-texts-and-scoped-source-references-001-003-006',preparationBatchSha256:prepared.preparationBatchSha256,
   reviewReported:{contentApprovedForSharing:true,sourceSharingPermissionsConfirmed:true},limits:{otherQuestionsApproved:false,newTextRevisionsApproved:false,officialAnswerKey:false},
   bindings:records.map(r=>({number:r.number,questionId:r.question.id,questionVersion:r.question.version,questionSha256:r.provenance.questionSha256,bodySha256:r.editorial.sha256,sourcesSha256:hash(r.sources),preparationSha256:r.preparationSha256,sourceCount:r.sources.length}))};
 const authorization={schema:'egel-user-publication-authorization-v1',recordedVia:'direct-user-chat',migrationAuthorized:true,publicationAuthorized:true,sharingApprovalSha256:hash(approval),numbers};
 return {prepared,approval,authorization};
}
const plan=f=>buildImportedEditorialPublication(f.prepared,f.approval,f.authorization,uid);
let db;
before(async()=>{
 db=await PGlite.create();await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema auth;create schema egel_private;grant usage on schema public,auth to anon,authenticated,service_role;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz,is_anonymous boolean default false,deleted_at timestamptz,banned_until timestamptz);
 create table public.profiles(user_id uuid primary key references auth.users(id));
 create table public.questions(id text primary key,version smallint,stem text,options jsonb,unique(id,version));
 create table public.question_attempts(user_id uuid,question_id text,question_version smallint,primary key(user_id,question_id,question_version));
 grant select on auth.users,public.profiles,public.questions,public.question_attempts to service_role;
 grant select on public.questions,public.question_attempts to authenticated;
 alter table public.question_attempts enable row level security;
 create policy own_attempt on public.question_attempts to authenticated using(user_id=(select auth.uid()));`);
 const migrationFiles=(await fs.readdir(path.join(root,'supabase/migrations'))).filter(n=>/^\d{14}_imported_reviewed_editorials\.sql$/.test(n));
 assert.equal(migrationFiles.length,1);await db.exec(await fs.readFile(path.join(root,'supabase/migrations',migrationFiles[0]),'utf8'));
 for(const id of [uid,other]){await db.query('insert into auth.users(id,email_confirmed_at) values($1,now())',[id]);await db.query('insert into public.profiles values($1)',[id]);}
 for(const r of fixture().prepared.records)await db.query('insert into public.questions values($1,1,$2,$3)',[r.question.id,r.question.stem,JSON.stringify(r.question.options)]);
});
after(async()=>{if(db)await db.close();});beforeEach(async()=>{await db.exec('begin');});afterEach(async()=>{await db.exec('rollback');});
async function failure(fn,pattern){await db.exec('savepoint expected_failure');let e;try{await fn();}catch(err){e=err;}await db.exec('rollback to savepoint expected_failure;release savepoint expected_failure');assert(e);assert.match(e.message,pattern);}
async function role(name,id,fn,anonymous=false){await db.exec('set local role '+name);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(id?{sub:id,is_anonymous:anonymous}:{})]);try{return await fn();}finally{await db.exec('reset role');}}
const visible=()=>db.query('select id,body,citations from public.tutor_imported_editorials');
async function draft(){const r=plan(fixture()).payload.records[0];return (await db.query('insert into public.tutor_imported_editorials(question_id,question_version,body,sources,provenance,registration_key) values($1,1,$2,$3,$4,$5) returning *',[r.question.id,r.body,JSON.stringify(r.sources),JSON.stringify(r.provenance),r.registrationKey])).rows[0];}
async function publish(b){await db.query('select public.publish_imported_editorial($1,$2,$3,$4,true)',[b.id,b.payload_sha256,uid,'Synthetic explicit review and publication authorization']);}
async function answer(id=uid,question='EGEL-2026-001'){await db.query('insert into public.question_attempts values($1,$2,1)',[id,question]);}

test('content sharing without distinct publication authorization cannot produce a plan',()=>{
 const f=fixture();assert.throws(()=>buildImportedEditorialPublication(f.prepared,f.approval,null,uid),/PUBLICATION_AUTHORIZATION_REQUIRED/);
 f.authorization.migrationAuthorized=false;assert.throws(()=>plan(f),/PUBLICATION_AUTHORIZATION_REQUIRED/);
});
test('approval bindings protect text, references, question and exact scope',()=>{
 for(const key of ['bodySha256','sourcesSha256','questionSha256','preparationSha256']){const f=fixture();f.approval.bindings[0][key]='0'.repeat(64);f.authorization.sharingApprovalSha256=hash(f.approval);assert.throws(()=>plan(f),/SHARING_APPROVAL_CHANGED/);}
});
test('publication plan preserves unknown provider and is deterministic, idempotent and scoped',async()=>{
 const f=fixture(),p=plan(f);assert.deepEqual(p,plan(f));assert(!p.query.includes('insert into public.question_attempts'));assert(!p.query.includes('tutor_base_explanations'));
 await db.exec(p.query);await db.exec(p.query);const rows=(await db.query('select * from public.tutor_imported_editorials')).rows;
 assert.equal(rows.length,3);assert(rows.every(r=>r.status==='published'&&r.provenance.provider_verified===null&&r.provenance.model_verified===null));
});
test('draft is hidden; own saved answer for this version is required after publication',async()=>{
 const b=await draft();await answer();assert.equal((await role('authenticated',uid,visible)).rows.length,0);
 await publish(b);assert.equal((await role('authenticated',uid,visible)).rows.length,1);assert.equal((await role('authenticated',other,visible)).rows.length,0);
 await answer(other,'EGEL-2026-003');assert.equal((await role('authenticated',other,visible)).rows.length,0);
 assert.equal((await role('authenticated',uid,visible,true)).rows.length,0);
 await role('anon',null,()=>failure(visible,/permission denied/));
});
test('students cannot read audit columns, mutate, approve or publish',async()=>{
 const b=await draft();await publish(b);await answer();
 await role('authenticated',uid,async()=>{
   for(const col of ['sources','provenance','reviewer_id','registration_key','question_stem'])await failure(()=>db.query('select '+col+' from public.tutor_imported_editorials'),/permission denied/);
   await failure(()=>db.query("update public.tutor_imported_editorials set body='tampered'"),/permission denied/);
   await failure(()=>publish(b),/permission denied/);
 });
});
test('source permission, exact URL and pilot question enforced in SQL',async()=>{
 const r=plan(fixture()).payload.records[0];
 for(const patch of [{url:'https://other.invalid/'},{permission_confirmed:false},{reference_id:'R9'}]){
   const sources=structuredClone(r.sources);Object.assign(sources[0],patch);
   assert.equal((await db.query('select egel_private.imported_editorial_sources_valid($1,$2) as valid',[r.question.id,JSON.stringify(sources)])).rows[0].valid,false);
 }
 assert.equal((await db.query("select egel_private.imported_editorial_sources_valid('EGEL-2026-034',$1) as valid",[JSON.stringify(r.sources)])).rows[0].valid,false);
});
test('unknown provider is not replaced by invented model/run metadata',async()=>{
 const b=await draft();await failure(()=>db.query("update public.tutor_imported_editorials set provenance=provenance||'{\"model_verified\":\"fake-model\"}' where id=$1",[b.id]),/check constraint/);
 await failure(()=>db.query("update public.tutor_imported_editorials set provenance=provenance||'{\"run_fingerprint\":\"fake\"}' where id=$1",[b.id]),/check constraint/);
});
test('changed live question aborts the whole plan, never publishes partial batch',async()=>{
 await db.query("update public.questions set stem='Changed third question' where id='EGEL-2026-006'");
 await failure(()=>db.exec(plan(fixture()).query),/LIVE_QUESTION_CHANGED/);assert.equal((await db.query('select count(*)::int as n from public.tutor_imported_editorials')).rows[0].n,0);
});
test('body/source edits reset review, question changes and withdrawal hide content',async()=>{
 const b=await draft();await publish(b);await answer();
 await db.query("update public.questions set stem='Changed' where id='EGEL-2026-001'");assert.equal((await role('authenticated',uid,visible)).rows.length,0);
 await db.query("update public.questions set stem='Synthetic 001' where id='EGEL-2026-001'");assert.equal((await role('authenticated',uid,visible)).rows.length,1);
 await db.query('update public.tutor_imported_editorials set body=body||$1 where id=$2',[' changed',b.id]);
 const changed=(await db.query('select * from public.tutor_imported_editorials where id=$1',[b.id])).rows[0];assert.equal(changed.status,'draft');assert.equal(changed.reviewer_id,null);assert.equal(changed.valid_until,null);
 assert.equal((await role('authenticated',uid,visible)).rows.length,0);await failure(()=>publish(b),/REVIEW_CONFLICT/);
});
test('expiry and explicit revocation hide shared content without changing attempts',async()=>{
 const b=await draft();await publish(b);await answer();
 await db.query("update public.tutor_imported_editorials set reviewed_at=now()-interval '2 days',valid_until=now()-interval '1 day' where id=$1",[b.id]);
 assert.equal((await role('authenticated',uid,visible)).rows.length,0);assert.equal((await db.query('select count(*)::int as n from public.question_attempts')).rows[0].n,1);
 await db.query("update public.tutor_imported_editorials set status='withdrawn' where id=$1",[b.id]);assert.equal((await role('authenticated',uid,visible)).rows.length,0);
});
test('unconfirmed reviewer and stale approval hash cannot publish',async()=>{
 const b=await draft();await db.query('update auth.users set email_confirmed_at=null where id=$1',[uid]);await failure(()=>publish(b),/HUMAN_APPROVAL_REQUIRED/);
 await db.query('update auth.users set email_confirmed_at=now() where id=$1',[uid]);await failure(()=>publish({...b,payload_sha256:'0'.repeat(64)}),/REVIEW_CONFLICT/);
});

test('actual session reader maps references without pages or model identity and rejects bad rows',async()=>{
 const require=createRequire(path.join(root,'package.json')),ts=require('typescript');
 async function load(file,imports={}){const code=ts.transpileModule(await fs.readFile(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('require','module','exports',code)(n=>{if(Object.hasOwn(imports,n))return imports[n];throw Error(n);},m,m.exports);return m.exports;}
 const domain=await load('src/lib/tutor/domain.ts'),reader=await load('src/lib/tutor/imported-base.ts',{'server-only':{},'./domain':domain});
 await db.exec(plan(fixture()).query);const raw=(await db.query("select id,format_version,body,citations,reviewed_at,valid_until from public.tutor_imported_editorials where question_id='EGEL-2026-001'")).rows[0];
 // PostgREST serializes timestamps as strings; PGlite returns Date objects.
 const row={...raw,reviewed_at:new Date(raw.reviewed_at).toISOString(),valid_until:new Date(raw.valid_until).toISOString()};
 const message=reader.selectImportedEditorial([row],'EGEL-2026-001');assert.equal(message.editorialImport,true);assert.equal(message.origin,'shared-reviewed');assert(message.citations.every(c=>c.page===null&&c.printed===null));assert(!JSON.stringify(message).includes('Gemini'));
 for(const patch of [{format_version:'other'},{body:'short'},{valid_until:'2000-01-01'},{citations:[{...row.citations[0],url:'https://other.invalid/'}]},
   {citations:[{...row.citations[0],pdf_page:2},...row.citations.slice(1)]}])assert.throws(()=>reader.selectImportedEditorial([{...row,...patch}],'EGEL-2026-001'),/TUTOR_BASE_UNAVAILABLE/);
 assert.throws(()=>reader.selectImportedEditorial([row,row],'EGEL-2026-001'),/TUTOR_BASE_UNAVAILABLE/);assert.equal(reader.selectImportedEditorial([],'EGEL-2026-001'),null);
});
