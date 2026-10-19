import {createHash} from 'node:crypto';
import {canonicalQuestion,hashText} from './pilot-candidates.mjs';

const exact=(v,keys)=>v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).length===keys.length && keys.every(k=>Object.hasOwn(v,k));
const hash=v=>typeof v==='string' && /^[a-f0-9]{64}$/.test(v);
const text=(v,max)=>typeof v==='string' && v.trim().length>0 && v.length<=max && !v.includes('\0');
export const editorialQuestionHash=q=>hashText(JSON.stringify(canonicalQuestion(q)));

// Preparation artifact only, deliberately incompatible with a published DB row.
// No SQL, network, provider calls, student writes or automatic human approval.
export function prepareEditorialBase(input) {
  if(!exact(input,['question','editorial','approval','provenance','evidence']))throw Error('EDITORIAL_INVALID_INPUT');
  const {question:q,editorial:e,approval:a,provenance:p,evidence}=input;
  const question=canonicalQuestion(q);
  if(!exact(q,['id','version','stem','options']) || !q.options.every(o=>exact(o,['letter','text'])))throw Error('EDITORIAL_INVALID_QUESTION');
  if(!exact(e,['markdown','sha256']) || !text(e.markdown,30000) || e.markdown.length<100 || e.sha256!==hashText(e.markdown))throw Error('EDITORIAL_BODY_CHANGED');
  if(!exact(a,['humanApproved','scope','approvedAt','bodySha256','questionSha256','evidenceSha256','provenanceSha256','recordedVia']) ||
    a.humanApproved!==true || a.scope!=='prepare-shared-explanation-only' || a.recordedVia!=='direct-user-chat' ||
    !text(a.approvedAt,40) || !Number.isFinite(Date.parse(a.approvedAt)) || a.bodySha256!==e.sha256 || a.questionSha256!==editorialQuestionHash(q))throw Error('EDITORIAL_APPROVAL_REQUIRED');
  if(!exact(p,['provider','model','promptVersion','runFingerprint','draftMarkdownSha256']) || p.provider!=='deepseek' || p.model!=='deepseek-flash' ||
    p.promptVersion!=='literature-draft-v2' || !hash(p.runFingerprint) || !hash(p.draftMarkdownSha256) ||
    a.provenanceSha256!==hashText(JSON.stringify(p)))throw Error('EDITORIAL_PROVENANCE_INVALID');
  if(!Array.isArray(evidence) || !evidence.length || evidence.length>6 || a.evidenceSha256!==hashText(JSON.stringify(evidence)))throw Error('EDITORIAL_EVIDENCE_CHANGED');
  const seen=new Set();
  const sources=evidence.map((s,i)=>{
    if(!exact(s,['documentId','title','pdfPage','ordinal','text','textSha256','reviewed']) || !hash(s.documentId) || !text(s.title,500) ||
      !Number.isSafeInteger(s.pdfPage) || s.pdfPage<1 || !Number.isSafeInteger(s.ordinal) || s.ordinal<0 ||
      !text(s.text,8000) || s.textSha256!==hashText(s.text) || s.reviewed!==true)throw Error('EDITORIAL_EVIDENCE_INVALID');
    const key=`${s.documentId}:${s.pdfPage}:${s.ordinal}`;
    if(seen.has(key))throw Error('EDITORIAL_EVIDENCE_INVALID');seen.add(key);
    return {sourceId:`S${i+1}`,kind:'reviewed-transcription',documentId:s.documentId,title:s.title,pdfPage:s.pdfPage,
      localOrdinal:s.ordinal,text:s.text,textSha256:s.textSha256};
  });
  const cited=new Set([...e.markdown.matchAll(/\[(S\d+)\]/g)].map(m=>m[1]));
  if(!cited.size || [...cited].some(id=>!sources.some(s=>s.sourceId===id)))throw Error('EDITORIAL_CITATION_INVALID');
  const payload={schema:'shared-editorial-preparation-v1',question,editorial:{...e},approval:{...a},
    provenance:{...p,editorialRevision:true},sources,
    contentApproval:'human-approved-for-preparation',publicationState:'local-only-not-published',
    // The native Gemini/chunk-only schema must NOT be bypassed or silently relaxed.
    cloudCompatible:false,automaticPublication:false,officialAnswerKey:false,clinicalValidation:false,
    requirements:['Register reviewed transcriptions with backend-only provenance and freshness checks.',
      'Support DeepSeek plus editorial revision explicitly in the shared schema and reader.',
      'Map the human approval to a verified reviewer before any publication.',
      'Revalidate the current question, source hashes and RLS before publishing.']};
  return {...payload,preparationSha256:createHash('sha256').update(JSON.stringify(payload)).digest('hex')};
}
