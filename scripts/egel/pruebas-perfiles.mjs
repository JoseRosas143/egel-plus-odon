// Pruebas sin red. Supabase y Next.js se sustituyen por dobles explicitamente.
// Ejecutar desde la app: node --test scripts/egel/pruebas-perfiles.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'package.json'));
let ts;
try { ts = require('typescript'); }
catch { console.error('Falta typescript en las dependencias locales del proyecto.'); process.exit(1); }
function load(relative, imports = {}) {
  const result = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    fileName: relative, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
  });
  assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', result.outputText)((id) => {
    if (Object.hasOwn(imports, id)) return imports[id];
    throw new Error(`Importacion no simulada: ${id}`);
  }, mod, mod.exports);
  return mod.exports;
}
const base = 'src/lib/estudiante/';
const domain = load(base + 'domain.ts');
const http = load(base + 'http.ts');
const handlers = load(base + 'handlers.ts', { './domain': domain, './http': http });
const origin = 'http://localhost:3000';
const makeRequest = (body, headers = {}) => new Request(origin + '/api/estudiante/perfil', {
  method: 'PATCH', headers: { origin, 'content-type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const profile = { user_id: 'user-A', display_name: 'Alumno A', timezone: 'America/Mexico_City', created_at: 'test', updated_at: 'test' };
const preferences = { user_id: 'user-A', daily_goal_minutes: 20, exam_date: null, preferred_mode: 'sequential', theme: 'system', created_at: 'test', updated_at: 'test' };
function authenticated(options = {}) {
  const calls = [];
  const repository = Object.fromEntries(Object.entries({ profile, preferences }).map(([resource, data]) => [resource, {
    read: async () => { calls.push(['read', resource]); return { data: options.missing ? null : data, failed: !!options.failed }; },
    update: async patch => { calls.push(['update', resource, patch]); return { data: options.missing ? null : { ...data, ...patch }, failed: !!options.failed }; },
  }]));
  return { calls, auth: async () => ({ ok: true, repository }) };
}
async function expectCode(response, status, code) {
  assert.equal(response.status, status);
  const json = await response.json();
  assert.equal(json.ok, false); assert.equal(json.error, code);
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  return json;
}
test('perfil valido se normaliza sin alterar el ID', () => {
  assert.deepEqual(domain.validateProfilePatch({ display_name: '  Jose  ' }), { ok: true, value: { display_name: 'Jose' } });
});
for (const [label, value] of [
  ['vacio', {}], ['nulo', null], ['arreglo', []], ['user_id', { user_id: 'other' }],
  ['rol editable', { display_name: 'X', role: 'admin' }], ['marca de tiempo', { updated_at: 'test' }],
  ['nombre en blanco', { display_name: '   ' }], ['nombre excesivo', { display_name: 'x'.repeat(101) }],
  ['nombre no textual', { display_name: 5 }], ['control en nombre', { display_name: 'a\nb' }],
  ['zona falsa', { timezone: 'invalid/nonsense' }], ['prototipo JSON', JSON.parse('{"__proto__":{},"display_name":"X"}')],
]) test(`perfil rechaza ${label}`, () => assert.equal(domain.validateProfilePatch(value).ok, false));
test('zona horaria reconocida', () => assert.equal(domain.validateProfilePatch({ timezone: 'America/Mexico_City' }).ok, true));
for (const [label, value] of [
  ['meta pequena', { daily_goal_minutes: 4 }], ['meta grande', { daily_goal_minutes: 241 }],
  ['meta decimal', { daily_goal_minutes: 5.5 }], ['meta textual', { daily_goal_minutes: '20' }],
  ['fecha inexistente', { exam_date: '2026-02-30' }], ['bisiesto falso', { exam_date: '2025-02-29' }],
  ['fecha local', { exam_date: '15/10/2026' }], ['modo invalido', { preferred_mode: 'admin' }],
  ['tema invalido', { theme: 'rainbow' }], ['otra cuenta', { user_id: 'user-B' }],
]) test(`preferencias rechazan ${label}`, () => assert.equal(domain.validatePreferencesPatch(value).ok, false));
test('preferencias validas, fecha bisiesta real y null', () => {
  assert.equal(domain.validatePreferencesPatch({ daily_goal_minutes: 240, exam_date: '2028-02-29', theme: 'dark', preferred_mode: 'review' }).ok, true);
  assert.equal(domain.validatePreferencesPatch({ exam_date: null }).ok, true);
});
for (const [label, headers] of [
  ['otro origen', { origin: 'https://foreign.invalid' }], ['origen null', { origin: 'null' }],
  ['origen vacio', { origin: '' }], ['cross-site', { 'sec-fetch-site': 'cross-site' }],
]) test(`PATCH rechaza ${label} antes de autenticar`, async () => {
  let calls = 0;
  await expectCode(await handlers.handlePatch(makeRequest({ display_name: 'X' }, headers), async () => { calls++; throw new Error(); }, 'profile'), 403, 'ORIGIN_NOT_ALLOWED');
  assert.equal(calls, 0);
});
test('PATCH rechaza ausencia de Origin', async () => {
  const r = makeRequest({ display_name: 'X' }); r.headers.delete('origin');
  assert.equal(http.sameOriginMutation(r), false);
});
for (const resource of ['profile', 'preferences']) {
  test(`GET ${resource} sin sesion devuelve 401`, async () => {
    await expectCode(await handlers.handleRead(async () => ({ ok: false, status: 401, code: 'AUTH_REQUIRED' }), resource), 401, 'AUTH_REQUIRED');
  });
  test(`GET ${resource} autentica y devuelve solo su recurso`, async () => {
    const fixture = authenticated(); const response = await handlers.handleRead(fixture.auth, resource);
    const result = await response.json();
    assert.equal(response.status, 200); assert.equal(result[resource].user_id, 'user-A');
    assert.equal(Object.keys(result).length, 2); assert.deepEqual(fixture.calls, [['read', resource]]);
    assert.match(response.headers.get('cache-control'), /private.*no-store/);
    assert.equal(response.headers.get('vary'), 'Cookie');
  });
  test(`GET ${resource} fallo DB no filtra informacion`, async () => {
    await expectCode(await handlers.handleRead(authenticated({ failed: true }).auth, resource), 503, 'DATABASE_UNAVAILABLE');
  });
  test(`GET ${resource} sin fila no inventa perfil`, async () => {
    await expectCode(await handlers.handleRead(authenticated({ missing: true }).auth, resource), 409, 'STUDENT_DATA_MISSING');
  });
}
test('GET error de servidor omite secretos', async () => {
  const response = await handlers.handleRead(async () => { throw new Error('SECRET_EXCEPTION'); }, 'profile');
  const result = await expectCode(response, 503, 'SERVICE_UNAVAILABLE');
  assert.equal(JSON.stringify(result).includes('SECRET_EXCEPTION'), false);
});
test('PATCH sin sesion no procesa cambios', async () => {
  await expectCode(await handlers.handlePatch(makeRequest({ display_name: 'X' }), async () => ({ ok: false, status: 401, code: 'AUTH_REQUIRED' }), 'profile'), 401, 'AUTH_REQUIRED');
});
for (const [label, body, headers, status, code] of [
  ['JSON roto', '{', {}, 400, 'INVALID_JSON'],
  ['tipo texto', '{}', { 'content-type': 'text/plain' }, 415, 'JSON_REQUIRED'],
  ['campo prohibido', { user_id: 'user-B' }, {}, 400, 'INVALID_INPUT'],
  ['tamano declarado', '{}', { 'content-length': '99999' }, 413, 'BODY_TOO_LARGE'],
  ['tamano real', 'x'.repeat(4097), {}, 413, 'BODY_TOO_LARGE'],
]) test(`PATCH ${label}`, async () => {
  const f = authenticated(); await expectCode(await handlers.handlePatch(makeRequest(body, headers), f.auth, 'profile'), status, code);
  assert.deepEqual(f.calls, []);
});
test('PATCH acota bytes incluso en transferencia por bloques', async () => {
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(3000)); controller.enqueue(new Uint8Array(3000)); controller.close();
  }});
  const request = new Request(origin + '/api/estudiante/perfil', { method: 'PATCH', headers: { origin, 'content-type': 'application/json' }, body: stream, duplex: 'half' });
  await expectCode(await handlers.handlePatch(request, authenticated().auth, 'profile'), 413, 'BODY_TOO_LARGE');
});
test('PATCH actualiza solo campos validados', async () => {
  const f = authenticated(); const response = await handlers.handlePatch(makeRequest({ display_name: '  Nuevo  ' }), f.auth, 'profile');
  assert.equal(response.status, 200); assert.equal((await response.json()).profile.display_name, 'Nuevo');
  assert.deepEqual(f.calls, [['update', 'profile', { display_name: 'Nuevo' }]]);
});
test('PATCH preferencias devuelve el cambio permitido', async () => {
  const f = authenticated(); const response = await handlers.handlePatch(makeRequest({ daily_goal_minutes: 35, exam_date: null }), f.auth, 'preferences');
  assert.equal(response.status, 200); assert.equal((await response.json()).preferences.daily_goal_minutes, 35);
});
test('PATCH error DB se traduce a 503', async () => {
  await expectCode(await handlers.handlePatch(makeRequest({ theme: 'light' }), authenticated({ failed: true }).auth, 'preferences'), 503, 'DATABASE_UNAVAILABLE');
});
function repositoryFixture(authResult, options = {}) {
  const calls = [];
  const client = { auth: { getUser: async () => { calls.push(['getUser']); if (options.throwAuth) throw new Error('SECRET'); return authResult; } },
    from(table) {
      calls.push(['from', table]); const chain = {};
      for (const method of ['select', 'eq', 'update']) chain[method] = (...args) => { calls.push([method, ...args]); return chain; };
      chain.maybeSingle = async () => { calls.push(['maybeSingle']); return { data: table === 'profiles' ? profile : preferences, error: options.failed ? { message: 'SECRET_DB' } : null }; };
      return chain;
    },
  };
  const repo = load(base + 'repository.ts', { '@/lib/supabase/server': { createClient: async () => client } });
  return { ...repo, calls };
}
for (const [label, result, status] of [
  ['sin usuario', { data: { user: null }, error: null }, 401],
  ['usuario anonimo', { data: { user: { id: 'A', is_anonymous: true } }, error: null }, 401],
  ['sesion ausente', { data: { user: null }, error: { name: 'AuthSessionMissingError' } }, 401],
  ['token invalido', { data: { user: null }, error: { status: 401 } }, 401],
  ['servidor Auth caido', { data: { user: null }, error: { status: 500 } }, 503],
]) test(`repositorio ${label}`, async () => {
  const f = repositoryFixture(result); const res = await f.authenticateStudent();
  assert.equal(res.ok, false); assert.equal(res.status, status); assert.deepEqual(f.calls, [['getUser']]);
});
test('repositorio ata TODAS las lecturas y cambios al user.id verificado', async () => {
  const f = repositoryFixture({ data: { user: { id: 'user-A', is_anonymous: false, user_metadata: { role: 'admin', user_id: 'user-B' } } }, error: null });
  const res = await f.authenticateStudent(); assert.equal(res.ok, true);
  await res.repository.profile.read(); await res.repository.profile.update({ display_name: 'X' });
  await res.repository.preferences.read(); await res.repository.preferences.update({ theme: 'dark' });
  assert.deepEqual(f.calls.filter(c => c[0] === 'eq'), Array(4).fill(['eq', 'user_id', 'user-A']));
  assert.deepEqual(f.calls.filter(c => c[0] === 'from').map(c => c[1]), ['profiles', 'profiles', 'study_preferences', 'study_preferences']);
});
test('repositorio error inesperado no expone secretos', async () => {
  const f = repositoryFixture(null, { throwAuth: true }); assert.deepEqual(await f.authenticateStudent(), { ok: false, code: 'AUTH_UNAVAILABLE', status: 503 });
});
for (const [folder, resource] of [['perfil', 'profile'], ['preferencias', 'preferences']]) {
  test(`ruta ${folder} espera connection y delega GET/PATCH`, async () => {
    const events = [];
    const route = load(`src/app/api/estudiante/${folder}/route.ts`, {
      'next/server': { connection: async () => { events.push('connection'); } },
      '@/lib/estudiante/repository': { authenticateStudent: () => {} },
      '@/lib/estudiante/handlers': {
        handleRead: async (_auth, r) => { events.push(['GET', r]); return Response.json({ ok: true }); },
        handlePatch: async (_req, _auth, r) => { events.push(['PATCH', r]); return Response.json({ ok: true }); },
      },
    });
    await route.GET(); await route.PATCH(makeRequest({}));
    assert.deepEqual(events, ['connection', ['GET', resource], 'connection', ['PATCH', resource]]);
  });
}
