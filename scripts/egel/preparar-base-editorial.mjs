import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareEditorialBase} from './lib/editorial-base.mjs';

const repository=await fs.realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'));
const outside=p=>{const r=path.relative(repository,p);return r.startsWith('..'+path.sep)||path.isAbsolute(r);};
try {
  const args=process.argv.slice(2);
  if(!args.length || (args.length===1 && args[0]==='--help')) {
    console.log('Preparación editorial offline. Sin IA ni publicación. --input=RUTA_JSON --output=RUTA_JSON. Ambas rutas fuera del repositorio.');
  } else {
    if(args.length!==2 || !args[0].startsWith('--input=') || !args[1].startsWith('--output='))throw Error('EDITORIAL_INVALID_ARGUMENTS');
    const input=await fs.realpath(path.resolve(args[0].slice(8)));
    const requested=path.resolve(args[1].slice(9)),parent=await fs.realpath(path.dirname(requested)),output=path.join(parent,path.basename(requested));
    if(!outside(input)||!outside(output)||input===output)throw Error('EDITORIAL_OUTSIDE_REPOSITORY_REQUIRED');
    const info=await fs.stat(input);if(!info.isFile()||info.size>150000)throw Error('EDITORIAL_INVALID_INPUT_FILE');
    const result=prepareEditorialBase(JSON.parse(await fs.readFile(input,'utf8'))),serialized=JSON.stringify(result,null,2)+'\n';
    // Never overwrite another payload, a previous approval, or an original source.
    try {await fs.writeFile(output,serialized,{flag:'wx',mode:0o600});}
    catch(e){if(e.code!=='EEXIST'||await fs.readFile(output,'utf8')!==serialized)throw Error('EDITORIAL_EXISTING_FILE_DIFFERS');}
    console.log(JSON.stringify({questionId:result.question.id,preparationSha256:result.preparationSha256,
      status:result.publicationState,cloudCompatible:false,networkCalls:0,newModelCalls:0}));
  }
} catch(e) {
  const code=e?.message;
  console.error(typeof code==='string' && /^EDITORIAL_[A-Z_]+$/.test(code)?code:'EDITORIAL_PREPARATION_FAILED');
  process.exitCode=1;
}
