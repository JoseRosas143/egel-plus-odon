import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {reviewPlan,hashText,candidatePacket,canonicalQuestion,rankCandidate,estimateOpenAIReceipt} from './lib/pilot-candidates.mjs';
import {loadDeepSeekPilot,repository} from './lib/load-deepseek-pilot.mjs';
const q={id:'EGEL-2026-027',version:1,stem:'Offline question',options:['A','B','C'].map(letter=>({letter,text:'Option '+letter})),user_id:'MUST NOT COPY',selected_answer:'B',notes:'PRIVATE'};
const text='Offline synthetic anafilaxia example for structural tests; not clinical guidance. '.repeat(5);
const s={documentId:'a'.repeat(64),catalogId:'BIB-021',title:'Offline source',pdfPage:300,ordinal:1,text,textSha256:hashText(text),method:'native',localPdf:'C:/offline.pdf'};
test('ten consecutive questions include 034 without a proposed key',()=>{assert.equal(reviewPlan.length,10);assert.deepEqual(reviewPlan.map(p=>p.number),Array.from({length:10},(_,i)=>i+27));assert(reviewPlan.every(p=>!Object.hasOwn(p,'answer')));});
test('question allowlist drops identities, answers and notes',()=>{const clean=canonicalQuestion(q);assert.deepEqual(Object.keys(clean),['id','version','stem','options']);assert(!JSON.stringify(clean).includes('PRIVATE'));assert(!JSON.stringify(clean).includes('selected_answer'));});
test('candidate construction never approves sources or generates a response',async()=>{const {packet,review}=candidatePacket(q,[s],reviewPlan[0]);assert.equal(packet.evidence[0].reviewed,false);assert.equal(review.humanSourceReview,false);assert.equal(review.answerGenerated,false);assert.equal(review.sourceSharingApproved,false);const {adapter}=await loadDeepSeekPilot();assert.throws(()=>adapter.prepareDeepSeek(packet),/PILOT_EVIDENCE_NOT_READY/);});
test('empty evidence remains missing, never invented',()=>{const {packet,review}=candidatePacket(q,[],reviewPlan[0]);assert.deepEqual(packet.evidence,[]);assert.equal(review.status,'missing_evidence');});
test('wrong book, bad hash, low confidence and contents pages are excluded',()=>{for(const change of [{catalogId:'GUIDE'},{textSha256:'invalid'},{pdfPage:1},{method:'ocr',confidence:40},{text:'Índice de contenidos anafilaxia '.repeat(10)}])assert.equal(rankCandidate(reviewPlan[0],{...s,...change}),0);});
test('same PDF page is not repeated to inflate evidence count',()=>{const r=candidatePacket(q,[s,{...s,ordinal:2}],reviewPlan[0]);assert.equal(r.packet.evidence.length,1);});
test('lexical candidates exclude book indexes and unrelated page ranges',()=>{
  const text='nasopalatino palatino mayor incisivo bloqueo '.repeat(10),candidate={...s,catalogId:'BIB-002',text,textSha256:hashText(text)};
  assert.equal(rankCandidate(reviewPlan[1],{...candidate,pdfPage:333}),0);assert.equal(rankCandidate(reviewPlan[1],{...candidate,pdfPage:100}),0);
  assert(rankCandidate(reviewPlan[1],{...candidate,pdfPage:204})>0);
});
test('missing mandatory table page is flagged, never silently substituted',()=>{
  const plan={...reviewPlan[0],requiredPages:{'BIB-021':[250]}};
  const r=candidatePacket(q,[s],plan);assert.equal(r.review.status,'missing_evidence');assert.deepEqual(r.review.missingRequired,[{book:'BIB-021',page:250}]);
});
test('OpenAI pricing equivalent accounts for cache writes, not a verified bill',()=>{const r=estimateOpenAIReceipt({model:'gpt-6.1-sol',status:'completed',service_tier:'default',tools:[],billing:{payer:'openai'},usage:{input_tokens:5709,output_tokens:1037,total_tokens:6746,input_tokens_details:{cache_write_tokens:5706,cached_tokens:0}}});assert.equal(r.listPriceEquivalentMicroUsd,24641);assert.equal(r.billedAmountConfirmed,false);assert.equal(r.payer,'openai');});
test('unsupported rate tiers and impossible usage do not become zero cost',()=>{for(const response of [{model:'other'},{model:'gpt-6.1-sol',status:'completed',service_tier:'fast',tools:[]},{model:'gpt-6.1-sol',status:'completed',service_tier:'default',tools:[],usage:{input_tokens:2,output_tokens:1,total_tokens:3,input_tokens_details:{cache_write_tokens:4}}}])assert.throws(()=>estimateOpenAIReceipt(response),/COST_/);});
test('preparation command is repeatable and refuses to replace foreign output',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'egel-candidates-test-')),index=path.join(dir,'index'),output=path.join(dir,'output'),docDir=path.join(index,s.documentId);
  await fs.mkdir(docDir,{recursive:true});
  const manifest=path.join(dir,'manifest.json'),questions=path.join(dir,'questions.json'),chunks=path.join(docDir,'chunks.jsonl');
  await fs.writeFile(manifest,JSON.stringify({documents:[{id:s.documentId,catalog_id:s.catalogId,title:s.title,local_file:s.localPdf,source_kind:'literature',visibility:'common',owner_id:null,page_count:500}]}));
  await fs.writeFile(questions,JSON.stringify(reviewPlan.map(p=>({...q,id:'EGEL-2026-'+String(p.number).padStart(3,'0')}))));
  await fs.writeFile(chunks,JSON.stringify({pdf_page:s.pdfPage,ordinal:s.ordinal,body:s.text,body_sha256:s.textSha256})+'\n');
  const args=['scripts/egel/preparar-piloto-deepseek.mjs','--manifest',manifest,'--index-root',index,'--questions',questions,'--output',output];
  const run=()=>spawnSync(process.execPath,args,{cwd:repository,encoding:'utf8'});
  try {
    const first=run();assert.equal(first.status,0,first.stderr);const file=path.join(output,'EGEL-2026-027.candidate.json'),before=await fs.readFile(file,'utf8');
    assert.equal(run().status,0);assert.equal(await fs.readFile(file,'utf8'),before);
    await fs.writeFile(file,'FOREIGN CONTENT');const refused=run();assert.equal(refused.status,1);assert.match(refused.stderr,/CANDIDATE_EXISTING_FILE_DIFFERS/);assert.equal(await fs.readFile(file,'utf8'),'FOREIGN CONTENT');
  } finally {
    // Only exact files/directories created by this test; never recursive removal.
    const files=await fs.readdir(output).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
    for(const name of files)await fs.unlink(path.join(output,name));await fs.rmdir(output).catch(e=>{if(e.code!=='ENOENT')throw e;});
    for(const file of [manifest,questions,chunks])await fs.unlink(file);await fs.rmdir(docDir);await fs.rmdir(index);await fs.rmdir(dir);
  }
});
