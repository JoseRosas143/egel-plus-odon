import {loadDraftImport,writeDraftImport} from './lib/draft-import-storage.mjs';

// Local operator tool only. No env loading, remote connection or publication.
try{
  const args=process.argv.slice(2);
  if(!args.length||(args.length===1&&args[0]==='--help')){
    console.log('Importación local privada de borradores pendientes. Sin IA ni publicación.\n--manifest=RUTA_JSON [--plan]\n--manifest=RUTA_JSON --execute --output=CARPETA_PRIVADA_EXISTENTE');
  }else{
    const allowed=new Set(['manifest','output','plan','execute']),options={};
    for(const arg of args){const match=/^--([a-z]+)(?:=(.+))?$/.exec(arg);if(!match||!allowed.has(match[1])||Object.hasOwn(options,match[1]))throw Error('DRAFT_INVALID_ARGUMENTS');
      if(['plan','execute'].includes(match[1])?match[2]!==undefined:!match[2])throw Error('DRAFT_INVALID_ARGUMENTS');options[match[1]]=match[2]??true;}
    if(!options.manifest||(options.plan&&options.execute)||(!options.execute&&options.output)||(options.execute&&!options.output))throw Error('DRAFT_INVALID_ARGUMENTS');
    const input=await loadDraftImport(options.manifest);
    const result=options.execute?await writeDraftImport(input,options.output):{mode:'plan',batchId:input.batch.batchId,summary:input.batch.summary,
      filesystemWrites:0,newModelCalls:0,cloudWrites:0,publicationAllowed:false};
    console.log(JSON.stringify(result,null,2));
  }
}catch(e){const code=e?.message;
  console.error(typeof code==='string'&&/^DRAFT_[A-Z_]+$/.test(code)?code:'DRAFT_OPERATION_FAILED');process.exitCode=1;
}
