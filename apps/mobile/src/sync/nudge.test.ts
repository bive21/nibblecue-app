/**
 * THE NUDGE, ON THE PHONE (migration 0149; the owner, 2026-09-30: "The handover to another parent
 * takes a while before it shows up on the other phone, about 2 minutes if not more. This needs to
 * be faster. Not necessarily instant, but faster.").
 *
 * A handover was two pull hops, and each hop waited for the other phone's 30-second tick, or for
 * longer when that tick joined a pass that read only the tables a push had written. Now the server
 * broadcasts that something changed, and an open phone pulls half a second later. What is held here:
 *
 *   * the in-app server tells every phone listening on a household, once per push that applied
 *     anything, and nobody else;
 *   * the engine listens only while the app is active, and pulls once per burst of nudges, after
 *     the debounce and never before it;
 *   * a full pass asked for while a narrow one runs is not swallowed by it (the tick of old), and
 *     a nudge heard while any pass runs gets a pass of its own after it;
 *   * two phones on one server: a handover saved on one through the app's own write path is in the
 *     other's mirror after its nudge and the debounce, with no tick at all.
 *
 * Time is the test's: the tick never fires by itself, and the debounce is a timer the test lets
 * run out. What the hosted Realtime does with a channel is `providers/supabase.test.ts`'s and the
 * owner's staging check (0149's header).
 */
import {
  NUDGE_DEBOUNCE_MS,
  type Net,
  type PullRequest,
  type PushOp,
  type SyncApi,
} from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import { saveDuty } from '../data/duty';
import { dutyList } from '../db/queries/duty';
import { HOUSEHOLD, USER, seedHousehold } from '../testing/fixtures';
import { PARTNER, SERVER_EPOCH, addDevice, createSyncHarness } from './harness';
import { SyncEngine, type Timer } from './index';
import { MockSyncApi, MockSyncServer } from './providers/mock';
import type { AppStateSource, Scheduler } from './triggers';

const HOUR = 3_600_000;
const OTHER_HOUSEHOLD = 'aaaaaaaa-0000-4000-8000-000000000009';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

/** A few turns of the event loop: every pull here is promises over an in-memory database. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise<void>(resolve => setImmediate(resolve));
}

const net: Net = { isConnected: () => Promise.resolve(true), onReconnect: () => () => undefined };

/** React Native's `AppState`, as much of it as the engine reads, in the test's hands. */
function appState(initial: string) {
  let state = initial;
  const listeners = new Set<(s: string) => void>();
  const source: AppStateSource = {
    current: () => state,
    addListener(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
    go(next: string) {
      state = next;
      for (const listener of [...listeners]) listener(next);
    },
  };
}

/**
 * The tick, dropped on the floor: the interval is never kept, so it cannot fire, and every pull in
 * this file after the first is a nudge's or a caller's own.
 */
const neverTicks: Scheduler = { every: () => 1, cancel: () => undefined };

/** The debounce, in the test's hands: it runs out when the test says so. */
function fakeTimer() {
  const due = new Map<number, { ms: number; fn: () => void }>();
  let next = 1;
  const timer: Timer = {
    after(ms, fn) {
      const handle = next;
      next += 1;
      due.set(handle, { ms, fn });
      return handle;
    },
    clear(handle) {
      due.delete(handle as number);
    },
  };
  return {
    timer,
    /** The waits still running, by length. */
    get pending(): number[] {
      return [...due.values()].map(d => d.ms);
    },
    runOut() {
      const all = [...due.values()];
      due.clear();
      for (const d of all) d.fn();
    },
  };
}

/**
 * A transport that writes down every pull, counts who is listening, and can hold a pull's answer
 * on its way back: the pull has READ the server, and has not yet written anything down.
 */
function recorded(inner: SyncApi) {
  const asked: string[][] = [];
  let listening = 0;
  let gate: Promise<void> | null = null;
  let open: () => void = () => undefined;
  const api: SyncApi = {
    push: ops => inner.push(ops),
    pull: async (req: PullRequest) => {
      asked.push(req.tables.map(t => t.name));
      const answer = await inner.pull(req);
      if (gate !== null) await gate;
      return answer;
    },
    subscribe(householdId, onChange) {
      listening += 1;
      const off = inner.subscribe?.(householdId, onChange) ?? (() => undefined);
      let live = true;
      return () => {
        if (!live) return;
        live = false;
        listening -= 1;
        off();
      };
    },
  };
  return {
    api,
    asked,
    get listening() {
      return listening;
    },
    /** Whole passes begun: every one starts with the bootstrap phase, which asks for `profiles`. */
    get passes() {
      return asked.filter(tables => tables.includes('profiles')).length;
    },
    hold() {
      gate = new Promise<void>(resolve => {
        open = resolve;
      });
    },
    release() {
      gate = null;
      open();
    },
  };
}

let n = 0;
const id = () => `eeeeeeee-0000-4000-8000-${String(900_000 + ++n).padStart(12, '0')}`;

/** Who's on, written whole, the way `data/duty.ts` sends it: the other parent's phone's write. */
function dutyOp(nowMs: number, userId = PARTNER, household = HOUSEHOLD): PushOp {
  return {
    client_op_id: id(),
    entity: 'settings',
    op: 'UPDATE',
    entity_id: id(),
    household_id: household,
    payload: {
      table: 'household_duty',
      shifts: [
        {
          user_id: userId,
          from: new Date(nowMs).toISOString(),
          until: new Date(nowMs + 3 * HOUR).toISOString(),
        },
      ],
      client_edited_at: new Date(nowMs).toISOString(),
    },
  };
}

/** One phone, not yet started, on a server where the other parent's phone can write. */
async function phone(state = 'active') {
  const f = await seedHousehold();
  cleanups.push(f.restoreIds);
  let serverTick = 0;
  const server = new MockSyncServer({ now: () => f.clock.now() + ++serverTick });
  server.addMember({ household_id: HOUSEHOLD, user_id: USER, role: 'OWNER' });
  server.addMember({ household_id: HOUSEHOLD, user_id: PARTNER, role: 'PARENT' });
  const t = recorded(new MockSyncApi(server, USER));
  const app = appState(state);
  const timer = fakeTimer();
  const engine = new SyncEngine({
    db: f.db,
    api: t.api,
    net,
    clock: f.clock,
    householdId: HOUSEHOLD,
    userId: USER,
    analytics: () => undefined as never,
    appState: app.source,
    scheduler: neverTicks,
    timer: timer.timer,
  });
  cleanups.push(() => engine.stop());
  const partner = new MockSyncApi(server, PARTNER);
  return {
    f,
    server,
    t,
    app,
    timer,
    engine,
    /** The other parent's phone puts themselves on, on the same server. */
    handover: () => partner.push([dutyOp(f.clock.now())]),
  };
}

const onDuty = async (p: { f: { db: Parameters<typeof dutyList>[0] } }) =>
  (await dutyList(p.f.db, HOUSEHOLD)).shifts.map(s => s.userId);

describe('the in-app server tells whoever listens', () => {
  it('once per push that applied anything, on that household only', async () => {
    const server = new MockSyncServer({ now: () => Date.parse('2026-09-30T20:00:00.000Z') });
    server.addMember({ household_id: HOUSEHOLD, user_id: USER, role: 'OWNER' });
    server.addMember({ household_id: HOUSEHOLD, user_id: PARTNER, role: 'PARENT' });
    const heard = { mine: 0, partner: 0, other: 0 };
    const offMine = new MockSyncApi(server, USER).subscribe(HOUSEHOLD, () => {
      heard.mine += 1;
    });
    new MockSyncApi(server, PARTNER).subscribe(HOUSEHOLD, () => {
      heard.partner += 1;
    });
    new MockSyncApi(server, USER).subscribe(OTHER_HOUSEHOLD, () => {
      heard.other += 1;
    });
    const at = Date.parse('2026-09-30T20:00:00.000Z');

    // three ops, one push: one nudge each, the sender's own phone included
    const res = await new MockSyncApi(server, PARTNER).push([
      dutyOp(at),
      dutyOp(at, USER),
      dutyOp(at),
    ]);
    expect(res.results.map(r => r.status)).toEqual(['applied', 'applied', 'applied']);
    expect(heard).toEqual({ mine: 1, partner: 1, other: 0 });

    // a push the server refused, op by op, tells nobody
    const refused = await new MockSyncApi(server, PARTNER).push([
      dutyOp(at, 'bbbbbbbb-0000-4000-8000-00000000dead'),
    ]);
    expect(refused.results[0]?.status).toBe('rejected');
    expect(heard).toEqual({ mine: 1, partner: 1, other: 0 });

    // a phone that stopped listening hears nothing more
    offMine();
    offMine();
    await new MockSyncApi(server, PARTNER).push([dutyOp(at)]);
    expect(heard).toEqual({ mine: 1, partner: 2, other: 0 });
  });

  it('tells even when the answer to the sender is lost, and not when the push never finished', async () => {
    const server = new MockSyncServer({ now: () => Date.parse('2026-09-30T20:00:00.000Z') });
    server.addMember({ household_id: HOUSEHOLD, user_id: PARTNER, role: 'PARENT' });
    let heard = 0;
    new MockSyncApi(server, USER).subscribe(HOUSEHOLD, () => {
      heard += 1;
    });
    const partner = new MockSyncApi(server, PARTNER);
    const at = Date.parse('2026-09-30T20:00:00.000Z');

    server.dropNextResponse();
    await expect(partner.push([dutyOp(at)])).rejects.toThrow();
    expect(heard).toBe(1); // applied and kept: the other phones have to hear

    server.abortAfterOps = 0;
    await expect(partner.push([dutyOp(at)])).rejects.toThrow();
    expect(heard).toBe(1); // nothing applied, nothing kept
  });
});

describe('the engine hears a nudge', () => {
  it('pulls once, after the debounce and not before, and the pass brings the change', async () => {
    const p = await phone();
    p.engine.start();
    await settle();
    expect(p.t.passes).toBe(1); // the foreground pass

    await p.handover();
    expect(p.timer.pending).toEqual([NUDGE_DEBOUNCE_MS]);
    await settle();
    expect(p.t.passes).toBe(1);
    expect(await onDuty(p)).toEqual([]);

    p.timer.runOut();
    await settle();
    expect(p.t.passes).toBe(2);
    expect(p.engine.lastPullReason).toBe('push');
    expect(await onDuty(p)).toEqual([PARTNER]);
    await settle();
    expect(p.t.passes).toBe(2);
  });

  it('pulls once for several nudges inside the window: every nudge starts the wait again', async () => {
    const p = await phone();
    p.engine.start();
    await settle();

    await p.handover();
    await p.handover();
    await p.handover();
    expect(p.timer.pending).toEqual([NUDGE_DEBOUNCE_MS]);

    p.timer.runOut();
    await settle();
    expect(p.t.passes).toBe(2);
    expect(p.timer.pending).toEqual([]);
  });

  it('listens only while the app is active, once, and lets go on the background, pause and stop', async () => {
    const p = await phone('background');
    p.engine.start();
    expect(p.t.listening).toBe(0);
    await p.handover();
    expect(p.timer.pending).toEqual([]);

    p.app.go('active');
    expect(p.t.listening).toBe(1);
    p.app.go('active');
    expect(p.t.listening).toBe(1);
    p.app.go('background');
    expect(p.t.listening).toBe(0);

    // heard, and the app went away before the wait ran out: no pull behind a dark screen
    p.app.go('active');
    await settle();
    const before = p.t.passes;
    await p.handover();
    expect(p.timer.pending).toEqual([NUDGE_DEBOUNCE_MS]);
    p.app.go('inactive');
    expect(p.timer.pending).toEqual([]);
    expect(p.t.listening).toBe(0);
    await settle();
    expect(p.t.passes).toBe(before);

    p.app.go('active');
    expect(p.t.listening).toBe(1);
    p.engine.pause();
    expect(p.t.listening).toBe(0);
    await p.handover();
    expect(p.timer.pending).toEqual([]);

    p.engine.start();
    expect(p.t.listening).toBe(1);
    p.engine.stop();
    expect(p.t.listening).toBe(0);
  });
});

describe('one pull at a time, and none swallowed', () => {
  it('runs a full pass asked for during a narrow one right after it, and two such asks as one', async () => {
    const p = await phone('background');
    p.engine.start();
    p.t.hold();
    const narrow = p.engine.pullTables(['household_duty']);
    await settle();
    expect(p.t.asked).toEqual([['household_duty']]);

    // the tick of old: it joined the narrow pass and read nothing else for thirty seconds
    const tick = p.engine.pullNow('tick');
    const manual = p.engine.pullNow('manual');
    expect(tick).not.toBe(narrow);
    expect(manual).toBe(tick);
    await settle();
    expect(p.t.asked).toHaveLength(1); // still one pull at a time

    p.t.release();
    const [n1, full] = await Promise.all([narrow, tick]);
    expect(n1.tables).toEqual(['household_duty']);
    expect(full.tables).toEqual(expect.arrayContaining(['household_duty', 'activities']));
    expect(p.t.passes).toBe(1);
    // a full ask while a full pass runs still joins it
    const a = p.engine.pullNow('refresh');
    expect(p.engine.pullNow('tick')).toBe(a);
    await a;
    expect(p.t.passes).toBe(2);
  });

  it('gives a nudge heard during a running pass a pass of its own after it', async () => {
    const p = await phone();
    p.t.hold();
    p.engine.start();
    await settle();
    // the foreground pass has READ who's on, and its answer is still on the way back
    expect(p.t.asked).toHaveLength(1);

    await p.handover();
    p.timer.runOut();
    await settle();
    expect(p.t.asked).toHaveLength(1);

    p.t.release();
    await settle();
    // joining the foreground pass would have left the handover to the tick
    expect(p.t.passes).toBe(2);
    expect(await onDuty(p)).toEqual([PARTNER]);
  });

  it('starts nothing of its own once paused: what waited gets the running pass’s answer', async () => {
    const p = await phone('background');
    p.engine.start();
    p.t.hold();
    const narrow = p.engine.pullTables(['household_duty']);
    await settle();
    const waiting = p.engine.pullNow('manual');
    p.engine.pause();
    p.t.release();
    expect(await waiting).toBe(await narrow);
    expect(p.t.passes).toBe(0);
  });
});

describe('two phones, one household', () => {
  it('a handover saved on one phone is on the other after its nudge, with no tick at all', async () => {
    const h = await createSyncHarness({ at: SERVER_EPOCH, stash: false, scenario: 'nudge' });
    cleanups.push(() => h.dispose());
    const sam = await addDevice(h, PARTNER, { stash: false });

    // Dana's phone and Sam's, both open, both on the server's clock
    const dana = new SyncEngine({
      db: h.db,
      api: new MockSyncApi(h.server, USER),
      net: h.net,
      clock: h.clock,
      householdId: HOUSEHOLD,
      userId: USER,
      analytics: () => undefined as never,
      appState: appState('active').source,
      scheduler: neverTicks,
      timer: fakeTimer().timer,
    });
    const samPulls = recorded(sam.api);
    const samTimer = fakeTimer();
    const samPhone = new SyncEngine({
      db: sam.db,
      api: samPulls.api,
      net,
      clock: h.clock,
      householdId: HOUSEHOLD,
      userId: PARTNER,
      analytics: () => undefined as never,
      appState: appState('active').source,
      scheduler: neverTicks,
      timer: samTimer.timer,
    });
    cleanups.push(
      () => dana.stop(),
      () => samPhone.stop(),
    );
    dana.start();
    samPhone.start();
    await settle();
    expect(samPulls.passes).toBe(1);

    // Dana hands the night to Sam, through the app's own write path, and her phone sends it
    const now = h.clock.now();
    await saveDuty(h.db, h.clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'sheet',
      shifts: [{ userId: PARTNER, fromMs: now, untilMs: now + 3 * HOUR }],
      eligible: new Set([USER, PARTNER]),
    });
    const sent = await dana.flush('write');
    expect(sent.synced).toBe(1);

    // Sam's phone has heard, and has not pulled yet
    expect(samTimer.pending).toEqual([NUDGE_DEBOUNCE_MS]);
    expect((await dutyList(sam.db, HOUSEHOLD)).shifts).toEqual([]);

    // half a second later it has the night, from the nudge's own pass: no tick can fire here
    samTimer.runOut();
    await settle();
    expect((await dutyList(sam.db, HOUSEHOLD)).shifts.map(s => s.userId)).toEqual([PARTNER]);
    expect(samPulls.passes).toBe(2);
  });
});
