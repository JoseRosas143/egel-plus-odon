import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {hashText} from './lib/pilot-candidates.mjs';
import {prepareEditorialBase,editorialQuestionHash} from './lib/editorial-base.mjs';
const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const q={id:'EGEL-2026-034',version:1,stem:'Synthetic fixture; no clinical content.',options:['A','B','C'].map(letter=>({letter,text:'Synthetic '+letter}))};
function fixture(){
  const markdown='Offline editorial fixture, not medical guidance. '.repeat(4)+'[S1]',source='Synthetic transcription, not clinical evidence.';
  const evidence=[{documentId:'a'.repeat(64),title:'Offline synthetic source',pdfPage:64,ordinal:0,text:source,textSha256:hashText(source),reviewed:true}];
  const provenance={provider:'deepseek',model:'deepseek-flash',promptVersion:'literature-draft-v2',runFingerprint:'b'.repeat(64),draftMarkdownSha256:'c'.repeat(64)};
  return {question:structuredClone(q),editorial:{markdown,sha256:hashText(markdown)},provenance,evidence,
    approval:{humanApproved:true,scope:'prepare-shared-explanation-only',approvedAt:'2026-10-18T23:00:00Z',bodySha256:hashText(markdown),
      questionSha256:editorialQuestionHash(q),evidenceSha256:hashText(JSON.stringify(evidence)),provenanceSha256:hashText(JSON.stringify(provenance)),recordedVia:'direct-user-chat'}};
}
test('editorial approval is stable but never equivalent to publication or a model-only row',()=>{
  const f=fixture(),before=structuredClone(f),r=prepareEditorialBase(f);assert.deepEqual(f,before);
  assert.equal(r.preparationSha256,prepareEditorialBase(structuredClone(f)).preparationSha256);
  assert.equal(r.provenance.provider,'deepseek');assert.equal(r.provenance.editorialRevision,true);
  assert.equal(r.sources[0].kind,'reviewed-transcription');assert.equal(r.sources[0].localOrdinal,0);
  assert.equal(r.cloudCompatible,false);assert.equal(r.automaticPublication,false);assert.equal(r.clinicalValidation,false);
  assert.equal(r.publicationState,'local-only-not-published');assert.equal(r.model,undefined);assert.equal(r.status,undefined);
});
test('missing, revoked or publication-scoped approval is rejected',()=>{
  for(const patch of [{humanApproved:false},{scope:'publish'},{recordedVia:'model'},{approvedAt:'invalid'}]){
    const f=fixture();Object.assign(f.approval,patch);assert.throws(()=>prepareEditorialBase(f),/EDITORIAL_APPROVAL_REQUIRED/);
  }
});
test('body changes require renewed exact approval even if their local hash is recomputed',()=>{
  const f=fixture();f.editorial.markdown+=' changed';assert.throws(()=>prepareEditorialBase(f),/EDITORIAL_BODY_CHANGED/);
  f.editorial.sha256=hashText(f.editorial.markdown);assert.throws(()=>prepareEditorialBase(f),/EDITORIAL_APPROVAL_REQUIRED/);
});
test('question changes and injected student fields cannot reuse approval',()=>{
  const f=fixture();f.question.stem+=' changed';assert.throws(()=>prepareEditorialBase(f),/EDITORIAL_APPROVAL_REQUIRED/);
  const g=fixture();g.question.personal_verdict='C';assert.throws(()=>prepareEditorialBase(g),/EDITORIAL_INVALID_QUESTION/);
  assert.throws(()=>prepareEditorialBase({...fixture(),user_id:'PRIVATE'}),/EDITORIAL_INVALID_INPUT/);
});
test('transcription or provenance changes invalidate approval',()=>{
  const f=fixture();f.evidence[0].pdfPage=65;assert.throws(()=>prepareEditorialBase(f),/EDITORIAL_EVIDENCE_CHANGED/);
  const g=fixture();g.provenance.runFingerprint='d'.repeat(64);assert.throws(()=>prepareEditorialBase(g),/EDITORIAL_PROVENANCE_INVALID/);
  const h=fixture();h.provenance.model='gemini-3.8-flash';h.approval.provenanceSha256=hashText(JSON.stringify(h.provenance));assert.throws(()=>prepareEditorialBase(h),/EDITORIAL_PROVENANCE_INVALID/);
});
test('unknown citation IDs and unreviewed evidence fail closed',()=>{
  const f=fixture();f.editorial.markdown+=' [S6]';f.editorial.sha256=hashText(f.editorial.markdown);f.approval.bodySha256=f.editorial.sha256;
  assert.throws(()=>prepareEditorialBase(f),/EDITORIAL_CITATION_INVALID/);
  const g=fixture();g.evidence[0].reviewed=false;g.approval.evidenceSha256=hashText(JSON.stringify(g.evidence));assert.throws(()=>prepareEditorialBase(g),/EDITORIAL_EVIDENCE_INVALID/);
});
test('CLI help cannot initialize a budget or call a model',()=>{
  const r=spawnSync(process.execPath,['scripts/egel/preparar-base-editorial.mjs','--help'],{cwd:repository,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Sin IA ni publicación/);
});
test('CLI output is repeatable and refuses to overwrite a different file',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'egel-editorial-test-')),input=path.join(dir,'input.json'),output=path.join(dir,'output.json');
  try {
    await fs.writeFile(input,JSON.stringify(fixture()));
    const run=()=>spawnSync(process.execPath,['scripts/egel/preparar-base-editorial.mjs','--input='+input,'--output='+output],{cwd:repository,encoding:'utf8'});
    const first=run();assert.equal(first.status,0,first.stderr);assert.equal(JSON.parse(first.stdout).newModelCalls,0);
    const before=await fs.readFile(output,'utf8');assert.equal(run().status,0);assert.equal(await fs.readFile(output,'utf8'),before);
    await fs.writeFile(output,'FOREIGN CONTENT');const refused=run();assert.equal(refused.status,1);assert.match(refused.stderr,/EDITORIAL_EXISTING_FILE_DIFFERS/);
    assert.equal(await fs.readFile(output,'utf8'),'FOREIGN CONTENT');
  } finally {for(const file of [input,output])await fs.unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e;});await fs.rmdir(dir);}
});
