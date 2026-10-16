// Offline filesystem/session doubles. No real books, database writes or AI calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as crypto from 'node:crypto';
import * as stream from 'node:stream';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(root,'package.json')),ts=require('typescript');
async function load(file,imports={}){const code=ts.transpileModule(await fs.readFile(path.join(root,file),'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const loaded={exports:{}};new Function('require','module','exports',code)(name=>{if(Object.hasOwn(imports,name))return imports[name];throw Error('Unexpected import '+name);},loaded,loaded.exports);return loaded.exports;}
const {pdfRange}=await load('src/lib/biblioteca/domain.ts');
for(const [header,expected] of [[null,{start:0,end:99}],['bytes=0-9',{start:0,end:9}],['bytes=90-',{start:90,end:99}],['bytes=-10',{start:90,end:99}],['bytes=-500',{start:0,end:99}],['bytes=0-500',{start:0,end:99}]])test('range '+header,()=>assert.deepEqual(pdfRange(header,100),expected));
for(const header of ['bytes=100-','bytes=9-1','bytes=-0','bytes=-','items=0-1','bytes=0-1,4-5','bytes=abc-9','bytes=9007199254740993-','bytes=0-\n'])test('reject '+JSON.stringify(header),()=>assert.equal(pdfRange(header,100),null));
for(const method of ['GET','HEAD'])test(method+' requires authentication before resolving book',async()=>{let accessed=false;const api=await load('src/app/api/biblioteca/[id]/route.ts',{'@/lib/estudiante/repository':{authenticateStudent:async()=>({ok:false,status:401,code:'AUTH_REQUIRED'})},'@/lib/biblioteca/files':{libraryPdf:()=>{accessed=true;}}});const result=await api[method](new Request('https://local.invalid/api/biblioteca/BIB-001',{method}),{params:Promise.resolve({id:'BIB-001'})});assert.equal(result.status,401);assert.equal(accessed,false);assert.equal(result.headers.get('Vary'),'Cookie');assert.match(result.headers.get('Cache-Control'),/private.*no-store/);});
test('verified session delegates exact known ID',async()=>{const api=await load('src/app/api/biblioteca/[id]/route.ts',{'@/lib/estudiante/repository':{authenticateStudent:async()=>({ok:true})},'@/lib/biblioteca/files':{libraryPdf:(id)=>new Response(id)}});assert.equal(await(await api.GET(new Request('https://local.invalid/api/biblioteca/BIB-001'),{params:Promise.resolve({id:'BIB-001'})})).text(),'BIB-001');});
test('PDF integrity, ranges, absent configuration and path containment',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'egel-library-test-')),original=process.env.EGEL_LIBRARY_ROOT;
 assert(path.basename(dir).startsWith('egel-library-test-'));
 const inner=path.join(dir,'books');await fs.mkdir(inner);const data=Buffer.from('%PDF-1.4\nEGEL TEST ONLY\n%%EOF');await fs.writeFile(path.join(inner,'book.pdf'),data);await fs.writeFile(path.join(dir,'outside.pdf'),data);
 const catalog=[{id:'BIB-001',filename:'book.pdf',bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')},{id:'BIB-002',filename:'../outside.pdf',bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')}];
 const {libraryPdf}=await load('src/lib/biblioteca/files.ts',{'server-only':{},'node:fs/promises':fs,'node:path':path,'node:crypto':crypto,'node:stream':stream,'./catalog.json':catalog,'./domain':{pdfRange}});
 const request=(headers={},method='GET')=>new Request('https://local.invalid/api/biblioteca/BIB-001',{headers,method});
 try{
  delete process.env.EGEL_LIBRARY_ROOT;
  await t.test('no local config is 503, not fake ready',async()=>assert.equal((await libraryPdf('BIB-001',request())).status,503));
  process.env.EGEL_LIBRARY_ROOT=inner;
  await t.test('invalid ID rejected',async()=>assert.equal((await libraryPdf('../../../outside.pdf',request())).status,404));
  await t.test('unknown ID rejected',async()=>assert.equal((await libraryPdf('BIB-999',request())).status,404));
  await t.test('HEAD exposes length, not content',async()=>{const r=await libraryPdf('BIB-001',request({},'HEAD'));assert.equal(r.status,200);assert.equal(r.headers.get('Content-Length'),String(data.length));assert.equal(await r.text(),'');});
  await t.test('full read verifies bytes and private headers',async()=>{const r=await libraryPdf('BIB-001',request());assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'application/pdf');assert.equal(r.headers.get('Vary'),'Cookie');assert.match(r.headers.get('Cache-Control'),/private, no-store/);assert.deepEqual(Buffer.from(await r.arrayBuffer()),data);});
  await t.test('partial read is 206 and exact',async()=>{const r=await libraryPdf('BIB-001',request({Range:'bytes=0-4'}));assert.equal(r.status,206);assert.equal(r.headers.get('Content-Range'),`bytes 0-4/${data.length}`);assert.equal(await r.text(),'%PDF-');});
  await t.test('invalid range is 416',async()=>{const r=await libraryPdf('BIB-001',request({Range:'bytes=900-'}));assert.equal(r.status,416);assert.equal(r.headers.get('Content-Range'),`bytes */${data.length}`);});
  await t.test('outside-root file denied even with correct hash',async()=>assert.equal((await libraryPdf('BIB-002',request())).status,503));
  await fs.writeFile(path.join(inner,'book.pdf'),Buffer.alloc(data.length,65));
  await t.test('same-size tampered file rejected, no path in errors',async()=>{const r=await libraryPdf('BIB-001',request());assert.equal(r.status,503);const body=await r.text();assert(!body.includes(dir));assert(body.includes('LIBRARY_FILE_CHANGED'));});
 } finally {if(original===undefined)delete process.env.EGEL_LIBRARY_ROOT;else process.env.EGEL_LIBRARY_ROOT=original;await fs.unlink(path.join(inner,'book.pdf'));await fs.unlink(path.join(dir,'outside.pdf'));await fs.rmdir(inner);await fs.rmdir(dir);}
});
test('catalogue unique IDs, 23 genuine sources, covers exist, no student data',async()=>{const books=JSON.parse(await fs.readFile(path.join(root,'src/lib/biblioteca/catalog.json'),'utf8'));assert.equal(books.length,23);assert.equal(new Set(books.map(b=>b.id)).size,23);for(const b of books){assert.match(b.id,/^BIB-\d{3}$/);assert.match(b.sha256,/^[a-f0-9]{64}$/);assert.equal(path.basename(b.filename),b.filename);assert(!('user_id' in b));await fs.access(path.join(root,'public/biblioteca/covers',b.id+'.jpg'));}});
