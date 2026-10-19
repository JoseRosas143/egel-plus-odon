/** Local, resumable OCR. No AI-provider calls, no cloud transmission of pages.
 * Install pinned tesseract.js externally; output and model cache outside Git.
 * Each page retains its confidence. Completion does NOT authorize evidence.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const args=process.argv.slice(2),arg=n=>args[args.indexOf(n)+1];
for(const k of ['--manifest','--index-root','--tools','--python'])if(!args.includes(k))throw Error(k+' required');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const indexRoot=path.resolve(arg('--index-root'));
if(!path.relative(root,indexRoot).startsWith('..'))throw Error('Private OCR must be outside Git');
const settings=JSON.parse(await fs.readFile(arg('--manifest'),'utf8'));
const {createWorker}=createRequire(path.join(path.resolve(arg('--tools')),'package.json'))('tesseract.js');
const run=promisify(execFile), jobs=[];
const max=args.includes('--max-pages')?Number(arg('--max-pages')):Infinity;
for(const doc of settings.documents.filter(d=>['BIB-002','BIB-004','BIB-017','BIB-018'].includes(d.catalog_id))) {
 const dir=path.join(indexRoot,doc.id,'ocr');await fs.mkdir(dir,{recursive:true});
 for(let page=1;page<=Math.min(doc.page_count,max);page++){
  const file=path.join(dir,page+'.json');try{await fs.access(file);}catch{jobs.push({doc,page,file});}
 }
}
console.log('OCR_PENDING',jobs.length);
let next=0,done=0;
await Promise.all(Array.from({length:4},async(_,workerIndex)=>{
 const worker=await createWorker('spa',1,{cachePath:arg('--tools')});
 await worker.setParameters({tessedit_pageseg_mode:'3',user_defined_dpi:'200',preserve_interword_spaces:'1'});
 try{
  while(next<jobs.length){
   const job=jobs[next++];
   const image=await run(arg('--python'),[path.join(root,'scripts/egel/renderizar-ocr.py'),job.doc.local_file,String(job.page)],{encoding:'buffer',maxBuffer:20*1024*1024,timeout:90000});
   const r=await worker.recognize(image.stdout);
   await fs.writeFile(job.file,JSON.stringify({pdf_page:job.page,text:r.data.text,confidence:r.data.confidence,engine:'tesseract.js@7.0.0',language:'spa',dpi:200}),{flag:'wx'});
   done++;if(done%10===0||done===jobs.length)console.log('OCR',done+'/'+jobs.length,job.doc.catalog_id,'page',job.page,'confidence',r.data.confidence,'worker',workerIndex);
  }
 } finally {await worker.terminate();}
}));
