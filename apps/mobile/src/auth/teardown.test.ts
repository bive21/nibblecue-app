import { describe, expect, it, vi } from 'vitest';
import {
  OUTBOX_FLUSH_BUDGET_MS,
  parseTeardownMark,
  resumeInterruptedTeardown,
  runTeardown,
  serializeTeardownMark,
  type TeardownDeps,
  type TeardownMark,
  type TeardownUser,
} from './teardown';

const dana: TeardownUser = { id: 'u1', email: 'dana@example.test' };

/** Every dependency records the order it was called in, so the 12-step order is asserted, not assumed. */
function harness(
  over: {
    user?: TeardownUser | null;
    /** An interrupted run: `true` is a mark that names nobody (what every mark was before). */
    flag?: boolean | TeardownMark;
    online?: boolean;
    pending?: unknown[];
  } = {},
) {
  const calls: string[] = [];
  let mark: TeardownMark | null =
    over.flag === true ? { user: null, keepPrefs: [] } : over.flag ? over.flag : null;
  /** Every mark step 1 wrote, and every keep list step 10 was given. */
  const marks: TeardownMark[] = [];
  const keeps: (readonly string[])[] = [];
  let user = over.user === undefined ? dana : over.user;
  const rec =
    <T>(name: string, value?: T) =>
    async () => {
      calls.push(name);
      return value as T;
    };
  const deps: TeardownDeps = {
    flags: {
      get: async () => mark,
      set: async m => {
        calls.push(`flag=${m !== null}`);
        if (m !== null) marks.push(m);
        mark = m;
      },
    },
    session: { current: async () => user },
    ui: { freeze: () => calls.push('ui.freeze'), closeSheets: () => calls.push('ui.closeSheets') },
    network: { online: async () => over.online ?? true },
    outbox: {
      flush: async budget => calls.push(`outbox.flush(${budget})`) as unknown as void,
      pending: rec('outbox.pending', over.pending ?? []),
    },
    quarantine: {
      write: async (u, ops) => {
        calls.push(`quarantine.write(${u.id},${ops.length})`);
        return ops.length > 0;
      },
    },
    notifications: {
      cancelAllScheduled: rec('notifications.cancelAllScheduled'),
      dismissAllDelivered: rec('notifications.dismissAllDelivered'),
    },
    widgets: { clearSnapshot: rec('widgets.clearSnapshot'), reloadAll: rec('widgets.reloadAll') },
    push: {
      markInvalidOnServer: rec('push.markInvalidOnServer'),
      unregisterLocally: rec('push.unregisterLocally'),
    },
    auth: {
      signOut: async scope => {
        calls.push(`auth.signOut(${scope})`);
        user = null;
      },
    },
    db: { closeAndDelete: rec('db.closeAndDelete') },
    keychain: { clearSession: rec('keychain.clearSession') },
    prefs: {
      clearForSignOut: async keep => {
        calls.push('prefs.clearForSignOut');
        keeps.push(keep);
      },
      clearForHouseholdEnd: async u => {
        calls.push(`prefs.clearForHouseholdEnd(${u.id})`);
      },
    },
    caches: { clearMemory: rec('caches.clearMemory'), clearTmp: rec('caches.clearTmp') },
    nav: { resetToAuth: () => calls.push('nav.resetToAuth') },
    analytics: { emit: (e, p) => calls.push(`analytics.${e}(${p.scope},${p.queued_ops_bucket})`) },
  };
  return { deps, calls, flag: () => mark !== null, mark: () => mark, marks, keeps };
}

describe('sign-out teardown (ACCOUNTS.md §4)', () => {
  it('runs the twelve steps in the documented order', async () => {
    const h = harness();
    const r = await runTeardown('local', h.deps);
    expect(r).toEqual({ ran: true, failed: [], quarantined: 0 });
    expect(h.calls).toEqual([
      'flag=true',
      'ui.closeSheets',
      'ui.freeze',
      `outbox.flush(${OUTBOX_FLUSH_BUDGET_MS})`,
      'outbox.pending',
      'notifications.cancelAllScheduled',
      'notifications.dismissAllDelivered',
      'widgets.clearSnapshot',
      'widgets.reloadAll',
      'push.markInvalidOnServer',
      'push.unregisterLocally',
      'auth.signOut(local)',
      'db.closeAndDelete',
      'keychain.clearSession',
      'prefs.clearForSignOut',
      'caches.clearMemory',
      'caches.clearTmp',
      'nav.resetToAuth',
      'flag=false',
      'analytics.signed_out(local,0)',
    ]);
    // the snapshot is gone before the database is, and the database before the keychain
    expect(h.calls.indexOf('widgets.clearSnapshot')).toBeLessThan(
      h.calls.indexOf('db.closeAndDelete'),
    );
    expect(h.calls.indexOf('auth.signOut(local)')).toBeLessThan(
      h.calls.indexOf('db.closeAndDelete'),
    );
    expect(h.flag()).toBe(false);
  });

  it('a failure at step 6 still deletes the database and the snapshot, and the flag still clears', async () => {
    const h = harness();
    h.deps.push.markInvalidOnServer = async () => {
      throw new Error('APNs down');
    };
    const r = await runTeardown('global', h.deps);
    expect(r.failed).toEqual([6]);
    expect(h.calls).toContain('widgets.clearSnapshot');
    expect(h.calls).toContain('db.closeAndDelete');
    expect(h.calls).toContain('auth.signOut(global)');
    expect(h.calls).toContain('analytics.signed_out(global,0)');
    expect(h.flag()).toBe(false);
  });

  it('quarantines only when ops remain, only for the signing-out user, and never flushes offline', async () => {
    const off = harness({ online: false, pending: [{ op: 1 }, { op: 2 }, { op: 3 }] });
    const r = await runTeardown('forced', off.deps);
    expect(r.quarantined).toBe(3);
    expect(off.calls).not.toContain(`outbox.flush(${OUTBOX_FLUSH_BUDGET_MS})`);
    expect(off.calls).not.toContain('push.markInvalidOnServer'); // online-only
    expect(off.calls).toContain('quarantine.write(u1,3)');
    expect(off.calls).toContain('db.closeAndDelete'); // the DB still goes; only the quarantine keeps bytes
    expect(off.calls.at(-1)).toBe('analytics.signed_out(forced,1-3)');

    const clean = harness({ pending: [] });
    await runTeardown('local', clean.deps);
    expect(clean.calls.some(c => c.startsWith('quarantine.write'))).toBe(false);
  });

  it('is a no-op when there is nothing to tear down, and resumes an interrupted run at launch', async () => {
    const nothing = harness({ user: null });
    expect(await runTeardown('local', nothing.deps)).toEqual({
      ran: false,
      failed: [],
      quarantined: 0,
    });
    expect(nothing.calls).toEqual([]);

    // interrupted after step 7: no session any more, but the flag is still set
    const interrupted = harness({ user: null, flag: true });
    const r = await resumeInterruptedTeardown(interrupted.deps);
    expect(r.ran).toBe(true);
    expect(interrupted.calls).toContain('db.closeAndDelete');
    expect(interrupted.calls).toContain('keychain.clearSession');
    expect(interrupted.calls).toContain('prefs.clearForSignOut');
    expect(interrupted.flag()).toBe(false);
    expect(interrupted.calls.some(c => c.startsWith('quarantine.write'))).toBe(false); // no user to key it by

    // and a second run after a completed one does nothing
    const done = harness();
    await runTeardown('local', done.deps);
    const before = done.calls.length;
    expect((await runTeardown('local', done.deps)).ran).toBe(false);
    expect(done.calls.length).toBe(before);
    expect(vi.isMockFunction(done.deps.db.closeAndDelete)).toBe(false);
  });

  it('flushes with the documented budget and quarantines EVERY unsent row (WP4.9)', async () => {
    // What step 3 keeps is exactly what step 2 could not send, whatever state it was left in: a
    // row abandoned in SENDING is the entry that was closest to being safe, and dropping it is
    // the one way a sign-out can still lose a log.
    const left = [
      { client_op_id: 'a', state: 'PENDING' },
      { client_op_id: 'b', state: 'SENDING' },
      { client_op_id: 'c', state: 'FAILED' },
    ];
    const h = harness({ pending: left });
    const result = await runTeardown('local', h.deps);
    expect(h.calls).toContain(`outbox.flush(${OUTBOX_FLUSH_BUDGET_MS})`);
    expect(h.calls.indexOf(`outbox.flush(${OUTBOX_FLUSH_BUDGET_MS})`)).toBeLessThan(
      h.calls.indexOf('outbox.pending'),
    );
    expect(h.calls).toContain('quarantine.write(u1,3)');
    expect(result.quarantined).toBe(3);
    // and the bucket in the event is a bucket, never the count
    expect(h.calls.at(-1)).toBe('analytics.signed_out(local,1-3)');
  });

  it('a switch or a deletion signs out locally or globally as documented', async () => {
    const sw = harness();
    await runTeardown('switch', sw.deps);
    expect(sw.calls).toContain('auth.signOut(local)');
    const del = harness();
    await runTeardown('deletion', del.deps);
    expect(del.calls).toContain('auth.signOut(global)');
    expect(del.calls.at(-1)).toBe('analytics.signed_out(local,0)');
  });
});

/**
 * THE HOUSEHOLD LEAVES, THE PERSON STAYS (`teardown.ts` `TeardownScope`; docs/ACCOUNTS.md §4,
 * §7.3). The account is no longer in the household this phone holds, and is still signed in: the
 * household's rows, queue (kept, under this person), reminders, widgets and preferences go, and
 * nothing that is the person's does — not the session, not the keychain, not the push token, not
 * the memory of which household it was.
 */
describe('a household teardown (the session stays)', () => {
  /** Everything that is the PERSON's, and so is never touched when only the household goes. */
  const PERSON = [
    'flag=true',
    'flag=false',
    'push.markInvalidOnServer',
    'push.unregisterLocally',
    'auth.signOut(local)',
    'auth.signOut(global)',
    'keychain.clearSession',
    'prefs.clearForSignOut',
    'caches.clearMemory',
    'nav.resetToAuth',
  ];

  it('runs the household steps in the documented order, numbered as §4 numbers them', async () => {
    const h = harness();
    const r = await runTeardown('household', h.deps);
    expect(r).toEqual({ ran: true, failed: [], quarantined: 0 });
    expect(h.calls).toEqual([
      // 1 — the latch and the engine's triggers (`bindings.ts` `freeze`), and NO flag
      'ui.closeSheets',
      'ui.freeze',
      // 2, 3
      `outbox.flush(${OUTBOX_FLUSH_BUDGET_MS})`,
      'outbox.pending',
      // 4, 5
      'notifications.cancelAllScheduled',
      'notifications.dismissAllDelivered',
      'widgets.clearSnapshot',
      'widgets.reloadAll',
      // 8, 10, 11
      'db.closeAndDelete',
      'prefs.clearForHouseholdEnd(u1)',
      'caches.clearTmp',
    ]);
  });

  it('never signs the auth client out, clears the keychain, drops the push token or says signed_out', async () => {
    const h = harness();
    await runTeardown('household', h.deps);
    for (const call of PERSON) expect(h.calls, call).not.toContain(call);
    expect(h.calls.some(c => c.startsWith('analytics.'))).toBe(false);
    // the session is still there afterwards: nothing here could have ended it
    expect(await h.deps.session.current()).toEqual(dana);
  });

  it('clears only the household preferences — never the sweep that forgets last_household', async () => {
    const h = harness();
    await runTeardown('household', h.deps);
    expect(h.calls).toContain('prefs.clearForHouseholdEnd(u1)');
    expect(h.calls).not.toContain('prefs.clearForSignOut');
    // and it runs after the file is gone, like the sign-out's step 10 does
    expect(h.calls.indexOf('db.closeAndDelete')).toBeLessThan(
      h.calls.indexOf('prefs.clearForHouseholdEnd(u1)'),
    );
  });

  it('quarantines every unsent row under the signed-in person BEFORE the file goes (rule 7)', async () => {
    const left = [
      { client_op_id: 'a', state: 'PENDING' },
      { client_op_id: 'b', state: 'SENDING' },
      { client_op_id: 'c', state: 'FAILED' },
    ];
    const h = harness({ pending: left, online: false });
    const r = await runTeardown('household', h.deps);
    expect(r.quarantined).toBe(3);
    expect(h.calls).toContain('quarantine.write(u1,3)');
    expect(h.calls.indexOf('quarantine.write(u1,3)')).toBeLessThan(
      h.calls.indexOf('db.closeAndDelete'),
    );
    // offline: no flush was attempted, and the rows were kept all the same
    expect(h.calls).not.toContain(`outbox.flush(${OUTBOX_FLUSH_BUDGET_MS})`);
    // an empty queue writes nothing, so a quarantine already on the phone is left alone
    const clean = harness({ pending: [] });
    await runTeardown('household', clean.deps);
    expect(clean.calls.some(c => c.startsWith('quarantine.write'))).toBe(false);
  });

  it('cancels the reminders and clears the widgets before the database goes', async () => {
    const h = harness();
    await runTeardown('household', h.deps);
    const del = h.calls.indexOf('db.closeAndDelete');
    expect(h.calls.indexOf('notifications.cancelAllScheduled')).toBeLessThan(del);
    expect(h.calls.indexOf('notifications.dismissAllDelivered')).toBeLessThan(del);
    expect(h.calls.indexOf('widgets.clearSnapshot')).toBeLessThan(del);
  });

  it('keeps going past a step that throws, and names it by its §4 number', async () => {
    const h = harness();
    h.deps.widgets.clearSnapshot = async () => {
      throw new Error('App Group unavailable');
    };
    const r = await runTeardown('household', h.deps);
    expect(r.failed).toEqual([5]);
    expect(h.calls).toContain('db.closeAndDelete');
    expect(h.calls).toContain('prefs.clearForHouseholdEnd(u1)');
  });

  it('needs somebody signed in: with no session there is nothing to keep it for', async () => {
    const nobody = harness({ user: null });
    expect(await runTeardown('household', nobody.deps)).toEqual({
      ran: false,
      failed: [],
      quarantined: 0,
    });
    expect(nobody.calls).toEqual([]);
    // …and a sign-out's interrupted flag is not its to finish or to clear
    const flagged = harness({ user: null, flag: true });
    expect((await runTeardown('household', flagged.deps)).ran).toBe(false);
    expect(flagged.flag()).toBe(true);
    expect(flagged.calls).toEqual([]);
  });

  /**
   * INTERRUPTED, IT IS NOT FINISHED AS A SIGN-OUT. The process dies between steps; at the next
   * launch `resumeInterruptedTeardown` must find nothing to do — the account cache still lists the
   * household, so the app opens on it, finds it gone again, and runs this from the top with the
   * engine mounted. A flag would have handed it to the resume, which runs a FULL forced teardown:
   * signed out, the household memory swept, and no engine at launch to read the queue through.
   */
  it('an interrupted household teardown leaves no flag, so the next launch does not sign anyone out', async () => {
    for (const at of ['outbox.pending', 'widgets.clearSnapshot', 'db.closeAndDelete'] as const) {
      const h = harness({ pending: [{ client_op_id: 'a' }] });
      const never = () => new Promise<never>(() => undefined);
      // the process dies inside this step: the promise never settles
      if (at === 'outbox.pending') h.deps.outbox.pending = never;
      if (at === 'widgets.clearSnapshot') h.deps.widgets.clearSnapshot = never;
      if (at === 'db.closeAndDelete') h.deps.db.closeAndDelete = never;
      void runTeardown('household', h.deps);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(h.flag(), at).toBe(false);

      // the relaunch: the flag is all the resume reads, and it is not set
      const before = h.calls.length;
      expect(await resumeInterruptedTeardown(h.deps), at).toEqual({
        ran: false,
        failed: [],
        quarantined: 0,
      });
      expect(h.calls.length, at).toBe(before);
      expect(h.calls, at).not.toContain('auth.signOut(local)');
      expect(h.calls, at).not.toContain('prefs.clearForSignOut');
    }
  });

  it('runs again from the top when the household is found gone again, and is harmless twice', async () => {
    const h = harness({ pending: [{ client_op_id: 'a' }] });
    await runTeardown('household', h.deps);
    const first = [...h.calls];
    h.calls.length = 0;
    const again = await runTeardown('household', h.deps);
    expect(again.ran).toBe(true);
    // the same steps, in the same order: every one of them tolerates having happened
    expect(h.calls).toEqual(first);
  });

  it('a sign-out interrupted the old way still resumes as one — the flag means what it meant', async () => {
    const h = harness({ user: null, flag: true });
    const r = await resumeInterruptedTeardown(h.deps);
    expect(r.ran).toBe(true);
    expect(h.calls).toContain('prefs.clearForSignOut');
    expect(h.calls).not.toContain('prefs.clearForHouseholdEnd(u1)');
  });
});

/**
 * THE MARK AN INTERRUPTED SIGN-OUT LEAVES (`teardown.ts` `TeardownMark`; the adversarial review,
 * 2026-09-25). A sign-out killed between steps 1 and 8 used to be finished at the next launch with
 * nobody to keep the queue under — the session was not read yet — so step 3 found the rows (read
 * from the file) and step 8 deleted them. The mark names the person, and what step 10 keeps.
 */
describe('an interrupted sign-out, finished at launch as the person it was signing out', () => {
  const OPS = [{ client_op_id: 'a' }, { client_op_id: 'b' }, { client_op_id: 'c' }];

  it('writes who it is signing out, and what step 10 keeps, before anything else — and clears it last', async () => {
    const h = harness();
    await runTeardown('forced', h.deps, { keepPrefs: ['last_household:u1'] });
    expect(h.calls[0]).toBe('flag=true');
    expect(h.marks).toEqual([{ user: dana, keepPrefs: ['last_household:u1'] }]);
    expect(h.keeps).toEqual([['last_household:u1']]);
    expect(h.calls.at(-2)).toBe('flag=false');
    expect(h.mark()).toBeNull();
  });

  it('keeps the queue under the person the mark names, though nobody is signed in at launch', async () => {
    // killed after step 1: the mark is written, the file still holds three unsynced entries
    const h = harness({ user: null, flag: { user: dana, keepPrefs: [] }, pending: OPS });
    const r = await resumeInterruptedTeardown(h.deps);
    expect(r.ran).toBe(true);
    expect(r.quarantined).toBe(3);
    expect(h.calls).toContain('quarantine.write(u1,3)');
    // …kept before the file goes
    expect(h.calls.indexOf('quarantine.write(u1,3)')).toBeLessThan(
      h.calls.indexOf('db.closeAndDelete'),
    );
    expect(h.mark()).toBeNull();
  });

  it('keeps through step 10 what the interrupted run was to keep', async () => {
    // the forced sign-out a refused pull falls back to, killed part-way: Ended must still open
    const h = harness({ user: null, flag: { user: dana, keepPrefs: ['last_household:u1'] } });
    await resumeInterruptedTeardown(h.deps);
    expect(h.keeps).toEqual([['last_household:u1']]);
    // …and the resumed run's own mark carries it again, should this run be killed too
    expect(h.marks[0]).toEqual({ user: dana, keepPrefs: ['last_household:u1'] });
  });

  it('a mark that names nobody still finishes the sign-out, as every one did before', async () => {
    const h = harness({ user: null, flag: true, pending: OPS });
    const r = await resumeInterruptedTeardown(h.deps);
    expect(r.ran).toBe(true);
    expect(h.calls).toContain('db.closeAndDelete');
    expect(h.calls).toContain('keychain.clearSession');
    expect(h.calls.some(c => c.startsWith('quarantine.write'))).toBe(false);
    expect(h.keeps).toEqual([[]]);
    expect(h.mark()).toBeNull();
  });

  it('a live sign-out names the live session, and never a stale mark’s keep list', async () => {
    const h = harness({ flag: { user: { id: 'u9', email: null }, keepPrefs: ['stale'] } });
    await runTeardown('local', h.deps, { keepPrefs: [] });
    expect(h.marks[0]).toEqual({ user: dana, keepPrefs: [] });
    expect(h.keeps).toEqual([[]]);
  });
});

describe('the mark as the keystore holds it', () => {
  it('round-trips who and what to keep', () => {
    const mark: TeardownMark = { user: dana, keepPrefs: ['last_household:u1'] };
    expect(parseTeardownMark(serializeTeardownMark(mark))).toEqual(mark);
    const noEmail: TeardownMark = { user: { id: 'u2', email: null }, keepPrefs: [] };
    expect(parseTeardownMark(serializeTeardownMark(noEmail))).toEqual(noEmail);
  });

  it('nothing stored is no teardown at all', () => {
    expect(parseTeardownMark(null)).toBeNull();
    expect(parseTeardownMark('')).toBeNull();
  });

  it('anything else it cannot read is a teardown to finish, naming nobody', () => {
    for (const raw of ['1', 'true', '{', '"x"', '[]', '{"user":{"id":""}}', '{"user":7}'])
      expect(parseTeardownMark(raw), raw).toEqual({ user: null, keepPrefs: [] });
    // a stray key in the keep list is dropped rather than failing the whole mark
    expect(parseTeardownMark('{"user":{"id":"u1","email":3},"keepPrefs":["a",4]}')).toEqual({
      user: { id: 'u1', email: null },
      keepPrefs: ['a'],
    });
  });
});
