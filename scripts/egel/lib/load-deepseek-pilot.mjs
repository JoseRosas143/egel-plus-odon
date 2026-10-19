// Local operator/test loader for these two trusted repository modules only.
// Does not load an arbitrary path, bypass student authentication, or expose an HTTP endpoint.
import fs from 'node:fs/promises';
import path from 'node:path';
import * as crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
export const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(path.join(repository, 'package.json'));
export async function loadDeepSeekPilot() {
  const ts = require('typescript');
  function compile(source, imports) {
    const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    const loaded = {exports:{}};
    new Function('require','module','exports',code)(name=>{
      if (!Object.hasOwn(imports,name)) throw Error('PILOT_UNEXPECTED_IMPORT');
      return imports[name];
    },loaded,loaded.exports);
    return loaded.exports;
  }
  const budget = compile(await fs.readFile(path.join(repository,'src/lib/tutor/pilot-budget.ts'),'utf8'),{
    'server-only':{},'node:crypto':crypto,'node:fs/promises':fs,'node:path':path,
  });
  const adapter = compile(await fs.readFile(path.join(repository,'src/lib/tutor/deepseek.ts'),'utf8'),{
    'server-only':{},'node:crypto':crypto,'@ai-sdk/deepseek':await import('@ai-sdk/deepseek'),'ai':await import('ai'),'./pilot-budget':budget,
  });
  return {budget,adapter};
}
