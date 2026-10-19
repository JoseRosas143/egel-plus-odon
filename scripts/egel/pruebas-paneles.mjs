// Offline layout checks; no model, account or database operations.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(root,'package.json')),ts=require('typescript'),React=require('react');
const read=file=>fs.readFile(path.join(root,file),'utf8');
async function load(file,imports={}) {
 const compiled=ts.transpileModule(await read(file),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const mod={exports:{}};new Function('require','module','exports',compiled)(id=>{if(Object.hasOwn(imports,id))return imports[id];throw Error('Unexpected import '+id);},mod,mod.exports);return mod.exports;
}
const layout=await load('src/lib/estudio/panel-layout.ts');
const close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('focused tutor combines question and tutor without changing saved widths',()=>{const sizes=[30,42,28];assert.equal(layout.focusedTutorSize(sizes),72);assert.deepEqual(sizes,[30,42,28]);});
test('custom split is respected',()=>assert.equal(layout.focusedTutorSize([24,44,32]),68));
test('focused resizing preserves total and original question/tutor ratio',()=>{const original=[30,42,28],next=layout.resizePanelSizes(original,1,65,1200,true);close(next.reduce((a,b)=>a+b,0),100);close(next[0]/next[1],30/42);close(next[2],35);assert.deepEqual(original,[30,42,28]);});
test('focused separator clamps both ends and keeps notes at least 240px',()=>{for(const desired of [-200,0,100,300]){const next=layout.resizePanelSizes([30,42,28],1,desired,1000,true);assert(next[2]>=24);assert(layout.focusedTutorSize(next)>=28);close(next.reduce((a,b)=>a+b,0),100);}});
test('regular resize leaves the third panel unchanged',()=>{assert.deepEqual(layout.resizePanelSizes([30,42,28],0,32,1200),[32,40,28]);});
test('keyboard adjustments use the same geometry as drag',()=>{const next=layout.resizePanelSizes([30,42,28],1,74,1200,true);close(layout.focusedTutorSize(next),74);close(next[2],26);});
const css=new Proxy({},{get:(_t,key)=>key==='__esModule'?false:String(key)});
const panels=await load('src/components/estudio/resizable-panels.tsx',{'react/jsx-runtime':require('react/jsx-runtime'),react:React,'./styles.module.css':css,'@/lib/estudio/panel-layout':layout});
const {renderToStaticMarkup}=require('react-dom/server');
const render=focused=>renderToStaticMarkup(React.createElement(panels.ResizablePanels,{active:'tutor',focused,reactivo:'Question fixture',tutor:'Tutor fixture without AI',notas:React.createElement('textarea',{'aria-label':'Note fixture',defaultValue:'Unchanged draft'})}));
test('focus is not a modal and does not mark notes inert',()=>{const html=render(true);assert(!html.includes('role="dialog"'));assert(!html.includes('aria-modal'));assert(!html.includes('inert'));assert(html.includes('Unchanged draft'));assert(html.includes('study-notas'));});
test('all three subtrees remain mounted in focused and normal modes',()=>{for(const focused of [false,true]){const html=render(focused);for(const id of ['study-reactivo','study-tutor','study-notas'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);}});
test('focused grid is 72/28 and splitter exposes combined tutor value',()=>{const html=render(true);assert(html.includes('72fr'));assert(html.includes('28fr'));assert(html.includes('data-focus-mode="true"'));assert(html.includes('aria-valuenow="72"'));});
test('CSS hides only question and its divider; notes use normal responsive rules',async()=>{const source=await read('src/components/estudio/styles.module.css');assert(source.includes('.workspace.focusMode > [data-panel="reactivo"],.workspace.focusMode > [data-separator-index="0"]'));assert(!source.includes('.workspace.focusMode { position:fixed'));assert(!source.includes('.panel:not([data-panel="tutor"])'));});
test('inline focus has no body lock or Tab trap',async()=>{const source=await read('src/components/estudio/resizable-panels.tsx');assert(!source.includes('document.body.style.overflow'));assert(!source.includes('event.key !== "Tab"'));assert(source.includes('event.key === "Escape"'));});
test('notes shortcuts keep focus mode; returning to question restores it',async()=>{const source=await read('src/components/estudio/workspace.tsx');const command=source.slice(source.indexOf('if (command === "/apuntes")'),source.indexOf('if (command === "/siguiente"'));assert(!command.includes('setTutorFocused(false)'));assert(source.includes('if (panels[next].key === "reactivo") setTutorFocused(false)'));assert(source.includes('if (item.key === "reactivo") setTutorFocused(false)'));});
