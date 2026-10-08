#!/usr/bin/env node
/**
 * The owner's own icons, imported from `assets/brand/kit/08-icons` into the app.
 *
 *   node tools/ui/import-icons.mjs          # read every SVG there; write paths.custom.ts and the README table
 *   node tools/ui/import-icons.mjs --check  # exit 1 if either is stale, or an SVG cannot be read
 *
 * THE SEAM. The app draws every glyph from `packages/ui/src/icons/paths.ts`, by name, and the
 * owner will want to replace those drawings with their own (2026-09-19: *"i will in the future
 * want to change how these icons. make sure it is ready for me when i have the icons"*). So the
 * drop folder takes one SVG per icon, named after the icon it replaces, and this script turns
 * them into `paths.custom.ts` — the same `IconDef` shape as the built-in table, which `Icon.tsx`
 * consults first. A name with no file keeps the built-in glyph, so the set can be replaced one
 * icon at a time and looked at between each.
 *
 * WHY A GENERATED FILE rather than SVGs read at runtime: the app has no SVG parser and should
 * not carry one for sixty small drawings; a file typed against `IconName` cannot name an icon
 * that does not exist; and everything the owner's exporter got wrong is refused HERE, with the
 * fix in the message, rather than drawn wrong on a phone at 3 a.m. The conversion itself lives
 * in `import-icons.lib.mjs` so the tests can run it on SVG strings; this file is the loop over
 * the folder, the prettier pass and the `--check`.
 *
 * The README's table of file names is generated too, from the `IconName` union, so the owner's
 * instructions cannot fall behind the code — which is also why `--check` covers the README.
 */
import { format } from 'prettier';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IconImportError,
  iconNameForFile,
  iconNamesFrom,
  parseSvg,
  renderCustomPaths,
  renderReadmeBlock,
  spliceReadme,
} from './import-icons.lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DROP = join('assets', 'brand', 'kit', '08-icons');
const PATHS = join('packages', 'ui', 'src', 'icons', 'paths.ts');
const OUT = join('packages', 'ui', 'src', 'icons', 'paths.custom.ts');
const README = join(DROP, 'README.md');
const RUN = 'node tools/ui/import-icons.mjs';
const check = process.argv.includes('--check');

/** CRLF-blind, so a checkout with autocrlf on the owner's Windows machine is not "stale". */
const same = (a, b) => a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');

function put(target, text, stale) {
  const abs = join(root, target);
  if (existsSync(abs) && same(readFileSync(abs, 'utf8'), text)) return;
  stale.push(target);
  if (!check) writeFileSync(abs, text);
}

const names = iconNamesFrom(readFileSync(join(root, PATHS), 'utf8'));
const dropDir = join(root, DROP);
// plain byte order, not the locale's: the generated file must come out identical on the
// owner's Windows machine and in CI
const files = existsSync(dropDir) ? readdirSync(dropDir).sort() : [];
const svgs = files.filter(f => /\.svg$/i.test(f) && !f.startsWith('.'));
const ignored = files.filter(f => !/\.svg$/i.test(f) && !f.startsWith('.') && f !== 'README.md');

const entries = [];
const failures = [];
const report = [];
const seen = new Map();
for (const file of svgs) {
  try {
    const name = iconNameForFile(file, names);
    if (seen.has(name)) {
      throw new IconImportError(
        `"${file}" and "${seen.get(name)}" are both "${name}" — keep one`,
        file,
      );
    }
    seen.set(name, file);
    const { def, notes, summary } = parseSvg(readFileSync(join(dropDir, file), 'utf8'), file);
    entries.push({ name, file, def });
    const width = summary.strokeWidth !== undefined ? ` ${summary.strokeWidth}` : '';
    const tones = summary.tones === 2 ? ', two tones' : '';
    report.push(
      `  ${file.padEnd(14)} → ${name.padEnd(10)} ${summary.mode}${width}${tones}, ` +
        `${summary.shapes} shape${summary.shapes === 1 ? '' : 's'}, viewBox ${summary.viewBox}`,
    );
    for (const note of notes) report.push(`      note: ${note}`);
  } catch (e) {
    if (!(e instanceof IconImportError)) throw e;
    failures.push(e.message);
  }
}
for (const f of ignored) report.push(`  ${f} — ignored (only .svg files are read)`);

console.log(`icons (${DROP}):`);
console.log(
  report.length ? report.join('\n') : '  no SVG files — every icon is the built-in glyph',
);

// through prettier, so `--check` is idempotent and `pnpm lint` passes on a file nobody edits
const generated = await format(renderCustomPaths(entries), {
  ...JSON.parse(readFileSync(join(root, '.prettierrc'), 'utf8')),
  parser: 'typescript',
});

const stale = [];
put(OUT, generated, stale);
try {
  const readme = readFileSync(join(root, README), 'utf8');
  const present = entries.map(e => e.name);
  put(README, spliceReadme(readme, renderReadmeBlock(names, present)), stale);
} catch (e) {
  if (!(e instanceof IconImportError)) throw e;
  failures.push(e.message);
}

if (failures.length) {
  console.error(`\ncould not use ${failures.length} file${failures.length === 1 ? '' : 's'}:`);
  for (const f of failures) console.error(`  ${f}`);
  console.error(`\nfix the file (or remove it) and run ${RUN} again`);
  process.exit(1);
}
if (check) {
  if (stale.length) {
    console.error(`\nstale (run ${RUN}):\n  ${stale.join('\n  ')}`);
    process.exit(1);
  }
  console.log('custom icons are up to date');
} else {
  console.log(
    stale.length
      ? `\nwrote ${stale.length} file${stale.length === 1 ? '' : 's'}:\n  ${stale.join('\n  ')}`
      : '\nnothing to do',
  );
}
