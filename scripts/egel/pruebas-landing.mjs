// Offline rendering contracts. No accounts, emails, database or model calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(root,'package.json')),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const source=file=>fs.readFile(path.join(root,file),'utf8');
async function load(file,imports={}) {
  const compiled=ts.transpileModule(await source(file),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const mod={exports:{}};
  new Function('require','module','exports',compiled)(id=>{if(Object.hasOwn(imports,id))return imports[id];throw Error('Unexpected import '+id);},mod,mod.exports);
  return mod.exports;
}
const css=new Proxy({},{get:(_t,key)=>key==='__esModule'?false:String(key)});
const common={'react/jsx-runtime':require('react/jsx-runtime'),'./styles.module.css':css};
const icons=await load('src/components/acceso/app-icon.tsx',common);
const arrows=await load('src/components/landing/arrow.tsx',common);
const mobileMenu=await load('src/components/landing/mobile-menu.tsx',{...common,react:React,'@/components/acceso/app-icon':icons});
const preview=await load('src/components/landing/product-preview.tsx',{...common,react:React,'@/components/acceso/app-icon':icons,'./arrow':arrows});
const legal=await load('src/components/landing/legal-page.tsx',{...common,'next/link':p=>React.createElement('a',p),'@/components/acceso/app-icon':icons});
const books=JSON.parse(await source('src/lib/biblioteca/catalog.json'));
const landing=await load('src/components/landing/landing-page.tsx',{...common,'next/link':p=>React.createElement('a',p),'next/image':p=>React.createElement('img',p),'@/components/acceso/app-icon':icons,'@/lib/biblioteca/catalog':{libraryBooks:books},'./product-preview':preview,'./arrow':arrows,'./mobile-menu':mobileMenu});
const home=await load('src/app/page.tsx',{'react/jsx-runtime':common['react/jsx-runtime'],'@/components/landing/landing-page':landing});
const terms=await load('src/app/terminos/page.tsx',{'react/jsx-runtime':common['react/jsx-runtime'],'@/components/landing/legal-page':legal});
const privacy=await load('src/app/privacidad/page.tsx',{'react/jsx-runtime':common['react/jsx-runtime'],'@/components/landing/legal-page':legal});
const html=renderToStaticMarkup(React.createElement(landing.LandingPage));
const termsHtml=renderToStaticMarkup(React.createElement(terms.default));
const privacyHtml=renderToStaticMarkup(React.createElement(privacy.default));

test('home is Spanish, branded and canonical points only to confirmed subdomain',()=>{assert.equal(home.metadata.metadataBase.href,'https://egelplusodon.jraprende.online/');assert.equal(home.metadata.alternates.canonical,'/');assert.match(home.metadata.title,/EGEL Plus ODON/);assert.equal((html.match(/<h1\b/g)||[]).length,1);});
test('all local anchor links have existing unique targets',()=>{const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);for(const [,id] of html.matchAll(/href="#([^"]+)"/g))assert(ids.includes(id),id);});
test('account entry links point to existing public routes',()=>{for(const url of ['/registro','/login','/estudio','/cuenta','/biblioteca'])assert(html.includes(`href="${url}"`));});
test('public preview has three panels and three ungraded options',()=>{assert(html.includes('Reactivo de demostración'));assert(html.includes('Tutor de demostración'));assert(html.includes('Notas de demostración'));assert.equal((html.match(/type="radio"/g)||[]).length,3);assert(html.includes('no reactivo del banco'));});
test('preview describes real limitations and does not fabricate model responses',()=>{assert(html.includes('Sin conexión a IA'));assert(html.includes('No contiene una respuesta generada por IA.'));assert(html.includes('Análisis del piloto guardado'));assert(html.includes('no una calificación'));});
test('demo note is explicitly ephemeral and labelled',()=>{assert.match(html,/<label for="landing-note">/);assert.match(html,/textarea[^>]+id="landing-note"/);assert(html.includes('no al recargar'));});
test('only real catalog cover references are used; no file paths or hashes are rendered',async()=>{for(const id of ['BIB-001','BIB-002','BIB-004','BIB-005']){assert(html.includes(`/biblioteca/covers/${id}.jpg`));await fs.access(path.join(root,`public/biblioteca/covers/${id}.jpg`));}for(const book of books){assert(!html.includes(book.filename));assert(!html.includes(book.sha256));}assert(html.includes('5.ª edición · 2006'));});
test('future features and prices are not represented as active paid access',()=>{assert(html.includes('Simulacros y tarjetas en desarrollo'));assert(html.includes('Precio y condiciones pendientes'));assert(html.includes('Subida privada de libros y auditoría por IA: en desarrollo'));assert(!html.includes('checkout'));});
test('legal links are public and contact channels are exact',()=>{assert(html.includes('href="/terminos"'));assert(html.includes('href="/privacidad"'));assert(html.includes('https://wa.me/522321416236'));assert(html.includes('mailto:egelplusodon@jraprende.online'));});
test('terms distinguish no guaranteed exam result from impermissible total release',()=>{assert(termsHtml.includes('Sin garantía de aprobar'));assert(termsHtml.includes('no libera al responsable'));assert(termsHtml.includes('derechos irrenunciables'));assert(termsHtml.includes('No se excluye responsabilidad'));});
test('privacy has confirmed controller, address and ARCO contact',()=>{for(const text of ['J. A. Rosas Abarca','Av. 5 de Mayo 25','Vicente Suárez','72380','Puebla, Puebla','Solicitud ARCO'])assert(privacyHtml.includes(text));});
test('privacy distinguishes suppliers, free-tier uncertainty and optional purposes',()=>{for(const text of ['Supabase','Google Gemini','OpenAI','fuera de México','modalidades gratuitas','finalidades opcionales'])assert(privacyHtml.includes(text));});
test('ARCO procedure includes verified deadlines and identity minimization',()=>{for(const text of ['20 días hábiles','15 días hábiles','ampliación única','No envíes contraseñas'])assert(privacyHtml.includes(text));});
test('registration offers legal notice before requesting identity fields',async()=>{const form=await source('src/components/acceso/form.tsx');const formStart=form.indexOf('<form');assert(form.indexOf('Privacidad y condiciones de registro',formStart)<form.indexOf('<fieldset',formStart));assert(form.includes('href="/privacidad"'));assert(form.includes('href="/terminos"'));});
test('responsive panels include tablet and mobile switching without removing draft state',async()=>{const cssText=await source('src/components/landing/styles.module.css');assert(cssText.includes('(min-width:651px) and (max-width:950px)'));assert(cssText.includes('data-panel="Mis notas"'));const previewSource=await source('src/components/landing/product-preview.tsx');assert(previewSource.includes('const [note, setNote]'));assert(!/fetch\(|localStorage|sessionStorage|process\.env|useLiterature|useOpinion/.test(previewSource));});
test('legal pages have deliberate canonical addresses and no indexing of personal address',()=>{assert.equal(terms.metadata.alternates.canonical,'https://egelplusodon.jraprende.online/terminos');assert.equal(privacy.metadata.alternates.canonical,'https://egelplusodon.jraprende.online/privacidad');assert.equal(privacy.metadata.robots.index,false);});
