// Synthetic offline fixtures only. Actual clinical data is never bundled here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {buildDraftImport,hashBytes} from './lib/draft-import.mjs';
import {buildImportedEditorialPreparations,importedEditorialPreview} from './lib/imported-editorial.mjs';
import {loadImportedEditorial,writeImportedEditorial} from './lib/imported-editorial-storage.mjs';

const repository=path.resolve(import.meta.dirname,'../..');
const objectHash=v=>hashBytes(JSON.stringify(v));
const json=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const numbers=['001','003','006'];
const body='Offline synthetic editorial explanation. Not patient data or medical guidance. '.repeat(3)+'[R2]\n\nProcedencia sintética [R1]';
function fixture(markdown=body){
 const bank=numbers.map(n=>({id:'EGEL-2026-'+n,version:1,stem:'Synthetic case '+n,options:['A','B','C'].map(letter=>({letter,text:'Synthetic '+letter}))}));
 const docs=bank.map((q,i)=>{
   const number=numbers[i],ref=id=>({id,archivo_consultado:null,autor_o_institucion:'Synthetic',titulo:'Synthetic '+id,edicion:null,
     anio:null,pagina_pdf:id==='R1'?1:null,pagina_impresa:null,doi_o_url:id==='R1'?null:'https://example.org/synthetic',estado:'consultada',afirmaciones_respaldadas:[]});
   return {formato:'egel_borradores_explicaciones',version:'1.0',estado_global:'pendiente_validacion',modo:'literatura',
     reactivos:[{numero_reactivo:number,question_id:null,question_version:null,enunciado_original:q.stem,
       opciones_originales:q.options.map(o=>({letra:o.letter,texto:o.text})),tema:'Synthetic',respuesta_propuesta:'A',estado_evidencia:'suficiente_para_propuesta',
       explicacion_markdown:markdown,referencias:[ref('R1'),ref('R2')],discrepancias:[],pendientes_revision:['Synthetic review pending'],estado_validacion:'pendiente_validacion'}],
     auditoria:{reactivos_entregados:[number]}};
 });
 const bankBytes=json(bank),files=docs.map((doc,i)=>({name:`egel_bloque_${numbers[i]}-${numbers[i]}_pendiente_validacion.json`,bytes:json(doc)}));
 const batch=buildDraftImport({bankBytes,files});
 const records=batch.entries.map(e=>({number:e.number,questionId:e.binding.questionId,questionVersion:e.binding.questionVersion,
   questionSha256:objectHash(e.binding.canonicalQuestion),recordSha256:objectHash(e.original),bodySha256:hashBytes(e.original.explicacion_markdown),
   referencesSha256:objectHash(e.original.referencias),original:structuredClone(e.original),recommendation:'candidate_for_human_content_review',
   provenance:{kind:'user_supplied_chat_export',providerVerified:null,modelVerified:null,runFingerprint:null},
   decision:{humanApproved:false,clinicalExpertApproved:false,publicationAllowed:false},
   independentlyCheckedReferenceIds:['R2'],sourceChecks:[{number:e.number,ref:'R2',url:'https://example.org/synthetic',scope:'Synthetic limited source check, not clinical validation.',read:'synthetic-section'}]}));
 const bindings=records.map(({number,questionId,questionVersion,questionSha256,recordSha256,bodySha256,referencesSha256})=>({number,questionId,questionVersion,questionSha256,recordSha256,bodySha256,referencesSha256}));
 const packet={schema:'egel-private-human-review-request-v1',sourceBatchId:batch.batchId,bankSnapshotSha256:hashBytes(bankBytes),
   records,requestedReview:{numbers:[...numbers],bindings},publicationAllowed:false};
 const decision={schema:'egel-private-user-study-key-review-v1',scope:'private_editorial_study_key_001_010_no_publication',sourceBatchId:batch.batchId,
   sourcePacketSha256:null,publicationAllowed:false,clinicalExpertValidation:false,
   effectiveUserStudyKey:{'001':'B'},userMessage:'DO NOT COPY THIS PRIVATE STUDY DECISION',
   preparationApproval:{scope:'continue_preparing_the_existing_explanations_with_their_limits',newExplanationsNotApprovedInAdvance:true,numbers:[...numbers]}};
 const input={batch,packet,decision,bindings:null,numbers:[...numbers]};refresh(input);
 return {input,bankBytes,files};
}
function refresh(input){const {packetSha256:ignored,...payload}=input.packet;void ignored;input.packet.packetSha256=objectHash(payload);
 input.decision.sourcePacketSha256=input.packet.packetSha256;input.bindings={packetSha256:input.packet.packetSha256,decisionSha256:objectHash(input.decision)};}
const build=f=>buildImportedEditorialPreparations(f.input);

test('three scoped existing texts prepare deterministically without approval or mutation',()=>{
 const f=fixture(),before=JSON.stringify(f.input),out=build(f);
 assert.equal(JSON.stringify(f.input),before);assert.deepEqual(out,build(f));assert.deepEqual(out.numbers,numbers);
 for(const r of out.records){assert.equal(r.editorial.markdown,body);assert.equal(r.contentApproval,'existing-text-preparation-only');assert.equal(r.publicationAllowed,false);assert.equal(r.cloudCompatible,false);}
});
test('personal key, raw decision and model provenance do not enter common content',()=>{
 const out=build(fixture()),text=JSON.stringify(out);assert(!text.includes('DO NOT COPY'));assert(!text.includes('effectiveUserStudyKey'));assert(!text.includes('userMessage'));
 for(const r of out.records){assert.equal(r.provenance.modelVerified,null);assert.equal(r.provenance.runFingerprint,null);assert.equal(r.provenance.providerVerified,null);}
});
test('only first three approved preparation candidates, never protected or unresolved questions',()=>{
 for(const list of [[],['002'],['034'],['001','001'],['001','003','006','007']]){const f=fixture();f.input.numbers=list;assert.throws(()=>build(f),/IMPORTED_PILOT_SCOPE/);}
 const f=fixture();f.input.numbers=['006','001'];assert.deepEqual(build(f).numbers,['001','006']);
});
test('modified packet and decision fail integrity checks',()=>{
 for(const modify of [f=>{f.input.packet.records[0].original.explicacion_markdown+='changed';},f=>{f.input.decision.preparationApproval.numbers=[];}]){
   const f=fixture();modify(f);assert.throws(()=>build(f),/IMPORTED_REVIEW_CHANGED/);
 }
});
test('rehashed altered content still fails original batch and approval bindings',()=>{
 const f=fixture();f.input.packet.records[0].original.explicacion_markdown+='changed';refresh(f.input);assert.throws(()=>build(f),/IMPORTED_CONTENT_CHANGED/);
 const g=fixture();g.input.packet.requestedReview.bindings[0].bodySha256='a'.repeat(64);refresh(g.input);assert.throws(()=>build(g),/IMPORTED_APPROVAL_BINDING_CHANGED/);
});
test('preparation permission cannot be broadened to new or published explanations',()=>{
 for(const change of [d=>{d.preparationApproval.numbers=[];},d=>{d.preparationApproval.newExplanationsNotApprovedInAdvance=false;},d=>{d.publicationAllowed=true;}]){
   const f=fixture();change(f.input.decision);refresh(f.input);assert.throws(()=>build(f),/IMPORTED_(PREPARATION_PERMISSION|REVIEW_SCHEMA)/);
 }
});
test('blocked, protected, model-attributed or already approved imports rejected',()=>{
 for(const change of [e=>{e.validation.blocks.push('PROTECTED_EXISTING_BASE');},e=>{e.validation.protectedExistingBase=true;},e=>{e.source.modelVerified='fake-model';},e=>{e.validation.humanApproved=true;}]){
   const f=fixture();change(f.input.batch.entries[0]);assert.throws(()=>build(f),/IMPORTED_CANDIDATE_NOT_ELIGIBLE/);
 }
});
test('source review is limited, not approval; unsafe or unmatched source destinations rejected',()=>{
 for(const url of ['http://example.org/','https://name:secret@example.org/','https://localhost/','https://127.0.0.1/','https://example.org/?token=secret','javascript:alert(1)']){
   const f=fixture();f.input.packet.records[0].sourceChecks[0].url=url;refresh(f.input);assert.throws(()=>build(f),/IMPORTED_SOURCE_CHECK_INVALID/);
 }
 const f=fixture();f.input.packet.records[0].sourceChecks[0].number='002';refresh(f.input);assert.throws(()=>build(f),/IMPORTED_SOURCE_CHECK_INVALID/);
 const r=build(fixture()).records[0];assert.equal(r.sources[0].commercialReuse,'not-cleared-by-this-preparation');assert.equal(r.sourceSharingApproved,false);
 assert.equal(r.questionProvenance.clinicalEvidence,false);assert.equal(r.questionProvenance.pdfLocator.state,'parsed_unverified');
});
test('all cited clinical reference IDs need a recorded scoped check',()=>{
 const f=fixture();f.input.packet.records[0].sourceChecks=[];refresh(f.input);assert.throws(()=>build(f),/IMPORTED_SOURCE_CHECK_INVALID/);
});
test('an otherwise bound import cannot introduce unknown citations or active Markdown',()=>{
 const unknown=fixture(body+' [R99]');
 assert.equal(unknown.input.batch.entries[0].binding.status,'matched_snapshot');
 assert.equal(unknown.input.batch.entries[0].queue,'blocked_pending_review');
 assert.throws(()=>build(unknown),/IMPORTED_CANDIDATE_NOT_ELIGIBLE/);
 // Harmless HTML and links may pass the quarantine importer, but are not allowed
 // in this narrowly scoped preparation path. Renderers still enforce their own safety.
 for(const text of [body+' <span>new markup</span>',body+' [link](https://example.org/)'])assert.throws(()=>build(fixture(text)),/IMPORTED_UNSAFE_MARKDOWN/);
});
test('private preview requires saved answer and exact current question, no grading',()=>{
 const r=build(fixture()).records[0],before=importedEditorialPreview(r,r.question,false);
 assert.equal(before.state,'answer-required');assert.equal(before.text,null);assert.deepEqual(before.references,[]);
 const after=importedEditorialPreview(r,r.question,true);assert.equal(after.state,'pending-human-review');assert.equal(after.text,body);assert.equal(after.answerEvaluation,null);
 assert.equal(after.newModelCalls,0);assert.equal(after.studentWrites,0);assert(!Object.hasOwn(after,'origin'));
 for(const q of [{...r.question,version:2},{...r.question,stem:r.question.stem+'x'}])assert.throws(()=>importedEditorialPreview(r,q,true),/IMPORTED_QUESTION_STALE/);
 assert.throws(()=>importedEditorialPreview(r,r.question,'true'),/IMPORTED_ANSWER_STATE_REQUIRED/);
 const changed=structuredClone(r);changed.editorial.markdown+='x';assert.throws(()=>importedEditorialPreview(changed,r.question,true),/IMPORTED_PREPARATION_CHANGED/);
});
test('current student reader rejects preparation and preview, not relabelled as shared-reviewed',async()=>{
 const require=createRequire(path.join(repository,'package.json')),ts=require('typescript');
 async function load(file,imports={}){const code=ts.transpileModule(await fs.readFile(path.join(repository,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
   const mod={exports:{}};new Function('require','module','exports',code)(name=>{if(Object.hasOwn(imports,name))return imports[name];throw Error('Unexpected '+name);},mod,mod.exports);return mod.exports;}
 const domain=await load('src/lib/tutor/domain.ts'),reader=await load('src/lib/tutor/shared-base.ts',{'server-only':{},'./domain':domain});
 const r=build(fixture()).records[0];for(const data of [r,importedEditorialPreview(r,r.question,true)])assert.throws(()=>reader.parseSharedBase(data),/TUTOR_BASE_UNAVAILABLE/);
});

async function localFixture(){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'egel-imported-editorial-')),source=path.join(dir,'input'),output=path.join(dir,'output');
 await fs.mkdir(source);await fs.mkdir(output);
 const f=fixture(),bank=path.join(source,'bank.json');await fs.writeFile(bank,f.bankBytes);
 const spec=(file,bytes)=>({path:file,sha256:hashBytes(bytes)}),files=[];
 for(const file of f.files){const target=path.join(source,file.name);await fs.writeFile(target,file.bytes);files.push(spec(target,file.bytes));}
 const draft={schema:'egel-draft-import-manifest-v1',bankSnapshot:spec(bank,f.bankBytes),files,protectedQuestionIds:[]};
 const draftFile=path.join(source,'draft-manifest.json'),packetFile=path.join(source,'packet.json'),decisionFile=path.join(source,'decision.json');
 const draftBytes=json(draft),packetBytes=json(f.input.packet),decisionBytes=json(f.input.decision);
 for(const [target,bytes]of [[draftFile,draftBytes],[packetFile,packetBytes],[decisionFile,decisionBytes]])await fs.writeFile(target,bytes);
 const manifest={schema:'egel-imported-editorial-manifest-v1',draftImportManifest:spec(draftFile,draftBytes),reviewPacket:spec(packetFile,packetBytes),decision:spec(decisionFile,decisionBytes),numbers};
 const file=path.join(source,'manifest.json');await fs.writeFile(file,json(manifest));
 return {dir,source,output,file,manifest,packetFile};
}
// Small temporary test fixtures are retained outside the repo; no recursive deletion.
test('manifest loader revalidates originals; modified input bytes stop before write',async()=>{
 const f=await localFixture(),input=await loadImportedEditorial(f.file);assert.deepEqual(input.prepared.numbers,numbers);
 await fs.appendFile(f.packetFile,' ');await assert.rejects(loadImportedEditorial(f.file),/IMPORTED_SOURCE_CHANGED/);assert.deepEqual(await fs.readdir(f.output),[]);
});
test('exclusive private writer reuses exact output, rejects changed and incomplete batches',async()=>{
 const f=await localFixture(),input=await loadImportedEditorial(f.file),first=await writeImportedEditorial(input,f.output);
 assert.equal(first.reused,false);assert.equal((await writeImportedEditorial(input,f.output)).reused,true);
 const data=path.join(first.destination,'preparaciones.json');await fs.appendFile(data,' ');
 await assert.rejects(writeImportedEditorial(input,f.output),/IMPORTED_EXISTING_DIFFERS/);
 assert((await fs.readFile(data,'utf8')).endsWith(' '));
 const other=await localFixture(),loaded=await loadImportedEditorial(other.file);
 await fs.mkdir(path.join(other.output,'editorial-'+loaded.prepared.preparationBatchSha256));
 await assert.rejects(writeImportedEditorial(loaded,other.output),/IMPORTED_EXISTING_DIFFERS/);
});
test('repository and input folders cannot receive private artifacts',async()=>{
 const f=await localFixture(),input=await loadImportedEditorial(f.file);
 for(const output of [repository,f.source,f.dir])await assert.rejects(writeImportedEditorial(input,output),/IMPORTED_PRIVATE_OUTPUT_REQUIRED/);
});
test('writer revalidates in-memory preparation before reserving a destination',async()=>{
 const f=await localFixture(),input=await loadImportedEditorial(f.file);input.prepared.records[0].editorial.markdown+='changed';
 await assert.rejects(writeImportedEditorial(input,f.output),/IMPORTED_PREPARATION_CHANGED/);
 assert.deepEqual(await fs.readdir(f.output),[]);
});
test('help and plan do not use env or credentials, write files or contact services',async()=>{
 const f=await localFixture(),cli=path.join(repository,'scripts/egel/preparar-editoriales-importadas.mjs');
 for(const args of [['--help'],['--manifest='+f.file,'--plan']]){
   const r=spawnSync(process.execPath,[cli,...args],{cwd:repository,encoding:'utf8',env:{...process.env,OPENAI_API_KEY:'NEVER_PRINT_OR_SEND'}});
   assert.equal(r.status,0,r.stderr);assert(!r.stdout.includes('NEVER_PRINT'));assert.deepEqual(await fs.readdir(f.output),[]);
 }
 for(const args of [['--publish'],['--manifest='+f.file,'--plan','--execute'],['--manifest='+f.file,'--execute'],['--manifest='+f.file,'--output='+f.output]]){
   assert.notEqual(spawnSync(process.execPath,[cli,...args],{cwd:repository,encoding:'utf8'}).status,0);
 }
});
test('implementation has no env loader, provider, SQL, web route or remote transport',async()=>{
 for(const file of ['imported-editorial.mjs','imported-editorial-storage.mjs']){
   const source=await fs.readFile(path.join(repository,'scripts/egel/lib',file),'utf8');
   assert(!/process\.env|dotenv|fetch\(|@supabase|from ['"]ai['"]|createClient|execute_sql|INSERT INTO/i.test(source));
 }
});
