/**
 * NO DASH IN ANY SENTENCE A PARENT READS (docs/DESIGN_SYSTEM.md §9; the owner, 2026-09-27, of the
 * tour: *"remove the "-" on the text, feels too AI"*). The rule held for the tour, leaving, sign-in,
 * the visit reminder and the nap outlook, each in its own test; this holds it everywhere at once.
 * It scans every string literal a person could read in the app, core and ui sources, the way
 * `usEnglish.test.ts` does: the same walk, the same literal extraction, the same `readable` rule.
 *
 * A sentence says an aside with a full stop, a comma, or a colon for `Label: detail`; a toast that
 * joins its facts with the middle dot (`Added 4 oz to the stash · Freezer`) keeps it.
 *
 * WHAT STAYS, BECAUSE IT IS NOT A DASH IN A SENTENCE:
 *   * a range, an en dash between two numbers or letters with no space (`6–8 months`, `A–Z`,
 *     `16–28 lb`, `9:05–9:50`), or the en dash the code sets between two values it fills in
 *     (`${from} – ${to}`, a time or a date range). That is typography.
 *   * a hyphen inside a word (`one-off`, `84-count`). That is spelling.
 *   * a lone dash standing for no value (`—`, `–`, `––:––`, `Every –h ––m`), the width of what
 *     it stands in for.
 *
 * WHAT IS NOT SCANNED, BECAUSE NO PARENT READS IT HERE (each one is also said where it is coded):
 *   * the boot log's lines (`crumb`, and the other names it is called by), the dev-only sync
 *     inspector, two sets of test scenarios, and a plan line's `rationale`, below.
 *   * comments and the docs, which are not literals.
 *   * the versioned published guidance (`assets/milk-guidance.*`, `assets/vaccine-guidance.*`,
 *     core's `guidance/`), which changes only by shipping a new version; the legal texts
 *     (`assets/legal/*.json`), where a change bumps the version every account accepts again; and
 *     the store title in `brand.json`. None of them is a source file this walks.
 *
 * NOT SKIPPED, UNLIKE `usEnglish.test.ts`: the sync layer. Its strings are column names and SQL,
 * which never hold a dash, and `sync/copy.ts` is every sentence the sync layer says to a parent —
 * the reconnect toast, the duplicate toasts, the banner.
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
  // SQL: a hyphen with a space either side is subtraction there, not a dash
  /\/db\//,
  /\/data\/undo\.ts$/,
  // versioned published guidance (CLAUDE.md §2 rule 5), changed only by shipping a new version
  /\/guidance\//,
];

/** Whole files no parent reads, each with its reason. */
const NEVER_SHOWN: readonly { file: RegExp; why: string }[] = [
  {
    file: /apps\/mobile\/src\/sheets\/SyncInspectorSheet\.tsx$/,
    why: 'the sync inspector is a developer’s sheet, reachable only in a dev build',
  },
  {
    file: /packages\/core\/src\/schedule\/naps\.scenarios\.ts$/,
    why: 'the nap outlook’s backtest scenarios: names a test prints, never a screen',
  },
  {
    file: /packages\/core\/src\/sync\/scenarios\.ts$/,
    why: 'the sync acceptance scenarios: test support the app never bundles (no-bundle.test.ts)',
  },
];

/**
 * Calls whose arguments go to the boot log, never to a screen: the developer's `area: message`
 * lines (`sync: pull failed — <error>`). `deps.log` and `d.log` are the same log, handed in.
 */
const DEV_LOG = /^(?:crumb|deps\.crumb|d\.log|deps\.log|console\.\w+)$/;
/** A function that only builds a boot-log line, for `crumb` to write. */
const DEV_LOG_LINES = new Set(['photoTroubleLine']);
/** A plan line's `rationale` is the reasoning behind the matrix, for the owner, and never shown. */
const UNSHOWN_FIELDS: readonly { file: RegExp; field: string }[] = [
  { file: /\/plan\/entitlements\.ts$/, field: 'rationale' },
];

/** A person reads it: it has a space, or it starts with a capital. Anything else is a key. */
const readable = (s: string): boolean => {
  const v = s.trim();
  return /\s/.test(v) || /^[A-Z]/.test(v);
};

/** An em dash or a horizontal bar: never a range and never a digit, so in prose it is an aside. */
const EM = /[—―]/;
/**
 * An en dash, a figure dash or a hyphen with a space before or after it: a dash standing in a
 * sentence (`Saved – bath`). With no space it is a range or a hyphenated word, and stays.
 */
const SPACED = /(?:^|\s)[‒–-](?=\s|$)/;
/**
 * An em dash touching a space, in any literal at all: the joint of a sentence built in pieces,
 * `${sentence} — ${count} earlier entries moved too`, whose middle alone is not "readable".
 */
const JOINER = /\s[—―]|[—―]\s/;

export const saysDash = (text: string): boolean =>
  (readable(text) && (EM.test(text) || SPACED.test(text))) || JOINER.test(text);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

interface Literal {
  text: string;
  line: number;
  /** Why no parent reads it, where that is so; null for every string that can reach a screen. */
  unread: string | null;
}

function literals(file: string, source = readFileSync(file, 'utf8')): Literal[] {
  const src = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const unshown = UNSHOWN_FIELDS.filter(u => u.file.test(file)).map(u => u.field);
  const out: Literal[] = [];
  const visit = (node: ts.Node, inherited: string | null): void => {
    let unread = inherited;
    if (unread === null) {
      if (ts.isCallExpression(node) && DEV_LOG.test(node.expression.getText(src)))
        unread = 'the boot log';
      else if (
        (ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) &&
        node.name !== undefined &&
        DEV_LOG_LINES.has(node.name.getText(src))
      )
        unread = 'a boot-log line';
      else if (ts.isPropertyAssignment(node) && unshown.includes(node.name.getText(src)))
        unread = 'a plan line’s rationale';
    }
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
        unread,
      });
    }
    ts.forEachChild(node, child => visit(child, unread));
  };
  visit(src, null);
  return out;
}

const hitsIn = (file: string): string[] =>
  literals(file)
    .filter(l => l.unread === null && saysDash(l.text))
    .map(l => `${relative(root, file)}:${l.line} ${JSON.stringify(l.text.trim().slice(0, 70))}`);

describe('no dash in a sentence a parent reads (DESIGN_SYSTEM.md §9)', () => {
  it('the scan is not vacuous', () => {
    // a dash in a sentence, of every kind
    expect(saysDash('Saved — bath')).toBe(true);
    expect(saysDash('Nothing on the list – add one')).toBe(true);
    expect(saysDash('Saved - bath')).toBe(true);
    expect(saysDash('Saved—bath at 6:40 PM')).toBe(true);
    expect(saysDash('Trip saved —')).toBe(true);
    expect(saysDash('— details')).toBe(true);
    // the joint of a sentence built in pieces, whose middle is not "readable" on its own
    expect(readable(' — ')).toBe(false);
    expect(saysDash(' — ')).toBe(true);
    // ranges, spellings and a dash for no value stay
    expect(saysDash('6–8 months')).toBe(false);
    expect(saysDash('A–Z')).toBe(false);
    expect(saysDash('Size 3 (16–28 lb), unscented, 84-count')).toBe(false);
    expect(saysDash('Most feeds: 9:05–9:50')).toBe(false);
    expect(saysDash(' – ')).toBe(false);
    expect(saysDash('a one-off')).toBe(false);
    expect(saysDash('—')).toBe(false);
    expect(saysDash('––:––')).toBe(false);
    expect(saysDash('Every –h ––m')).toBe(false);
  });

  it('lets through only what no parent reads', () => {
    const file = join(root, 'packages/core/src/plan/entitlements.ts');
    const source = [
      'crumb(`sync: pull failed — ${String(err)}`);',
      "deps.crumb('photo: redrawn — kept');",
      "d.log('sync: the pull was refused — asking');",
      "deps.log('widgets: timeline unreadable — skipped');",
      "console.warn('query failed —', err);",
      'export const photoTroubleLine = (e: string): string => `photo: none — ${e}`;',
      "export const F = { label: 'Night — the amber screen', rationale: 'Why — because' };",
      'toast.show(`Saved — ${what}`);',
      'export const moved = (s: string, n: number) => `${s} — ${n} earlier entries moved too`;',
    ].join('\n');
    const said = literals(file, source)
      .filter(l => l.unread === null && saysDash(l.text))
      .map(l => l.text.trim());
    expect(said).toEqual(['Night — the amber screen', 'Saved —', '—']);
    // and a rationale anywhere but the plan matrix is read like any other string
    const elsewhere = literals(join(root, 'apps/mobile/src/x.ts'), source).filter(
      l => l.unread === null && saysDash(l.text),
    );
    expect(elsewhere.map(l => l.text)).toContain('Why — because');
  });

  /**
   * A MINUTE, NOT FIVE SECONDS, for the reason `usEnglish.test.ts` gives: this parses every source
   * file in three packages with the TypeScript compiler, and vitest's default budget times out on
   * a busy machine rather than on a defect.
   */
  it('no string a person reads in the app, core or ui has a dash in a sentence', () => {
    const files = SOURCES.flatMap(d => walk(join(root, d))).filter(
      f => !SKIP.some(re => re.test(f)) && !NEVER_SHOWN.some(n => n.file.test(f)),
    );
    expect(files.length).toBeGreaterThan(200);
    expect(files.flatMap(hitsIn)).toEqual([]);
  }, 60_000);

  it('skips no file that is not there, so an exemption cannot outlive what it was for', () => {
    const all = SOURCES.flatMap(d => walk(join(root, d)));
    for (const n of NEVER_SHOWN)
      expect(
        all.some(f => n.file.test(f)),
        n.why,
      ).toBe(true);
  });
});
