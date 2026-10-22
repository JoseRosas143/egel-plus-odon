import fs from 'node:fs/promises';
import path from 'node:path';
import {loadDraftImport} from './draft-import-storage.mjs';
import {hashBytes} from './draft-import.mjs';
import {buildImportedEditorialPreparations,validateImportedEditorialBatch} from './imported-editorial.mjs';

const repo=path.resolve(import.meta.dirname,'../../..');
const inside=(parent,child)=>{const r=path.relative(parent,child);return !r||!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const fail=code=>{throw Error(code);};
const serialize=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
async function readPrivate(file,max){
 const info=await fs.lstat(file),real=await fs.realpath(file);
 if(!info.isFile()||info.isSymbolicLink()||info.size<1||info.size>max||inside(await fs.realpath(repo),real))fail('IMPORTED_PRIVATE_INPUT_REQUIRED');
 const bytes=await fs.readFile(real);if(bytes.length>max)fail('IMPORTED_PRIVATE_INPUT_REQUIRED');
 return {real,bytes};
}
export async function loadImportedEditorial(manifestFile){
 const manifest=await readPrivate(manifestFile,25000);let m;
 try{m=JSON.parse(manifest.bytes);}catch{fail('IMPORTED_MANIFEST_SCHEMA');}
 if(!exact(m,['schema','draftImportManifest','reviewPacket','decision','numbers'])||m.schema!=='egel-imported-editorial-manifest-v1')fail('IMPORTED_MANIFEST_SCHEMA');
 const read=async spec=>{
   if(!exact(spec,['path','sha256'])||typeof spec.path!=='string'||!spec.path.trim()||typeof spec.sha256!=='string'||!/^[a-f0-9]{64}$/.test(spec.sha256))fail('IMPORTED_MANIFEST_SCHEMA');
   const value=await readPrivate(path.resolve(path.dirname(manifest.real),spec.path),5000000);
   if(hashBytes(value.bytes)!==spec.sha256)fail('IMPORTED_SOURCE_CHANGED');return value;
 };
 const draft=await read(m.draftImportManifest),review=await read(m.reviewPacket),decision=await read(m.decision);
 const loaded=await loadDraftImport(draft.real),packet=JSON.parse(review.bytes),receipt=JSON.parse(decision.bytes);
 const prepared=buildImportedEditorialPreparations({batch:loaded.batch,packet,decision:receipt,
   bindings:{packetSha256:packet.packetSha256,decisionSha256:hashBytes(JSON.stringify(receipt))},numbers:m.numbers});
 return {prepared,inputManifestSha256:hashBytes(manifest.bytes),
   privateInputs:[manifest.real,draft.real,review.real,decision.real,loaded.bank.real,...loaded.files.map(f=>f.real)]};
}
function artifacts(input){
 return new Map([['preparaciones.json',serialize(input.prepared)],
   ['manifest.json',serialize({schema:'egel-private-editorial-input-receipt-v1',inputManifestSha256:input.inputManifestSha256,
     preparationBatchSha256:input.prepared.preparationBatchSha256,publicationAllowed:false})]]);
}
export async function writeImportedEditorial(input,outputRoot){
 validateImportedEditorialBatch(input.prepared);
 const info=await fs.lstat(outputRoot),resolved=await fs.realpath(outputRoot),repository=await fs.realpath(repo);
 if(!info.isDirectory()||info.isSymbolicLink()||resolved===path.parse(resolved).root||inside(repository,resolved)||inside(resolved,repository)||
   input.privateInputs.some(p=>inside(path.dirname(p),resolved)||inside(resolved,p)))fail('IMPORTED_PRIVATE_OUTPUT_REQUIRED');
 const files=artifacts(input),destination=path.join(resolved,'editorial-'+input.prepared.preparationBatchSha256);
 let reused=false;try{await fs.mkdir(destination,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;reused=true;}
 if(reused){
   try{
     if((await fs.lstat(destination)).isSymbolicLink()||!inside(resolved,await fs.realpath(destination)))fail('IMPORTED_EXISTING_DIFFERS');
     const marker=path.join(destination,'complete.json'),s=await fs.lstat(marker);
     if(!s.isFile()||s.isSymbolicLink())fail('IMPORTED_EXISTING_DIFFERS');
     const receipt=JSON.parse(await fs.readFile(marker,'utf8'));
     if(!exact(receipt,['schema','preparationBatchSha256','files','publicationAllowed'])||receipt.schema!=='egel-private-editorial-complete-v1'||
       receipt.preparationBatchSha256!==input.prepared.preparationBatchSha256||receipt.publicationAllowed!==false||Object.keys(receipt.files).length!==files.size)fail('IMPORTED_EXISTING_DIFFERS');
     for(const [name,bytes]of files){const file=path.join(destination,name),stat=await fs.lstat(file);
       if(!stat.isFile()||stat.isSymbolicLink()||!inside(destination,await fs.realpath(file))||receipt.files[name]!==hashBytes(bytes)||
         !(await fs.readFile(file)).equals(bytes))fail('IMPORTED_EXISTING_DIFFERS');}
   }catch{fail('IMPORTED_EXISTING_DIFFERS');}
 }else{
   const hashes={};
   for(const [name,bytes]of files){const file=await fs.open(path.join(destination,name),'wx',0o600);
     try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}hashes[name]=hashBytes(bytes);}
   const file=await fs.open(path.join(destination,'complete.json'),'wx',0o600);
   try{await file.writeFile(serialize({schema:'egel-private-editorial-complete-v1',preparationBatchSha256:input.prepared.preparationBatchSha256,files:hashes,publicationAllowed:false}));await file.sync();}finally{await file.close();}
 }
 return {mode:'local-editorial-preparation',destination,reused,numbers:input.prepared.numbers,publicationAllowed:false,cloudWrites:0,paidModelCalls:0,studentWrites:0};
}
