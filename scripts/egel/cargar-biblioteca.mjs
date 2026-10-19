/** Operator tool: private files/credentials and resumable state outside Git.
 * No model calls. Source PDFs are read-only. Run --prepare, deploy the generated
 * short-lived bridge with MCP, then --upload. No account/CLI token extraction.
 */
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2), option=name=>args[args.indexOf(name)+1];
const collection=path.resolve(option('--collection')||''), output=path.resolve(option('--output')||'');
if(!args.includes('--collection')||!args.includes('--output')||!path.relative(root,output).startsWith('..')) throw Error('Use --collection and an --output outside the checkout');
const project='zbfgcfajiwhfhewkstvi', functionName='egel-library-import-20261016';
const endpoint=`https://${project}.supabase.co/functions/v1/${functionName}`;
const bucket='egel-library-private', storageOrigin=`https://${project}.storage.supabase.co`;
const privateFile=path.join(output,'operator-multipart.json');
const hash=async file=>{const h=createHash('sha256');for await(const part of createReadStream(file))h.update(part);return h.digest('hex');};
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
await fs.mkdir(output,{recursive:true});
if(args.includes('--refresh-template')) {
  const settings=await read(privateFile);
  for(const doc of settings.documents) {
    if(doc.source_kind==='unclassified' && /Lynn\.pdf$/i.test(doc.local_file))doc.source_kind='literature';
  }
  const template=await fs.readFile(path.join(root,'scripts/egel/library-import-template.ts.txt'),'utf8');
  const manifest=settings.documents.map(doc=>Object.fromEntries(Object.entries(doc).filter(([key])=>key!=='local_file')));
  const source=template.replace('__MANIFEST__',JSON.stringify(manifest)).replace('__KEY_HASH__',createHash('sha256').update(settings.key).digest('hex')).replace('__DEADLINE__',String(settings.deadline));
  await fs.writeFile(privateFile,JSON.stringify(settings,null,2),{mode:0o600});
  await fs.writeFile(path.join(output,'import-function-refreshed.ts'),source);
  console.log('Refreshed operator-only template; existing key and deadline unchanged.');
} else if(args.includes('--prepare')) {
  const final=await read(path.join(collection,'resultado-final.json')), inventory=await read(path.join(collection,'inventario.json'));
  const catalog=await read(path.join(root,'src/lib/biblioteca/catalog.json')), documents=[];
  for(const item of final.mapping.filter(x=>!x.duplicate_of)) {
    const pdf=await fs.realpath(path.join(collection,item.canonical_output));
    if(path.relative(collection,pdf).startsWith('..'))throw Error('Manifest outside collection');
    if(await hash(pdf)!==item.output_sha256)throw Error('PDF changed');
    const original=inventory.find(x=>x.sha256===item.original_sha256);
    const book=catalog.find(x=>x.sha256===item.original_sha256);
    const kind=book||/Lynn\.pdf$/i.test(item.source)?'literature':/^app[\\/]/.test(item.source)?'excerpt':/Guia de preguntas EGEL/.test(item.source)?'exam_guide':'unclassified';
    const fileBytes=(await fs.stat(pdf)).size, parts=[];
    const handle=await fs.open(pdf,'r');
    try {
      for(let start=0;start<fileBytes;start+=48*1024*1024){
        const size=Math.min(48*1024*1024,fileBytes-start),data=Buffer.alloc(size);
        const got=await handle.read(data,0,size,start);if(got.bytesRead!==size)throw Error('Incomplete source');
        parts.push({ordinal:parts.length,start_byte:start,file_bytes:size,sha256:createHash('sha256').update(data).digest('hex'),
          object_path:fileBytes<=48*1024*1024?`sha256/${item.output_sha256}.pdf`:`sha256/${item.output_sha256}/part-${String(parts.length).padStart(4,'0')}.bin`,
          content_type:fileBytes<=48*1024*1024?'application/pdf':'application/octet-stream'});
      }
    } finally {await handle.close();}
    documents.push({id:item.output_sha256,catalog_id:book?.id??null,title:book?.title??path.basename(item.source),visibility:'common',owner_id:null,
      source_kind:kind,original_sha256:item.original_sha256,bucket_id:bucket,object_path:`sha256/${item.output_sha256}.pdf`,file_bytes:(await fs.stat(pdf)).size,page_count:original.pages,
      part_count:parts.length,parts,local_file:pdf});
  }
  const key=randomBytes(32).toString('hex'),deadline=Date.now()+3*60*60*1000;
  const settings={project,endpoint,key,deadline,documents};
  await fs.writeFile(privateFile,JSON.stringify(settings,null,2),{flag:'wx',mode:0o600});
  const template=await fs.readFile(path.join(root,'scripts/egel/library-import-template.ts.txt'),'utf8');
  const source=template.replace('__MANIFEST__',JSON.stringify(documents.map(doc=>Object.fromEntries(Object.entries(doc).filter(([key])=>key!=='local_file')))))
    .replace('__KEY_HASH__',createHash('sha256').update(key).digest('hex')).replace('__DEADLINE__',String(deadline));
  await fs.writeFile(path.join(output,'import-function-multipart.ts'),source,{flag:'wx'});
  console.log(JSON.stringify({prepared:documents.length,bytes:documents.reduce((n,d)=>n+d.file_bytes,0),source:path.join(output,'import-function-multipart.ts'),expires:new Date(deadline).toISOString()}));
} else {
  const settings=await read(privateFile);
  if(settings.project!==project||settings.endpoint!==endpoint||Date.now()>settings.deadline)throw Error('Import session unavailable or expired');
  const call=async payload=>{
    const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-egel-import-key':settings.key},body:JSON.stringify(payload),signal:AbortSignal.timeout(90000)});
    if(!r.ok){let code='REQUEST_FAILED';try{const data=await r.json();code=data.error??code;if(/^[A-Z0-9]{5}$/.test(data.code??''))code+=' '+data.code;}catch{}throw Error(`Import ${code} HTTP ${r.status}`);}
    return r.json();
  };
  if(args.includes('--setup')) { console.log(await call({action:'setup'}));process.exit(0); }
  const lock=await fs.open(path.join(output,'import.lock'),'wx');
  try {
    for(const doc of settings.documents) {
      if(args.includes('--only') && doc.id!==option('--only') && doc.catalog_id!==option('--only'))continue;
      if(await hash(doc.local_file)!==doc.id)throw Error('Local integrity failed');
      if(args.includes('--upload')) {
        for(const part of doc.parts) {
        const signed=await call({action:'sign',id:doc.id,part:part.ordinal});
        if(!signed.exists) {
          if(args.includes('--tus')) {
          const stateFile=path.join(output,doc.id+'.part-'+part.ordinal+'.upload.json'); let uploadUrl;
          try{uploadUrl=(await read(stateFile)).url;}catch{}
          const headers={'Tus-Resumable':'1.0.0','x-signature':signed.token};
          if(uploadUrl && new URL(uploadUrl).origin!==storageOrigin)throw Error('Unexpected upload host');
          if(!uploadUrl) {
            const metadata={bucketName:bucket,objectName:part.object_path,contentType:part.content_type,cacheControl:'0'};
            const r=await fetch(storageOrigin+'/storage/v1/upload/resumable',{method:'POST',headers:{...headers,'Upload-Length':String(part.file_bytes),'Upload-Metadata':Object.entries(metadata).map(([k,v])=>`${k} ${Buffer.from(v).toString('base64')}`).join(',')},redirect:'error',signal:AbortSignal.timeout(60000)});
            if(r.status!==201){const detail=(await r.text()).replaceAll(signed.token,'[redacted]').replace(/https?:\/\/[^\s"<>]+/g,'[url]').replace(/eyJ[A-Za-z0-9_.-]+/g,'[token]').slice(0,300);throw Error(`TUS creation HTTP ${r.status}: ${detail}`);}
            uploadUrl=new URL(r.headers.get('Location'),storageOrigin).href;
            if(new URL(uploadUrl).origin!==storageOrigin)throw Error('Unexpected TUS location');
            await fs.writeFile(stateFile,JSON.stringify({url:uploadUrl}),{mode:0o600});
          }
          const head=await fetch(uploadUrl,{method:'HEAD',headers,redirect:'error',signal:AbortSignal.timeout(60000)});
          if(!head.ok)throw Error(`TUS resume HTTP ${head.status}`);
          let offset=Number(head.headers.get('Upload-Offset'));
          if(!Number.isSafeInteger(offset)||offset<0||offset>part.file_bytes)throw Error('Invalid TUS offset');
          const handle=await fs.open(doc.local_file,'r');
          try{
            let lastLog=0;
            while(offset<part.file_bytes) {
              const size=Math.min(6*1024*1024,part.file_bytes-offset),data=Buffer.alloc(size);
              const {bytesRead}=await handle.read(data,0,size,part.start_byte+offset);if(bytesRead!==size)throw Error('Short local read');
              const r=await fetch(uploadUrl,{method:'PATCH',headers:{...headers,'Upload-Offset':String(offset),'Content-Type':'application/offset+octet-stream'},body:data,redirect:'error',signal:AbortSignal.timeout(120000)});
              if(r.status!==204)throw Error(`TUS chunk HTTP ${r.status}`);
              const next=Number(r.headers.get('Upload-Offset'));if(next!==offset+size)throw Error('TUS acknowledgement differs');offset=next;
              if(Date.now()-lastLog>10000||offset===part.file_bytes){console.log('UPLOAD',doc.catalog_id??doc.id.slice(0,10),'part',part.ordinal+1,Math.round(100*offset/part.file_bytes)+'%');lastLog=Date.now();}
            }
          } finally {await handle.close();}
          } else {
            // Ordered parts stay below the project's 50 MB cap. Each immutable
            // part can be retried independently without replacing any object.
            const url=new URL(`${storageOrigin}/storage/v1/object/upload/sign/${bucket}/${part.object_path}`);
            url.searchParams.set('token',signed.token);
            const stream=createReadStream(doc.local_file,{start:part.start_byte,end:part.start_byte+part.file_bytes-1});
            const r=await fetch(url,{method:'PUT',headers:{'Content-Type':part.content_type,'Content-Length':String(part.file_bytes),'cache-control':'max-age=0','x-upsert':'false'},
              body:stream,duplex:'half',redirect:'error',signal:AbortSignal.timeout(240000)});
            if(!r.ok)throw Error(`Signed part upload HTTP ${r.status}`);
            await r.arrayBuffer();
            console.log('UPLOAD',doc.catalog_id??doc.id.slice(0,10),'part',part.ordinal+1,'complete');
          }
          const checked=await call({action:'status',id:doc.id,part:part.ordinal});if(!checked.exists)throw Error('Object not verified');
        }
        }
        console.log('STORED',doc.catalog_id??doc.id.slice(0,10),doc.file_bytes);
      }
      if(args.includes('--index')) {
        const indexRoot=option('--index-root');if(!args.includes('--index-root'))throw Error('--index-root required');
        const extraction=await read(path.join(indexRoot,doc.id,'extraction.json'));
        if(doc.source_kind==='literature') {
          const {createInterface}=await import('node:readline');
          const lines=createInterface({input:createReadStream(path.join(indexRoot,doc.id,'chunks.jsonl')),crlfDelay:Infinity});let batch=[],count=0;
          for await(const line of lines){batch.push(JSON.parse(line));if(batch.length===100){await call({action:'chunks',id:doc.id,chunks:batch});count+=batch.length;batch=[];}}
          if(batch.length){await call({action:'chunks',id:doc.id,chunks:batch});count+=batch.length;}
          if(count!==extraction.chunks)throw Error('Local chunk count differs');
        }
        await call({action:'finalize',id:doc.id,extraction:{version:extraction.version,pages:extraction.pages,indexed_pages:extraction.indexed_pages,pending_pages:extraction.pending_pages,chunks:extraction.chunks}});
        console.log('INDEXED',doc.catalog_id??doc.id.slice(0,10),extraction.indexed_pages+'/'+extraction.pages);
      }
    }
  } finally {await lock.close();await fs.unlink(path.join(output,'import.lock'));}
}
