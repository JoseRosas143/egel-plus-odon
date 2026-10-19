// No model call by default. All pilot data stays outside the repository.
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadDeepSeekPilot,repository} from './lib/load-deepseek-pilot.mjs';

const directory = path.resolve(repository,'../egel-plus-odon-datos-privados/deepseek-piloto');
const args = process.argv.slice(2);
const fail = code => { throw Error(code); };
try {
  if (process.env.VERCEL) fail('PILOT_LOCAL_ONLY');
  const {budget,adapter} = await loadDeepSeekPilot();
  if (!args.length || (args.length === 1 && args[0] === '--help')) {
    console.log('Piloto DeepSeek local. Sin generación por defecto.\n--status\n--init --prior-spend-micro-usd=N\n--plan=C:\\ruta\\paquete.json\n--execute=C:\\ruta\\paquete.json --confirm-source-sharing\nN incluye el gasto anterior de Gemini/OpenAI de estas pruebas. US$1 = 1000000 micro-USD. No inventar N ni reiniciar el presupuesto.');
  } else if (args.length === 1 && args[0] === '--status') {
    console.log(JSON.stringify(await budget.budgetStatus(directory),null,2));
  } else if (args.length === 2 && args[0] === '--init' && /^--prior-spend-micro-usd=\d+$/.test(args[1])) {
    await budget.initializeBudget(directory,Number(args[1].split('=')[1]));
    console.log('Presupuesto inicializado sin llamadas de IA. No se sobrescriben presupuestos existentes.');
  } else {
    const live = args[0]?.startsWith('--execute=');
    const plan = args[0]?.startsWith('--plan=');
    if (!(live || plan) || (plan ? args.length !== 1 : args.length !== 2 || args[1] !== '--confirm-source-sharing')) fail('PILOT_INVALID_ARGUMENTS');
    const inputPath = path.resolve(args[0].slice(args[0].indexOf('=')+1));
    const relative = path.relative(repository,inputPath);
    if (!relative.startsWith('..'+path.sep) && !path.isAbsolute(relative)) fail('PILOT_INPUT_MUST_BE_OUTSIDE_REPOSITORY');
    const stat = await fs.stat(inputPath);
    if (!stat.isFile() || stat.size > 150000) fail('PILOT_INVALID_INPUT_FILE');
    const input = JSON.parse(await fs.readFile(inputPath,'utf8'));
    const prepared = adapter.prepareDeepSeek(input);
    if (plan) {
      console.log(JSON.stringify({mode:'plan',questionId:prepared.input.question.id,sources:prepared.input.evidence.length,
        fingerprint:prepared.fingerprint,reservationMicroUsd:budget.RESERVATION,networkCalls:0,
        warning:'La integridad de texto no prueba relevancia clínica, permisos de uso ni aprobación humana.'},null,2));
    } else {
      // An explicit operator invocation is still required; an API key alone never enables calls.
      process.env.EGEL_DEEPSEEK_PILOT_ENABLED = 'true';
      const result = await adapter.runDeepSeekPilot(directory,input);
      console.log(JSON.stringify({reused:result.reused,validation:'pending_human_review',usage:result.usage,
        budget:await budget.budgetStatus(directory),message:'Borrador guardado en el registro privado local. No publicado en la app.'},null,2));
    }
  }
} catch (e) {
  // Never print upstream errors, input text, credentials, stack traces or raw SDK objects.
  const code = e?.code ?? e?.message;
  console.error(typeof code === 'string' && /^PILOT_[A-Z_]+$/.test(code) ? code : 'PILOT_OPERATION_FAILED');
  process.exitCode = 1;
}
