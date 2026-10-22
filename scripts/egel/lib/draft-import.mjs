import {createHash} from 'node:crypto';
import {canonicalQuestion} from './pilot-candidates.mjs';

export const DEFAULT_PROTECTED_IDS=['EGEL-2026-034','EGEL-2026-035','EGEL-2026-036'];
export const hashBytes=value=>createHash('sha256').update(value).digest('hex');
const hashObject=value=>hashBytes(JSON.stringify(value));
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const text=(value,max=30000)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!value.includes('\0');
const optionalText=value=>value===null||text(value,4000);
const normalized=value=>value.normalize('NFC').replace(/\s+/gu,' ').trim();
const pending='pendiente_validacion';
const entryKeys=['numero_reactivo','question_id','question_version','enunciado_original','opciones_originales','tema','respuesta_propuesta','estado_evidencia','explicacion_markdown','referencias','discrepancias','pendientes_revision','estado_validacion'];
const referenceKeys=['id','archivo_consultado','autor_o_institucion','titulo','edicion','anio','pagina_pdf','pagina_impresa','doi_o_url','estado','afirmaciones_respaldadas'];
const fail=code=>{throw Error(code);};

// Page numbers are locators supplied by the exporter, never verified citations.
// Printed-page labels are preserved separately; they are not guessed from PDFs.
export function parseDraftPages(value){
  if(value===null)return {raw:null,pages:[],state:'unspecified'};
  const pages=[];
  const add=n=>{if(!Number.isSafeInteger(n)||n<1||n>100000||pages.length>=500)fail('DRAFT_PAGE_FORMAT');pages.push(n);};
  try{
    if(typeof value==='number')add(value);
    else if(Array.isArray(value)){if(!value.length||value.length>500)fail('DRAFT_PAGE_FORMAT');for(const n of value)add(n);}
    else if(typeof value==='string'&&value.length<=2000){
      for(const item of value.split(',')){
        const match=/^\s*([1-9][0-9]*)(?:\s*[-–—]\s*([1-9][0-9]*))?\s*$/u.exec(item);
        if(!match)fail('DRAFT_PAGE_FORMAT');
        const first=Number(match[1]),last=Number(match[2]??match[1]);
        if(last<first||last-first>=500)fail('DRAFT_PAGE_FORMAT');
        for(let n=first;n<=last;n++)add(n);
      }
    }else fail('DRAFT_PAGE_FORMAT');
    return {raw:structuredClone(value),pages:[...new Set(pages)].sort((a,b)=>a-b),state:'parsed_unverified'};
  }catch{return {raw:structuredClone(value),pages:[],state:'unsupported'};}
}

function validateReference(r){
  if(!exact(r,referenceKeys)||!/^R[1-9][0-9]*$/.test(r.id)||!optionalText(r.titulo)||!optionalText(r.archivo_consultado)||
    !optionalText(r.autor_o_institucion)||!optionalText(r.edicion)||!optionalText(r.doi_o_url)||
    !(r.anio===null||(Number.isSafeInteger(r.anio)&&r.anio>=1500&&r.anio<=2100))||
    !['consultada','afirmacion_contrastada','mencionada'].includes(r.estado)||
    !Array.isArray(r.afirmaciones_respaldadas)||r.afirmaciones_respaldadas.length>100||
    r.afirmaciones_respaldadas.some(s=>!text(s,8000)))fail('DRAFT_REFERENCE_SCHEMA');
  for(const v of [r.pagina_pdf,r.pagina_impresa])if(!(v===null||typeof v==='number'||typeof v==='string'||Array.isArray(v)))fail('DRAFT_REFERENCE_SCHEMA');
}
function validateRecord(q){
  if(!exact(q,entryKeys)||typeof q.numero_reactivo!=='string'||!/^\d{3}$/.test(q.numero_reactivo)||
    Number(q.numero_reactivo)<1||Number(q.numero_reactivo)>469||!text(q.enunciado_original,16000)||!text(q.tema,1000)||!text(q.explicacion_markdown)||
    !(q.question_id===null||(typeof q.question_id==='string'&&/^EGEL-2026-\d{3}$/.test(q.question_id)))||
    !(q.question_version===null||(Number.isSafeInteger(q.question_version)&&q.question_version>0))||
    !(q.respuesta_propuesta===null||['A','B','C'].includes(q.respuesta_propuesta))||
    !['suficiente_para_propuesta','parcial','insuficiente'].includes(q.estado_evidencia)||q.estado_validacion!==pending||
    !Array.isArray(q.opciones_originales)||q.opciones_originales.length!==3||q.opciones_originales.some((o,i)=>
      !exact(o,['letra','texto'])||o.letra!==['A','B','C'][i]||!text(o.texto,4000))||
    !Array.isArray(q.referencias)||!q.referencias.length||q.referencias.length>100)fail('DRAFT_RECORD_SCHEMA');
  for(const k of ['discrepancias','pendientes_revision'])if(!Array.isArray(q[k])||q[k].length>100||q[k].some(s=>!text(s,8000)))fail('DRAFT_RECORD_SCHEMA');
  const ids=new Set();for(const r of q.referencias){validateReference(r);if(ids.has(r.id))fail('DRAFT_DUPLICATE_REFERENCE');ids.add(r.id);}
}

export function buildDraftImport({bankBytes,files,protectedIds=[]}){
  if(!Buffer.isBuffer(bankBytes)||!bankBytes.length||bankBytes.length>5000000||!Array.isArray(files)||!files.length||files.length>100||
    !Array.isArray(protectedIds)||protectedIds.some(s=>typeof s!=='string'||!/^EGEL-2026-\d{3}$/.test(s)))fail('DRAFT_INVALID_INPUT');
  let snapshot;try{snapshot=JSON.parse(bankBytes.toString('utf8'));}catch{fail('DRAFT_BANK_JSON');}
  if(!Array.isArray(snapshot)||!snapshot.length||snapshot.length>469)fail('DRAFT_BANK_SCHEMA');
  const bank=new Map();
  for(const q of snapshot){
    if(!exact(q,['id','version','stem','options'])||!Array.isArray(q.options)||!q.options.every(o=>exact(o,['letter','text'])))fail('DRAFT_BANK_SCHEMA');
    let canonical;try{canonical=canonicalQuestion(q);}catch{fail('DRAFT_BANK_SCHEMA');}
    if(bank.has(q.id))fail('DRAFT_DUPLICATE_BANK_ID');bank.set(q.id,canonical);
  }
  const protectedSet=new Set([...DEFAULT_PROTECTED_IDS,...protectedIds]);
  const entries=[],sources=[],seen=new Set(),names=new Set();
  for(const file of files){
    if(!exact(file,['name','bytes'])||!Buffer.isBuffer(file.bytes)||!file.bytes.length||file.bytes.length>2000000||
      typeof file.name!=='string'||!/^egel_bloque_\d{3}-\d{3}_pendiente_validacion\.json$/.test(file.name)||names.has(file.name))fail('DRAFT_INVALID_FILE');
    names.add(file.name);const sourceHash=hashBytes(file.bytes);
    let doc;try{doc=JSON.parse(file.bytes.toString('utf8'));}catch{fail('DRAFT_FILE_JSON');}
    if(!exact(doc,['formato','version','estado_global','modo','reactivos','auditoria'])||doc.formato!=='egel_borradores_explicaciones'||
      doc.version!=='1.0'||doc.estado_global!==pending||doc.modo!=='literatura'||!Array.isArray(doc.reactivos)||!doc.reactivos.length||
      !doc.auditoria||typeof doc.auditoria!=='object'||Array.isArray(doc.auditoria))fail('DRAFT_FILE_SCHEMA');
    const [first,last]=file.name.match(/\d{3}/g).map(Number);
    if(first<1||last>469||last<first||doc.reactivos.length!==last-first+1)fail('DRAFT_FILE_COVERAGE');
    const sourceIndex=sources.length;
    sources.push({name:file.name,sha256:sourceHash,bytes:file.bytes.length,modeDeclared:doc.modo,records:doc.reactivos.length});
    const fileNumbers=new Set();
    for(const [index,q]of doc.reactivos.entries()){
      if(entries.length>=469)fail('DRAFT_BATCH_TOO_LARGE');
      validateRecord(q);const n=Number(q.numero_reactivo),id=`EGEL-2026-${q.numero_reactivo}`;
      if(n<first||n>last||fileNumbers.has(n))fail('DRAFT_FILE_COVERAGE');fileNumbers.add(n);
      if(seen.has(id))fail('DRAFT_DUPLICATE_QUESTION');seen.add(id);
      const canonical=bank.get(id),blocks=[],warnings=[];
      let matches=!!canonical;
      if(!canonical)blocks.push('QUESTION_NOT_IN_SNAPSHOT');
      else{
        if(normalized(q.enunciado_original)!==normalized(canonical.stem)){blocks.push('STEM_RECONCILIATION_REQUIRED');matches=false;}
        if(q.opciones_originales.some((o,i)=>normalized(o.texto)!==normalized(canonical.options[i].text))){blocks.push('OPTIONS_RECONCILIATION_REQUIRED');matches=false;}
        if(q.question_id!==null&&q.question_id!==canonical.id){blocks.push('SUPPLIED_ID_MISMATCH');matches=false;}
        if(q.question_version!==null&&q.question_version!==canonical.version){blocks.push('SUPPLIED_VERSION_MISMATCH');matches=false;}
      }
      if(protectedSet.has(id))blocks.push('PROTECTED_EXISTING_BASE');
      if(q.estado_evidencia==='insuficiente'&&q.respuesta_propuesta!==null)blocks.push('INSUFFICIENT_WITH_PROPOSED_ANSWER');
      const ids=new Set(q.referencias.map(r=>r.id));
      const cited=[...new Set([...q.explicacion_markdown.matchAll(/\[(R\d+(?:[\s,;]+R\d+)*)\]/g)].flatMap(m=>m[1].match(/R\d+/g)))];
      if(cited.some(s=>!ids.has(s)))blocks.push('UNKNOWN_INLINE_REFERENCE');
      if(!cited.length)blocks.push('NO_INLINE_REFERENCE');
      if(/<\/?(?:script|iframe|style|img|svg)\b|!\[[^\]]*\]\(/i.test(q.explicacion_markdown))blocks.push('UNSAFE_RENDERING_CONTENT');
      const references=q.referencias.map(r=>{
        const pdf=parseDraftPages(r.pagina_pdf);
        if(pdf.state==='unsupported')blocks.push('PAGE_FORMAT_UNSUPPORTED');
        if(r.titulo===null)blocks.push('REFERENCE_TITLE_MISSING');
        if(r.estado==='mencionada')warnings.push('REFERENCE_MENTIONED_NOT_VERIFIED');
        if(r.estado==='afirmacion_contrastada'&&!r.afirmaciones_respaldadas.length)blocks.push('REFERENCE_WITHOUT_SUPPORTING_CLAIMS');
        let destination={kind:'none',value:null,verified:false};
        if(r.doi_o_url!==null){
          if(/^10\.\d{4,9}\/\S+$/i.test(r.doi_o_url))destination={kind:'doi',value:r.doi_o_url,verified:false};
          else{
            try{const u=new URL(r.doi_o_url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||/^(localhost|127\.|0\.|\[::1\])/.test(u.hostname))throw Error();
              destination={kind:'url',value:r.doi_o_url,verified:false};
            }catch{blocks.push('UNSAFE_REFERENCE_DESTINATION');destination={kind:'unsupported',value:null,verified:false};}
          }
        }
        return {declared:structuredClone(r),pdfLocator:pdf,printedLocatorRaw:structuredClone(r.pagina_impresa),destination,
          verification:{state:'not_verified',assertionsVerified:false,eligibleForPublication:false}};
      });
      const protectedBase=protectedSet.has(id);
      entries.push({draftId:hashObject({sourceHash,index,questionHash:hashObject(q)}),number:q.numero_reactivo,
        mode:'literatura',source:{fileIndex:sourceIndex,fileSha256:sourceHash,recordIndex:index,recordSha256:hashObject(q),
          provenance:'user_supplied_chat_export',providerDeclaredByOperator:null,modelVerified:null,generationDateVerified:null},
        binding:{status:matches?'matched_snapshot':'reconciliation_required',questionId:matches?id:null,questionVersion:matches?canonical.version:null,
          candidateQuestionId:id,candidateQuestionVersion:canonical?.version??null,canonicalQuestion:canonical??null,
          comparison:'NFC_and_whitespace_only',snapshotSha256:hashBytes(bankBytes),requiresLiveRecheckBeforeAnyFuturePublication:true},
        original:structuredClone(q),references,proposedAnswer:q.respuesta_propuesta,
        isAbstention:q.respuesta_propuesta===null,declaredEvidence:q.estado_evidencia,
        validation:{state:pending,clinicalReview:false,sourceReview:false,humanApproved:false,publicationAllowed:false,
          blocks:[...new Set(blocks)],warnings:[...new Set(warnings)],protectedExistingBase:protectedBase},
        queue:protectedBase?'protected_existing_base':blocks.length?'blocked_pending_review':'pending_review'});
    }
    if(!Array.isArray(doc.auditoria.reactivos_entregados)||
      JSON.stringify(doc.auditoria.reactivos_entregados)!==JSON.stringify(doc.reactivos.map(q=>q.numero_reactivo)))fail('DRAFT_DELIVERY_DECLARATION');
  }
  entries.sort((a,b)=>a.number.localeCompare(b.number));
  const manifest={schema:'egel-private-draft-batch-v1',bankSnapshotSha256:hashBytes(bankBytes),sources,
    protectedQuestionIds:[...protectedSet].sort(),mode:'literatura',validationState:pending,publicationAllowed:false};
  const counts={records:entries.length,files:sources.length,matched:entries.filter(e=>e.binding.status==='matched_snapshot').length,
    reconciliation:entries.filter(e=>e.binding.status!=='matched_snapshot').length,proposals:entries.filter(e=>!e.isAbstention).length,
    abstentions:entries.filter(e=>e.isAbstention).length,pendingReview:entries.filter(e=>e.queue==='pending_review').length,
    blocked:entries.filter(e=>e.queue==='blocked_pending_review').length,protected:entries.filter(e=>e.queue==='protected_existing_base').length};
  const reasons={};for(const e of entries)for(const reason of e.validation.blocks)reasons[reason]=(reasons[reason]??0)+1;
  const summary={schema:'egel-private-draft-summary-v1',counts,reasons,allPending:true,eligibleForPublication:0,
    mode:'literatura',clinicalReviewPerformed:false,referenceVerificationPerformed:false,newModelCalls:0,cloudWrites:0,
    reconciliationNumbers:entries.filter(e=>e.binding.status!=='matched_snapshot').map(e=>e.number),
    blockedNumbers:entries.filter(e=>e.queue==='blocked_pending_review').map(e=>e.number),
    protectedNumbers:entries.filter(e=>e.queue==='protected_existing_base').map(e=>e.number)};
  return {batchId:hashObject(manifest),manifest,summary,entries};
}
