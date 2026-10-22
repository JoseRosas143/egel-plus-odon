import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';

const root=path.resolve(import.meta.dirname,'../../..'),require=createRequire(path.join(root,'package.json'));
// Compile the repository's existing safe renderer once for this local operator
// process. No untrusted code or Markdown is evaluated as JavaScript.
export async function editorialPreviewRenderer(){
 const ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const source=await fs.readFile(path.join(root,'src/components/estudio/tutor-rich-text.tsx'),'utf8');
 const imports={'react':React,'react/jsx-runtime':require('react/jsx-runtime'),'react-markdown':require('react-markdown'),
   'remark-gfm':require('remark-gfm'),'remark-math':require('remark-math'),'rehype-katex':require('rehype-katex'),
   './styles.module.css':{richText:'richText',tableScroll:'tableScroll'}};
 const code=ts.transpileModule(source,{fileName:'tutor-rich-text.tsx',compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const mod={exports:{}};
 new Function('require','module','exports',code)(name=>{if(!Object.hasOwn(imports,name))throw Error('PREVIEW_UNEXPECTED_RENDERER_IMPORT');return imports[name];},mod,mod.exports);
 return text=>renderToStaticMarkup(React.createElement(mod.exports.TutorRichText,{text}));
}

export async function editorialPreviewAssets(){
 const dir=path.join(root,'scripts/egel/editorial-preview'),assets=new Map();
 for(const [url,file,type]of [['/','index.html','text/html; charset=utf-8'],['/viewer.js','viewer.js','text/javascript; charset=utf-8'],['/viewer.css','viewer.css','text/css; charset=utf-8']]){
   assets.set(url,{body:await fs.readFile(path.join(dir,file)),type});
 }
 const katex=path.dirname(require.resolve('katex/package.json'));
 assets.set('/katex.css',{body:await fs.readFile(path.join(katex,'dist/katex.min.css')),type:'text/css; charset=utf-8'});
 for(const name of await fs.readdir(path.join(katex,'dist/fonts'))){if(/^[A-Za-z0-9_-]+\.woff2$/.test(name))assets.set('/fonts/'+name,{body:await fs.readFile(path.join(katex,'dist/fonts',name)),type:'font/woff2'});}
 return assets;
}
