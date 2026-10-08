/**
 * SIGNING IN AGAIN KEEPS THE ACCOUNT (Privacy §7, Terms §12): the ask, against the test backend,
 * which now behaves as a real project does — signing in alone undoes nothing, the app's own call
 * does, and a call that cannot land is asked again. The server's half, which decides what a call
 * may undo, is `packages/db/src/integration/deletion-undo.test.ts` (0131).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Session } from './session';
import { askToKeepAccount, keepAnswerKey, keepAskDue } from './keep-account';
import { MockAccountsApi, MockAuthProvider, MockBackend } from './providers/mock';
import type { SessionStore } from './providers/types';

const DAY = 86_400_000;
const T0 = Date.parse('2026-09-14T12:00:00Z');

function sessionStore(): SessionStore {
  let s: Session | null = null;
  return {
    load: async () => s,
    save: async v => {
      s = v;
    },
    clear: async () => {
      s = null;
    },
  };
}

function world() {
  let now = T0;
  const backend = new MockBackend({ now: () => now });
  const device = () => {
    const auth = new MockAuthProvider(backend, sessionStore());
    return { auth, api: new MockAccountsApi(backend, auth) };
  };
  return { backend, device, advance: (ms: number) => (now += ms) };
}

/** Dana asks for her account to be deleted on one phone, and comes back on another. */
async function askedThenBack() {
  const w = world();
  const first = w.device();
  await first.auth.signInWithGoogle();
  const asked = await first.api.requestAccountDeletion();
  expect(asked.ok).toBe(true);
  w.advance(2 * DAY);
  const back = w.device();
  await back.auth.signInWithGoogle();
  return { w, first, back };
}

describe('the ask a sign-in makes', () => {
  it('keeps an account whose deletion was pending, once: the second ask has nothing to say', async () => {
    const { back } = await askedThenBack();
    expect((await back.api.bootstrapState()).deletionPending).not.toBeNull();
    expect(await askToKeepAccount(back.api)).toBe('kept');
    expect((await back.api.bootstrapState()).deletionPending).toBeNull();
    expect(await askToKeepAccount(back.api)).toBe('nothing');
  });

  it('says nothing for an account with no deletion pending', async () => {
    const w = world();
    const d = w.device();
    await d.auth.signInWithGoogle();
    expect(await askToKeepAccount(d.api)).toBe('nothing');
  });

  it('asks again later when the call cannot land: no connection, or a session the server refuses', async () => {
    const { w, first, back } = await askedThenBack();
    w.backend.online = false;
    expect(await askToKeepAccount(back.api)).toBe('retry');
    w.backend.online = true;
    // the phone that asked was signed out with the request: its ask is refused, never obeyed
    expect(await askToKeepAccount(first.api)).toBe('retry');
    expect((await back.api.bootstrapState()).deletionPending).not.toBeNull();
    // and once the signal is back, the phone that signed in again keeps the account
    expect(await askToKeepAccount(back.api)).toBe('kept');
  });

  it('never throws, whatever the API does', async () => {
    const throwing = {
      cancelAccountDeletion: async () => {
        throw new Error('the transport broke');
      },
    };
    expect(await askToKeepAccount(throwing)).toBe('retry');
  });
});

/* ---------------------------------------------------------------- the wiring, read as source */

const strip = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const flatOf = (rel: string): string =>
  strip(readFileSync(join(__dirname, rel), 'utf8')).replace(/\s+/g, ' ');
const context = flatOf('AuthContext.tsx');
const between = (from: string, to: string): string => {
  const a = context.indexOf(from);
  expect(a, from).toBeGreaterThan(-1);
  const b = context.indexOf(to, a + from.length);
  expect(b, to).toBeGreaterThan(a);
  return context.slice(a, b);
};

describe('AuthContext asks after every sign-in, and keeps asking until it lands', () => {
  it('after a password, Google or sign-up session, once the session is the app’s', () => {
    const signedIn = between('const signedIn = useCallback(', 'const signOut = useCallback(');
    const published = signedIn.indexOf("setSessionState({ status: 'signed_in', session: s,");
    const ask = signedIn.indexOf('forgetKeepAsk(); void keepAccount(s.user.id);');
    expect(published).toBeGreaterThan(-1);
    expect(ask).toBeGreaterThan(published);
  });

  it('after an emailed link — the confirmation, and the reset link a parent comes back through', () => {
    const link = between('const openLink = useCallback(', 'const signedIn = useCallback(');
    // sessionRef first so a concurrent openLink cannot race on "already used", then publish
    const published = link.indexOf('setSessionState(sessionRef.current);');
    const ask = link.indexOf('forgetKeepAsk(); void keepAccount(result.session.user.id);');
    expect(published).toBeGreaterThan(-1);
    expect(ask).toBeGreaterThan(published);
    expect(link.indexOf("status: 'signed_in'")).toBeGreaterThan(-1);
    expect(link.indexOf('sessionRef.current =')).toBeLessThan(published);
    // a reset link is `recovery`, not `signed_in` — and it goes through the same lines
    expect(link.indexOf("if (result.kind === 'recovery') setRecovery(true);")).toBeLessThan(ask);
  });

  it('every sign-in on the page ends in `signedIn` — and Delete account’s fresh login does not', () => {
    const auth = flatOf('../screens/auth/AuthScreen.tsx');
    expect(auth.match(/await actions\.signedIn\(s\);/g)).toHaveLength(2); // password, a provider
    expect(auth).toContain('if (r.session) return actions.signedIn(r.session);');
    // the re-authentication before a deletion request must not be what undoes it
    const del = flatOf('../screens/more/DeleteAccountScreen.tsx');
    expect(del).toContain('await auth.signInWithPassword(session.user.email, password);');
    expect(del).not.toContain('actions.signedIn(');
  });

  it('again while an account read shows the deletion pending, once per answer', () => {
    expect(context).toContain(
      'if (!keepAskDue(session.user.id, account.deletionPending, keepAnswered.current)) return; void keepAccount(session.user.id);',
    );
  });

  it('again on a backoff timer when the ask does not land, while the person is signed in', () => {
    const keep = between(
      'const keepAccount = useCallback(',
      'keepAccountRef.current = keepAccount;',
    );
    expect(keep).toContain('const outcome = await askToKeepAccount(providers.api);');
    expect(keep).toContain(
      'keepTimer.current = setTimeout( () => void keepAccountRef.current(userId), refreshBackoffMs(keepAttempts.current), );',
    );
    // an answer about a session that is gone — a sign-out, or a newer sign-in — is dropped
    expect(keep).toContain(
      "if (gen !== keepGen.current || now.status !== 'signed_in' || now.session.user.id !== userId) return;",
    );
    // and never during a teardown: the sign-out after a deletion request asks nothing
    expect(keep).toContain('if (!providers || tearingDown.current) return Promise.resolve();');
  });

  it('says "kept" once, and reads the account again so it shows', () => {
    const keep = between(
      'const keepAccount = useCallback(',
      'keepAccountRef.current = keepAccount;',
    );
    expect(keep).toContain("if (outcome === 'kept') {");
    expect(keep).toContain('setAccountKept(true);');
    const toast = flatOf('AccountKeptToast.tsx');
    expect(toast).toContain('toast.show(ACCOUNT_KEPT); said();');
    // a sign-out forgets all of it, so nothing carries to whoever signs in next
    const reset = between('resetToAuth: () => {', 'clearMemory:');
    expect(reset).toContain('setAccountKept(false); forgetKeepAsk();');
  });
});

describe('when an account read starts an ask', () => {
  const pending = { purge_at: '2026-09-28T12:00:00.000Z' };

  it('only while a deletion is pending', () => {
    expect(keepAskDue('u1', null, null)).toBe(false);
    expect(keepAskDue('u1', pending, null)).toBe(true);
  });

  it('not again for the same pending deletion once the server has answered for this person', () => {
    const answered = keepAnswerKey('u1', pending.purge_at);
    expect(keepAskDue('u1', pending, answered)).toBe(false);
    // a new request is a new question, and so is another person on this phone
    expect(keepAskDue('u1', { purge_at: '2026-10-02T09:00:00.000Z' }, answered)).toBe(true);
    expect(keepAskDue('u2', pending, answered)).toBe(true);
  });
});
