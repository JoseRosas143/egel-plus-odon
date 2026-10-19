// Offline preparation only: no API keys, fetch, SDK generation, publication or budget initialization.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {reviewPlan,hashText,candidatePacket,canonicalQuestion} from './lib/pilot-candidates.mjs';
const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
for(const name of ['--manifest','--index-root','--questions','--output'])if(!args.includes(name)||!arg(name))throw Error(name+' required');
const output=path.resolve(arg('--output')),index=path.resolve(arg('--index-root'));
const relative=path.relative(repository,output);
if(!path.isAbsolute(relative)&&!relative.startsWith('..'+path.sep))throw Error('CANDIDATE_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
const manifest=JSON.parse(await fs.readFile(arg('--manifest'),'utf8'));
const questionsText=await fs.readFile(arg('--questions'),'utf8'),questions=JSON.parse(questionsText).map(canonicalQuestion);
if(questions.length!==10 || new Set(questions.map(q=>q.id)).size!==10 || questions.some(q=>!reviewPlan.some(p=>p.number===Number(q.id.slice(-3)))))throw Error('CANDIDATE_EXPECTED_TEN_QUESTIONS');
const sources=[];
for(const doc of manifest.documents.filter(d=>d.source_kind==='literature'&&d.visibility==='common'&&d.owner_id===null&&reviewPlan.some(p=>p.books.includes(d.catalog_id)))){
  if(!/^[a-f0-9]{64}$/.test(doc.id))throw Error('CANDIDATE_INVALID_DOCUMENT');
  const directory=path.join(index,doc.id),metadata={documentId:doc.id,catalogId:doc.catalog_id,title:doc.title,localPdf:doc.local_file};
  const lines=(await fs.readFile(path.join(directory,'chunks.jsonl'),'utf8')).split('\n').filter(Boolean);
  for(const line of lines){const c=JSON.parse(line);
    if(!Number.isSafeInteger(c.pdf_page)||c.pdf_page<1||c.pdf_page>doc.page_count||!Number.isSafeInteger(c.ordinal)||c.ordinal<0||typeof c.body!=='string'||hashText(c.body)!==c.body_sha256)throw Error('CANDIDATE_INDEX_INTEGRITY');
    sources.push({...metadata,pdfPage:c.pdf_page,ordinal:c.ordinal,text:c.body,textSha256:c.body_sha256,method:'native'});
  }
  if(lines.length===0){
    const ocr=path.join(directory,'ocr');
    for(const file of await fs.readdir(ocr)){
      if(!/^\d+\.json$/.test(file))continue;
      const c=JSON.parse(await fs.readFile(path.join(ocr,file),'utf8'));
      if(!Number.isSafeInteger(c.pdf_page)||c.pdf_page!==Number(file.slice(0,-5))||c.pdf_page<1||c.pdf_page>doc.page_count||typeof c.text!=='string'||!Number.isFinite(c.confidence))throw Error('CANDIDATE_OCR_INTEGRITY');
      // Keep a whole OCR page where bounded, so a table is not silently separated
      // from its heading or footnotes. Larger pages use overlapping windows.
      // Neither representation is a reviewed or published cloud index.
      const step=c.text.length<=8000?8000:1600,window=c.text.length<=8000?8000:2200;
      for(let start=0,ordinal=0;start<c.text.length;start+=step,ordinal++){
        const text=c.text.slice(start,start+window);
        sources.push({...metadata,pdfPage:c.pdf_page,ordinal,text,textSha256:hashText(text),method:'ocr',confidence:c.confidence});
      }
    }
  }
}
await fs.mkdir(output,{recursive:true,mode:0o700});
async function immutable(name,value){
  const contents=JSON.stringify(value,null,2)+'\n',file=path.join(output,name);
  try {await fs.writeFile(file,contents,{flag:'wx',mode:0o600});}
  catch(e){if(e.code!=='EEXIST')throw e;if(await fs.readFile(file,'utf8')!==contents)throw Error('CANDIDATE_EXISTING_FILE_DIFFERS');}
}
const review=[];
for(const plan of reviewPlan){
  const q=questions.find(q=>Number(q.id.slice(-3))===plan.number),result=candidatePacket(q,sources,plan);
  const filename=q.id+'.candidate.json';await immutable(filename,result.packet);review.push({...result.review,packetFile:filename});
}
await immutable('review-manifest.json',{schema:1,questionsSha256:hashText(questionsText),networkCalls:0,budgetInitialized:false,
  warning:'Candidatos léxicos. Ninguna aprobación clínica, revisión humana ni autorización de transmisión está implícita.',questions:review});
console.log(JSON.stringify({questions:review.length,withCandidates:review.filter(q=>q.sources.length).length,allRequireHumanReview:true,networkCalls:0,output}));
