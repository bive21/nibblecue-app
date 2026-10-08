import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OwedExit, signOutWhenFree, strongerExit, type ExitDeps } from './exits';
import type { SignOutScope, TeardownScope } from './teardown';

/**
 * A SIGN-OUT ASKED FOR WHILE A TEARDOWN RUNS (`exits.ts`; the adversarial review, 2026-09-25).
 * A household leaving the phone runs on its own, and a Sign out tapped during it was dropped: the
 * sheet said "Signed out" while the phone landed on Ended, still signed in, and Delete account
 * asked for the deletion and signed nobody out.
 *
 * `Gate` below is `AuthContext.tsx`'s teardown gate as a model — one teardown at a time, a sign-out
 * that signs the person out when it finishes, and `endHousehold`'s end — built from the shipped
 * `OwedExit` and `signOutWhenFree`. The last block holds `AuthContext` to the same shape, read as
 * source (a `.tsx` over React Native, which node cannot import).
 */

interface Deferred {
  promise: Promise<void>;
  resolve(): void;
}
function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Let every queued continuation run. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

class Gate {
  signedIn = true;
  busy = false;
  keepsSession = false;
  done: Promise<boolean> | null = null;
  readonly owed = new OwedExit();
  /** Every teardown that started, in order. */
  readonly runs: TeardownScope[] = [];
  /** Every account read the household's end wrote. */
  readonly adopted: string[] = [];
  /** How the next teardown ends: when this resolves, and whether it stops short of signing out. */
  private next: { gate: Promise<void>; stopsShort: boolean }[] = [];

  holdNext(stopsShort = false): Deferred {
    const d = deferred();
    this.next.push({ gate: d.promise, stopsShort });
    return d;
  }

  tearDown(scope: TeardownScope): Promise<boolean> {
    if (this.busy) return Promise.resolve(false);
    this.busy = true;
    this.keepsSession = scope === 'household';
    this.runs.push(scope);
    const how = this.next.shift() ?? { gate: Promise.resolve(), stopsShort: false };
    const run = (async (): Promise<boolean> => {
      try {
        await how.gate;
        if (scope !== 'household' && !how.stopsShort) this.signedIn = false;
        return true;
      } finally {
        this.busy = false;
        this.keepsSession = false;
      }
    })();
    this.done = run;
    return run;
  }

  deps(): ExitDeps {
    return {
      signedIn: () => this.signedIn,
      busy: () => this.busy,
      keepsSession: () => this.keepsSession,
      start: scope => this.tearDown(scope),
      underWay: () => (this.done ?? Promise.resolve(false)).catch(() => false),
      owe: scope => this.owed.ask(scope),
    };
  }

  signOut(scope: SignOutScope): Promise<void> {
    return signOutWhenFree(scope, this.deps());
  }

  /** `AuthContext` `endHousehold`, then the read written — or not, when a sign-out ran instead. */
  async householdEnds(read: string): Promise<boolean> {
    const ran = await this.tearDown('household').catch(() => false);
    const owed = this.owed.take();
    if (owed !== null) {
      try {
        await signOutWhenFree(owed.scope, this.deps());
      } finally {
        owed.settle();
      }
      return false;
    }
    if (ran) this.adopted.push(read);
    return ran;
  }
}

describe('which of two sign-outs asked together runs', () => {
  it('the one that does more: a deletion, then everywhere, then this phone', () => {
    expect(strongerExit('local', 'global')).toBe('global');
    expect(strongerExit('global', 'local')).toBe('global');
    expect(strongerExit('global', 'deletion')).toBe('deletion');
    expect(strongerExit('deletion', 'global')).toBe('deletion');
    expect(strongerExit('local', 'switch')).toBe('switch');
    expect(strongerExit('forced', 'global')).toBe('global');
    expect(strongerExit('local', 'local')).toBe('local');
  });
});

describe('the sign-outs owed to a household leaving the phone', () => {
  it('owes nothing until asked', () => {
    expect(new OwedExit().take()).toBeNull();
  });

  it('keeps the strongest asked, and answers everybody who asked only when it has run', async () => {
    const owed = new OwedExit();
    const answered: string[] = [];
    void owed.ask('local').then(() => answered.push('sheet'));
    void owed.ask('deletion').then(() => answered.push('delete'));
    void owed.ask('global').then(() => answered.push('everywhere'));
    const taken = owed.take();
    expect(taken?.scope).toBe('deletion');
    await settle();
    expect(answered).toEqual([]);
    taken?.settle();
    await settle();
    expect(answered.sort()).toEqual(['delete', 'everywhere', 'sheet']);
    // and it is owed once: the next household starts from nothing
    expect(owed.take()).toBeNull();
  });
});

describe('a sign-out asked for while nothing runs', () => {
  it('runs, and resolves once the person is signed out', async () => {
    const g = new Gate();
    const hold = g.holdNext();
    let resolved = false;
    void g.signOut('local').then(() => (resolved = true));
    await settle();
    expect(g.runs).toEqual(['local']);
    expect(resolved).toBe(false);
    hold.resolve();
    await settle();
    expect(resolved).toBe(true);
    expect(g.signedIn).toBe(false);
  });

  it('does nothing for somebody already signed out', async () => {
    const g = new Gate();
    g.signedIn = false;
    await g.signOut('global');
    expect(g.runs).toEqual([]);
  });
});

describe('a sign-out asked for while a household leaves the phone', () => {
  it('runs the moment the household is off the phone — and the Ended read is never written', async () => {
    const g = new Gate();
    const household = g.holdNext();
    const ending = g.householdEnds('ended');
    await settle();
    // the person taps Sign out while the household is leaving
    let signedOut = false;
    void g.signOut('local').then(() => (signedOut = true));
    await settle();
    expect(g.runs).toEqual(['household']);
    expect(signedOut).toBe(false); // not "Signed out" yet: it has not happened
    household.resolve();
    expect(await ending).toBe(false);
    await settle();
    expect(g.runs).toEqual(['household', 'local']);
    expect(signedOut).toBe(true);
    expect(g.signedIn).toBe(false);
    // the phone lands on AUTH, not on Ended over a session nobody wanted
    expect(g.adopted).toEqual([]);
  });

  it('a deletion confirmed during it signs out everywhere, once, answering every asker', async () => {
    const g = new Gate();
    const household = g.holdNext();
    const ending = g.householdEnds('ended');
    await settle();
    const answered: string[] = [];
    void g.signOut('local').then(() => answered.push('sheet'));
    void g.signOut('deletion').then(() => answered.push('delete'));
    household.resolve();
    await ending;
    await settle();
    expect(g.runs).toEqual(['household', 'deletion']);
    expect(answered.sort()).toEqual(['delete', 'sheet']);
  });

  it('with nothing asked for, the household simply ends and its read is written', async () => {
    const g = new Gate();
    expect(await g.householdEnds('ended')).toBe(true);
    expect(g.runs).toEqual(['household']);
    expect(g.adopted).toEqual(['ended']);
    expect(g.signedIn).toBe(true);
  });
});

describe('a sign-out asked for while another sign-out runs', () => {
  it('waits for it rather than starting a second, and resolves when the person is out', async () => {
    const g = new Gate();
    const first = g.holdNext();
    void g.tearDown('forced'); // the auth client dropped its session
    let resolved = false;
    void g.signOut('local').then(() => (resolved = true));
    await settle();
    expect(resolved).toBe(false);
    first.resolve();
    await settle();
    expect(resolved).toBe(true);
    expect(g.runs).toEqual(['forced']); // one teardown, not two
  });

  it('runs its own when the one under way stopped short of signing anybody out', async () => {
    const g = new Gate();
    const first = g.holdNext(true);
    void g.tearDown('forced');
    const asked = g.signOut('global');
    first.resolve();
    await asked;
    expect(g.runs).toEqual(['forced', 'global']);
    expect(g.signedIn).toBe(false);
  });
});

/* ---------------------------------------------------------------------- the wiring, as source */

const strip = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const context = strip(readFileSync(join(__dirname, 'AuthContext.tsx'), 'utf8')).replace(
  /\s+/g,
  ' ',
);
const between = (from: string, to: string): string => {
  const a = context.indexOf(from);
  expect(a, from).toBeGreaterThan(-1);
  const b = context.indexOf(to, a + from.length);
  expect(b, to).toBeGreaterThan(a);
  return context.slice(a, b);
};

describe('AuthContext is the gate above', () => {
  it('every sign-out a screen asks for goes through `signOutWhenFree`', () => {
    const signOut = between('const signOut = useCallback(', 'const phase: Phase');
    expect(signOut).toContain('await signOutWhenFree(scope, exitDeps(providers));');
    expect(signOut).not.toContain('tearDown(');
  });

  it('its deps are the live refs: the running teardown, the household flag, the owed exits', () => {
    const deps = between('const exitDeps = useCallback(', '[tearDown, owedExit]');
    for (const part of [
      "signedIn: () => sessionRef.current.status === 'signed_in'",
      'busy: () => tearingDown.current',
      'keepsSession: () => keepsSession.current',
      'start: scope => tearDown(scope, p)',
      'owe: scope => owedExit.ask(scope)',
    ])
      expect(deps, part).toContain(part);
    // the teardown under way is what a waiting sign-out awaits
    expect(context).toContain('teardownDone.current = run;');
  });

  it('the household’s end runs what was owed, before its read could be written, and answers it', () => {
    const end = between('const endHousehold = useCallback(', 'const refreshAccount');
    const household = end.indexOf("await tearDown('household', providers)");
    const take = end.indexOf('const owed = owedExit.take();');
    const run = end.indexOf('await signOutWhenFree(owed.scope, exitDeps(providers));');
    const answer = end.indexOf('owed.settle();');
    expect(household).toBeGreaterThan(0);
    expect(take).toBeGreaterThan(household);
    expect(run).toBeGreaterThan(take);
    expect(answer).toBeGreaterThan(run);
    // answered in a `finally`: a sign-out that throws still lets its screen go
    expect(end.slice(run, answer)).toContain('} finally {');
    // and it returns false, so neither caller writes the Ended read
    expect(end.slice(answer)).toMatch(/^owed\.settle\(\); } return false; }/);
  });

  it('a sign-out’s last step writes the session through at once, for a sign-out waiting on it', () => {
    const reset = between('resetToAuth: () => {', 'clearMemory:');
    expect(reset.indexOf("sessionRef.current = { status: 'signed_out' };")).toBeGreaterThan(-1);
    expect(reset.indexOf("sessionRef.current = { status: 'signed_out' };")).toBeLessThan(
      reset.indexOf("setSessionState({ status: 'signed_out' });"),
    );
  });
});
