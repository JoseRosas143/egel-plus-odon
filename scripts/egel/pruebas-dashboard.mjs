// Offline checks. Database and session clients are doubles, not live Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');
function load(file, imports = {}) {
  const result = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', result.outputText)(id => {
    if (Object.hasOwn(imports, id)) return imports[id];
    throw new Error(`Unexpected import: ${id}`);
  }, loaded, loaded.exports);
  return loaded.exports;
}
const d = load('src/lib/estudiante/dashboard.ts');
const now = new Date('2026-10-16T04:30:00Z'); // Still Oct 15 in Mexico City.
test('countdown uses profile timezone, not UTC or browser timezone', () => {
  assert.equal(d.examCountdown('2026-10-16', 'America/Mexico_City', now).days, 1);
  assert.equal(d.examCountdown('2026-10-16', 'Asia/Tokyo', now).state, 'today');
});
test('exam today is explicit', () => assert.equal(d.examCountdown('2026-10-15', 'America/Mexico_City', now).state, 'today'));
test('past date never shows negative countdown', () => {
  const exam = d.examCountdown('2026-10-14', 'America/Mexico_City', now);
  assert.equal(exam.state, 'past'); assert.equal(exam.days, 0);
});
test('unset date is not zero days', () => {
  assert.equal(d.examCountdown(null, 'America/Mexico_City', now).state, 'unset');
  assert.equal(d.examCountdown(null, 'America/Mexico_City', now).days, null);
});
for (const date of ['2026-02-29', '2026-13-01', '2026-00-01', 'not a date', '1899-12-31', '2201-01-01']) {
  test(`invalid date stays honest: ${date}`, () => assert.equal(d.examCountdown(date, 'UTC', now).state, 'unavailable'));
}
test('invalid timezone does not silently change calendar', () => assert.equal(d.examCountdown('2026-10-16', 'Not/AZone', now).state, 'unavailable'));
test('leap year and year boundary', () => {
  assert.equal(d.examCountdown('2028-03-01', 'UTC', new Date('2028-02-28T23:59:00Z')).days, 2);
  assert.equal(d.examCountdown('2027-01-01', 'UTC', new Date('2026-12-31T23:59:00Z')).days, 1);
});
test('DST counts calendar days, not elapsed hours', () => {
  assert.equal(d.examCountdown('2026-03-09', 'America/New_York', new Date('2026-03-08T05:30:00Z')).days, 1);
});
test('Spanish exam date preserves day', () => assert.match(d.examCountdown('2026-12-06', 'America/Mexico_City', now).dateLabel, /6 de diciembre de 2026/));

function repository(results) {
  const calls = [];
  const db = { from(table) {
    const index = calls.length;
    const call = { table, filters: [] }; calls.push(call);
    return { select(fields, options) {
      Object.assign(call, { fields, options });
      const query = { eq(field, value) { call.filters.push([field, value]); return query; },
        then(resolve, reject) { return Promise.resolve().then(() => {
          const result = results[index]; if (result instanceof Error) throw result; return result;
        }).then(resolve, reject); } };
      return query;
    } };
  } };
  const r = load('src/lib/estudiante/dashboard-repository.ts', {
    'server-only': {}, '@/lib/supabase/server': { createClient: async () => db },
    '@/lib/estudio/domain': { BANK_ID: 'CURRENT_BANK' }, './dashboard': d,
  });
  return { ...r, calls };
}
const count = n => ({ count: n, error: null });
test('four exact HEAD counts, no note/answer payloads, bank constrained', async () => {
  const r = repository([count(469), count(12), count(8), count(3)]);
  assert.deepEqual(await r.readStudentDashboard('verified-owner'), { total: 469, answered: 12, notes: 8, favorites: 3 });
  assert.equal(r.calls.length, 4);
  for (const call of r.calls) {
    assert.equal(call.table, 'questions');
    assert.deepEqual(call.options, { head: true, count: 'exact' });
    assert.deepEqual(call.filters[0], ['bank_id', 'CURRENT_BANK']);
  }
});
test('distinct parent question counts and explicit private owner filters', async () => {
  const r = repository([count(469), count(1), count(1), count(1)]);
  await r.readStudentDashboard('verified-owner');
  assert.equal(r.calls[1].fields, 'id,question_attempts!inner(user_id)');
  assert.deepEqual(r.calls[1].filters[1], ['question_attempts.user_id', 'verified-owner']);
  assert.equal(r.calls[2].fields, 'id,study_notes!inner(user_id)');
  assert.deepEqual(r.calls[2].filters[1], ['study_notes.user_id', 'verified-owner']);
  assert.deepEqual(r.calls[3].filters.slice(1), [['study_notes.user_id', 'verified-owner'], ['study_notes.favorite', true]]);
});
test('query failure shows unavailable, never fabricated zero; healthy cards survive', async () => {
  const r = repository([count(469), { error: { code: 'DENIED' }, count: null }, count(0), count(0)]);
  assert.deepEqual(await r.readStudentDashboard('owner'), { total: 469, answered: null, notes: 0, favorites: 0 });
});
test('network rejection stays isolated', async () => {
  const r = repository([count(469), new Error('private details'), count(2), count(1)]);
  assert.deepEqual(await r.readStudentDashboard('owner'), { total: 469, answered: null, notes: 2, favorites: 1 });
});
test('missing exact count is not zero', async () => {
  const r = repository([count(null), count(-1), count(0), count(1.5)]);
  assert.deepEqual(await r.readStudentDashboard('owner'), { total: null, answered: null, notes: 0, favorites: null });
});
test('client creation failure returns unavailable without error details', async () => {
  const r = load('src/lib/estudiante/dashboard-repository.ts', {
    'server-only': {}, '@/lib/supabase/server': { createClient: async () => { throw new Error('secret'); } },
    '@/lib/estudio/domain': { BANK_ID: 'CURRENT_BANK' }, './dashboard': d,
  });
  assert.deepEqual(await r.readStudentDashboard('owner'), d.unavailableStats);
});
