import {createHash} from 'node:crypto';

// Document-derived review plan, not an answer key or validated exam blueprint.
export const reviewPlan = [
  {number:27,topic:'Urgencia alérgica y compromiso circulatorio',books:['BIB-021','BIB-012'],terms:['anafilax','anafilact','alergia','sibilancia','hipotension'],mustCheck:'Distinguir anafilaxia de choque; no dar por documentada una hipotensión ausente.'},
  {number:28,topic:'Territorio nervioso y bloqueo anestésico',books:['BIB-002'],ranges:{'BIB-002':[[179,180],[201,208]]},terms:['nasopalat','palatino mayor','incisivo','bloqueo'],mustCheck:'Comprobar territorio palatino, técnica y alcance del bloqueo sin extrapolar a toda la cirugía.'},
  {number:29,topic:'Displasia ectodérmica y valoración previa',books:['BIB-017','BIB-012','BIB-020','BIB-003'],terms:['displasia ectoderm','hipohidrosis','anhidrosis','hipertermia'],mustCheck:'Comprobar el vínculo con termorregulación y señalar si la terminología de la pregunta es imprecisa.'},
  {number:30,topic:'Desarrollo del esmalte y defectos de formación',books:['BIB-017','BIB-020','BIB-003','BIB-001'],terms:['hipoplasia','amelogenesis','matriz organica','mineralizacion'],mustCheck:'Separar cantidad de matriz, maduración/mineralización y pérdida adquirida de tejido.'},
  {number:31,topic:'Métodos de exploración física',books:['BIB-023'],ranges:{'BIB-023':[[35,45]]},terms:['palpacion','inspeccion','auscultacion','aumento de volumen'],mustCheck:'Comparar qué información aporta cada método; no convertir un hallazgo inespecífico en diagnóstico.'},
  {number:32,topic:'Limitación de apertura posterior a anestesia',books:['BIB-002','BIB-021','BIB-012'],ranges:{'BIB-002':[[252,268]]},terms:['trism','compresas','calor humedo','ejercicios mandibulares'],mustCheck:'Revisar temporalidad, diagnóstico diferencial y criterios de tratamiento; no prescribir a un paciente real.'},
  {number:33,topic:'Colonización temprana del microbioma oral',books:['BIB-014','BIB-011','BIB-001','BIB-012'],terms:['salivarius','recien nacido','colonizacion','microbiota'],mustCheck:'Comprobar si la fuente respalda el intervalo de los primeros cinco minutos, no solo la colonización neonatal general.'},
  {number:34,topic:'Concentración, cartuchos y límites de anestésicos',books:['BIB-002','BIB-012','BIB-021'],ranges:{'BIB-002':[[63,69]]},requiredPages:{'BIB-002':[64]},terms:['lidocaina','dosis maxima','mg/kg','cartucho','4,4'],mustCheck:'Recalcular unidades; conservar discrepancias de edición, tabla/texto, fabricante y formulación; no forzar una letra.'},
  {number:35,topic:'Interpretación de datos tiroideos',books:['BIB-012','BIB-019'],ranges:{'BIB-012':[[205,207]],'BIB-019':[[1121,1128]]},requiredPages:{'BIB-012':[205,206]},terms:['hipotiroid','tsh','tiroxina','tirotropina'],mustCheck:'Revisar unidad de TSH, T4 libre/total e intervalos ausentes; separar datos del reactivo y evidencia.'},
  {number:36,topic:'Presíncope, pérdida de conciencia y diferenciales',books:['BIB-021','BIB-012'],terms:['sincope','lipotimia','hipoglucemia','vasovagal'],mustCheck:'Comprobar si hubo pérdida de conciencia y distinguir etiquetas; una posición descrita en la guía no es recomendación vigente.'},
];
export const hashText = text => createHash('sha256').update(text).digest('hex');
const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/(\p{L})-\s+(?=\p{L})/gu,'$1').replace(/\s+/g,' ');

export function canonicalQuestion(value) {
  const n=Number(value?.id?.slice(-3));
  if (!/^EGEL-2026-\d{3}$/.test(value?.id??'') || n<1 || n>469 || !Number.isSafeInteger(value.version) || value.version<1 ||
      typeof value.stem!=='string' || !value.stem.trim() || !Array.isArray(value.options) || value.options.length!==3) throw Error('CANDIDATE_INVALID_QUESTION');
  const options=value.options.map((o,i)=>{
    if(o.letter!==['A','B','C'][i] || typeof o.text!=='string' || !o.text.trim())throw Error('CANDIDATE_INVALID_OPTIONS');
    return {letter:o.letter,text:o.text};
  });
  // Explicit allowlist: never pass answers, notes, original_record or identities.
  return {id:value.id,version:value.version,stem:value.stem,options};
}

export function rankCandidate(plan, source) {
  if (!plan.books.includes(source.catalogId) || source.pdfPage<=15 || source.text.length<200 || source.text.length>8000 ||
      source.textSha256!==hashText(source.text) || !['native','ocr'].includes(source.method) ||
      (source.method==='ocr' && (!Number.isFinite(source.confidence)||source.confidence<75||source.confidence>100))) return 0;
  const text=normalize(source.text);
  if((source.catalogId==='BIB-002'&&source.pdfPage>=326)||(source.catalogId==='BIB-017'&&source.pdfPage>=380))return 0;
  const ranges=plan.ranges?.[source.catalogId];
  if(ranges&&!ranges.some(([first,last])=>source.pdfPage>=first&&source.pdfPage<=last))return 0;
  if (/indice de (?:materias|contenidos)|tabla de contenido/.test(text) || (text.match(/\.{5,}/g)?.length??0)>4) return 0;
  const matches=plan.terms.map(term=>text.includes(normalize(term)));
  // The first term anchors the actual topic instead of matching only generic words.
  if(!matches[0])return 0;
  return matches.filter(Boolean).length*10+Math.min(5,(text.split(normalize(plan.terms[0])).length-1))+Math.max(0,3-plan.books.indexOf(source.catalogId));
}

export function candidatePacket(question, sources, plan) {
  const q=canonicalQuestion(question);
  if(Number(q.id.slice(-3))!==plan.number)throw Error('CANDIDATE_PLAN_MISMATCH');
  const ranked=sources.map(source=>({source,score:rankCandidate(plan,source)})).filter(r=>r.score>0)
    .sort((a,b)=>b.score-a.score || a.source.documentId.localeCompare(b.source.documentId) || a.source.pdfPage-b.source.pdfPage || a.source.ordinal-b.source.ordinal);
  const picked=[];const seen=new Set(),missingRequired=[];
  for(const [book,pages] of Object.entries(plan.requiredPages??{}))for(const page of pages){
    const r=ranked.find(r=>r.source.catalogId===book&&r.source.pdfPage===page);
    if(r){seen.add(`${r.source.documentId}:${page}`);picked.push(r.source);}else missingRequired.push({book,page});
  }
  for(const r of ranked){
    const s=r.source,key=`${s.documentId}:${s.pdfPage}`;
    if(seen.has(key))continue;seen.add(key);picked.push(s);if(picked.length===4)break;
  }
  return {packet:{question:q,evidence:picked.map(s=>({documentId:s.documentId,title:s.title,pdfPage:s.pdfPage,ordinal:s.ordinal,
    text:s.text,textSha256:s.textSha256,reviewed:false}))},review:{questionId:q.id,topic:plan.topic,mustCheck:plan.mustCheck,
    status:!picked.length||missingRequired.length?'missing_evidence':'pending_source_review',method:'lexical_candidates_not_clinical_validation',missingRequired,
    sources:picked.map(s=>({documentId:s.documentId,catalogId:s.catalogId,title:s.title,pdfPage:s.pdfPage,ordinal:s.ordinal,
      textSha256:s.textSha256,method:s.method,confidence:s.confidence??null,localPdf:s.localPdf})),
    humanSourceReview:false,sourceSharingApproved:false,answerGenerated:false}};
}

export function estimateOpenAIReceipt(response) {
  if(response?.model!=='gpt-6.1-sol' || response.status!=='completed' || response.service_tier!=='default' || response.tools?.length)throw Error('COST_UNSUPPORTED_RECEIPT');
  const u=response.usage,write=u?.input_tokens_details?.cache_write_tokens??0,hit=u?.input_tokens_details?.cached_tokens??0;
  for(const n of [u?.input_tokens,u?.output_tokens,write,hit])if(!Number.isSafeInteger(n)||n<0)throw Error('COST_INVALID_USAGE');
  if(write+hit>u.input_tokens || u.input_tokens>272000 || u.total_tokens!==u.input_tokens+u.output_tokens)throw Error('COST_INVALID_USAGE');
  // 2026-10-18 standard list price equivalent, NOT a bill, balance or payment proof.
  return {provider:'openai',model:response.model,input:u.input_tokens,output:u.output_tokens,cacheWrite:write,cacheHit:hit,
    listPriceEquivalentMicroUsd:Math.ceil(((u.input_tokens-write-hit)*20+write*25+hit+u.output_tokens*100)/10),
    billedAmountConfirmed:false,payer:response.billing?.payer??null};
}
