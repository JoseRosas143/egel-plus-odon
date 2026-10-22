import {loadImportedEditorial,writeImportedEditorial} from './lib/imported-editorial-storage.mjs';

// Offline preparation only. Help/plan never load env, credentials or providers.
try{
 const args=process.argv.slice(2);
 if(!args.length||args.length===1&&args[0]==='--help'){
   console.log('Preparar textos editoriales importados 001, 003 y 006. No publica ni conecta con IA o Supabase.\n--manifest=RUTA_JSON [--plan]\n--manifest=RUTA_JSON --execute --output=CARPETA_PRIVADA_EXISTENTE');
 }else{
   const options={},allowed=new Set(['manifest','output','execute','plan']);
   for(const arg of args){const match=/^--([a-z]+)(?:=(.+))?$/.exec(arg);
     if(!match||!allowed.has(match[1])||Object.hasOwn(options,match[1])||(['plan','execute'].includes(match[1])?match[2]!==undefined:!match[2]))throw Error('IMPORTED_INVALID_ARGUMENTS');
     options[match[1]]=match[2]??true;
   }
   if(!options.manifest||options.plan&&options.execute||!options.execute&&options.output||options.execute&&!options.output)throw Error('IMPORTED_INVALID_ARGUMENTS');
   const input=await loadImportedEditorial(options.manifest);
   console.log(JSON.stringify(options.execute?await writeImportedEditorial(input,options.output):{mode:'plan',numbers:input.prepared.numbers,
     preparationBatchSha256:input.prepared.preparationBatchSha256,filesystemWrites:0,cloudWrites:0,paidModelCalls:0,studentWrites:0,publicationAllowed:false},null,2));
 }
}catch(e){console.error(/^IMPORTED_[A-Z_]+$/.test(e?.message??'')?e.message:'IMPORTED_OPERATION_FAILED');process.exitCode=1;}
