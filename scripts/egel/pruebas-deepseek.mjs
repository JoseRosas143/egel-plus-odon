// Offline only. Actual installed AI SDK + DeepSeek provider, intercepted HTTP transport.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {loadDeepSeekPilot,repository} from './lib/load-deepseek-pilot.mjs';
const {budget:b,adapter:a} = await loadDeepSeekPilot();
const sha = text=>createHash('sha256').update(text).digest('hex');
const source = 'Offline structural evidence; NOT clinical guidance.';
const input = {question:{id:'EGEL-2026-034',version:1,stem:'Offline structural question.',options:['A','B','C'].map(letter=>({letter,text:'Option '+letter}))},
  evidence:[{documentId:'a'.repeat(64),title:'Offline source',pdfPage:64,ordinal:0,text:source,textSha256:sha(source),reviewed:true}]};
const output = {state:'propuesta',answer:'C',markdown:'Offline structural fixture. This text is not a clinical explanation or an approved answer. '.repeat(2)+'[S1]',citations:['S1']};
function response(patch={}) {return {id:'offline-only',object:'chat.completion',created:1792350000,model:'deepseek-flash',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(output),reasoning_content:'PRIVATE REASONING MUST NOT BE SAVED'}}],
  usage:{prompt_tokens:6000,completion_tokens:1500,total_tokens:7500,prompt_cache_hit_tokens:1000,prompt_cache_miss_tokens:5000,completion_tokens_details:{reasoning_tokens:500}},...patch};}
async function temporary(action,prior=0) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'egel-deepseek-test-'));
  const oldKey=process.env.DEEPSEEK_API_KEY,oldEnabled=process.env.EGEL_DEEPSEEK_PILOT_ENABLED,oldVercel=process.env.VERCEL;
  process.env.DEEPSEEK_API_KEY='OFFLINE-FAKE-KEY-NEVER-TRANSMITTED';process.env.EGEL_DEEPSEEK_PILOT_ENABLED='true';delete process.env.VERCEL;
  try {await b.initializeBudget(dir,prior);await action(dir);} finally {
    for(const [key,value] of [['DEEPSEEK_API_KEY',oldKey],['EGEL_DEEPSEEK_PILOT_ENABLED',oldEnabled],['VERCEL',oldVercel]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    // Exact mkdtemp directory and its own known generated files only; no recursive deletion.
    for(const name of await fs.readdir(dir))await fs.unlink(path.join(dir,name));await fs.rmdir(dir);
  }
}
test('peak accounting includes reasoning once and ignores cache discounts',()=>{
  const u=b.priceUsage(response().usage);assert.equal(u.microUsd,3600);assert.equal(u.reasoning,500);assert.equal(u.output,1500);
  assert.equal(b.RESERVATION,604916);
});
for(const patch of [{prompt_tokens:undefined},{completion_tokens:-1},{completion_tokens:4097},{total_tokens:1},{prompt_cache_miss_tokens:12},{completion_tokens_details:{reasoning_tokens:1501}}])
 test('invalid billing fails closed '+JSON.stringify(patch),()=>assert.throws(()=>b.priceUsage({...response().usage,...patch}),/PILOT_USAGE_UNKNOWN/));
test('preparation rejects student data, model overrides and wrong source hashes',()=>{
  for(const value of [{...input,user_id:'private'},{...input,model:'expensive'},{...input,question:{...input.question,selected_answer:'C'}},
    {...input,evidence:[{...input.evidence[0],reviewed:false}]},{...input,evidence:[{...input.evidence[0],text:'changed'}]},
    {...input,evidence:[input.evidence[0],input.evidence[0]]},{...input,evidence:[]}])assert.throws(()=>a.prepareDeepSeek(value),/PILOT_/);
});
test('question, source and prompt changes get distinct stable fingerprints',()=>{
  const first=a.prepareDeepSeek(input);assert.equal(first.fingerprint,a.prepareDeepSeek(structuredClone(input)).fingerprint);
  assert.notEqual(first.fingerprint,a.prepareDeepSeek({...input,question:{...input.question,version:2}}).fingerprint);
  assert.notEqual(first.fingerprint,a.prepareDeepSeek({...input,evidence:[{...input.evidence[0],pdfPage:65}]}).fingerprint);
});
test('draft only, source metadata comes from evidence, never model-supplied pages',()=>{
  const d=a.parseDeepSeekDraft(output,input,'deepseek-flash');assert.equal(d.validation,'pending_human_review');assert.equal(d.citations[0].pdfPage,64);assert(!JSON.stringify(d).includes(source));
  for(const patch of [{citations:['S6']},{citations:['S1','S1']},{markdown:output.markdown+' [S2]'},{markdown:output.markdown+' https://fake.invalid'},
    {state:'abstencion',answer:'C'},{citations:[]},{page:100}])assert.throws(()=>a.parseDeepSeekDraft({...output,...patch},input,'deepseek-flash'),/PILOT_/);
  assert.throws(()=>a.parseDeepSeekDraft(output,input,'deepseek-v4-pro'),/PILOT_/);
  assert.equal(a.parseDeepSeekDraft({state:'abstencion',answer:null,markdown:'Insufficient coverage. '.repeat(6),citations:[]},input,'deepseek-flash').answer,null);
});
test('actual SDK request constrained; reservation is durable before HTTP; restart reuses draft',()=>temporary(async dir=>{
  let calls=0;
  const transport=async(url,init)=>{
    calls++;assert.equal(String(url),'https://api.deepseek.com/chat/completions');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');
    const payload=JSON.parse(init.body);assert.equal(payload.model,'deepseek-flash');assert.equal(payload.max_tokens,4096);assert.equal(payload.response_format.type,'json_object');
    assert.equal(payload.thinking.type,'enabled');assert.equal(payload.reasoning_effort,'low');assert.equal(payload.tools,undefined);assert.equal(payload.messages.length,3);
    assert.equal(a.DEEPSEEK_PROMPT_VERSION,'literature-draft-v2');
    assert.match(payload.messages[1].content,/Separa datos literales/);
    assert.match(payload.messages[1].content,/volumen de un cartucho/);
    assert.match(payload.messages[1].content,/no las unifiques/);
    assert.match(payload.messages[1].content,/edición histórica/);
    assert.equal((await b.readBudget(dir)).runs[0].state,'reserved');
    return Response.json(response());
  };
  const result=await a.runDeepSeekPilot(dir,input,transport);assert.equal(calls,1);assert.equal(result.usage.microUsd,3600);assert.equal(result.result.validation,'pending_human_review');
  const restarted=await loadDeepSeekPilot();assert((await restarted.adapter.runDeepSeekPilot(dir,input,transport)).reused);assert.equal(calls,1);
  const saved=await fs.readFile(path.join(dir,'budget.json'),'utf8');assert(!saved.includes('PRIVATE REASONING'));assert(!saved.includes('OFFLINE-FAKE-KEY'));assert(!saved.includes(source));
  assert.equal((await b.budgetStatus(dir)).chargedMicroUsd,3600);
}));
test('US$1 includes explicit previous provider spend and blocks before dispatch',()=>temporary(async dir=>{
  let calls=0;await assert.rejects(()=>a.runDeepSeekPilot(dir,input,async()=>{calls++;return Response.json(response());}),/PILOT_BUDGET_LIMIT/);assert.equal(calls,0);
},500000));
test('concurrent attempts cannot both dispatch',()=>temporary(async dir=>{
  let release,entered;const pending=new Promise(r=>release=r),started=new Promise(r=>entered=r);let calls=0;
  const first=a.runDeepSeekPilot(dir,input,async()=>{calls++;entered();await pending;return Response.json(response());});
  await started;await assert.rejects(()=>a.runDeepSeekPilot(dir,input,async()=>{calls++;return Response.json(response());}),/PILOT_BUSY_OR_UNINITIALIZED/);
  release();await first;assert.equal(calls,1);
}));
for(const failure of ['timeout','429','malformed','missing-usage','other-model'])test('uncertain '+failure+' retains reservation, redacts error, blocks every retry',()=>temporary(async dir=>{
  let calls=0;
  const transport=async()=>{calls++;if(failure==='timeout')throw Error('PRIVATE upstream credential');if(failure==='429')return Response.json({error:{message:'PRIVATE'}},{status:429});
    if(failure==='malformed')return new Response('PRIVATE malformed');
    if(failure==='other-model')return Response.json(response({model:'deepseek-v4-pro'}));return Response.json(response({usage:undefined}));};
  await assert.rejects(()=>a.runDeepSeekPilot(dir,input,transport),e=>e.message==='PILOT_RECONCILIATION_REQUIRED');assert.equal(calls,1);
  await assert.rejects(()=>a.runDeepSeekPilot(dir,input,transport),/PILOT_NO_AUTOMATIC_RETRY/);
  await assert.rejects(()=>a.runDeepSeekPilot(dir,{...input,question:{...input.question,version:2}},transport),/PILOT_RECONCILIATION_REQUIRED/);assert.equal(calls,1);
  const status=await b.budgetStatus(dir);assert(status.blockedByUnknown);assert.equal(status.chargedMicroUsd,b.RESERVATION);
}));
for(const failure of ['bad-json','bad-citations','truncated'])test('known usage '+failure+' is charged even when output is withheld',()=>temporary(async dir=>{
  let calls=0;const result=response();
  if(failure==='truncated')result.choices[0].finish_reason='length';
  else result.choices[0].message.content=failure==='bad-json'?'INVALID JSON':JSON.stringify({...output,citations:['S6']});
  await assert.rejects(()=>a.runDeepSeekPilot(dir,input,async()=>{calls++;return Response.json(result);}),/PILOT_OUTPUT_WITHHELD/);
  assert.equal(calls,1);assert.equal((await b.budgetStatus(dir)).chargedMicroUsd,3600);assert.equal((await b.readBudget(dir)).runs[0].state,'invalid');
}));
test('disabled, hosted and missing credentials never dispatch',()=>temporary(async dir=>{
  let calls=0;const transport=async()=>{calls++;return Response.json(response());};
  delete process.env.EGEL_DEEPSEEK_PILOT_ENABLED;await assert.rejects(()=>a.runDeepSeekPilot(dir,input,transport),/PILOT_DISABLED/);
  process.env.EGEL_DEEPSEEK_PILOT_ENABLED='true';process.env.VERCEL='1';await assert.rejects(()=>a.runDeepSeekPilot(dir,input,transport),/PILOT_DISABLED/);
  delete process.env.VERCEL;delete process.env.DEEPSEEK_API_KEY;await assert.rejects(()=>a.runDeepSeekPilot(dir,input,transport),/PILOT_DISABLED/);assert.equal(calls,0);
}));
test('missing, corrupt, stale reservation and existing initialization fail closed',()=>temporary(async dir=>{
  await assert.rejects(()=>b.initializeBudget(dir,0));
  const ledger=await b.readBudget(dir);ledger.runs.push({fingerprint:'a'.repeat(64),state:'reserved',charge:b.RESERVATION});
  await fs.writeFile(path.join(dir,'budget.json'),JSON.stringify(ledger));
  await assert.rejects(()=>b.runBudgeted(dir,'b'.repeat(64),async()=>{throw Error('MUST NOT RUN');}),/PILOT_RECONCILIATION_REQUIRED/);
  await fs.writeFile(path.join(dir,'budget.json'),'{}');await assert.rejects(()=>b.readBudget(dir),/PILOT_BUDGET_UNAVAILABLE/);
  await fs.unlink(path.join(dir,'budget.json'));await assert.rejects(()=>b.readBudget(dir),/PILOT_BUDGET_UNAVAILABLE/);
}));
test('operator help and malformed args do not load env or make API calls',()=>{
  const help=spawnSync(process.execPath,['scripts/egel/deepseek-piloto.mjs','--help'],{cwd:repository,encoding:'utf8'});assert.equal(help.status,0);assert.match(help.stdout,/Sin generación por defecto/);
  const bad=spawnSync(process.execPath,['scripts/egel/deepseek-piloto.mjs','--execute=anything'],{cwd:repository,encoding:'utf8'});assert.equal(bad.status,1);assert.match(bad.stderr,/PILOT_INVALID_ARGUMENTS/);
});
test('stale tariff blocks new generations but does not erase completed drafts',()=>temporary(async dir=>{
  const savedKey=sha('completed-before-expiry');
  await b.runBudgeted(dir,savedKey,async()=>({usage:b.priceUsage(response().usage),result:{draft:true}}));
  const now=Date.now;Date.now=()=>Date.parse(b.PRICE_EXPIRES)+1;
  try {
    assert((await b.runBudgeted(dir,savedKey,async()=>{throw Error('MUST NOT RUN');})).reused);
    await assert.rejects(()=>b.runBudgeted(dir,'a'.repeat(64),async()=>{throw Error('MUST NOT RUN');}),/PILOT_PRICE_REVIEW_REQUIRED/);
  }
  finally {Date.now=now;}
  assert.equal((await b.budgetStatus(dir)).calls,1);
}));
test('ten lifetime calls maximum, no reset between operator invocations',()=>temporary(async dir=>{
  const usage=b.priceUsage(response().usage);let calls=0;
  for(let i=0;i<10;i++)await b.runBudgeted(dir,sha('request '+i),async()=>{calls++;return {usage,result:{draft:true}};});
  const restarted=await loadDeepSeekPilot();
  await assert.rejects(()=>restarted.budget.runBudgeted(dir,sha('eleventh'),async()=>{calls++;return {usage,result:{draft:true}};}),/PILOT_BUDGET_LIMIT/);
  assert.equal(calls,10);assert.equal((await b.budgetStatus(dir)).calls,10);
}));
test('CLI plan validates a private packet without a key or budget creation',()=>temporary(async dir=>{
  const packet=path.join(dir,'packet.json');await fs.writeFile(packet,JSON.stringify(input));
  try {
    const command=spawnSync(process.execPath,['scripts/egel/deepseek-piloto.mjs','--plan='+packet],{cwd:repository,encoding:'utf8',env:{...process.env,DEEPSEEK_API_KEY:''}});
    assert.equal(command.status,0,command.stderr);const plan=JSON.parse(command.stdout);assert.equal(plan.networkCalls,0);assert.equal(plan.questionId,'EGEL-2026-034');
    assert(!command.stdout.includes(source));assert.equal((await b.budgetStatus(dir)).calls,0);
  } finally {await fs.unlink(packet);}
}));
test('malformed adapter accounting cannot release a reservation',()=>temporary(async dir=>{
  const usage=b.priceUsage(response().usage);
  await assert.rejects(()=>b.runBudgeted(dir,sha('bad usage'),async()=>({usage:{...usage,microUsd:0},result:{draft:true}})),/PILOT_USAGE_UNKNOWN/);
  assert((await b.budgetStatus(dir)).blockedByUnknown);assert.equal((await b.budgetStatus(dir)).chargedMicroUsd,b.RESERVATION);
}));
