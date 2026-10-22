import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildDraftImport,hashBytes} from './draft-import.mjs';

const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const inside=(parent,child)=>{const r=path.relative(parent,child);return !r||(!r.startsWith('..'+path.sep)&&!path.isAbsolute(r));};
const validHash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const fail=code=>{throw Error(code);};
async function regularFile(file,max){
  const stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max||stat.size===0)fail('DRAFT_INVALID_LOCAL_FILE');
  const real=await fs.realpath(file);
  if(inside(await fs.realpath(repository),real))fail('DRAFT_PRIVATE_PATH_REQUIRED');
  const bytes=await fs.readFile(real);
  if(bytes.length>max)fail('DRAFT_INVALID_LOCAL_FILE');
  return {real,bytes};
}
export async function loadDraftImport(manifestPath){
  const source=await regularFile(manifestPath,250000);let manifest;
  try{manifest=JSON.parse(source.bytes.toString('utf8'));}catch{fail('DRAFT_MANIFEST_JSON');}
  if(!exact(manifest,['schema','bankSnapshot','files','protectedQuestionIds'])||manifest.schema!=='egel-draft-import-manifest-v1'||
    !Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>100||!Array.isArray(manifest.protectedQuestionIds))fail('DRAFT_MANIFEST_SCHEMA');
  const folder=path.dirname(source.real),read=async(spec,max)=>{
    if(!exact(spec,['path','sha256'])||typeof spec.path!=='string'||!spec.path.trim()||!validHash(spec.sha256))fail('DRAFT_MANIFEST_SCHEMA');
    const file=await regularFile(path.resolve(folder,spec.path),max);
    if(hashBytes(file.bytes)!==spec.sha256)fail('DRAFT_SOURCE_CHANGED');
    return file;
  };
  const bank=await read(manifest.bankSnapshot,5000000),files=[];let size=0;
  for(const spec of manifest.files){const file=await read(spec,2000000);size+=file.bytes.length;if(size>20000000)fail('DRAFT_BATCH_TOO_LARGE');files.push({...file,name:path.basename(file.real)});}
  const batch=buildDraftImport({bankBytes:bank.bytes,files:files.map(({name,bytes})=>({name,bytes})),protectedIds:manifest.protectedQuestionIds});
  return {batch,bank,files,manifestPath:source.real,manifestSha256:hashBytes(source.bytes)};
}

const serialize=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
function report(batch){const s=batch.summary,c=s.counts;
  return `# Borradores EGEL importados localmente\n\nLote ${batch.batchId}. Todos pendientes de validación; no publicados ni visibles para alumnos.\n\n`+
    `| Estado | Cantidad |\n|---|---:|\n| Registros conservados | ${c.records} |\n| Propuestas con letra | ${c.proposals} |\n| Abstenciones completas | ${c.abstentions} |\n| Vinculados al snapshot del banco | ${c.matched} |\n| Necesitan conciliación textual | ${c.reconciliation} |\n| En cola de revisión | ${c.pendingReview} |\n| Bloqueados para revisión | ${c.blocked} |\n| Base existente protegida | ${c.protected} |\n\n`+
    `Los tres últimos estados de cola son excluyentes y suman los registros del lote. Ningún estado implica aprobación clínica o bibliográfica.\n\n`+
    `Conciliación: ${s.reconciliationNumbers.join(', ')||'ninguna'}.\n\nBloqueados: ${s.blockedNumbers.join(', ')||'ninguno'}.\n\nProtegidos: ${s.protectedNumbers.join(', ')||'ninguno'}.\n\n`+
    `## Motivos de bloqueo (pueden coincidir en un registro)\n\n${Object.entries(s.reasons).map(([reason,count])=>'- '+reason+': '+count).join('\n')||'Ninguno adicional.'}\n\n`+
    `## Límites\n\nLos ID y versiones vinculados proceden del snapshot archivado, no de una consulta en vivo. Se exige cotejo nuevo antes de cualquier publicación futura. Las referencias y sus páginas siguen sin verificar: solo se adaptó su formato. No se promovieron afirmaciones del exportador a hechos verificados.\n\n`+
    `Se preservan originales y abstenciones. No se cambiaron datos del alumno ni bases compartidas; no hay llamadas de IA, importación a Supabase, aprobación ni publicación.\n`;
}
function artifacts(input){
  const {batch}=input;
  const files=new Map([
    ['manifest.json',serialize({...batch.manifest,batchId:batch.batchId,inputManifestSha256:input.manifestSha256})],
    ['bank.snapshot.json',input.bank.bytes],
    ['drafts.json',serialize({schema:'egel-private-quarantine-v1',batchId:batch.batchId,publicationAllowed:false,entries:batch.entries})],
    ['summary.json',serialize(batch.summary)],['RESUMEN.md',Buffer.from(report(batch))],
  ]);
  input.files.forEach((file,i)=>files.set(`originales/${String(i+1).padStart(3,'0')}-${file.name}`,file.bytes));
  return files;
}
export async function writeDraftImport(input,outputRoot){
  const resolved=await fs.realpath(outputRoot),repo=await fs.realpath(repository),stat=await fs.lstat(outputRoot);
  if(!stat.isDirectory()||stat.isSymbolicLink()||resolved===path.parse(resolved).root||inside(repo,resolved)||inside(resolved,repo)||
    [input.manifestPath,input.bank.real,...input.files.map(f=>f.real)].some(p=>inside(path.dirname(p),resolved)||inside(resolved,p)))fail('DRAFT_PRIVATE_OUTPUT_REQUIRED');
  const destination=path.join(resolved,'batch-'+input.batch.batchId),files=artifacts(input);
  let reused=false;
  try{await fs.mkdir(destination,{mode:0o700});}
  catch(e){if(e.code!=='EEXIST')throw e;reused=true;}
  if(reused){
    try{
      if((await fs.lstat(destination)).isSymbolicLink())fail('DRAFT_EXISTING_BATCH_DIFFERS');
      if((await fs.lstat(path.join(destination,'originales'))).isSymbolicLink()||
        !inside(resolved,await fs.realpath(destination)))fail('DRAFT_EXISTING_BATCH_DIFFERS');
      const receiptPath=path.join(destination,'complete.json');
      if(!(await fs.lstat(receiptPath)).isFile()||(await fs.lstat(receiptPath)).isSymbolicLink())fail('DRAFT_EXISTING_BATCH_DIFFERS');
      const receipt=JSON.parse(await fs.readFile(receiptPath,'utf8'));
      if(receipt.schema!=='egel-private-complete-v1'||receipt.batchId!==input.batch.batchId||
        !receipt.files||Object.keys(receipt.files).length!==files.size)fail('DRAFT_EXISTING_BATCH_DIFFERS');
      for(const [name,bytes]of files){
        const target=path.join(destination,name),info=await fs.lstat(target);
        if(!info.isFile()||info.isSymbolicLink()||!inside(destination,await fs.realpath(target))||info.size!==bytes.length||receipt.files[name]!==hashBytes(bytes)||
          hashBytes(await fs.readFile(target))!==hashBytes(bytes))fail('DRAFT_EXISTING_BATCH_DIFFERS');
      }
    }catch{fail('DRAFT_EXISTING_BATCH_DIFFERS');}
  }else{
    // The directory is an exclusive reservation. Never repair or overwrite an
    // incomplete prior run. complete.json is the durable commit marker, last.
    await fs.mkdir(path.join(destination,'originales'),{mode:0o700});
    const checksums={};
    for(const [name,bytes]of files){const file=await fs.open(path.join(destination,name),'wx',0o600);
      try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}checksums[name]=hashBytes(bytes);}
    const receipt=await fs.open(path.join(destination,'complete.json'),'wx',0o600);
    try{await receipt.writeFile(serialize({schema:'egel-private-complete-v1',batchId:input.batch.batchId,createdAt:new Date().toISOString(),
      files:checksums,publicationAllowed:false,newModelCalls:0,cloudWrites:0}));await receipt.sync();}finally{await receipt.close();}
  }
  return {mode:'local-private-import',batchId:input.batch.batchId,destination,reused,summary:input.batch.summary,
    publicationAllowed:false,newModelCalls:0,cloudWrites:0};
}
