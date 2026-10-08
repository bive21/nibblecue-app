/**
 * That the real dependencies are actually wired (docs/ACCOUNTS.md §4; WP4.9 step 6).
 *
 * THIS IS THE HIGHEST-VALUE ASSERTION IN THE PACKAGE, and it is worth saying why so plainly.
 * `teardownDeps` takes `outbox`, `widgets` and `push` as OPTIONAL bindings with harmless
 * defaults, because each of them lands in a different work package. Forgetting to pass one
 * therefore produces no type error, no runtime error, no failing test and nothing on screen —
 * it produces a sign-out that flushes nothing and quarantines nothing, and three entries a
 * parent logged on the bus are gone. There is no assertion that can be made about behavior
 * here, because the behavior is correct in both cases; the only thing that distinguishes them
 * is whether the call site passes the argument. So the call sites are what is checked.
 *
 * IT IS A SOURCE SCAN, AND THAT IS NOT LAZINESS. `AuthContext.tsx` is a `.tsx` that imports
 * `react-native`, `expo-file-system`, `@react-native-async-storage/async-storage` and NetInfo
 * at module scope, and `apps/mobile`'s vitest runs in node (`vitest.config.ts`). Importing
 * either module to inspect it is not possible in this suite; rendering the provider needs a
 * device. What CAN be established in node is the fact that matters: at every point where the
 * app builds teardown dependencies, the real queue is handed in.
 *
 * The table is deliberately exhaustive over the three optional bindings, so that the day
 * `widgets` (WP10) or `push` (WP8) is wired, this test fails and is updated rather than
 * silently continuing to pass while asserting nothing about it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const AUTH_CONTEXT = join(__dirname, 'AuthContext.tsx');
const BINDINGS = join(__dirname, 'bindings.ts');

/**
 * The argument text of every `teardownDeps({ … })` call in a source file.
 *
 * Brace counting rather than a regex: the argument is a nested object literal several levels
 * deep with arrow functions in it, and a non-greedy regex stops at the first `}`.
 */
export function teardownDepsArgs(source: string): string[] {
  const out: string[] = [];
  const needle = 'teardownDeps(';
  let from = 0;
  for (;;) {
    const at = source.indexOf(needle, from);
    if (at === -1) break;
    let depth = 0;
    let i = at + needle.length - 1;
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === '(' || c === '{') depth += 1;
      else if (c === ')' || c === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(source.slice(at + needle.length, i));
    from = i;
  }
  return out;
}

/** Whether a call's argument object passes `key:` at its TOP level (not inside a nested one). */
export function passesKey(arg: string, key: string): boolean {
  let depth = 0;
  for (let i = 0; i < arg.length; i++) {
    const c = arg[i];
    if (c === '{' || c === '(' || c === '[') depth += 1;
    else if (c === '}' || c === ')' || c === ']') depth -= 1;
    else if (depth === 1 && arg.startsWith(`${key}:`, i)) {
      // not part of a longer identifier
      const before = arg[i - 1] ?? '';
      if (!/[A-Za-z0-9_$]/.test(before)) return true;
    }
  }
  return false;
}

/**
 * Every optional binding, and whether the app is expected to pass it today. `false` is not a
 * permission to forget: it is a pin on the current fact, and it fails the moment the package
 * that owns it wires it up without coming back here.
 */
const OPTIONAL_BINDINGS: readonly { key: string; wired: boolean; owner: string }[] = [
  { key: 'outbox', wired: true, owner: 'WP4.9' },
  // NibbleCue: a no-op stand-in at both sites (`AuthContext.tsx`: no widgets, no push device)
  { key: 'widgets', wired: true, owner: 'NibbleCue — AuthContext.tsx widgetsTeardown (no-op)' },
  { key: 'push', wired: true, owner: 'NibbleCue — AuthContext.tsx noPushTeardown (no-op)' },
];

describe('the teardown bindings at every call site (docs/ACCOUNTS.md §4)', () => {
  const source = readFileSync(AUTH_CONTEXT, 'utf8');
  const args = teardownDepsArgs(source);

  it('finds both call sites: the manual/forced teardown and the interrupted-teardown resume', () => {
    expect(args).toHaveLength(2);
    // the two are told apart by the user they report: a live session, and none at launch
    expect(args.some(a => /currentUser:\s*\(\)\s*=>\s*user/.test(a))).toBe(true);
    expect(args.some(a => /currentUser:\s*\(\)\s*=>\s*null/.test(a))).toBe(true);
  });

  /*
    CuddleCue passes the real `pushTeardown` here, so the token is forgotten on every exit.
    NibbleCue registers no push device (2026-10-08), so there is no token to forget: both sites
    pass the no-op, and the moment anything here registers one, this fails and asks for the real
    teardown back.
  */
  it('passes the push step at both of them, a no-op only while no push device is registered', () => {
    for (const [i, arg] of args.entries()) {
      expect(arg, `call site ${i + 1}`).toMatch(/push:\s*noPushTeardown\(\)/);
    }
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap(e =>
        e.isDirectory()
          ? walk(join(dir, e.name))
          : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)
            ? [join(dir, e.name)]
            : [],
      );
    const registers = walk(join(__dirname, '..')).filter(f =>
      /getExpoPushTokenAsync|getDevicePushTokenAsync/.test(readFileSync(f, 'utf8')),
    );
    expect(registers, 'a push device is registered: pass the real pushTeardown').toEqual([]);
  });

  it('passes the REAL outbox at both of them, never the empty default', () => {
    for (const [i, arg] of args.entries()) {
      expect(passesKey(arg, 'outbox'), `call site ${i + 1}`).toBe(true);
      // the running worker, and — with no engine built yet — the file itself (2026-09-25)
      expect(arg, `call site ${i + 1}`).toMatch(/outbox:\s*outboxTeardown\(queueOnDisk\)/);
    }
    // and it is the late-bound one from the sync layer, not a literal written here
    expect(source).toMatch(/import \{[^}]*\boutboxTeardown\b[^}]*\} from '\.\.\/sync\/status'/);
    expect(source).toMatch(/import \{[^}]*\bqueueOnDisk\b[^}]*\} from '\.\/bindings'/);
  });

  it('every optional binding is either wired at both call sites or at neither', () => {
    for (const binding of OPTIONAL_BINDINGS) {
      const wiredAt = args.filter(a => passesKey(a, binding.key)).length;
      expect(wiredAt, `${binding.key} (${binding.owner})`).toBe(binding.wired ? args.length : 0);
    }
  });

  it('is not vacuous: the scanner sees a missing key and a nested one for what they are', () => {
    const fixture = `
      await runTeardown(scope, teardownDeps({
        auth: p.auth,
        outbox: outboxTeardown(),
        resetToAuth: () => { setState({ outbox: 'nested, not a binding' }); },
      }));
      resumeInterruptedTeardown(teardownDeps({ auth: p.auth, freezeUi: () => undefined }));
    `;
    const found = teardownDepsArgs(fixture);
    expect(found).toHaveLength(2);
    expect(passesKey(found[0] ?? '', 'outbox')).toBe(true);
    // the second call site forgot it — which is exactly the defect this file exists to catch
    expect(passesKey(found[1] ?? '', 'outbox')).toBe(false);
    // and a key of the same name inside a nested object is not a binding
    expect(passesKey('{ auth: p.auth, ui: { outbox: 1 } }', 'outbox')).toBe(false);
  });
});

describe('bindings.ts itself', () => {
  const source = readFileSync(BINDINGS, 'utf8');

  it('no longer defaults the outbox to a no-op that loses the queue', () => {
    expect(source).toMatch(/outbox:\s*b\.outbox \?\? outboxTeardown\(queueOnDisk\)/);
    // WP2's placeholder, named so a revert is visible
    expect(source).not.toMatch(/outbox:\s*b\.outbox \?\? \{\s*flush: async \(\) => undefined/);
  });

  /**
   * STEP 3 BEFORE THERE IS AN ENGINE (2026-09-25). A teardown can start at launch before
   * `SyncProvider` has built one — the account read that finds the household gone, or a refused
   * refresh — and with nothing to ask, step 3 reported an empty queue and step 8 deleted it. The
   * file is read instead; `sync/teardown-race.test.ts` runs the binding over a real database.
   */
  it('reads the queue from the file when there is no engine, and never creates one to do it', () => {
    const reader = source.slice(source.indexOf('export async function queueOnDisk'));
    const body = reader.slice(0, reader.indexOf('\n}\n'));
    expect(body).toContain('outboxPending(await openLocalDb())');
    // a closed latch or a missing file is an empty queue: nothing is opened, so nothing is made
    expect(body.indexOf('localDbStopped() || !localDbFileExists()')).toBeGreaterThan(-1);
    expect(body.indexOf('localDbStopped() || !localDbFileExists()')).toBeLessThan(
      body.indexOf('openLocalDb()'),
    );
  });

  it('gives a household teardown its own step 10, and a sign-out only the keys it is told to keep', () => {
    expect(source).toContain('await clearForHouseholdEnd(prefsStore, user.id);');
    // what a sign-out keeps is the runner's (and an interrupted run's mark's) to say, not a binding's
    expect(source).toContain('await clearForSignOut(prefsStore, keep);');
    expect(source).not.toContain('keepPrefs');
  });

  it('keeps the teardown mark in the keystore through the pure parser, a bare flag included', () => {
    const keychain = readFileSync(join(__dirname, 'keychain.ts'), 'utf8').replace(/\s+/g, ' ');
    expect(keychain).toContain('parseTeardownMark(await secure.get(KEYS.teardownFlag))');
    expect(keychain).toContain('secure.set(KEYS.teardownFlag, serializeTeardownMark(mark))');
    expect(keychain).toContain("teardownFlag: 'cc.teardown_in_progress'");
  });

  it('closes the database latch and stops the cadence before step 1 freezes the UI', () => {
    const freeze = source.slice(source.indexOf('freeze: () => {'));
    expect(freeze.slice(0, freeze.indexOf('}'))).toContain('stopSyncForTeardown()');
    expect(source).toMatch(
      /import \{ outboxTeardown, stopSyncForTeardown \} from '\.\.\/sync\/status'/,
    );
  });

  it('keeps a harmless default for widgets and push, for a test — the app passes both', () => {
    expect(source).toMatch(/widgets: b\.widgets \?\?/);
    expect(source).toMatch(/push: b\.push \?\?/);
  });
});
