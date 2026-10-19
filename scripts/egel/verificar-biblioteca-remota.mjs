/** Compare trusted Storage size/ETag metadata with each local immutable part.
 * All PDFs and the private report stay outside Git. No credentials printed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),arg=n=>args[args.indexOf(n)+1];
for(const flag of ['--manifest','--objects','--report'])if(!args.includes(flag))throw Error(flag+' required');
const settings=JSON.parse(await fs.readFile(arg('--manifest'),'utf8'));
const objects=JSON.parse(await fs.readFile(arg('--objects'),'utf8'));
const failures=[],verified=[];
for(const doc of settings.documents){
 const file=await fs.open(doc.local_file,'r'),combined=createHash('sha256');let expectedStart=0;
 try{
  for(const part of doc.parts){
   if(part.start_byte!==expectedStart)throw Error('Noncontiguous manifest');
   const data=Buffer.alloc(part.file_bytes),read=await file.read(data,0,data.length,part.start_byte);
   if(read.bytesRead!==data.length)throw Error('Short local file');
   combined.update(data);expectedStart+=data.length;
   const sha=createHash('sha256').update(data).digest('hex'),md5=createHash('md5').update(data).digest('hex');
   const remote=objects.find(x=>x.name===part.object_path);
   const etag=remote?.etag?.replaceAll('"','');
   // Storage uses 16 MiB S3 multipart uploads for larger parts. An ETag with
   // a suffix is MD5(concatenated binary MD5s), not MD5(the whole object).
   const sub=[];for(let offset=0;offset<data.length;offset+=16*1024*1024)sub.push(createHash('md5').update(data.subarray(offset,offset+16*1024*1024)).digest());
   const multipart=createHash('md5').update(Buffer.concat(sub)).digest('hex')+'-'+sub.length;
   const ok=sha===part.sha256&&remote?.file_bytes===part.file_bytes&&(etag===md5||etag===multipart);
   if(!ok)failures.push({document_id:doc.id,ordinal:part.ordinal,reason:'size, SHA-256 or remote ETag mismatch'});
  }
  if(combined.digest('hex')!==doc.id||expectedStart!==doc.file_bytes)throw Error('Reconstruction differs from source PDF hash');
  verified.push({id:doc.id,catalog_id:doc.catalog_id,bytes:doc.file_bytes,parts:doc.parts.length});
 }finally{await file.close();}
}
const expectedParts=settings.documents.reduce((n,d)=>n+d.parts.length,0);
if(objects.length!==expectedParts)failures.push({reason:'Unexpected remote object count'});
const report={checked_at:new Date().toISOString(),documents:verified.length,parts:expectedParts,bytes:verified.reduce((n,d)=>n+d.bytes,0),
 method:'Local full and per-part SHA-256; every remote part size and S3 ETag matched to local MD5; contiguous reconstruction verified.',failures,verified};
const destination=path.resolve(arg('--report'));
if(destination.startsWith(path.resolve('src')+path.sep))throw Error('Report must not be client content');
await fs.writeFile(destination,JSON.stringify(report,null,2));
console.log(JSON.stringify({documents:report.documents,parts:report.parts,bytes:report.bytes,failures:failures.length}));
if(failures.length)process.exitCode=1;
