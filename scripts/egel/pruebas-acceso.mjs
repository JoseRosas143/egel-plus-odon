// No network, no real accounts and no emails. SDK and framework are explicit test doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');
function load(relative, imports = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    fileName: relative, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, strict: true },
  });
  assert.equal(compiled.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, relative);
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputText)(id => {
    if (Object.hasOwn(imports, id)) return imports[id];
    throw new Error(`Unmocked import: ${id}`);
  }, mod, mod.exports);
  return mod.exports;
}
const student = load('src/lib/estudiante/domain.ts');
const http = load('src/lib/estudiante/http.ts');
const domain = load('src/lib/acceso/domain.ts', { '../estudiante/domain': student });
const handlers = load('src/lib/acceso/handlers.ts', { '../estudiante/http': http, './domain': domain });
const origin = 'http://localhost:3000';
const credentials = { email: 'test@example.invalid', password: 'Only-a-test-value-10' };
const registration = { ...credentials, display_name: '  Alumno A  ', confirm_password: credentials.password };
function request(body = credentials, extra = {}) {
  return new Request(`${origin}/api/auth/login`, { method: 'POST', headers: {
    origin, 'content-type': 'application/json', ...extra,
  }, body: typeof body === 'string' ? body : JSON.stringify(body) });
}
function fixture(options = {}) {
  const calls = [];
  const outcome = { error: options.error ?? null, signedIn: options.signedIn ?? true };
  const adapter = {
    login: async data => { calls.push(['login', data]); if (options.throws) throw new Error('PRIVATE_EXCEPTION'); return outcome; },
    signup: async (data, url) => { calls.push(['signup', data, url]); return outcome; },
    logout: async () => { calls.push(['logout']); return { error: options.error ?? null }; },
    session: async () => ({ error: options.error ?? null, user: options.noUser ? null : { id: 'A', email: credentials.email } }),
    exchange: async (code, flowId) => { calls.push(['exchange', code, flowId]); return outcome; },
    respond: res => { calls.push(['respond']); return res; },
  };
  return { calls, create: () => adapter };
}
async function code(res, status, expected) {
  assert.equal(res.status, status);
  const data = await res.json(); assert.equal(data.error, expected); assert.equal(data.ok, false);
  assert.match(res.headers.get('cache-control') ?? '', /no-store/); return data;
}
test('normalizes email and name, never password', () => {
  const value = { ...registration, email: ` ${credentials.email} `, password: '  long password  ', confirm_password: '  long password  ' };
  const result = domain.validateCredentials(value, true);
  assert.equal(result.ok, true); assert.equal(result.value.display_name, 'Alumno A');
  assert.equal(result.value.email, credentials.email); assert.equal(result.value.password, value.password);
  assert.equal('confirm_password' in result.value, false);
});
for (const [label, value] of [
  ['null', null], ['array', []], ['empty', {}], ['admin', { ...registration, role: 'admin' }],
  ['other user', { ...registration, user_id: 'B' }], ['bad email', { ...registration, email: 'none' }],
  ['email control', { ...registration, email: 'a\n@example.invalid' }], ['missing name', { ...registration, display_name: '' }],
  ['long name', { ...registration, display_name: 'x'.repeat(101) }], ['short password', { ...registration, password: '123' }],
  ['confirmation', { ...registration, confirm_password: 'wrong' }], ['excessive password', { ...registration, password: 'x'.repeat(257) }],
  ['prototype', JSON.parse('{"__proto__":{},"email":"test@example.invalid","password":"test-password"}')],
]) test(`registration rejects ${label}`, () => assert.equal(domain.validateCredentials(value, true).ok, false));
test('login accepts existing short password but registration does not', () => {
  assert.equal(domain.validateCredentials({ ...credentials, password: 'short' }).ok, true);
  assert.equal(domain.validateCredentials({ ...registration, password: 'short', confirm_password: 'short' }, true).ok, false);
});
for (const mode of ['login', 'registro', 'salir']) {
  for (const [label, headers] of [['cross origin', { origin: 'https://elsewhere.invalid' }], ['null origin', { origin: 'null' }], ['cross site', { 'sec-fetch-site': 'cross-site' }]]) {
    test(`${mode} rejects ${label} before SDK`, async () => {
      let calls = 0;
      await code(await handlers.handleAuth(request({}, headers), mode, () => { calls++; throw new Error(); }), 403, 'ORIGIN_NOT_ALLOWED');
      assert.equal(calls, 0);
    });
  }
}
for (const [label, body, headers, status, err] of [
  ['text', '{}', { 'content-type': 'text/plain' }, 415, 'JSON_REQUIRED'],
  ['invalid JSON', '{', {}, 400, 'INVALID_JSON'], ['oversize', 'x'.repeat(4097), {}, 413, 'BODY_TOO_LARGE'],
  ['role', { ...credentials, role: 'admin' }, {}, 400, 'INVALID_INPUT'],
]) test(`request rejects ${label}`, async () => {
  const f = fixture(); await code(await handlers.handleAuth(request(body, headers), 'login', f.create), status, err); assert.deepEqual(f.calls, []);
});
test('login returns fixed next, never credentials or tokens', async () => {
  const f = fixture(); const data = await (await handlers.handleAuth(request(), 'login', f.create)).json();
  assert.deepEqual(data, { ok: true, state: 'SIGNED_IN', next: '/cuenta' });
  assert.equal(JSON.stringify(data).includes(credentials.password), false);
});
test('signup allowlists metadata and fixes callback', async () => {
  const f = fixture({ signedIn: false }); const result = await handlers.handleAuth(request(registration), 'registro', f.create);
  assert.deepEqual(await result.json(), { ok: true, state: 'CHECK_EMAIL' });
  assert.equal(f.calls[0][2], origin + '/auth/callback'); assert.equal(f.calls[0][1].display_name, 'Alumno A');
  assert.deepEqual(Object.keys(f.calls[0][1]).sort(), ['display_name', 'email', 'password']);
});
test('signup obeys provider session result without changing confirmation settings', async () => {
  const result = await handlers.handleAuth(request(registration), 'registro', fixture().create);
  assert.equal((await result.json()).state, 'SIGNED_IN');
});
test('login rejects a success result without session', async () => {
  await code(await handlers.handleAuth(request(), 'login', fixture({ signedIn: false }).create), 401, 'CREDENTIALS_REJECTED');
});
for (const [provider, status, expected] of [
  ['invalid_credentials', 401, 'CREDENTIALS_REJECTED'], ['email_not_confirmed', 403, 'EMAIL_NOT_CONFIRMED'],
  ['over_email_send_rate_limit', 429, 'TOO_MANY_ATTEMPTS'], ['weak_password', 400, 'PASSWORD_REJECTED'],
  ['email_address_not_authorized', 503, 'EMAIL_DELIVERY_RESTRICTED'], ['signup_disabled', 403, 'SIGNUP_DISABLED'],
  ['captcha_failed', 403, 'CAPTCHA_REQUIRED'], ['new_unexpected_error', 503, 'AUTH_UNAVAILABLE'],
]) test(`maps ${provider} without provider message`, async () => {
  const f = fixture({ error: { code: provider, message: 'PRIVATE_MESSAGE' } });
  const data = await code(await handlers.handleAuth(request(), 'login', f.create), status, expected);
  assert.equal(JSON.stringify(data).includes('PRIVATE_MESSAGE'), false);
});
test('SDK exception does not leak', async () => {
  const data = await code(await handlers.handleAuth(request(), 'login', fixture({ throws: true }).create), 503, 'AUTH_UNAVAILABLE');
  assert.equal(JSON.stringify(data).includes('PRIVATE_EXCEPTION'), false);
});
test('logout returns fixed location', async () => {
  const data = await (await handlers.handleAuth(request({}), 'salir', fixture().create)).json();
  assert.deepEqual(data, { ok: true, next: '/login' });
});
test('logout refuses arbitrary scope', async () => {
  const f = fixture(); await code(await handlers.handleAuth(request({ scope: 'global' }), 'salir', f.create), 400, 'INVALID_INPUT');
  assert.deepEqual(f.calls, []);
});
test('session missing returns 401', async () => { await code(await handlers.handleSession(fixture({ noUser: true }).create), 401, 'AUTH_REQUIRED'); });
test('session outage returns 503', async () => { await code(await handlers.handleSession(fixture({ error: { status: 500 }, noUser: true }).create), 503, 'AUTH_UNAVAILABLE'); });
test('session failure ignores any stale user', async () => { await code(await handlers.handleSession(fixture({ error: { status: 401 } }).create), 401, 'AUTH_REQUIRED'); });
test('session exposes minimal user, no tokens', async () => {
  const response = await handlers.handleSession(fixture().create); const data = await response.json();
  assert.deepEqual(data, { ok: true, user: { id: 'A', email: credentials.email } });
  assert.equal(response.headers.get('vary'), 'Cookie');
});
for (const params of ['', '?code=', '?code=a&code=b', '?error=bad&code=a', '?code=a&sb_flow_id=x&sb_flow_id=y', '?code=' + 'x'.repeat(2049)]) {
  test(`invalid callback ${params.slice(0, 35)}`, async () => {
    const f = fixture(); const response = await handlers.handleCallback(new Request(origin + '/auth/callback' + params), f.create);
    assert.equal(response.status, 303); assert.equal(response.headers.get('location'), origin + '/login?aviso=confirmacion');
    assert.deepEqual(f.calls, []);
  });
}
test('callback consumes code and flow ID, ignores external next', async () => {
  const f = fixture(); const response = await handlers.handleCallback(new Request(origin + '/auth/callback?code=abc&sb_flow_id=flow-1&next=https://evil.invalid'), f.create);
  assert.equal(response.headers.get('location'), origin + '/cuenta'); assert.deepEqual(f.calls[0], ['exchange', 'abc', 'flow-1']);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
});
test('failed exchange drops codes and provider text from redirect', async () => {
  const response = await handlers.handleCallback(new Request(origin + '/auth/callback?code=abc'), fixture({ error: { code: 'bad' } }).create);
  assert.equal(response.headers.get('location'), origin + '/login?aviso=confirmacion');
});

function adapterFixture() {
  let settings; const calls = []; const map = new Map();
  const sdk = { auth: {
    signInWithPassword: async data => { calls.push(['login', data]); settings.cookies.setAll([{ name:'sb-session',value:'test-cookie',options:{path:'/',sameSite:'lax'} }], { 'Cache-Control': 'no-store' }); return {error:null,data:{session:{access_token:'NEVER_RETURN'}}}; },
    signUp: async data => {calls.push(['signup',data]); return {error:null,data:{session:null}};},
    signOut: async data => {calls.push(['logout',data]); return {error:null};},
    getUser: async () => ({error:null,data:{user:{id:'A',email:'a@example.invalid',is_anonymous:false}}}),
    exchangeCodeForSession: async (code, options) => {calls.push(['exchange',code,options]); return {error:null,data:{session:{}}};},
  }};
  class MockResponse extends Response { constructor(body, init) {super(body, init); this.cookieWrites=[]; this.cookies={set:(...args)=>this.cookieWrites.push(args)};} }
  const impl = load('src/lib/acceso/adapter.ts', {
    '@supabase/ssr':{createServerClient:(url,key,options)=>{settings=options; return sdk;}},
    'next/server':{NextResponse:MockResponse}, '@/lib/supabase/environment':{getSupabaseEnvironment:()=>({url:'https://project.invalid',publishableKey:'not-real'})},
  });
  const req = {cookies:{getAll:()=>[...map].map(([name,value])=>({name,value})),set:(name,value)=>map.set(name,value)}};
  return {adapter:impl.createRequestAuth(req),calls,sdk,getSettings:()=>settings};
}
test('adapter propagates session cookies with private headers', async () => {
  const f=adapterFixture(); const out=await f.adapter.login(credentials); assert.deepEqual(out,{error:null,signedIn:true});
  const response=f.adapter.respond(Response.json({ok:true})); assert.equal(response.cookieWrites[0][0],'sb-session');
  assert.match(response.headers.get('cache-control'),/private.*no-store/); assert.equal(response.headers.get('vary'),'Cookie');
  assert.equal((await response.text()).includes('test-cookie'),false);
});
test('adapter metadata never carries a role and uses email redirect', async () => {
  const f=adapterFixture(); await f.adapter.signup({...credentials,display_name:'A'},origin+'/auth/callback');
  assert.deepEqual(f.calls[0][1].options,{data:{display_name:'A'},emailRedirectTo:origin+'/auth/callback'});
});
test('logout only revokes the current session',async()=>{ const f=adapterFixture(); await f.adapter.logout(); assert.deepEqual(f.calls[0],['logout',{scope:'local'}]); });
test('adapter refuses anonymous Auth identity',async()=>{ const f=adapterFixture(); f.sdk.auth.getUser=async()=>({error:null,data:{user:{id:'A',is_anonymous:true}}}); assert.equal((await f.adapter.session()).user,null); });
test('adapter normalizes missing session error',async()=>{ const f=adapterFixture(); f.sdk.auth.getUser=async()=>({error:{name:'AuthSessionMissingError'},data:{user:null}}); assert.equal((await f.adapter.session()).error.status,401); });
test('adapter forwards flow identifier',async()=>{ const f=adapterFixture(); await f.adapter.exchange('code','flow'); assert.deepEqual(f.calls[0],['exchange','code',{flowId:'flow'}]); });
test('all delivered TS/TSX files parse (not an integration type check)',()=>{
  for(const dir of ['src/lib/acceso','src/components/acceso','src/app/login','src/app/registro','src/app/cuenta','src/app/api/auth','src/app/auth/callback']){
    for(const entry of fs.readdirSync(path.join(root,dir),{recursive:true,withFileTypes:true})){
      if(!entry.isFile() || !/\.tsx?$/.test(entry.name))continue;
      const full=path.join(entry.parentPath ?? entry.path,entry.name);
      const result=ts.transpileModule(fs.readFileSync(full,'utf8'),{fileName:full,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}});
      assert.deepEqual(result.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error),[],full);
    }
  }
});

for (const key of ['constructor', '__proto__']) test(`mapping ignores inherited property ${key}`, () => {
  assert.equal(typeof domain.errorMessage(key), 'string');
  assert.deepEqual(domain.classifyAuthError({code:key}), {code:'AUTH_UNAVAILABLE',status:503});
});
