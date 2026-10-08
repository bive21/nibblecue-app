#!/usr/bin/env node
/**
 * THE REUSE RECORD GATE: NibbleCue is built from CuddleCue's modules (the owner, 2026-10-08: "use
 * as much modules as you can from cuddlecue so the app still feel familiar"), and `docs/REUSE.md`
 * says where each one came from. This keeps that record honest:
 *
 *   1. it names the CuddleCue commit the copy was taken from (a full or short sha);
 *   2. every package and app in this repo is named in it, so a new one cannot arrive unrecorded;
 *   3. every CuddleCue patch applied since is listed with its own commit;
 *   4. when a CuddleCue checkout sits beside this repo (`../cuddlecue-app`, or CUDDLECUE_DIR), each
 *      recorded commit exists there, so a typo or a rebased-away commit is caught.
 *
 *   pnpm check:reuse
 *
 * It reads files (and asks git, when the checkout is there) and changes nothing.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const record = join(root, 'docs', 'REUSE.md');
const problems = [];

if (!existsSync(record)) {
  console.error('docs/REUSE.md is missing: the record of what came from CuddleCue.');
  process.exit(1);
}
const text = readFileSync(record, 'utf8');

const source = /^Source commit:\s*`?([0-9a-f]{7,40})`?/m.exec(text)?.[1];
if (!source) problems.push('no "Source commit: <sha>" line');

const patches = [...text.matchAll(/^- Patch:\s*`?([0-9a-f]{7,40})`?/gm)].map(m => m[1]);

const units = [
  ...readdirSync(join(root, 'packages')).map(n => `packages/${n}`),
  ...readdirSync(join(root, 'apps')).map(n => `apps/${n}`),
];
for (const u of units) if (!text.includes(u)) problems.push(`${u} is not named in docs/REUSE.md`);

const cuddle = process.env.CUDDLECUE_DIR ?? join(root, '..', 'cuddlecue-app');
let checked = 0;
if (existsSync(join(cuddle, '.git'))) {
  for (const sha of [source, ...patches].filter(Boolean)) {
    const r = spawnSync('git', ['-C', cuddle, 'cat-file', '-e', `${sha}^{commit}`]);
    if (r.status !== 0) problems.push(`commit ${sha} is not in ${cuddle}`);
    checked += 1;
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(`reuse record: ${p}`);
  process.exit(1);
}
console.log(
  `reuse record: source ${source}, ${patches.length} patch(es), ${units.length} units named` +
    (checked > 0
      ? `, ${checked} commit(s) found in ${cuddle}`
      : ' (no CuddleCue checkout beside this repo; commits not verified)'),
);
