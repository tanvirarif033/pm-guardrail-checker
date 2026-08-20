// Guardrail regression runner.
//
// Plain Node script (not part of the tsc build — see tsconfig.json's
// "exclude": ["tests"]) that walks guardrail-regression.cases.json against
// a running backend and reports every mismatch.
//
// Usage:
//   node backend/tests/run-regression.mjs [--model <name>] [--url <base>]

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const API_URL = argValue('--url', process.env.API_URL || 'http://localhost:3001');
const MODEL = argValue('--model', process.env.GUARDRAIL_MODEL || undefined);

const cases = JSON.parse(
  readFileSync(path.join(__dirname, 'guardrail-regression.cases.json'), 'utf8')
);

async function runCase(c) {
  const body = { prompt: c.prompt };
  if (MODEL) body.model = MODEL;

  const res = await fetch(`${API_URL}/api/guardrail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  return {
    id: c.id,
    category: c.category,
    prompt: c.prompt,
    expected: c.expected,
    actual: data.decision ?? null,
    pass: data.decision === c.expected,
    explanation: data.explanation ?? data.error ?? null,
    httpStatus: res.status,
  };
}

async function main() {
  console.log(`Running ${cases.length} regression cases against ${API_URL}${MODEL ? ` (model: ${MODEL})` : ''}\n`);

  const results = [];
  for (const c of cases) {
    try {
      const r = await runCase(c);
      results.push(r);
      const mark = r.pass ? 'PASS' : 'FAIL';
      console.log(`[${mark}] #${c.id} (${c.category}) expected=${c.expected} actual=${r.actual}`);
    } catch (err) {
      results.push({
        id: c.id,
        category: c.category,
        prompt: c.prompt,
        expected: c.expected,
        actual: null,
        pass: false,
        explanation: `Runner error: ${err.message}`,
        httpStatus: null,
      });
      console.log(`[ERROR] #${c.id} (${c.category}): ${err.message}`);
    }
  }

  const failures = results.filter((r) => !r.pass);
  const outPath = path.join(__dirname, 'last-regression-results.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2));

  console.log(`\n${results.length - failures.length}/${results.length} passed.`);
  console.log(`Full results written to ${outPath}`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`\n#${f.id} [${f.category}] expected=${f.expected} actual=${f.actual}`);
      console.log(`  prompt: ${f.prompt}`);
      console.log(`  explanation: ${f.explanation}`);
    }
    process.exitCode = 1;
  }
}

main();
