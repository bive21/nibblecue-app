/**
 * NO OPEN NOBODY AWAITS IS LEFT WITHOUT A HANDLER (the owner's Expo Go log, 2026-09-29).
 *
 * A teardown closes the database latch at its first step, and from then on every open is refused
 * with `LocalDbStoppedError` (`latch.ts`). A read that handles the refusal is right, and says so in
 * the boot log. A promise that opened the database and was started with `void` — or left floating —
 * and has no rejection handler turned the same refusal into a red "Uncaught (in promise)" in
 * development: an ordinary sign-out that looked like a crash.
 *
 * The call sites are React components and hooks that node cannot render, so this reads the
 * source, as the other `*.scan.test.ts` files do: a general guard over every chain that opens the
 * database directly, and the sites fixed on 2026-09-29, each of which reaches the database through
 * something the general guard cannot follow (a named function, a write context, a `useCallback`).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const src = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The file with its comments taken out and its whitespace folded, as the other scans read. */
const flat = (...p: string[]): string =>
  readFileSync(join(src, ...p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.ts$/.test(name) && !/\.d\.ts$/.test(name))
      out.push(p);
  }
  return out;
}

const unwrap = (e: ts.Expression): ts.Expression => {
  let x = e;
  while (ts.isParenthesizedExpression(x)) x = x.expression;
  return x;
};

/** `a().then(f).catch(g)` as its root `a()` and its links `.then(f)`, `.catch(g)`, in order. */
function chainOf(expr: ts.Expression): { root: ts.Expression; links: ts.CallExpression[] } {
  const links: ts.CallExpression[] = [];
  let e = unwrap(expr);
  while (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
    links.unshift(e);
    e = unwrap(e.expression.expression);
  }
  return { root: e, links };
}

const isOpen = (n: ts.Node): n is ts.CallExpression =>
  ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'openLocalDb';

/** An `openLocalDb()` inside `fn` that no try/catch within `fn` stands around. */
function unguardedOpen(fn: ts.FunctionLikeDeclaration): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (isOpen(n)) {
      let guarded = false;
      for (let p: ts.Node | undefined = n.parent; p !== undefined && p !== fn; p = p.parent) {
        // inside the `try` block itself — not its `catch` or `finally` — of a try that catches
        if (!ts.isTryStatement(p) || p.catchClause === undefined) continue;
        if (n.pos >= p.tryBlock.pos && n.end <= p.tryBlock.end) guarded = true;
      }
      if (!guarded) found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  if (fn.body !== undefined) visit(fn.body);
  return found;
}

interface Site {
  where: string;
  handled: boolean;
}

/**
 * Every promise started and let go — `void <chain>`, or a chain standing as a statement — whose
 * root opens the database: `openLocalDb()` itself, or an async function called on the spot that
 * opens it outside a try/catch of its own. Handled means a `.catch(…)` in the chain, or a
 * `.then(…, …)` with its second argument.
 */
function letGoOpens(): Site[] {
  const out: Site[] = [];
  for (const file of sources(src)) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('openLocalDb')) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const consider = (expr: ts.Expression): void => {
      const { root, links } = chainOf(expr);
      if (!ts.isCallExpression(root)) return;
      const callee = unwrap(root.expression);
      const opens =
        isOpen(root) ||
        ((ts.isArrowFunction(callee) || ts.isFunctionExpression(callee)) && unguardedOpen(callee));
      if (!opens) return;
      const handled = links.some(link => {
        const name = (link.expression as ts.PropertyAccessExpression).name.text;
        return name === 'catch' || (name === 'then' && link.arguments.length >= 2);
      });
      const { line } = sf.getLineAndCharacterOfPosition(expr.getStart(sf));
      out.push({ where: `${relative(src, file)}:${line + 1}`, handled });
    };
    const visit = (n: ts.Node): void => {
      if (ts.isVoidExpression(n)) consider(n.expression);
      else if (ts.isExpressionStatement(n)) consider(n.expression);
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

describe('every open of the database that nobody awaits', () => {
  const sites = letGoOpens();

  it('is found where it is — the guard below is not passing on an empty list', () => {
    // the local reads, the edit sheet's pre-fills, the Health note's look-back… (NibbleCue has
    // fewer than CuddleCue's sixteen: no Bottle sheet, no Stash)
    expect(sites.length).toBeGreaterThanOrEqual(8);
    expect(sites.map(s => s.where)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^data\/useLocalQuery\.ts:\d+$/),
        expect.stringMatching(/^sheets\/quick\/edit\/EditEntrySheet\.tsx:\d+$/),
        expect.stringMatching(/^sheets\/quick\/modules\/wellbeing\/LookBackView\.tsx:\d+$/),
      ]),
    );
  });

  it('has a rejection handler, so a teardown’s refusal is never an "Uncaught (in promise)"', () => {
    expect(sites.filter(s => !s.handled).map(s => s.where)).toEqual([]);
  });
});

describe('the write context answers null while a teardown runs', () => {
  const write = flat('sheets', 'quick', 'useWriteContext.ts');

  it('treats the latch’s refusal as nobody to write for, and throws anything else on', () => {
    expect(write).toContain(
      'try { db = await openLocalDb(); } catch (err) { if (isTeardownRefusal(err)) return null; throw err; }',
    );
  });
  // (CuddleCue's sharing switches, `screens/account/SharingRows.tsx`, are not in NibbleCue)
});

describe('the sites that open the database through a function of their own keep their handler', () => {
  // (no Activity log in NibbleCue, so no next page to load)
  it('adding a child, whose rhythms are copied after the server answers', () => {
    expect(flat('sheets', 'household', 'AddChildSheet.tsx')).toContain(
      'onPress={() => void save().catch(rethrowUnlessTeardown)}',
    );
  });

  // (no Routine in NibbleCue, so no Day window)
  it('the helpers are the latch’s, reached through `../db` like the rest of it', () => {
    const index = flat('db', 'index.ts');
    expect(index).toMatch(/export \{[^}]*isTeardownRefusal[^}]*\}/);
    expect(index).toMatch(/export \{[^}]*rethrowUnlessTeardown[^}]*\}/);
  });
});
