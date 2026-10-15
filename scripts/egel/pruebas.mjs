// Pruebas locales sin red. Los SDK/framework se simulan cuando es necesario.
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
catch {
  console.error('Falta typescript en las dependencias de desarrollo del proyecto.');
  process.exit(1);
}

function load(relative, imports = {}) {
  const text = fs.readFileSync(path.join(root, relative), 'utf8');
  const compiled = ts.transpileModule(text, {
    fileName: relative,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
  });
  const errors = compiled.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error) || [];
  assert.equal(errors.length, 0, `Error de sintaxis en ${relative}`);
  const mod = { exports: {} };
  const resolver = (id) => {
    if (Object.hasOwn(imports, id)) return imports[id];
    throw new Error(`Importacion no simulada: ${id}`);
  };
  // Se ejecuta exclusivamente el codigo local del paquete; no contenido externo.
  new Function('require', 'module', 'exports', compiled.outputText)(resolver, mod, mod.exports);
  return mod.exports;
}

const env = load('src/lib/supabase/environment.ts');
const diag = load('src/lib/supabase/diagnostics.ts');
const url = 'https://zbfgcfajiwhfhewkstvi.supabase.co';
const key = 'sb_publishable_unit_test_NOT_REAL';
const config = { url, publishableKey: key };

test('acepta la URL de Egel y una clave con formato publicable', () => {
  assert.deepEqual(env.validateSupabaseEnvironment(url, key), { ok: true, value: config });
});
test('normaliza espacios y barra final', () => {
  assert.deepEqual(env.validateSupabaseEnvironment(` ${url}/ `, ` ${key} `).value, config);
});
for (const [label, badUrl, badKey, code] of [
  ['sin URL', undefined, key, 'MISSING_CONFIGURATION'],
  ['sin clave', url, undefined, 'MISSING_CONFIGURATION'],
  ['otro proyecto', 'https://other.supabase.co', key, 'WRONG_PROJECT'],
  ['HTTP inseguro', url.replace('https:', 'http:'), key, 'WRONG_PROJECT'],
  ['URL con usuario', 'https://user@zbfgcfajiwhfhewkstvi.supabase.co', key, 'WRONG_PROJECT'],
  ['URL con consulta', `${url}?x=1`, key, 'WRONG_PROJECT'],
  ['URL con ruta', `${url}/auth/v1`, key, 'WRONG_PROJECT'],
  ['URL de ataque', `${url}.evil.test`, key, 'WRONG_PROJECT'],
  ['clave secreta', url, 'sb_secret_UNIT_TEST', 'INVALID_PUBLIC_KEY'],
  ['JWT no permitido', url, 'eyJhbGciOiJIUzI1NiJ9.test.test', 'INVALID_PUBLIC_KEY'],
  ['inyeccion de cabecera', url, `${key}\r\nInjected: yes`, 'INVALID_PUBLIC_KEY'],
]) {
  test(`rechaza ${label} sin mostrar valores`, () => {
    const result = env.validateSupabaseEnvironment(badUrl, badKey);
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
    assert.equal(JSON.stringify(result).includes(key), false);
  });
}

test('diagnostico exitoso envia solo la peticion prevista', async () => {
  let called = 0;
  const result = await diag.checkSupabaseAuth(config, async (input, options) => {
    called++;
    assert.equal(input, `${url}/auth/v1/settings`);
    assert.equal(options.method, 'GET');
    assert.deepEqual(options.headers, { apikey: key });
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(JSON.stringify({ ignored: 'private-body-test' }), { status: 200 });
  });
  assert.equal(called, 1);
  assert.deepEqual(result, { httpStatus: 200, body: { ok: true, service: 'supabase-auth', status: 200 } });
  assert.equal(JSON.stringify(result).includes('private-body-test'), false);
  assert.equal(JSON.stringify(result).includes(key), false);
});
for (const status of [401, 403, 429, 500, 503]) {
  test(`HTTP ${status} remoto nunca se informa como exito`, async () => {
    const result = await diag.checkSupabaseAuth(config, async () => new Response('no reenviar', { status }));
    assert.equal(result.httpStatus, 502);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.status, status);
  });
}
test('fallo de red no expone mensaje remoto o clave', async () => {
  const result = await diag.checkSupabaseAuth(config, async () => { throw new Error(`sensitive ${key}`); });
  assert.equal(result.httpStatus, 502);
  assert.equal(JSON.stringify(result).includes(key), false);
});
test('timeout se identifica sin filtrar detalles', async () => {
  const result = await diag.checkSupabaseAuth(config, async () => {
    const e = new Error('sensitive detail'); e.name = 'TimeoutError'; throw e;
  });
  assert.equal(result.httpStatus, 504);
  assert.equal(result.body.ok, false);
});

test('route: produccion devuelve 404 y no consulta servicio', async () => {
  const old = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    let called = 0;
    const route = load('src/app/api/health/supabase/route.ts', {
      'next/server': { connection: async () => {} },
      '@/lib/supabase/environment': env,
      '@/lib/supabase/diagnostics': { checkSupabaseAuth: async () => { called++; } },
    });
    const res = await route.GET();
    assert.equal(res.status, 404);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(called, 0);
  } finally { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old; }
});

test('route: desarrollo espera la peticion y devuelve diagnostico sin claves', async () => {
  const saved = Object.fromEntries(['NODE_ENV', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'].map((k) => [k, process.env[k]]));
  Object.assign(process.env, { NODE_ENV: 'development', NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key });
  try {
    let connected = false;
    const route = load('src/app/api/health/supabase/route.ts', {
      'next/server': { connection: async () => { connected = true; } },
      '@/lib/supabase/environment': env,
      '@/lib/supabase/diagnostics': { checkSupabaseAuth: async (c) => {
        assert.equal(connected, true); assert.deepEqual(c, config);
        return { httpStatus: 200, body: { ok: true, service: 'supabase-auth', status: 200 } };
      } },
    });
    const res = await route.GET();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal((await res.text()).includes(key), false);
  } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
});

test('route: configuracion invalida evita toda solicitud remota', async () => {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = 'development';
  try {
    let called = false;
    const route = load('src/app/api/health/supabase/route.ts', {
      'next/server': { connection: async () => {} },
      '@/lib/supabase/environment': { validateSupabaseEnvironment: () => ({ ok: false, code: 'TEST', message: 'Invalid' }) },
      '@/lib/supabase/diagnostics': { checkSupabaseAuth: async () => { called = true; } },
    });
    assert.equal((await route.GET()).status, 500);
    assert.equal(called, false);
  } finally { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old; }
});

class Cookies {
  constructor() { this.values = new Map(); }
  set(name, value, options) {
    const item = typeof name === 'object' ? name : { name, value, ...options };
    this.values.set(item.name, item);
  }
  getAll() { return [...this.values.values()]; }
}

test('proxy: conserva cookies de dos renovaciones y bloquea cache compartida', async () => {
  const request = { cookies: new Cookies() };
  request.cookies.set('existing', 'local');
  let gotClaims = false;
  const mod = load('src/lib/supabase/proxy.ts', {
    './environment': { getSupabaseEnvironment: () => config },
    'next/server': { NextResponse: { next: () => ({ cookies: new Cookies(), headers: new Headers() }) } },
    '@supabase/ssr': { createServerClient: (u, k, options) => {
      assert.equal(u, url); assert.equal(k, key);
      assert.equal(options.cookies.getAll().length, 1);
      return { auth: { getClaims: async () => {
        gotClaims = true;
        options.cookies.setAll([{ name: 'session.0', value: 'A', options: { path: '/' } }]);
        options.cookies.setAll([{ name: 'session.1', value: 'B', options: { path: '/' } }]);
        return { data: null, error: null };
      } } };
    } },
  });
  const res = await mod.updateSession(request);
  assert.equal(gotClaims, true);
  assert.equal(res.cookies.getAll().length, 2);
  assert.equal(request.cookies.getAll().length, 3);
  assert.ok(res.headers.get('cache-control').includes('no-store'));
  assert.equal(res.headers.get('pragma'), 'no-cache');
});

test('server: crea un cliente nuevo por solicitud con cookies', async () => {
  let calls = 0;
  const cookies = new Cookies();
  const mod = load('src/lib/supabase/server.ts', {
    './environment': { getSupabaseEnvironment: () => config },
    'next/headers': { cookies: async () => cookies },
    '@supabase/ssr': { createServerClient: (u, k, options) => {
      calls++; options.cookies.setAll([{ name: 'unit', value: 'test', options: {} }]);
      return { unique: calls };
    } },
  });
  const a = await mod.createClient(); const b = await mod.createClient();
  assert.notEqual(a.unique, b.unique); assert.equal(cookies.getAll().length, 1);
});

test('client: delega en createBrowserClient con URL/clave de entorno', () => {
  const mod = load('src/lib/supabase/client.ts', {
    './environment': { getSupabaseEnvironment: () => config },
    '@supabase/ssr': { createBrowserClient: (u, k) => ({ u, k }) },
  });
  assert.deepEqual(mod.createClient(), { u: url, k: key });
});

console.log('Pruebas con respuestas simuladas; no verifican el SDK ni una sesion real.');
