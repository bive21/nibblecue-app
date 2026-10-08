/**
 * NOTHING IS MEASURED ON THE AUTH SCREENS (CLAUDE.md §7: product analytics is "never on the auth
 * screens"; Privacy §2: any counts will never "measure the sign-in screens"). The sign-up funnel's
 * two events fired from AUTH until 2026-09-27, into a sink that sends nothing — which is exactly
 * why a scan is the right guard: an emit added here compiles, passes every other test, and goes
 * nowhere until the day the sink is wired, when it quietly breaks a published promise.
 *
 * WHAT "REACHABLE" MEANS HERE — what code in this folder can run:
 *   1. every file in `screens/auth/`, and every module they import, transitively, inside the app —
 *      stopping at the two modules every screen in the app reaches, the context
 *      (`auth/AuthContext.tsx`) and the page frame (`app/Screen.tsx`), which are held on their own
 *      below rather than walked (a walk through them reaches every provider in the app, and a scan
 *      that fails on correct code gets deleted);
 *   2. the context's actions these screens call — each is read out of `AuthContext.tsx`, and none
 *      may emit, except the sign-out's teardown, whose emitter is decided where the sign-out starts;
 *   3. the context's own emitter, which is the only one in the app and is gated shut on the sign-in
 *      screens, so whatever else changes, nothing measured can leave while one is in front.
 *
 * The rules themselves are `auth/measured.ts` (with `measured.test.ts`); this file holds the wiring.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EVENT_PROPS } from '../../analytics';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '..', '..');
const read = (p: string): string => readFileSync(p, 'utf8');
/** Comments first: these files explain their own rules, and a scan must not read the explanation. */
const code = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const flat = (text: string): string => code(text).replace(/\s+/g, ' ');
const rel = (p: string): string => relative(SRC, p).split('\\').join('/');

/** The app's own analytics module, however a file spells the path to it. */
const ANALYTICS_MODULE = join(SRC, 'analytics', 'index.ts');
/** Every event the emitter knows, and the one it no longer does. */
const EVENTS = [...Object.keys(EVENT_PROPS), 'signup_started'];
const EMIT = new RegExp(`\\.emit\\(\\s*['"\`](${EVENTS.join('|')})['"\`]`);

/** The auth screen files: everything in this folder that ships. */
const AUTH_FILES = readdirSync(here)
  .filter(f => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map(f => join(here, f));

/** The two modules every screen reaches, held on their own below. */
const BOUNDARY = new Set([join(SRC, 'auth', 'AuthContext.tsx'), join(SRC, 'app', 'Screen.tsx')]);

const isFile = (p: string): boolean => existsSync(p) && statSync(p).isFile();

/** A relative import, resolved the way the bundler resolves it; null for a package or an asset. */
function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec);
  for (const c of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ])
    if (isFile(c) && /\.tsx?$/.test(c)) return c;
  return null;
}

/** Every module a file imports (or re-exports from), resolved. */
function importsOf(file: string): string[] {
  const src = code(read(file));
  const out: string[] = [];
  for (const m of src.matchAll(
    /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g,
  )) {
    const r = resolveImport(file, m[1] ?? m[2] ?? m[3] ?? m[4] ?? '');
    if (r !== null) out.push(r);
  }
  return out;
}

/** The closure the auth screens can run, with the path each module was reached by. */
function reachable(): Map<string, string[]> {
  const via = new Map<string, string[]>();
  const queue: [string, string[]][] = AUTH_FILES.map(f => [f, [rel(f)]]);
  for (const [f, path] of queue) via.set(f, path);
  while (queue.length > 0) {
    const [file, path] = queue.shift() as [string, string[]];
    if (BOUNDARY.has(file)) continue;
    for (const next of importsOf(file)) {
      if (via.has(next)) continue;
      const p = [...path, rel(next)];
      via.set(next, p);
      queue.push([next, p]);
    }
  }
  return via;
}

describe('no analytics emit is reachable from the auth screen files', () => {
  it('finds the files it is about, and walks past them', () => {
    const names = AUTH_FILES.map(f => rel(f));
    for (const screen of ['AuthScreen.tsx', 'VerifyScreen.tsx', 'EndedScreen.tsx'])
      expect(names).toContain(`screens/auth/${screen}`);
    // a walk that found nothing past the screens would pass on nothing
    expect(reachable().size).toBeGreaterThan(AUTH_FILES.length + 10);
  });

  it('no auth screen touches the emitter: no import, no `analytics` from the context, no emit', () => {
    for (const f of AUTH_FILES) {
      const src = code(read(f));
      expect(importsOf(f), rel(f)).not.toContain(ANALYTICS_MODULE);
      expect(src, rel(f)).not.toMatch(/\banalytics\b/);
      expect(src, rel(f)).not.toMatch(/\.emit\(/);
    }
  });

  it('no module they import, however deep, emits or imports the emitter', () => {
    const offenders: string[] = [];
    for (const [file, path] of reachable()) {
      if (BOUNDARY.has(file)) continue;
      const src = code(read(file));
      if (file === ANALYTICS_MODULE) offenders.push(`imports the emitter: ${path.join(' → ')}`);
      else if (importsOf(file).includes(ANALYTICS_MODULE))
        offenders.push(`imports the emitter: ${path.join(' → ')}`);
      if (EMIT.test(src) || /\bcreateAnalytics\(/.test(src))
        offenders.push(`emits: ${path.join(' → ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('the page frame every screen is drawn in measures nothing itself', () => {
    const screen = code(read(join(SRC, 'app', 'Screen.tsx')));
    expect(screen).not.toMatch(EMIT);
    expect(screen).not.toMatch(/\banalytics\b/);
  });
});

/* ------------------------------------------------------------- what they call through the context */

const context = flat(read(join(SRC, 'auth', 'AuthContext.tsx')));

/** The body of `const name = useCallback(` up to the next top-level hook or action. */
function action(name: string): string {
  const at = context.indexOf(`const ${name} = useCallback(`);
  expect(at, `AuthContext defines ${name}`).toBeGreaterThan(-1);
  const rest = context.slice(at + 1);
  const next = rest.search(/ const \w+ = use(?:Callback|Memo|Ref|State)\(| useEffect\(\(\) => \{/);
  return next === -1 ? rest : rest.slice(0, next);
}

/** The actions an auth screen calls, read out of the screens themselves. */
const CALLED = [
  ...new Set(
    AUTH_FILES.flatMap(f =>
      [...code(read(f)).matchAll(/\bactions\.(\w+)\(/g)].map(m => m[1] ?? ''),
    ),
  ),
].sort();

describe('what the auth screens call through the context measures nothing', () => {
  it('reads the actions off the screens rather than a list someone must remember', () => {
    for (const a of ['signedIn', 'signOut', 'agreeToTerms', 'openLink', 'setPendingEmail'])
      expect(CALLED).toContain(a);
  });

  /** The actions that are one state setter each, written inline in the context's value. */
  const SETTERS: Record<string, string> = {
    setPendingEmail: 'const [pendingEmail, setPendingEmail] = useState<string | null>(null);',
    clearLinkProblem: 'clearLinkProblem: () => setLinkProblem(null),',
    clearRecovery: 'clearRecovery: () => setRecovery(false),',
  };

  it('none of those actions emits', () => {
    for (const a of CALLED) {
      const setter = SETTERS[a];
      if (setter !== undefined) {
        // nothing but a state setter: there is no body that could emit
        expect(context, a).toContain(setter);
        continue;
      }
      expect(action(a), a).not.toMatch(/analytics\.emit\(/);
      expect(action(a), a).not.toMatch(EMIT);
    }
  });

  it('a sign-out started on an auth screen hands its teardown an emitter that sends nothing', () => {
    // every sign-out a screen asks for is the one teardown (exits.test.ts holds the route there)
    expect(action('signOut')).toContain('await signOutWhenFree(scope, exitDeps(providers));');
    const teardown = action('tearDown');
    const decided = teardown.indexOf(
      'const measured = signOutMeasured(phaseRef.current, termsShown.current);',
    );
    const handed = teardown.indexOf('analytics: measured ? signOutAnalytics : quietAnalytics(),');
    expect(decided, 'decided where the sign-out starts').toBeGreaterThan(-1);
    expect(handed, 'and handed to the teardown').toBeGreaterThan(decided);
    // decided before the teardown runs a single step
    expect(decided).toBeLessThan(teardown.indexOf('await runTeardown('));
  });
});

/* ------------------------------------------------------------------- the context's own emitter */

describe('the app’s one emitter is shut on the sign-in screens', () => {
  it('is gated, and the gate is written from the phase and the terms step on every render', () => {
    expect(context).toContain(
      'const analytics = useMemo( () => createAnalytics(gatedSink(ANALYTICS_SINK, () => measuring.current)), [], );',
    );
    expect(context).toContain("measuring.current = analyticsOpen(phase, termsStep !== 'none');");
  });

  it('is the only emitter the app makes, so the gate covers every event there is', () => {
    // the test-only seam never ships (`testing/no-bundle.test.ts` holds that nothing the app
    // bundles imports it), so an emitter a test fixture makes there measures nobody
    const testOnly = (p: string): boolean =>
      rel(p).startsWith('testing/') || rel(p) === 'sync/harness.ts';
    const makers: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && p !== ANALYTICS_MODULE) {
          if (!testOnly(p) && /\bcreateAnalytics\(/.test(code(read(p)))) makers.push(rel(p));
        }
      }
    };
    walk(SRC);
    expect(makers).toEqual(['auth/AuthContext.tsx']);
    // …twice there: the gated one, and the one a sign-out measured when it started is handed
    expect(context.match(/createAnalytics\(/g)).toHaveLength(2);
    expect(context).toContain(
      'const signOutAnalytics = useMemo(() => createAnalytics(ANALYTICS_SINK), []);',
    );
  });

  it('counts a launch only once it has landed past the sign-in screens, never at boot', () => {
    const emits = [...context.matchAll(/analytics\.emit\(\s*'(\w+)'/g)].map(m => m[1]);
    /*
      AND A JOIN, WHERE IT LANDS (2026-09-29). `invite_accepted` moved here from the join page and
      the code sheet when the join became the context's own (`settleJoin`, `auth/join.ts`). Its one
      emit is inside `settleJoin`'s joined answer, which runs only for a signed-in, confirmed
      account with no household and no terms step in front — phases the gate is open for — and it
      goes through the gated emitter like every other.
    */
    expect(emits).toEqual(['invite_accepted', 'app_open']);
    const settle = context.slice(context.indexOf('const settleJoin = useCallback('));
    expect(settle.indexOf("analytics.emit('invite_accepted'")).toBeGreaterThan(
      settle.indexOf("case 'joined':"),
    );
    expect(settle.indexOf("analytics.emit('invite_accepted'")).toBeLessThan(
      settle.indexOf("case 'refused':"),
    );
    const landed = context.indexOf(
      "if (launchCountedOnce.current || !launchCounted(phase, termsStep !== 'none')) return;",
    );
    expect(landed).toBeGreaterThan(-1);
    expect(context.indexOf("analytics.emit('app_open'")).toBeGreaterThan(landed);
    // and the boot effect no longer says anything about it
    const boot = context.slice(context.indexOf('/* ---- boot ---- */'));
    expect(boot.slice(0, boot.indexOf('return () => { cancelled = true; };'))).not.toContain(
      'analytics.emit(',
    );
  });
});

describe('the sign-up is counted after the auth screens, and only there', () => {
  it('signup_started is gone from the app, and signup_completed comes from setup’s page or nowhere', () => {
    const where: Record<string, string[]> = { signup_started: [], signup_completed: [] };
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const src = code(read(p));
          for (const e of Object.keys(where))
            if (new RegExp(`\\.emit\\(\\s*'${e}'`).test(src)) where[e]?.push(rel(p));
        }
      }
    };
    walk(SRC);
    // NIBBLECUE'S ONE-PAGE SETUP DOES NOT COUNT THE SIGN-UP YET (2026-10-08): CuddleCue's first
    // setup page emits `signup_completed` once per account; NibbleCue's emits nothing. Whether it
    // should is the owner's call. What holds either way: never `signup_started`, and never from
    // anywhere but setup's page
    expect(where.signup_started).toEqual([]);
    for (const file of where.signup_completed ?? [])
      expect(file).toBe('screens/onboarding/OnboardingScreen.tsx');
  });
});
