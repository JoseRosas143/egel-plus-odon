import test from 'node:test';
import assert from 'node:assert/strict';
import {hashText} from './lib/pilot-candidates.mjs';
import {prepareTranscription} from './lib/pilot-transcription.mjs';
import {loadDeepSeekPilot} from './lib/load-deepseek-pilot.mjs';

// Fictional numbers for structural tests, not medical evidence or a proposed answer.
const oldText='Synthetic OCR: 8.25 in both locations.';
const source={documentId:'a'.repeat(64),title:'Offline synthetic document',pdfPage:64,ordinal:0,text:oldText,textSha256:hashText(oldText),reviewed:true};
const original={question:{id:'EGEL-2026-034',version:1,stem:'Synthetic question with missing volume.',options:['A','B','C'].map(letter=>({letter,text:'Option '+letter}))},evidence:[source,{...source,pdfPage:68}]};
const change={documentId:source.documentId,pdfPage:64,ordinal:0,originalTextSha256:source.textSha256,
  text:'Synthetic table: 8.2. Synthetic prose: 8.25. Preserve the disagreement.',locator:'Synthetic table and prose',reason:'Explicit visual transcription, not a clinical correction.'};

test('transcription preserves distinct values and question without mutating originals',()=>{
  const before=structuredClone(original),r=prepareTranscription(original,[change]);assert.deepEqual(original,before);
  assert.equal(r.packet.evidence[0].text,change.text);assert.equal(r.packet.evidence[0].textSha256,hashText(change.text));
  assert.deepEqual(r.packet.question,original.question);assert.notEqual(r.review.originalPacketSha256,r.review.newPacketSha256);
  assert.equal(r.review.edits[0].oldTextSha256,source.textSha256);assert.equal(r.review.edits[0].newTextSha256,hashText(change.text));
  assert.equal(r.review.omittedSources[0].pdfPage,68);
  assert.deepEqual(prepareTranscription({...original,question:{options:original.question.options,stem:original.question.stem,version:1,id:original.question.id}},[change]).packet.question,original.question);
});
test('even previously approved evidence becomes pending after transcription',async()=>{
  const r=prepareTranscription(original,[change]);assert.equal(r.packet.evidence[0].reviewed,false);assert.equal(r.review.humanSourceReview,false);
  assert.equal(r.review.sourceSharingApproved,false);assert.equal(r.review.answerGenerated,false);assert.equal(r.review.automaticPublication,false);
  const {adapter}=await loadDeepSeekPilot();assert.throws(()=>adapter.prepareDeepSeek(r.packet),/PILOT_EVIDENCE_NOT_READY/);
});
test('stale source hashes, new pages and repeated replacements fail closed',()=>{
  for(const c of [{...change,originalTextSha256:'b'.repeat(64)},{...change,pdfPage:70},{...change,documentId:'b'.repeat(64)}])
    assert.throws(()=>prepareTranscription(original,[c]),/TRANSCRIPTION_STALE_OR_UNKNOWN_SOURCE/);
  assert.throws(()=>prepareTranscription(original,[change,change]),/TRANSCRIPTION_STALE_OR_UNKNOWN_SOURCE/);
});
test('untracked identities, approvals and invalid text cannot enter transcription artifacts',()=>{
  for(const c of [{...change,reviewed:true},{...change,text:''},{...change,text:'x'.repeat(8001)},{...change,reason:''},{...change,text:'x\0y'}])
    assert.throws(()=>prepareTranscription(original,[c]),/TRANSCRIPTION_INVALID_CHANGE/);
  assert.throws(()=>prepareTranscription({...original,user_id:'PRIVATE'},[change]),/TRANSCRIPTION_INVALID_INPUT/);
  assert.throws(()=>prepareTranscription({...original,question:{...original.question,selected_answer:'C'}},[change]),/TRANSCRIPTION_INVALID_QUESTION/);
  assert.throws(()=>prepareTranscription({...original,evidence:[{...source,text:'tampered'}]},[change]),/TRANSCRIPTION_INVALID_SOURCE/);
});
test('separately approved corrected input has a new stable request fingerprint',async()=>{
  const {adapter}=await loadDeepSeekPilot(),r=prepareTranscription(original,[change]);
  const approved={...r.packet,evidence:r.packet.evidence.map(e=>({...e,reviewed:true}))};
  assert.notEqual(adapter.prepareDeepSeek(original).fingerprint,adapter.prepareDeepSeek(approved).fingerprint);
  assert.equal(adapter.prepareDeepSeek(approved).fingerprint,adapter.prepareDeepSeek(structuredClone(approved)).fingerprint);
});
