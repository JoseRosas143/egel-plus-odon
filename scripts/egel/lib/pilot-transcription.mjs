import {createHash} from 'node:crypto';
import {canonicalQuestion,hashText} from './pilot-candidates.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const exact = (value,keys) => value && typeof value==='object' && !Array.isArray(value) &&
  Object.keys(value).length===keys.length && keys.every(k=>Object.hasOwn(value,k));
const validText = (value,max) => typeof value==='string' && value.trim().length>0 && value.length<=max && !value.includes('\0');
const hash = value => typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
const sourceKey = value => `${value.documentId}:${value.pdfPage}:${value.ordinal}`;
const sourceFields=['documentId','title','pdfPage','ordinal','text','textSha256','reviewed'];
const changeFields=['documentId','pdfPage','ordinal','originalTextSha256','text','locator','reason'];

// Offline provenance only. It cannot approve evidence, contact a model or publish a draft.
// Complete explicit replacements, never a global numeric find/replace.
export function prepareTranscription(original,changes) {
  if(!exact(original,['question','evidence']) || !Array.isArray(original.evidence) || !original.evidence.length || original.evidence.length>6 ||
    !Array.isArray(changes) || !changes.length || changes.length>6)throw Error('TRANSCRIPTION_INVALID_INPUT');
  const question=canonicalQuestion(original.question);
  if(!exact(original.question,['id','version','stem','options']) ||
    !original.question.options.every(o=>exact(o,['letter','text'])))throw Error('TRANSCRIPTION_INVALID_QUESTION');
  const sources=new Map();
  for(const e of original.evidence){
    if(!exact(e,sourceFields) || !hash(e.documentId) || !validText(e.title,500) || !Number.isSafeInteger(e.pdfPage) || e.pdfPage<1 ||
      !Number.isSafeInteger(e.ordinal) || e.ordinal<0 || !validText(e.text,8000) || e.textSha256!==hashText(e.text) || typeof e.reviewed!=='boolean' ||
      sources.has(sourceKey(e)))throw Error('TRANSCRIPTION_INVALID_SOURCE');
    sources.set(sourceKey(e),e);
  }
  const selected=new Set(),edits=[];
  const evidence=changes.map(c=>{
    if(!exact(c,changeFields) || !hash(c.documentId) || !hash(c.originalTextSha256) || !Number.isSafeInteger(c.pdfPage) ||
      !Number.isSafeInteger(c.ordinal) || !validText(c.text,8000) || !validText(c.locator,500) || !validText(c.reason,2000))throw Error('TRANSCRIPTION_INVALID_CHANGE');
    const key=sourceKey(c),old=sources.get(key);
    if(!old || selected.has(key) || c.originalTextSha256!==old.textSha256)throw Error('TRANSCRIPTION_STALE_OR_UNKNOWN_SOURCE');
    selected.add(key);
    const textSha256=hashText(c.text);
    edits.push({documentId:old.documentId,pdfPage:old.pdfPage,ordinal:old.ordinal,
      oldTextSha256:old.textSha256,newTextSha256:textSha256,locator:c.locator,reason:c.reason});
    return {...old,text:c.text,textSha256,reviewed:false};
  });
  const packet={question,evidence};
  return {packet,review:{schema:1,questionId:question.id,originalPacketSha256:digest(original),newPacketSha256:digest(packet),
    method:'explicit_transcription_pending_human_approval',humanSourceReview:false,sourceSharingApproved:false,edits,
    omittedSources:original.evidence.filter(e=>!selected.has(sourceKey(e))).map(e=>({documentId:e.documentId,pdfPage:e.pdfPage,ordinal:e.ordinal,textSha256:e.textSha256})),
    answerGenerated:false,automaticPublication:false}};
}
