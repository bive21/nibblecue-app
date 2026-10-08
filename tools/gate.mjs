#!/usr/bin/env node
/**
 * THE GATE: every check, in order, with its own result line, ending in one line the reader greps.
 *
 *   pnpm gate            → runs every step, writes gate.log, prints `GATE_EXIT=<n>` last
 *
 * WHY A SCRIPT AND NOT A `&&` CHAIN. CuddleCue once reported three failing runs as passing because
 * the exit status that was read belonged to the `echo` after a background job, not to the gate
 * (bpnc-studio engineering.md, "Mistakes already paid for"). Here the last line of the log is
 * written by the same process that ran the steps, from their own exit codes, and it is the only
 * line a person or an agent needs to read: `GATE_EXIT=0` is green, anything else is red and the
 * step above it says which.
 *
 * Every step runs even after one fails, so one run shows every red, not just the first. Test
 * steps run with `--force` (turbo) so a cached result never stands in for a real run.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const log = join(root, 'gate.log');

const STEPS = [
  ['lint', 'pnpm lint'],
  ['typecheck', 'pnpm typecheck'],
  ['entitlements', 'pnpm test:entitlements'],
  ['brand', 'pnpm test:brand'],
  ['safety', 'pnpm test:safety'],
  ['copy scans', 'pnpm check:copy'],
  ['expo go imports', 'pnpm check:expo-go'],
  ['reuse record', 'pnpm check:reuse'],
  ['all tests (unit, scenario, boot smoke)', 'pnpm test'],
];

writeFileSync(log, `gate started ${new Date().toISOString()}\n`);
const results = [];
for (const [name, cmd] of STEPS) {
  const started = Date.now();
  const r = spawnSync(cmd, { cwd: root, shell: true, encoding: 'utf8', maxBuffer: 1 << 28 });
  const code = r.status ?? 1;
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  appendFileSync(log, `\n===== ${name}: ${cmd}\n${r.stdout ?? ''}${r.stderr ?? ''}`);
  const line = `${code === 0 ? 'PASS' : 'FAIL'}  ${name}  (${secs}s, exit ${code})`;
  appendFileSync(log, `----- ${line}\n`);
  console.log(line);
  results.push(code);
}
const failed = results.filter(c => c !== 0).length;
const exit = failed === 0 ? 0 : 1;
const summary = `\n${STEPS.length - failed}/${STEPS.length} steps passed\nGATE_EXIT=${exit}\n`;
appendFileSync(log, summary);
process.stdout.write(summary);
process.exit(exit);
