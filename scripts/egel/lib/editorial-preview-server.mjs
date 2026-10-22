import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {validateImportedEditorialBatch,importedEditorialPreview} from './imported-editorial.mjs';

const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const fail=code=>{throw Error(code);};
// Loopback-only operator viewer. Not a route in the student app, a publication
// mechanism, a stored answer or an authentication scheme for a deployed site.
export async function startEditorialPreview({load,render,assets,port=0}){
 if(!Number.isSafeInteger(port)||port<0||port>65535||typeof load!=='function'||typeof render!=='function'||!(assets instanceof Map))fail('PREVIEW_INVALID_CONFIG');
 const initial=await load();validateImportedEditorialBatch(initial.prepared);
 const pinned=initial.prepared.preparationBatchSha256,manifest=initial.inputManifestSha256;
 const capability=randomBytes(32).toString('hex'),session=randomBytes(32).toString('hex');
 const expiresAt=Date.now()+60*60*1000;
 let origin;
 const server=http.createServer(async(req,res)=>{
   const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
     'Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin',
     'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"};
   const send=(status,body,type='application/json; charset=utf-8',extra={})=>{res.writeHead(status,{...headers,'Content-Type':type,...extra});res.end(type.startsWith('application/json')?JSON.stringify(body):body);};
   try{
     const expectedHost=new URL(origin).host;
     if(req.headers.host!==expectedHost||!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||
       req.headers['x-forwarded-host']||req.headers['x-forwarded-proto']||req.headers.forwarded||
       req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'PREVIEW_LOCAL_ONLY'});
     if(Date.now()>=expiresAt)return send(401,{error:'PREVIEW_SESSION_EXPIRED'});
     const url=new URL(req.url,origin);
     if(url.origin!==origin||url.search)return send(400,{error:'PREVIEW_INVALID_REQUEST'});
     if(req.method==='POST'&&url.pathname==='/api/session'){
       if(req.headers.origin!==origin||req.headers['content-type']!=='application/json')return send(403,{error:'PREVIEW_SESSION_REQUIRED'});
       let size=0,body='';for await(const chunk of req){size+=chunk.length;if(size>1024)return send(413,{error:'PREVIEW_REQUEST_TOO_LARGE'});body+=chunk;}
       let data;try{data=JSON.parse(body);}catch{return send(400,{error:'PREVIEW_INVALID_REQUEST'});}
       if(!data||Object.keys(data).length!==1||!same(data.token,capability))return send(401,{error:'PREVIEW_SESSION_REQUIRED'});
       return send(200,{ok:true},'application/json; charset=utf-8',{'Set-Cookie':`egel_editorial_session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`});
     }
     if(req.method!=='GET')return send(405,{error:'PREVIEW_READ_ONLY'});
     if(assets.has(url.pathname)){const {body,type}=assets.get(url.pathname);return send(200,body,type);}
     if(!url.pathname.startsWith('/api/'))return send(404,{error:'PREVIEW_NOT_FOUND'});
     const cookies=(req.headers.cookie??'').split(';').map(s=>s.trim());
     const cookie=cookies.find(s=>s.startsWith('egel_editorial_session='))?.slice('egel_editorial_session='.length);
     if(!same(cookie,session))return send(401,{error:'PREVIEW_SESSION_REQUIRED'});
     const loaded=await load();validateImportedEditorialBatch(loaded.prepared);
     if(loaded.prepared.preparationBatchSha256!==pinned||loaded.inputManifestSha256!==manifest)fail('PREVIEW_INPUT_CHANGED');
     const records=loaded.prepared.records;
     if(url.pathname==='/api/records')return send(200,{records:records.map(r=>({number:r.number,id:r.question.id})),publicationAllowed:false});
     const match=/^\/api\/records\/(\d{3})(\/explanation)?$/.exec(url.pathname),r=match&&records.find(r=>r.number===match[1]);
     if(!r)return send(404,{error:'PREVIEW_NOT_FOUND'});
     if(match[2]){
       // An authenticated local operator explicitly opens the existing text.
       // This is NOT a claim that a student saved an answer in their account.
       const preview=importedEditorialPreview(r,r.question,true);
       return send(200,{html:render(preview.text),publicationAllowed:false,clinicalExpertApproved:false});
     }
     return send(200,{number:r.number,question:r.question,sources:r.sources.map(s=>({referenceId:s.referenceId,title:s.title,url:s.url,scope:s.scope,
       read:s.read,license:s.license,commercialReuse:s.commercialReuse})),preparationSha256:r.preparationSha256,
       publicationAllowed:false,clinicalExpertApproved:false,notice:'Cotejo con snapshot local. No consulta el banco de producción ni guarda respuestas.'});
   }catch{return send(503,{error:'PREVIEW_REVALIDATION_FAILED'});}
 });
 server.requestTimeout=5000;server.headersTimeout=5000;server.maxHeadersCount=50;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 origin=`http://127.0.0.1:${server.address().port}`;
 return {server,origin,launchUrl:origin+'/#'+capability,close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}
