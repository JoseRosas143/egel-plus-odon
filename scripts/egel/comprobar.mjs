/** Comprobacion LOCAL: no imprime claves, no se conecta, no cambia archivos. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let failed = false;
function check(label, ok) {
  console.log(`${ok ? 'OK' : 'REVISAR'}: ${label}`);
  if (!ok) failed = true;
}
const major = Number(process.versions.node.split('.')[0]);
check('Node.js 22 o posterior', major >= 22);
const envPath = path.join(root, '.env.local');
check('.env.local existe en la raiz', fs.existsSync(envPath));
if (fs.existsSync(envPath)) {
  // Se lee solo en este proceso. No se envia a terceros ni se imprime.
  try { loadEnvFile(envPath); }
  catch { check('.env.local se puede interpretar', false); }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
check('La URL corresponde a Egel', url === 'https://zbfgcfajiwhfhewkstvi.supabase.co');
check('La clave tiene formato publicable (valor oculto)', /^sb_publishable_[A-Za-z0-9_-]+$/.test(key || ''));
const ignored = spawnSync('git', ['check-ignore', '-q', '.env.local'], { cwd: root });
const tracked = spawnSync('git', ['ls-files', '--', '.env.local'], { cwd: root, encoding: 'utf8' });
check('.env.local esta excluido y no rastreado por Git', ignored.status === 0 && tracked.status === 0 && tracked.stdout.trim() === '');
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const dependencies = { ...pkg.devDependencies, ...pkg.dependencies };
  for (const name of ['next', 'react', '@supabase/ssr', '@supabase/supabase-js']) {
    check(`Dependencia declarada: ${name}`, Boolean(dependencies[name]));
  }
} catch { check('package.json legible', false); }
console.log('\nEsta comprobacion no valida login, permisos RLS ni la conexion remota.');
process.exitCode = failed ? 1 : 0;
