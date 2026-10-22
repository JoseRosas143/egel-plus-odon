import {loadImportedEditorial} from './lib/imported-editorial-storage.mjs';
import {startEditorialPreview} from './lib/editorial-preview-server.mjs';
import {editorialPreviewRenderer,editorialPreviewAssets} from './lib/editorial-preview-renderer.mjs';

try{
 const args=process.argv.slice(2);
 if(!args.length||args.length===1&&args[0]==='--help'){
   console.log('Visor editorial local de solo lectura. No publica ni consume IA.\n--manifest=RUTA_PRIVADA [--port=PUERTO]\nAbre el enlace privado que se muestra. Ctrl+C cierra el visor; el enlace caduca en una hora.');
 }else{
   const options={};for(const arg of args){const m=/^--(manifest|port)=(.+)$/.exec(arg);if(!m||Object.hasOwn(options,m[1]))throw Error('PREVIEW_INVALID_ARGUMENTS');options[m[1]]=m[2];}
   if(!options.manifest||options.port!==undefined&&!/^(0|[1-9]\d{0,4})$/.test(options.port))throw Error('PREVIEW_INVALID_ARGUMENTS');
   const [render,assets]=await Promise.all([editorialPreviewRenderer(),editorialPreviewAssets()]);
   const app=await startEditorialPreview({load:()=>loadImportedEditorial(options.manifest),render,assets,port:options.port===undefined?0:Number(options.port)});
   console.log('Visor privado, solo en este equipo. No compartir este enlace:\n'+app.launchUrl);
   process.once('SIGINT',()=>app.close().then(()=>process.exit(0)));
   process.once('SIGTERM',()=>app.close().then(()=>process.exit(0)));
 }
}catch(e){console.error(/^PREVIEW_[A-Z_]+$/.test(e?.message??'')?e.message:'PREVIEW_START_FAILED');process.exitCode=1;}
