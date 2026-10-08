/**
 * docs/DESIGN_SYSTEM.md §18: the product ships in US English — color, favorite, canceled,
 * license, analyze. This scans every string literal a person could read: the app, core and ui
 * sources, and the dev seed a dev build shows on Today. Identifiers are exempt (§18: a
 * breaking rename is not a word a person reads), so a literal with no space and no capital is
 * skipped, and so are the sync and database layers, whose strings are column names and SQL,
 * and the versioned guidance data, which changes only by shipping a new version.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const SOURCES = ['apps/mobile/src', 'packages/core/src', 'packages/ui/src'];
const SKIP = [
  /\.test\.tsx?$/,
  /\.d\.ts$/,
  /\/sync\//,
  /\/db\//,
  /\/data\/undo\.ts$/,
  /\/guidance\//,
];

export const BRITISH =
  /\b(colours?|favourites?|cancell(ed|ing)|immunis\w*|sterilis\w*|organis(e|ed|es|ing|ation)|recognis(e|ed|es|ing)|customis(e|ed|es|ing|ation)|analys(e|ed|es|ing)|centres?|grey|licences?|judgements?|behaviours?|programmes?|catalogues?)\b/i;

/** A person reads it: it has a space, or it starts with a capital. Anything else is a key. */
const readable = (s: string): boolean => {
  const v = s.trim();
  return /\s/.test(v) || /^[A-Z]/.test(v);
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

function literals(file: string): { text: string; line: number }[] {
  const src = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out: { text: string; line: number }[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      out.push({
        text: node.text,
        line: src.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return out;
}

const hitsIn = (file: string): string[] =>
  literals(file)
    .filter(l => readable(l.text) && BRITISH.test(l.text))
    .map(l => `${relative(root, file)}:${l.line} ${JSON.stringify(l.text.trim().slice(0, 70))}`);

describe('US English (DESIGN_SYSTEM.md §18)', () => {
  it('the scan is not vacuous', () => {
    expect(BRITISH.test('Sterilise the pump parts')).toBe(true);
    expect(BRITISH.test('Immunisations')).toBe(true);
    expect(BRITISH.test('it is cancelled')).toBe(true);
    expect(BRITISH.test('Pick a colour')).toBe(true);
    expect(BRITISH.test('it is canceled')).toBe(false);
    expect(BRITISH.test('Color schemes and favorites')).toBe(false);
    expect(BRITISH.test('the analysis')).toBe(false);
    expect(BRITISH.test('CANCELLED_AT_PERIOD_END')).toBe(false);
    expect(readable('cancelled')).toBe(false);
    expect(readable('Immunisations')).toBe(true);
  });

  /**
   * A MINUTE, NOT FIVE SECONDS. This one test parses every source file in three packages with
   * the TypeScript compiler, so its cost grows with the repository and vitest's default budget
   * was never sized for it: it passed in 4-point-something seconds alone and timed out whenever
   * the machine was busy with anything else (2026-09-21, on a run beside a bundle export). A
   * timeout that fires on load rather than on a defect is a test that teaches you to ignore it.
   * The ceiling is high enough to be about correctness again and low enough to catch a hang.
   */
  it('no string a person reads in the app, core or ui is spelled the British way', () => {
    const files = SOURCES.flatMap(d => walk(join(root, d))).filter(
      f => !SKIP.some(re => re.test(f)),
    );
    expect(files.length).toBeGreaterThan(200);
    expect(files.flatMap(hitsIn)).toEqual([]);
  }, 60_000);

  // (the dev seed, supabase/seed/dev.sql, is CuddleCue's repository's, and its own US English suite reads it)
});
