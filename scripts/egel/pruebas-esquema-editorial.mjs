// Actual PostgreSQL in memory. Synthetic data only; no remote DB, key or model.
import {PGlite} from '@electric-sql/pglite';
import test,{before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildEditorialDraftRegistration} from './lib/editorial-registration.mjs';
import {editorialQuestionHash} from './lib/editorial-base.mjs';
import {buildWebEditorialDraftRegistration} from './lib/web-editorial-registration.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const ids={one:'11111111-1111-4111-8111-111111111111',two:'22222222-2222-4222-8222-222222222222',reviewer:'33333333-3333-4333-8333-333333333333'};
const doc='a'.repeat(64),legacyDoc='b'.repeat(64),body='Synthetic offline structural fixture. Not clinical evidence or an answer key. '.repeat(3);
const provenance={provider:'deepseek',generation_prompt_version:'literature-draft-v2',run_fingerprint:'c'.repeat(64),draft_markdown_sha256:'d'.repeat(64),editorial_document_sha256:'e'.repeat(64),editorial_approval_sha256:'f'.repeat(64)};
const migration='supabase/migrations/20261019004132_reviewed_transcriptions_and_editorial_bases.sql';
let db;
before(async()=>{
  db=await PGlite.create();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create schema egel_private;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant usage on schema egel_private to authenticated,service_role;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,
      is_anonymous boolean not null default false,deleted_at timestamptz,banned_until timestamptz);
    create table public.profiles(user_id uuid primary key references auth.users(id));
    create table public.questions(id text primary key,version smallint not null,stem text not null,options jsonb not null,unique(id,version));
    create table public.question_attempts(user_id uuid references public.profiles(user_id),question_id text,question_version smallint,
      primary key(user_id,question_id,question_version),foreign key(question_id,question_version) references public.questions(id,version));
    grant select,insert,update on public.profiles,public.questions,public.question_attempts to service_role;
    alter table public.questions enable row level security; alter table public.question_attempts enable row level security;
    grant select on public.questions,public.question_attempts to authenticated;
    create policy read_question on public.questions for select to authenticated using((select auth.uid()) is not null);
    create policy read_own_attempt on public.question_attempts for select to authenticated using(user_id=(select auth.uid()));
  `);
  for(const file of ['supabase/migrations/20261017044119_shared_tutor_library.sql','supabase/migrations/20261017051546_shared_reviewed_tutor_bases.sql',migration])
    await db.exec(await fs.readFile(file,'utf8'));
  await db.exec(await fs.readFile('supabase/migrations/20261019042604_reviewed_web_editorial_sources.sql','utf8'));
  for(const [name,id] of Object.entries(ids)){await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,name+'@example.invalid']);await db.query('insert into public.profiles values($1)',[id]);}
  for(const id of ['EGEL-2026-034','EGEL-2026-035'])await db.query('insert into public.questions values($1,1,$2,$3)',[id,body,JSON.stringify(['A','B','C'].map(letter=>({letter,text:'Synthetic '+letter})))]);
  for(const [id,enabled] of [[doc,false],[legacyDoc,true]])await db.query(`insert into public.library_documents
    (id,catalog_id,title,visibility,source_kind,original_sha256,object_path,file_bytes,page_count,upload_state,indexed_pages,evidence_enabled)
    values($1,'BIB-002','Offline synthetic document','common','literature',$1,$2,1000,350,'verified',$3,$4)`,[id,`sha256/${id}.pdf`,enabled?1:0,enabled]);
  await db.query('insert into public.library_chunks(document_id,ordinal,pdf_page,start_char,end_char,body,body_sha256) values($1,0,64,0,$2,$3,$4)',[legacyDoc,body.length,body,sha(body)]);
});
after(async()=>{if(db)await db.close();});
beforeEach(async()=>{await db.exec('begin');});
afterEach(async()=>{await db.exec('rollback');});
async function role(name,uid,action,anonymous=false){
  await db.exec('set local role '+name);
  await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(uid?{sub:uid,is_anonymous:anonymous}:{})]);
  try{return await action();}finally{await db.exec('reset role').catch(()=>{});}
}
async function failure(action,pattern){
  await db.exec('savepoint expected_failure');let error;
  try{await action();}catch(e){error=e;}
  await db.exec('rollback to savepoint expected_failure');await db.exec('release savepoint expected_failure');
  assert(error,'operation should fail');assert.match(error.message,pattern);
}
async function transcription(page=64){return (await db.query(`insert into public.library_reviewed_transcriptions
  (document_id,pdf_page,body,source_locator,revision_note) values($1,$2,$3,'Synthetic locator','Synthetic revision note without clinical data') returning *`,[doc,page,body])).rows[0];}
async function approve(t){await db.query('select public.approve_reviewed_library_transcription($1,$2,$3,$4,true)',[t.id,t.payload_sha256,ids.reviewer,'Explicit synthetic human review for offline permissions tests']);return t;}
function source(t){return {kind:'reviewed-transcription',document_id:doc,catalog_id:'BIB-002',title:'Offline synthetic document',pdf_page:t.pdf_page,body_sha256:t.body_sha256,transcription_id:t.id,transcription_sha256:t.payload_sha256};}
async function base(sources,legacy=false){return (await db.query(`insert into public.tutor_base_explanations
  (question_id,question_version,model,prompt_version,body,sources,editorial_revision,provenance)
  values('EGEL-2026-034',1,$1,$2,$3,$4,$5,$6) returning *`,[legacy?'gemini-3.8-flash':'deepseek-flash',legacy?'literature-base-v1':'literature-editorial-v1',body+' [S1]',JSON.stringify(sources),!legacy,JSON.stringify(legacy?{}:provenance)])).rows[0];}
async function publish(b){await db.query('select public.publish_reviewed_tutor_base($1,$2,$3,$4,true)',[b.id,b.payload_sha256,ids.reviewer,'Explicit synthetic approval; no real clinical explanation']);}
async function answered(uid=ids.one,id='EGEL-2026-034'){await db.query('insert into public.question_attempts values($1,$2,1)',[uid,id]);}
const visible=()=>db.query('select id,body,editorial_revision from public.tutor_base_explanations');

test('database computes transcription hashes and always inserts as draft',async()=>{
  const t=await role('service_role',null,()=>transcription());assert.equal(t.status,'draft');assert.equal(t.body_sha256,sha(body));assert.match(t.payload_sha256,/^[a-f0-9]{64}$/);
  assert.equal(t.reviewer_id,null);assert.equal((await db.query('select evidence_enabled from public.library_documents where id=$1',[doc])).rows[0].evidence_enabled,false);
});
test('raw transcriptions and approval RPCs are inaccessible to anon and students',async()=>{
  const t=await transcription();
  for(const name of ['anon','authenticated'])await role(name,name==='authenticated'?ids.one:null,async()=>{
    await failure(()=>db.query('select body from public.library_reviewed_transcriptions'),/permission denied/);
    await failure(()=>db.query('select public.approve_reviewed_library_transcription($1,$2,$3,$4,true)',[t.id,t.payload_sha256,ids.one,'Synthetic unauthorized approval']),/permission denied/);
    await failure(()=>db.query('select public.publish_reviewed_tutor_base($1,$2,$3,$4,true)',[t.id,t.payload_sha256,ids.one,'Synthetic unauthorized publication']),/permission denied/);
  });
});
test('approval requires exact hash, reviewer profile and explicit human confirmation',async()=>{
  const t=await transcription();
  for(const [hash,reviewer,confirm] of [['0'.repeat(64),ids.reviewer,true],[t.payload_sha256,ids.reviewer,false],[t.payload_sha256,'44444444-4444-4444-8444-444444444444',true]])
    await failure(()=>db.query('select public.approve_reviewed_library_transcription($1,$2,$3,$4,$5)',[t.id,hash,reviewer,'Synthetic explicit review note',confirm]),/TRANSCRIPTION_REVIEW_CONFLICT|HUMAN_REVIEW_REQUIRED/);
});
test('unapproved evidence, unrelated pages and personal documents cannot enter a base',async()=>{
  const t=await transcription();await failure(()=>base([source(t)]),/BASE_SOURCES_INVALID/);await approve(t);
  await failure(()=>base([{...source(t),pdf_page:65}]),/BASE_SOURCES_INVALID/);
  await db.query("update public.library_documents set visibility='personal',owner_id=$1 where id=$2",[ids.one,doc]);
  await failure(()=>base([source(t)]),/BASE_SOURCES_INVALID/);
});
test('a reviewed excerpt works without enabling the whole book or modifying its OCR chunks',async()=>{
  const t=await role('service_role',null,async()=>approve(await transcription()));
  const b=await role('service_role',null,()=>base([source(t)]));assert.equal(b.status,'draft');assert.equal(b.editorial_revision,true);
  assert.equal((await db.query('select count(*)::int as n from public.library_chunks where document_id=$1',[doc])).rows[0].n,0);
  assert.equal((await db.query('select evidence_enabled from public.library_documents where id=$1',[doc])).rows[0].evidence_enabled,false);
});
test('drafts stay hidden; publication requires the current approval hash',async()=>{
  const b=await base([source(await approve(await transcription()))]);await answered();
  assert.equal((await role('authenticated',ids.one,visible)).rows.length,0);
  await failure(()=>db.query('select public.publish_reviewed_tutor_base($1,$2,$3,$4,true)',[b.id,'0'.repeat(64),ids.reviewer,'Synthetic invalid expected hash']),/BASE_REVIEW_CONFLICT/);
});
test('published explanation requires a saved answer of the requesting student and this version',async()=>{
  const b=await base([source(await approve(await transcription()))]);await publish(b);await answered();
  assert.equal((await role('authenticated',ids.one,visible)).rows.length,1);
  assert.equal((await role('authenticated',ids.two,visible)).rows.length,0);
  await answered(ids.two,'EGEL-2026-035');assert.equal((await role('authenticated',ids.two,visible)).rows.length,0);
  assert.equal((await role('authenticated',ids.one,visible,true)).rows.length,0);
  await role('anon',null,()=>failure(()=>visible(),/permission denied/));
});
test('student cannot read sources, provenance, reviewer identity or modify shared content',async()=>{
  const b=await base([source(await approve(await transcription()))]);await publish(b);await answered();
  await role('authenticated',ids.one,async()=>{
    for(const column of ['sources','provenance','reviewer_id'])await failure(()=>db.query('select '+column+' from public.tutor_base_explanations'),/permission denied/);
    await failure(()=>db.query("update public.tutor_base_explanations set body='altered'"),/permission denied/);
  });
});
test('transcription changes revoke its approval and hide the published dependent explanation',async()=>{
  const t=await approve(await transcription()),b=await base([source(t)]);await publish(b);await answered();
  await db.query('update public.library_reviewed_transcriptions set body=body||$1 where id=$2',[' changed',t.id]);
  const changed=(await db.query('select * from public.library_reviewed_transcriptions where id=$1',[t.id])).rows[0];
  assert.equal(changed.status,'draft');assert.equal(changed.reviewer_id,null);assert.notEqual(changed.payload_sha256,t.payload_sha256);
  assert.equal((await role('authenticated',ids.one,visible)).rows.length,0);
});
test('revocation and document changes hide dependent explanations without deleting student data',async()=>{
  const t=await approve(await transcription()),b=await base([source(t)]);await publish(b);await answered();
  await db.query("update public.library_reviewed_transcriptions set status='revoked' where id=$1",[t.id]);
  assert.equal((await role('authenticated',ids.one,visible)).rows.length,0);
  assert.equal((await db.query('select count(*)::int as n from public.question_attempts')).rows[0].n,1);
});
test('a transcription can still be revoked after its document is withdrawn',async()=>{
  const t=await approve(await transcription());await db.query("update public.library_documents set upload_state='pending' where id=$1",[doc]);
  await db.query("update public.library_reviewed_transcriptions set status='revoked' where id=$1",[t.id]);
  assert.equal((await db.query('select status from public.library_reviewed_transcriptions where id=$1',[t.id])).rows[0].status,'revoked');
});
test('changed document metadata and question snapshot invalidate publication',async()=>{
  const t=await approve(await transcription()),b=await base([source(t)]);await publish(b);await answered();
  await db.query("update public.library_documents set title='Changed source title' where id=$1",[doc]);
  assert.equal((await role('authenticated',ids.one,visible)).rows.length,0);
  await db.query("update public.library_documents set title='Offline synthetic document' where id=$1",[doc]);
  assert.equal((await role('authenticated',ids.one,visible)).rows.length,1);
  await db.query("update public.questions set stem='Changed question snapshot' where id='EGEL-2026-034'");
  assert.equal((await role('authenticated',ids.one,visible)).rows.length,0);
});
test('body and provenance edits reset base review rather than silently preserving publication',async()=>{
  const b=await base([source(await approve(await transcription()))]);await publish(b);await answered();
  await db.query("update public.tutor_base_explanations set provenance=jsonb_set(provenance,'{run_fingerprint}',to_jsonb($1::text)) where id=$2",['1'.repeat(64),b.id]);
  const r=(await db.query('select * from public.tutor_base_explanations where id=$1',[b.id])).rows[0];
  assert.equal(r.status,'draft');assert.equal(r.reviewer_id,null);assert.notEqual(r.payload_sha256,b.payload_sha256);
  assert.equal((await role('authenticated',ids.one,visible)).rows.length,0);
});
test('changed explanation body removes approval; old source fingerprints cannot publish a revision',async()=>{
  const b=await base([source(await approve(await transcription()))]);await publish(b);await answered();
  await db.query('update public.tutor_base_explanations set body=body||$1 where id=$2',[' Changed body.',b.id]);
  const changed=(await db.query('select * from public.tutor_base_explanations where id=$1',[b.id])).rows[0];
  assert.equal(changed.status,'draft');assert.equal(changed.reviewed_at,null);assert.equal(changed.review_note,null);
  assert.equal((await role('authenticated',ids.one,visible)).rows.length,0);
  await failure(()=>publish(b),/BASE_REVIEW_CONFLICT/);
});
test('a draft insert cannot smuggle publication or transcription approval flags',async()=>{
  const t=await transcription();
  await failure(()=>db.query('select public.approve_reviewed_library_transcription($1,$2,$3,null,true)',[t.id,t.payload_sha256,ids.reviewer]),/HUMAN_REVIEW_REQUIRED/);
  await approve(t);const b=await base([source(t)]);
  await failure(()=>db.query("update public.tutor_base_explanations set status='published',reviewer_id=$1,reviewed_at=now(),review_note=null where id=$2",[ids.reviewer,b.id]),/tutor_base_published_review_complete/);
});
test('legacy Gemini indexed sources remain valid and cannot be mislabeled as DeepSeek',async()=>{
  const s={document_id:legacyDoc,catalog_id:'BIB-002',title:'Offline synthetic document',pdf_page:64,ordinal:0,body_sha256:sha(body)};
  const b=await base([s],true);await publish(b);await answered();assert.equal((await role('authenticated',ids.one,visible)).rows.length,1);
  await failure(()=>db.query("update public.tutor_base_explanations set model='deepseek-flash' where id=$1",[b.id]),/tutor_base_model_and_provenance_check/);
});
test('malformed source references fail closed including nulls and overflowing page numbers',async()=>{
  for(const sources of [null,{},[],[{}],[{kind:'unknown'}],[{pdf_page:999999999999999999999,body_sha256:sha(body)}]]){
    const r=await db.query('select egel_private.shared_base_sources_valid($1) as valid',[JSON.stringify(sources)]);assert.equal(r.rows[0].valid,false);
  }
});
test('only exact model/prompt/editorial provenance combinations are accepted',async()=>{
  const b=await base([source(await approve(await transcription()))]);
  for(const [column,value] of [['prompt_version','literature-draft-v2'],['model','other']])
    await failure(()=>db.query('update public.tutor_base_explanations set '+column+'=$1 where id=$2',[value,b.id]),/tutor_base_model_and_provenance_check/);
  await failure(()=>db.query("update public.tutor_base_explanations set provenance='{}' where id=$1",[b.id]),/tutor_base_model_and_provenance_check/);
});

function registrationFixture(){
  const question={id:'EGEL-2026-034',version:1,stem:body,options:['A','B','C'].map(letter=>({letter,text:'Synthetic '+letter}))};
  const evidence=[64,68].map(pdfPage=>({documentId:doc,title:'Offline synthetic document',pdfPage,ordinal:0,text:body,textSha256:sha(body),reviewed:true}));
  const markdown=body+' [S1] [S2]',p={provider:'deepseek',model:'deepseek-flash',promptVersion:'literature-draft-v2',runFingerprint:'c'.repeat(64),draftMarkdownSha256:'d'.repeat(64)};
  return {preparation:{question,editorial:{markdown,sha256:sha(markdown)},provenance:p,evidence,
    approval:{humanApproved:true,scope:'prepare-shared-explanation-only',approvedAt:'2026-10-18T23:00:00Z',bodySha256:sha(markdown),
      questionSha256:editorialQuestionHash(question),evidenceSha256:sha(JSON.stringify(evidence)),provenanceSha256:sha(JSON.stringify(p)),recordedVia:'direct-user-chat'}},
    sourceReview:{humanSourceReview:true,sourceSharingApproved:true,questionId:question.id,sourcePdfSha256:doc,
      edits:evidence.map(e=>({documentId:doc,pdfPage:e.pdfPage,ordinal:0,newTextSha256:e.textSha256,locator:'Synthetic locator '+e.pdfPage,reason:'Synthetic explicit source revision for offline testing only.'}))}};
}
const registrationPlan=f=>buildEditorialDraftRegistration(f.preparation,f.sourceReview,'reviewer@example.invalid');
const executeRegistration=async plan=>(await db.exec(plan.query)).at(-1).rows[0];

const webUrl='https://www.cun.es/diccionario-medico/terminos/lipotimia';
function webFixture(){
  const f=registrationFixture(),p=f.preparation;
  p.editorial.markdown+=' Editorial web supplement '+webUrl;
  p.editorial.sha256=sha(p.editorial.markdown);p.approval.bodySha256=p.editorial.sha256;
  const webEvidence=[{url:webUrl,title:'Synthetic web title',publisher:'Synthetic publisher',summary:body,
    verifiedAt:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),
    reviewScope:'Terminology only; no clinical management or dosage.',reviewed:true}];
  return {...f,input:{bookPreparation:p,webEvidence,approval:{humanApproved:true,scope:'prepare-web-supplement-only',approvedAt:new Date().toISOString(),
    bodySha256:p.editorial.sha256,webEvidenceSha256:sha(JSON.stringify(webEvidence)),recordedVia:'direct-user-chat'}}};
}
const webPlan=f=>buildWebEditorialDraftRegistration(f.input,f.sourceReview,'reviewer@example.invalid');

test('web registration is atomic, review-gated, idempotent and has no fake PDF page',async()=>{
  const p=webPlan(webFixture()),first=await executeRegistration(p),again=await executeRegistration(p);
  assert.equal(first.base_id,again.base_id);assert.equal(first.status,'draft');assert.equal(first.web_source_count,1);
  assert.equal((await db.query('select count(*)::int as n from public.library_reviewed_web_sources')).rows[0].n,1);
  const b=(await db.query('select * from public.tutor_base_explanations where id=$1',[first.base_id])).rows[0];
  assert.equal(b.prompt_version,'literature-editorial-web-v1');const c=b.citations.at(-1);
  assert.equal(c.kind,'reviewed-web');assert.equal(c.url,webUrl);assert(!Object.hasOwn(c,'pdf_page'));assert(!Object.hasOwn(c,'document_id'));
  assert.equal((await role('authenticated',ids.one,visible)).rows.length,0);
  await publish(b);await answered();assert.equal((await role('authenticated',ids.one,visible)).rows.length,1);
  assert.equal((await role('authenticated',ids.two,visible)).rows.length,0);
  assert.equal((await role('authenticated',ids.one,visible,true)).rows.length,0);
  const published=await executeRegistration(p);assert.equal(published.status,'published');
});

test('web raw text, reference column and approval RPC remain backend-only',async()=>{
  await executeRegistration(webPlan(webFixture()));
  for(const r of ['anon','authenticated'])await role(r,r==='authenticated'?ids.one:null,async()=>{
    await failure(()=>db.query('select * from public.library_reviewed_web_sources'),/permission denied/);
    await failure(()=>db.query('select web_sources from public.tutor_base_explanations'),/permission denied/);
    await failure(()=>db.query('select public.approve_reviewed_web_source($1,$2,$3,$4,true)',[ids.one,'a'.repeat(64),ids.one,'Unauthorized synthetic request']),/permission denied/);
  });
});

test('web changes reset approval and hide dependent published bases',async()=>{
  const r=await executeRegistration(webPlan(webFixture())),b=(await db.query('select * from public.tutor_base_explanations where id=$1',[r.base_id])).rows[0];
  await publish(b);await answered();
  await db.exec("update public.library_reviewed_web_sources set summary=summary||' changed'");
  assert.equal((await db.query('select status from public.library_reviewed_web_sources')).rows[0].status,'draft');
  assert.equal((await role('authenticated',ids.one,visible)).rows.length,0);
  assert.equal((await db.query('select count(*)::int as n from public.question_attempts')).rows[0].n,1);
});

test('web revocation hides a base and PDF-only legacy hashes remain unchanged',async()=>{
  const old=await base([source(await approve(await transcription()))]);await publish(old);
  const hash=old.payload_sha256;await db.query('update public.tutor_base_explanations set body=body where id=$1',[old.id]);
  assert.equal((await db.query('select payload_sha256 from public.tutor_base_explanations where id=$1',[old.id])).rows[0].payload_sha256,hash);
  await db.exec('delete from public.tutor_base_explanations; delete from public.library_reviewed_transcriptions');
  const r=await executeRegistration(webPlan(webFixture())),b=(await db.query('select * from public.tutor_base_explanations where id=$1',[r.base_id])).rows[0];
  await publish(b);await answered();await db.exec("update public.library_reviewed_web_sources set status='revoked'");
  assert.equal((await role('authenticated',ids.one,visible)).rows.length,0);
});

test('expired web evidence prevents approval and rolls back PDF registration',async()=>{
  const f=webFixture(),w=f.input.webEvidence[0];w.verifiedAt='2020-01-01T00:00:00Z';w.expiresAt='2020-01-02T00:00:00Z';
  f.input.approval.webEvidenceSha256=sha(JSON.stringify(f.input.webEvidence));
  await failure(()=>executeRegistration(webPlan(f)),/WEB_REVIEW_STALE/);
  assert.equal((await db.query('select count(*)::int as n from public.library_reviewed_transcriptions')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int as n from public.tutor_base_explanations')).rows[0].n,0);
});

test('unknown web URLs, fake PDF identities and unapproved changed snapshots fail before SQL',()=>{
  for(const patch of [{url:'javascript:alert(1)'},{url:webUrl+'?token=secret'},{url:'https://www.cun.es.evil.invalid/'},{pdfPage:1},{reviewed:false}]){
    const f=webFixture();Object.assign(f.input.webEvidence[0],patch);assert.throws(()=>webPlan(f),/WEB_EVIDENCE_INVALID/);
  }
  const f=webFixture();f.input.webEvidence[0].summary+=' modified';assert.throws(()=>webPlan(f),/WEB_APPROVAL_REQUIRED/);
});

test('malformed web references return false rather than throwing during RLS',async()=>{
  for(const value of [null,{},[],[null],[1],[{}],[{kind:'reviewed-web',web_source_id:'invalid'}]]){
    const r=await db.query('select egel_private.shared_base_web_sources_valid($1) as valid',[JSON.stringify(value)]);
    assert.equal(r.rows[0].valid,Array.isArray(value)&&value.length===0);
  }
});
test('operator registration links an active account, approves exact sources and only inserts a hidden draft',async()=>{
  const plan=registrationPlan(registrationFixture()),r=await executeRegistration(plan);assert.equal(plan.plan.publish,false);assert.equal(plan.plan.newModelCalls,0);
  assert.equal(r.status,'draft');assert.equal(r.prepared_by_reviewer_id,ids.reviewer);assert.equal(r.publication_reviewer_id,null);assert.equal(r.source_count,2);
  assert.equal((await db.query("select count(*)::int as n from public.library_reviewed_transcriptions where status='approved' and reviewer_id=$1",[ids.reviewer])).rows[0].n,2);
  await answered();assert.equal((await role('authenticated',ids.one,visible)).rows.length,0);
  assert.equal((await db.query('select evidence_enabled from public.library_documents where id=$1',[doc])).rows[0].evidence_enabled,false);
});
test('operator registration is repeatable without duplicates or approval replacement',async()=>{
  const plan=registrationPlan(registrationFixture()),first=await executeRegistration(plan),second=await executeRegistration(plan);assert.equal(first.base_id,second.base_id);
  assert.equal(first.payload_sha256,second.payload_sha256);assert.equal((await db.query('select count(*)::int as n from public.tutor_base_explanations')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from public.library_reviewed_transcriptions')).rows[0].n,2);
});
test('unknown or inactive reviewer cannot cause any content writes',async()=>{
  const f=registrationFixture(),unknown=buildEditorialDraftRegistration(f.preparation,f.sourceReview,'missing@example.invalid');
  await failure(()=>executeRegistration(unknown),/query returned no rows/);
  await db.query('update auth.users set email_confirmed_at=null where id=$1',[ids.reviewer]);
  await failure(()=>executeRegistration(registrationPlan(f)),/query returned no rows/);
  await db.query("update auth.users set email_confirmed_at=now(),banned_until=now()+interval '1 day' where id=$1",[ids.reviewer]);
  await failure(()=>executeRegistration(registrationPlan(f)),/query returned no rows/);
  assert.equal((await db.query('select count(*)::int as n from public.library_reviewed_transcriptions')).rows[0].n,0);
});
test('changed question refuses registration before source or explanation writes',async()=>{
  const plan=registrationPlan(registrationFixture());await db.query("update public.questions set stem='Changed after local preparation' where id='EGEL-2026-034'");
  await failure(()=>executeRegistration(plan),/REGISTRATION_QUESTION_CHANGED/);
  assert.equal((await db.query('select count(*)::int as n from public.library_reviewed_transcriptions')).rows[0].n,0);
});
test('late source conflict rolls back earlier approvals and does not bypass revocation',async()=>{
  const t=await transcription(68);await db.query("update public.library_reviewed_transcriptions set status='revoked' where id=$1",[t.id]);
  await failure(()=>executeRegistration(registrationPlan(registrationFixture())),/REGISTRATION_SOURCE_REVOKED/);
  assert.equal((await db.query('select count(*)::int as n from public.library_reviewed_transcriptions')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from public.tutor_base_explanations')).rows[0].n,0);
});
test('an edited existing draft is never silently overwritten by a repeated registration',async()=>{
  const plan=registrationPlan(registrationFixture()),r=await executeRegistration(plan);
  await db.query('update public.tutor_base_explanations set body=body||$1 where id=$2',[' Changed by another editor.',r.base_id]);
  await failure(()=>executeRegistration(plan),/REGISTRATION_BASE_CONFLICT/);
  assert.match((await db.query('select body from public.tutor_base_explanations where id=$1',[r.base_id])).rows[0].body,/Changed by another editor/);
});
test('SQL-looking text and math dollar delimiters remain literal data',async()=>{
  const f=registrationFixture();f.preparation.editorial.markdown+=" Literal fixture: '); drop table public.questions; -- $$ $do$";
  f.preparation.editorial.sha256=sha(f.preparation.editorial.markdown);f.preparation.approval.bodySha256=f.preparation.editorial.sha256;
  const r=await executeRegistration(registrationPlan(f));assert.equal(r.status,'draft');
  assert.equal((await db.query('select body from public.tutor_base_explanations where id=$1',[r.base_id])).rows[0].body,f.preparation.editorial.markdown);
  assert.equal((await db.query('select count(*)::int as n from public.questions')).rows[0].n,2);
});
test('source approval mismatch and invalid email never create an executable registration plan',()=>{
  const f=registrationFixture();f.sourceReview.edits[0].newTextSha256='9'.repeat(64);
  assert.throws(()=>registrationPlan(f),/REGISTRATION_SOURCE_APPROVAL_MISMATCH/);
  const g=registrationFixture();assert.throws(()=>buildEditorialDraftRegistration(g.preparation,g.sourceReview,'not-an-email'),/REGISTRATION_INVALID_EMAIL/);
  g.sourceReview.humanSourceReview=false;assert.throws(()=>registrationPlan(g),/REGISTRATION_SOURCE_APPROVAL_REQUIRED/);
});

function multiBookFixture(){
  const f=registrationFixture();f.preparation.question.id='EGEL-2026-035';
  f.preparation.approval.questionSha256=editorialQuestionHash(f.preparation.question);
  f.preparation.evidence[1].documentId=legacyDoc;
  f.preparation.approval.evidenceSha256=sha(JSON.stringify(f.preparation.evidence));
  f.sourceReview.questionId='EGEL-2026-035';delete f.sourceReview.sourcePdfSha256;
  f.sourceReview.sourcePdfSha256s=[doc,legacyDoc];f.sourceReview.edits[1].documentId=legacyDoc;
  return f;
}

test('two-book registration remains exact, idempotent and answer-gated for its own question',async()=>{
  const plan=registrationPlan(multiBookFixture()),first=await executeRegistration(plan),again=await executeRegistration(plan);
  assert.equal(first.base_id,again.base_id);assert.equal(first.status,'draft');assert.equal(first.source_count,2);
  const rows=(await db.query('select distinct document_id from public.library_reviewed_transcriptions order by document_id')).rows;
  assert.deepEqual(rows.map(r=>r.document_id),[doc,legacyDoc]);
  const b=(await db.query('select * from public.tutor_base_explanations where id=$1',[first.base_id])).rows[0];
  await publish(b);await answered(ids.one,'EGEL-2026-034');
  assert.equal((await role('authenticated',ids.one,visible)).rows.length,0);
  await answered(ids.one,'EGEL-2026-035');assert.equal((await role('authenticated',ids.one,visible)).rows.length,1);
  assert.equal((await role('authenticated',ids.two,visible)).rows.length,0);
  await db.query("update public.library_reviewed_transcriptions set status='revoked' where document_id=$1",[legacyDoc]);
  assert.equal((await role('authenticated',ids.one,visible)).rows.length,0);
});

test('multi-book approval refuses missing, extra, duplicate, malformed and ambiguous fingerprints',()=>{
  for(const value of [null,{},[],[doc],[legacyDoc],[doc,legacyDoc,doc],[doc,legacyDoc,'f'.repeat(64)],[doc,'invalid']]){
    const f=multiBookFixture();f.sourceReview.sourcePdfSha256s=value;
    assert.throws(()=>registrationPlan(f),/REGISTRATION_SOURCE_APPROVAL_MISMATCH/);
  }
  const f=multiBookFixture();f.sourceReview.sourcePdfSha256=doc;
  assert.throws(()=>registrationPlan(f),/REGISTRATION_SOURCE_APPROVAL_MISMATCH/);
});

test('multi-book approval cannot reuse the right text hash under another document',()=>{
  const f=multiBookFixture();f.sourceReview.edits[1].documentId=doc;
  assert.throws(()=>registrationPlan(f),/REGISTRATION_SOURCE_APPROVAL_MISMATCH/);
});

test('a later conflict in another approved book rolls back the whole registration',async()=>{
  await db.query("update public.library_documents set upload_state='pending',evidence_enabled=false where id=$1",[legacyDoc]);
  await failure(()=>executeRegistration(registrationPlan(multiBookFixture())),/REGISTRATION_SOURCE_CHANGED/);
  assert.equal((await db.query('select count(*)::int as n from public.library_reviewed_transcriptions')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int as n from public.tutor_base_explanations')).rows[0].n,0);
});
