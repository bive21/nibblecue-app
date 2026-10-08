/**
 * A SIGN-OUT ASKED FOR WHILE A TEARDOWN IS ALREADY RUNNING (the adversarial review of 2026-09-25).
 * Pure: `AuthContext.tsx` supplies the state, so every branch is a test (`exits.test.ts`).
 *
 * One teardown runs at a time (`AuthContext` `tearDown`), and a second one asked for meanwhile
 * used to be dropped. That was harmless while every teardown was a sign-out — the person was being
 * signed out anyway. It stopped being harmless when a teardown could KEEP the session: a household
 * leaving the phone (`teardown.ts`, scope `household`) runs on its own, from an account read or a
 * refused pull, and a parent who tapped Sign out during it was told "Signed out" while the phone
 * landed on Ended, still signed in — and Delete account asked for the deletion and signed nobody
 * out.
 *
 * So a sign-out asked for during a household teardown is OWED to it: the household teardown's end
 * (`endHousehold`) runs it the moment the household is off the phone, and the person's sign-out
 * resolves only then. One asked for during a sign-out waits for that sign-out, which is theirs as
 * much as anybody's. Either way the promise a screen awaits means what the screen then says.
 */
import type { SignOutScope } from './teardown';

/**
 * Which of two sign-outs asked for together to run: the one that does more. A deletion ends every
 * session and starts the deletion clock; everywhere ends every session; the rest end this phone's.
 */
const STRENGTH: Readonly<Record<SignOutScope, number>> = {
  local: 0,
  switch: 1,
  forced: 2,
  global: 3,
  deletion: 4,
};

export const strongerExit = (a: SignOutScope, b: SignOutScope): SignOutScope =>
  STRENGTH[b] > STRENGTH[a] ? b : a;

/** The sign-outs owed to the household teardown under way, and everybody waiting on them. */
export class OwedExit {
  private scope: SignOutScope | null = null;
  private waiters: (() => void)[] = [];

  /** Owe this sign-out; resolves once the one that runs for it has run (`take` → `settle`). */
  ask(scope: SignOutScope): Promise<void> {
    this.scope = this.scope === null ? scope : strongerExit(this.scope, scope);
    return new Promise<void>(resolve => {
      this.waiters.push(resolve);
    });
  }

  /** What is owed — the strongest asked — and the call that tells every asker it has run. */
  take(): { scope: SignOutScope; settle(): void } | null {
    if (this.scope === null) return null;
    const scope = this.scope;
    const waiters = this.waiters;
    this.scope = null;
    this.waiters = [];
    return {
      scope,
      settle: () => {
        for (const w of waiters) w();
      },
    };
  }
}

export interface ExitDeps {
  /** Somebody is signed in on this phone, as of right now (not as of the last render). */
  signedIn(): boolean;
  /** A teardown is under way. */
  busy(): boolean;
  /** …and it is one that keeps the session: a household leaving the phone. */
  keepsSession(): boolean;
  /** Start this sign-out's teardown and run it through; false when one is already under way. */
  start(scope: SignOutScope): Promise<boolean>;
  /** The teardown under way, to wait on. */
  underWay(): Promise<unknown>;
  /** Owe the sign-out to the household teardown under way; resolves once it has run. */
  owe(scope: SignOutScope): Promise<void>;
}

/**
 * THIS PERSON, SIGNED OUT — now, or as soon as the teardown under way lets go — and resolved only
 * once they are. A sign-out under way is waited for and then looked at again: it signed them out,
 * or it stopped short and this one runs. A household leaving is owed the sign-out instead, because
 * starting one the moment it ends would race the account it writes next.
 */
export async function signOutWhenFree(scope: SignOutScope, d: ExitDeps): Promise<void> {
  for (;;) {
    if (!d.signedIn()) return;
    if (!d.busy()) {
      if (await d.start(scope)) return;
      continue;
    }
    if (d.keepsSession()) {
      await d.owe(scope);
      return;
    }
    await d.underWay();
  }
}
