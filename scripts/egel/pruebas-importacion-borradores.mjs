import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildDraftImport,parseDraftPages,hashBytes} from './lib/draft-import.mjs';
import {loadDraftImport,writeDraftImport} from './lib/draft-import-storage.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const body='Offline synthetic explanation, not medical guidance. '.repeat(3)+'[R1]';
function fixture(number='001'){
 const bank=[{id:'EGEL-2026-'+number,version:1,stem:'Synthetic case. Never patient data.',options:['A','B','C'].map(letter=>({letter,text:'Synthetic '+letter}))}];
 const q={numero_reactivo:number,question_id:null,question_version:null,enunciado_original:bank[0].stem,
   opciones_originales:bank[0].options.map(o=>({letra:o.letter,texto:o.text})),tema:'Synthetic',respuesta_propuesta:'A',estado_evidencia:'parcial',
   explicacion_markdown:body,referencias:[{id:'R1',archivo_consultado:'synthetic.pdf',autor_o_institucion:'Synthetic author',titulo:'Synthetic source',edicion:null,
     anio:2020,pagina_pdf:'1, 3–4',pagina_impresa:'S1–S3',doi_o_url:null,estado:'consultada',afirmaciones_respaldadas:[]}],
   discrepancias:[],pendientes_revision:['Synthetic human check required'],estado_validacion:'pendiente_validacion'};
 const doc={formato:'egel_borradores_explicaciones',version:'1.0',estado_global:'pendiente_validacion',modo:'literatura',reactivos:[q],auditoria:{reactivos_entregados:[number]}};
 return {bank,doc,q,name:`egel_bloque_${number}-${number}_pendiente_validacion.json`};
}
const args=f=>({bankBytes:Buffer.from(JSON.stringify(f.bank)),files:[{name:f.name,bytes:Buffer.from(JSON.stringify(f.doc))}]});
const build=f=>buildDraftImport(args(f));

test('draft import binds only against exact NFC/whitespace-normalized case and options',()=>{
 const f=fixture();f.q.enunciado_original='  Synthetic   case.\nNever patient data. ';
 const r=build(f),entry=r.entries[0];assert.equal(entry.binding.questionId,f.bank[0].id);assert.equal(entry.binding.questionVersion,1);
 assert.equal(entry.validation.state,'pendiente_validacion');assert.equal(entry.validation.humanApproved,false);assert.equal(entry.validation.publicationAllowed,false);
 assert.equal(entry.source.modelVerified,null);assert.equal(entry.mode,'literatura');assert.equal(entry.queue,'pending_review');
});
test('case wording, punctuation, units, options and supplied version mismatches block binding',()=>{
 for(const mutate of [f=>{f.q.enunciado_original+=' Added header';},f=>{f.q.enunciado_original=f.q.enunciado_original.replace('.','!');},
   f=>{f.q.opciones_originales[1].texto+=' changed';},f=>{f.q.question_id='EGEL-2026-002';},f=>{f.q.question_version=2;}]){
   const f=fixture();mutate(f);const r=build(f).entries[0];assert.equal(r.binding.status,'reconciliation_required');assert.equal(r.binding.questionId,null);assert.equal(r.queue,'blocked_pending_review');
 }
});
test('an absent bank question is preserved but never bound by number alone',()=>{
 const f=fixture();f.bank[0].id='EGEL-2026-002';const e=build(f).entries[0];assert.equal(e.binding.questionId,null);assert(e.validation.blocks.includes('QUESTION_NOT_IN_SNAPSHOT'));
});
test('034–036 protection cannot be disabled by an empty supplied protection list',()=>{
 for(const number of ['034','035','036']){const f=fixture(number),r=buildDraftImport({...args(f),protectedIds:[]});assert.equal(r.entries[0].queue,'protected_existing_base');assert.equal(r.summary.eligibleForPublication,0);}
});
test('complete abstentions are retained, not mistaken for missing explanations',()=>{
 const f=fixture();f.q.respuesta_propuesta=null;f.q.estado_evidencia='insuficiente';const r=build(f);
 assert.equal(r.summary.counts.records,1);assert.equal(r.summary.counts.abstentions,1);assert.equal(r.entries[0].queue,'pending_review');assert.equal(r.entries[0].original.respuesta_propuesta,null);
});
test('insufficient evidence with a letter is blocked without changing the original',()=>{
 const f=fixture();f.q.estado_evidencia='insuficiente';const r=build(f);assert.equal(r.entries[0].proposedAnswer,'A');assert(r.entries[0].validation.blocks.includes('INSUFFICIENT_WITH_PROPOSED_ANSWER'));
});
test('page normalization preserves raw ranges, arrays and printed labels without claiming verification',()=>{
 for(const [input,expected]of [[2,[2]],['2',[2]],['20, 22–23',[20,22,23]],[[4,2,2],[2,4]]])assert.deepEqual(parseDraftPages(input).pages,expected);
 const e=build(fixture()).entries[0];assert.deepEqual(e.references[0].pdfLocator.raw,'1, 3–4');assert.equal(e.references[0].printedLocatorRaw,'S1–S3');assert.equal(e.references[0].verification.eligibleForPublication,false);
 for(const value of [-1,'2-1','1-9999999','1;2',[],['1'],{},'1'.repeat(2001)])assert.equal(parseDraftPages(value).state,'unsupported');
});
test('reference labels and exporter claims never become source approval',()=>{
 const f=fixture();f.q.referencias[0].estado='mencionada';f.q.referencias[0].titulo=null;const e=build(f).entries[0];
 assert(e.validation.warnings.includes('REFERENCE_MENTIONED_NOT_VERIFIED'));assert(e.validation.blocks.includes('REFERENCE_TITLE_MISSING'));assert.equal(e.references[0].verification.assertionsVerified,false);
});
test('unknown inline references and active markup are blocked and kept only as private original data',()=>{
 const f=fixture();f.q.explicacion_markdown+=' [R9] <script>untrusted data</script>';const e=build(f).entries[0];
 assert(e.validation.blocks.includes('UNKNOWN_INLINE_REFERENCE'));assert(e.validation.blocks.includes('UNSAFE_RENDERING_CONTENT'));assert(e.original.explicacion_markdown.includes('<script>'));
});
test('URLs are never fetched; credential-bearing or unsafe destinations stay blocked',()=>{
 for(const url of ['javascript:alert(1)','https://name:pass@example.invalid/','http://127.0.0.1/private']){
   const f=fixture();f.q.referencias[0].doi_o_url=url;const e=build(f).entries[0];assert(e.validation.blocks.includes('UNSAFE_REFERENCE_DESTINATION'));assert.equal(e.references[0].destination.verified,false);
 }
});
test('unknown fields, student identities and fake validation states fail closed',()=>{
 for(const mutate of [f=>{f.q.user_id='other';},f=>{f.q.estado_validacion='approved';},f=>{f.doc.modo='segunda_opinion';},f=>{f.doc.estado_global='published';},f=>{f.bank[0].personal_verdict='B';}]){
   const f=fixture();mutate(f);assert.throws(()=>build(f),/DRAFT_/);
 }
});
test('duplicate questions, duplicate references and bogus range declarations reject the batch',()=>{
 const f=fixture();assert.throws(()=>buildDraftImport({...args(f),files:[...args(f).files,...args(f).files]}),/DRAFT_INVALID_FILE/);
 const g=fixture();g.q.referencias.push(structuredClone(g.q.referencias[0]));assert.throws(()=>build(g),/DRAFT_DUPLICATE_REFERENCE/);
 const h=fixture();h.doc.auditoria.reactivos_entregados=['002'];assert.throws(()=>build(h),/DRAFT_DELIVERY_DECLARATION/);
});
test('deterministic fingerprints preserve source bytes and do not depend on hidden clocks',()=>{
 const f=fixture(),before=structuredClone(f),a=build(f),b=build(f);assert.deepEqual(f,before);assert.equal(a.batchId,b.batchId);assert.deepEqual(a.entries,b.entries);
 f.q.explicacion_markdown+=' changed';assert.notEqual(build(f).batchId,a.batchId);
});

async function diskFixture(action){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'egel-draft-test-'));
 try{
   const f=fixture(),inputs=path.join(directory,'inputs'),output=path.join(directory,'output');await fs.mkdir(inputs);await fs.mkdir(output);
   const file=path.join(inputs,f.name),bank=path.join(inputs,'bank.json');await fs.writeFile(file,JSON.stringify(f.doc));await fs.writeFile(bank,JSON.stringify(f.bank));
   const manifest={schema:'egel-draft-import-manifest-v1',bankSnapshot:{path:bank,sha256:hashBytes(await fs.readFile(bank))},
     files:[{path:file,sha256:hashBytes(await fs.readFile(file))}],protectedQuestionIds:[]};
   const manifestPath=path.join(inputs,'manifest.json');await fs.writeFile(manifestPath,JSON.stringify(manifest));
   await action({directory,inputs,output,file,bank,manifest,manifestPath});
 }finally{
   const temporaryRoot=await fs.realpath(os.tmpdir()),resolved=await fs.realpath(directory);
   assert.equal(path.dirname(resolved),temporaryRoot);assert(path.basename(resolved).startsWith('egel-draft-test-'));
   await fs.rm(resolved,{recursive:true,force:true});
 }
}
test('help and plan neither load env, write a batch nor connect to a service',async()=>{
 const cli='scripts/egel/importar-borradores.mjs';assert.equal(spawnSync(process.execPath,[cli,'--help'],{cwd:root,encoding:'utf8'}).status,0);
 await diskFixture(async d=>{
   const r=spawnSync(process.execPath,[cli,'--manifest='+d.manifestPath,'--plan'],{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
   assert.equal(JSON.parse(r.stdout).filesystemWrites,0);assert.deepEqual(await fs.readdir(d.output),[]);
 });
});
test('execute archives exact originals and repeated import reuses the existing batch',async()=>diskFixture(async d=>{
 const input=await loadDraftImport(d.manifestPath),a=await writeDraftImport(input,d.output),b=await writeDraftImport(input,d.output);
 assert.equal(a.reused,false);assert.equal(b.reused,true);assert.equal(a.destination,b.destination);
 assert.equal(await fs.readFile(path.join(a.destination,'originales','001-'+path.basename(d.file)),'utf8'),await fs.readFile(d.file,'utf8'));
 assert.equal(JSON.parse(await fs.readFile(path.join(a.destination,'complete.json'),'utf8')).publicationAllowed,false);
}));
test('tampered output and incomplete prior runs are never repaired or overwritten',async()=>diskFixture(async d=>{
 const input=await loadDraftImport(d.manifestPath),a=await writeDraftImport(input,d.output),target=path.join(a.destination,'summary.json');
 await fs.writeFile(target,'FOREIGN CONTENT');await assert.rejects(()=>writeDraftImport(input,d.output),/DRAFT_EXISTING_BATCH_DIFFERS/);
 assert.equal(await fs.readFile(target,'utf8'),'FOREIGN CONTENT');
 await fs.unlink(path.join(a.destination,'complete.json'));await assert.rejects(()=>writeDraftImport(input,d.output),/DRAFT_EXISTING_BATCH_DIFFERS/);
}));
test('modified input hashes fail before any import and original files remain untouched',async()=>diskFixture(async d=>{
 await fs.appendFile(d.file,' ');const bytes=await fs.readFile(d.file);await assert.rejects(()=>loadDraftImport(d.manifestPath),/DRAFT_SOURCE_CHANGED/);
 assert.deepEqual(await fs.readFile(d.file),bytes);assert.deepEqual(await fs.readdir(d.output),[]);
}));
test('repository and source destinations cannot receive private batches',async()=>diskFixture(async d=>{
 const input=await loadDraftImport(d.manifestPath);
 for(const dest of [root,d.inputs,d.directory])await assert.rejects(()=>writeDraftImport(input,dest),/DRAFT_PRIVATE_OUTPUT_REQUIRED/);
}));
test('local modules have no provider, environment, network or publication implementation',async()=>{
 for(const file of ['scripts/egel/importar-borradores.mjs','scripts/egel/lib/draft-import.mjs','scripts/egel/lib/draft-import-storage.mjs']){
   const code=await fs.readFile(path.join(root,file),'utf8');for(const forbidden of ['fetch(','process.env','@ai-sdk','createClient(','publish_reviewed_tutor_base','execute_sql'])assert(!code.includes(forbidden));
 }
});
