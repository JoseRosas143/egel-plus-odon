import {canonicalQuestion,hashText} from './pilot-candidates.mjs';
import {parseDraftPages} from './draft-import.mjs';

const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const digest=v=>hashText(JSON.stringify(v));
const validHash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const fail=code=>{throw Error(code);};
const text=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max&&!s.includes('\0');
export const IMPORTED_EDITORIAL_PILOT_NUMBERS=['001','003','006'];
const normalized=s=>s.normalize('NFC').replace(/\s+/gu,' ').trim();
function publicHttps(value){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
   !u.searchParams.size&&!/^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.invalid)$/i.test(u.hostname)&&
   /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)&&u.hostname.length<=253;}
 catch{return false;}
}

// Local preparation, NOT a DB row, published TutorMessage, signature or medical approval.
// All input hashes must come from a separately inspected local manifest. Hashes
// protect integrity; they do not make an exporter, reviewer or source trustworthy.
export function buildImportedEditorialPreparations(input){
 if(!exact(input,['batch','packet','decision','bindings','numbers']))fail('IMPORTED_INVALID_INPUT');
 const {batch,packet,decision,bindings,numbers}=input;
 if(!exact(bindings,['packetSha256','decisionSha256'])||!validHash(bindings.packetSha256)||!validHash(bindings.decisionSha256))fail('IMPORTED_INVALID_BINDINGS');
 if(!Array.isArray(numbers)||!numbers.length||numbers.length>3||new Set(numbers).size!==numbers.length||
   numbers.some(n=>!IMPORTED_EDITORIAL_PILOT_NUMBERS.includes(n)))fail('IMPORTED_PILOT_SCOPE');
 if(packet?.schema!=='egel-private-human-review-request-v1'||packet.publicationAllowed!==false||!Array.isArray(packet.records)||
   decision?.schema!=='egel-private-user-study-key-review-v1'||decision.publicationAllowed!==false||decision.clinicalExpertValidation!==false||
   decision.scope!=='private_editorial_study_key_001_010_no_publication')fail('IMPORTED_REVIEW_SCHEMA');
 const {packetSha256,...payload}=packet;
 if(packetSha256!==bindings.packetSha256||digest(payload)!==packetSha256||digest(decision)!==bindings.decisionSha256||
   decision.sourcePacketSha256!==packetSha256||decision.sourceBatchId!==packet.sourceBatchId||packet.sourceBatchId!==batch?.batchId||
   packet.bankSnapshotSha256!==batch?.manifest?.bankSnapshotSha256)fail('IMPORTED_REVIEW_CHANGED');
 const permission=decision.preparationApproval;
 if(permission?.scope!=='continue_preparing_the_existing_explanations_with_their_limits'||permission.newExplanationsNotApprovedInAdvance!==true||
   !Array.isArray(permission.numbers)||!Array.isArray(packet.requestedReview?.bindings))fail('IMPORTED_PREPARATION_PERMISSION');
 const records=[...numbers].sort().map(number=>{
   if(!permission.numbers.includes(number)||!packet.requestedReview.numbers.includes(number))fail('IMPORTED_PREPARATION_PERMISSION');
   const entries=batch.entries.filter(e=>e.number===number),reviews=packet.records.filter(r=>r.number===number),approvals=packet.requestedReview.bindings.filter(r=>r.number===number);
   if(entries.length!==1||reviews.length!==1||approvals.length!==1)fail('IMPORTED_AMBIGUOUS_RECORD');
   const e=entries[0],r=reviews[0],a=approvals[0],q=canonicalQuestion(e.binding.canonicalQuestion);
   if(e.binding.status!=='matched_snapshot'||e.queue!=='pending_review'||e.validation.blocks.length||e.validation.protectedExistingBase||
     e.validation.humanApproved!==false||e.validation.publicationAllowed!==false||e.validation.clinicalReview!==false||
     e.source.provenance!=='user_supplied_chat_export'||e.source.modelVerified!==null||e.source.providerDeclaredByOperator!==null||
     r.provenance.kind!=='user_supplied_chat_export'||r.provenance.providerVerified!==null||r.provenance.modelVerified!==null||r.provenance.runFingerprint!==null||
     r.recommendation!=='candidate_for_human_content_review'||r.decision.humanApproved!==false||r.decision.clinicalExpertApproved!==false||r.decision.publicationAllowed!==false)fail('IMPORTED_CANDIDATE_NOT_ELIGIBLE');
   for(const key of ['questionId','questionVersion','questionSha256','recordSha256','bodySha256','referencesSha256'])if(a[key]!==r[key])fail('IMPORTED_APPROVAL_BINDING_CHANGED');
   if(q.id!==`EGEL-2026-${number}`||q.id!==r.questionId||q.version!==r.questionVersion||q.id!==e.binding.questionId||q.version!==e.binding.questionVersion||
     digest(q)!==r.questionSha256||digest(r.original)!==r.recordSha256||digest(e.original)!==r.recordSha256||e.source.recordSha256!==r.recordSha256||
     hashText(r.original.explicacion_markdown)!==r.bodySha256||digest(r.original.referencias)!==r.referencesSha256||
     normalized(r.original.enunciado_original)!==normalized(q.stem)||r.original.opciones_originales.some((o,i)=>o.letra!==q.options[i].letter||normalized(o.texto)!==normalized(q.options[i].text)))fail('IMPORTED_CONTENT_CHANGED');
   const markdown=r.original.explicacion_markdown;
   if(!text(markdown,30000)||markdown.length<100||/<[^>]*>|!\[[^\]]*\]\(|\]\(/i.test(markdown))fail('IMPORTED_UNSAFE_MARKDOWN');
   const references=r.original.referencias,ids=references.map(s=>s.id),checks=r.sourceChecks;
   if(new Set(ids).size!==ids.length||!ids.includes('R1')||!Array.isArray(checks)||!checks.length||checks.length>12||
     !Array.isArray(r.independentlyCheckedReferenceIds)||new Set(checks.map(c=>c.ref)).size!==checks.length||
     checks.some(c=>c.number!==number||c.ref==='R1'||!ids.includes(c.ref)||!publicHttps(c.url)||!text(c.scope,4000)||!text(c.read,100)||
       !r.independentlyCheckedReferenceIds.includes(c.ref))||r.independentlyCheckedReferenceIds.some(id=>!checks.some(c=>c.ref===id)))fail('IMPORTED_SOURCE_CHECK_INVALID');
   const cited=[...new Set([...markdown.matchAll(/\[(R\d+(?:[\s,;]+R\d+)*)\]/g)].flatMap(m=>m[1].match(/R\d+/g)))];
   if(!cited.length||cited.some(id=>!ids.includes(id)||id!=='R1'&&!checks.some(c=>c.ref===id)))fail('IMPORTED_UNCHECKED_CITATION');
   const questionRef=references.find(s=>s.id==='R1');
   const sources=checks.map(c=>{
     const ref=references.find(s=>s.id===c.ref);
     if(!text(ref.titulo,500))fail('IMPORTED_SOURCE_CHECK_INVALID');
     return {referenceId:c.ref,title:ref.titulo,url:c.url,scope:c.scope,read:c.read,
       verification:'scoped-check-recorded-not-clinical-certification',
       license:typeof c.license==='string'?c.license:null,commercialReuse:'not-cleared-by-this-preparation'};
   });
   const result={schema:'egel-imported-editorial-preparation-v1',number,question:q,
     editorial:{markdown,sha256:hashText(markdown)},sources,
     questionProvenance:{referenceId:'R1',title:questionRef.titulo,pdfLocator:parseDraftPages(questionRef.pagina_pdf),
       printedLocatorRaw:structuredClone(questionRef.pagina_impresa),clinicalEvidence:false},
     provenance:{kind:'imported-chat-editorial',providerVerified:null,modelVerified:null,runFingerprint:null,
       sourceBatchId:batch.batchId,sourceFileSha256:e.source.fileSha256,sourceRecordSha256:r.recordSha256,
       sourcePacketSha256:packetSha256,preparationPermissionSha256:bindings.decisionSha256,questionSha256:r.questionSha256},
     contentApproval:'existing-text-preparation-only',humanPublicationApproved:false,clinicalExpertApproved:false,
     sourceSharingApproved:false,publicationAllowed:false,cloudCompatible:false,automaticGradingAllowed:false,
     requirements:['human-content-review-before-publication','commercial-source-rights-review','audited-source-registration',
       'explicit-imported-provenance-schema-and-reader','live-question-and-source-freshness-check','separate-publication-authorization']};
   return {...result,preparationSha256:digest(result)};
 });
 const result={schema:'egel-private-imported-editorial-batch-v1',records,sourceBatchId:batch.batchId,
   bankSnapshotSha256:packet.bankSnapshotSha256,numbers:records.map(r=>r.number),
   publicationAllowed:false,cloudWrites:0,paidModelCalls:0,studentWrites:0};
 return {...result,preparationBatchSha256:digest(result)};
}

// Presentation seam for future operator-only preview. This is not wired to the
// student API: the shared-base parser must continue rejecting it. No fake user,
// timestamps, registered document IDs or shared-reviewed origin are generated.
export function importedEditorialPreview(prepared,currentQuestion,answerSaved){
 const {preparationSha256,...payload}=prepared;
 if(prepared.schema!=='egel-imported-editorial-preparation-v1'||digest(payload)!==preparationSha256||
   prepared.publicationAllowed!==false||prepared.cloudCompatible!==false||prepared.humanPublicationApproved!==false)fail('IMPORTED_PREPARATION_CHANGED');
 const current=canonicalQuestion(currentQuestion);
 if(digest(current)!==prepared.provenance.questionSha256)fail('IMPORTED_QUESTION_STALE');
 if(typeof answerSaved!=='boolean')fail('IMPORTED_ANSWER_STATE_REQUIRED');
 return {kind:'private-editorial-preview',state:answerSaved?'pending-human-review':'answer-required',
   notice:'Vista editorial privada. No publicada ni validada como clave oficial.',
   text:answerSaved?prepared.editorial.markdown:null,
   references:answerSaved?prepared.sources.map(s=>({referenceId:s.referenceId,label:s.title,href:s.url,scope:s.scope})):[],
   answerEvaluation:null,studentWrites:0,newModelCalls:0,publicationAllowed:false};
}

export function validateImportedEditorialBatch(prepared){
 if(!exact(prepared,['schema','records','sourceBatchId','bankSnapshotSha256','numbers','publicationAllowed','cloudWrites','paidModelCalls','studentWrites','preparationBatchSha256']))fail('IMPORTED_PREPARATION_CHANGED');
 const {preparationBatchSha256,...payload}=prepared;
 if(prepared.schema!=='egel-private-imported-editorial-batch-v1'||digest(payload)!==preparationBatchSha256||prepared.publicationAllowed!==false||
   prepared.cloudWrites!==0||prepared.paidModelCalls!==0||prepared.studentWrites!==0||!Array.isArray(prepared.records)||!prepared.records.length||prepared.records.length>3||
   JSON.stringify(prepared.numbers)!==JSON.stringify(prepared.records.map(r=>r.number))||new Set(prepared.numbers).size!==prepared.numbers.length||
   prepared.numbers.some(n=>!IMPORTED_EDITORIAL_PILOT_NUMBERS.includes(n)))fail('IMPORTED_PREPARATION_CHANGED');
 for(const r of prepared.records)importedEditorialPreview(r,r.question,false);
 return prepared;
}
