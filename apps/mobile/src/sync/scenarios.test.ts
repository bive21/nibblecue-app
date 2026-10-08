/**
 * `docs/OFFLINE_SYNC.md` §9, end to end on a device that has no network and then has one.
 *
 * TWO HALVES, AND THE SPLIT IS THE POINT.
 *
 * The first half runs `SYNC_SCENARIOS` — the eighteen rows of §9, as data — through the shared
 * harness. Those assertions are about what the SERVER ends up holding, and they run unchanged
 * against Postgres in `packages/db/src/integration/sync-scenarios.test.ts` (D23).
 *
 * The second half is the four rows whose claim is about the DEVICE, and which therefore cannot
 * be expressed against `SyncApi` and `ServerProbe` alone: the outbox rows a stash bottle leaves
 * behind, the toast a double-tapped Save raises, two phones each with their own database, and
 * the losing phone adopting the winning timer. Each drives the real write path — `logActivity`,
 * `logBottleFromStash`, `startTimer`, `OutboxWorker` — over `node:sqlite`, which is the code
 * the phone runs.
 *
 * Nothing here replaces a unit test. `worker.test.ts` proves the queue's own state machine and
 * `repository.test.ts` the transaction; these rows prove the four of them compose.
 */
import type { OutboxRow } from '@nibblecue/core';
import { SYNC_SCENARIOS } from '@nibblecue/core/sync/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import { logActivity } from '../data/activities';
import { logBottleFromStash } from '../data/stash';
import { startTimer } from '../data/timers';
import type { Db } from '../db/driver';
import { CHILD_A, HOUSEHOLD, USER } from '../testing/fixtures';
import { duplicateBottle } from './copy';
import { addDevice, createSyncHarness, PARTNER, type SyncHarness } from './harness';
import { syncChipFrom } from './status';

const open: SyncHarness[] = [];
afterEach(() => {
  for (const h of open.splice(0)) h.dispose();
});

async function setup(scenario: string): Promise<SyncHarness> {
  const h = await createSyncHarness({ scenario });
  open.push(h);
  return h;
}

const outboxRows = (db: Db): Promise<OutboxRow[]> =>
  db.all<OutboxRow>('select * from outbox order by seq asc', []);

/* ================================================================ the table */

describe('the §9 matrix against the harness', () => {
  it('runs every row the table claims — eighteen, no more and no fewer', () => {
    expect(SYNC_SCENARIOS.length).toBe(18);
  });

  for (const scenario of SYNC_SCENARIOS) {
    it(`${scenario.tag} — ${scenario.title}`, async () => {
      const h = await setup(scenario.id);
      await scenario.run(h.api, h.probe, h.ctx);
    });
  }
});

/* ================================================================ the device's four rows */

describe('@AT-07 the offline bottle, end to end on the device', () => {
  it('survives a kill, lands once, keeps the tap time and leaves two SYNCED outbox rows', async () => {
    const h = await setup('at07-device');
    const tapTime = h.clock.iso();

    // Airplane mode. The write must succeed with no network at all (CLAUDE.md rule 7).
    h.net.connected = false;
    const written = await logBottleFromStash(h.db, h.clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: 'device-1',
      source: 'quicklog',
      childId: CHILD_A,
      startAt: tapTime,
      consumedMl: 120,
    });
    expect(written.committed).toBe(true);

    // TWO ops, not the four §9 row 7 claims and not the three §2.3 claims (D5). The detail row
    // travels inside the activity op, and the container's new amount is the ledger row's own
    // consequence — so what is owed to the server is: one activity, one ledger row.
    expect(written.opIds).toHaveLength(2);
    const queued = await outboxRows(h.db);
    expect(queued).toHaveLength(2);
    expect(queued.map(r => r.entity)).toEqual(['activity', 'milk_txn']);

    const offline = h.worker();
    offline.start();
    expect((await offline.flush('write')).stoppedBecause).toBe('offline');
    expect(h.server.rowCount('activities')).toBe(0);
    // The chip a parent sees while the entry is on the phone and nowhere else.
    expect(syncChipFrom(h.states[h.states.length - 1] ?? h.states[0]!).state).toBe('offline');

    // The app is killed with both ops queued; four hours later it is relaunched with a network.
    h.clock.advance(4 * 3_600_000);
    h.net.connected = true;
    const relaunched = h.worker();
    relaunched.start();
    const outcome = await relaunched.flush('foreground');
    expect(outcome.synced).toBe(2);

    // Exactly one server record, at the time of the TAP, not the time of the flush.
    expect(h.server.rowCount('activities', { type: 'bottle' })).toBe(1);
    const activity = h.server.activities[0];
    expect(activity?.['start_at']).toBe(tapTime);
    expect(h.server.detailRow(String(activity?.['id']), 'bottle_details')).not.toBeNull();
    const uses = h.server.milk_inventory_transactions.filter(r => r['kind'] === 'USE');
    expect(uses).toHaveLength(1);
    expect(uses[0]?.['delta_ml']).toBe(-120);

    for (const row of await outboxRows(h.db)) expect(row.state).toBe('SYNCED');
    const local = await h.db.get<{ local_synced: number }>(
      'select local_synced from activities where id = ?',
      [written.activityId],
    );
    expect(local?.local_synced).toBe(1);
    // §6: `SYNCED` is not a state the chip renders. A drained queue draws nothing at all.
    expect(syncChipFrom(h.states[h.states.length - 1]!).state).toBe('ok');
  });
});

describe('@AT-17b a double-tapped Save is one bottle', () => {
  it('suppresses the second tap before it mints an id, and says so as a non-event', async () => {
    const h = await setup('at17b-device');
    await h.restore(); // a restored device: the guard table starts empty, and is proved to

    const input = {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: 'device-1',
      source: 'sheet' as const,
      childId: CHILD_A,
      startAt: h.clock.iso(),
      consumedMl: 120,
    };
    const first = await logBottleFromStash(h.db, h.clock, input);
    expect(first.committed).toBe(true);

    h.clock.advance(200);
    const second = await logBottleFromStash(h.db, h.clock, { ...input, startAt: h.clock.iso() });

    expect(second.suppressed).toBe(true);
    expect(second.committed).toBe(false);
    // The second tap produced NO client_op_id: suppression happens before the mint, so there is
    // nothing to roll back and nothing queued that has to be recognised later.
    expect(second.opIds).toEqual([]);

    const activities = await h.db.get<{ n: number }>('select count(*) as n from activities', []);
    expect(activities?.n).toBe(1);
    expect(await outboxRows(h.db)).toHaveLength(2);

    // The sentence is a non-event, never an error: the app has just protected the parent.
    expect(duplicateBottle).toBe('Just logged that bottle. No duplicate created.');

    const worker = h.worker();
    worker.start();
    await worker.flush('write');
    expect(h.server.rowCount('activities', { type: 'bottle' })).toBe(1);
  });
});

describe('@AT-17c two caregivers within a second are two entries', () => {
  it('keeps both, from two databases, with the two authors on them', async () => {
    const h = await setup('at17c-device');
    const other = await addDevice(h, PARTNER);

    const at = h.clock.iso();
    const mine = await logActivity(h.db, h.clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: 'device-1',
      source: 'quicklog',
      childId: CHILD_A,
      type: 'diaper',
      startAt: at,
      detail: { kind: 'WET' },
    });
    h.clock.advance(900);
    const theirs = await logActivity(other.db, h.clock, {
      householdId: HOUSEHOLD,
      createdBy: PARTNER,
      deviceId: 'device-2',
      source: 'quicklog',
      childId: CHILD_A,
      type: 'diaper',
      startAt: h.clock.iso(),
      detail: { kind: 'WET' },
      intentId: h.uuid('theirs-intent'),
      activityId: h.uuid('theirs-activity'),
    });
    expect(mine.committed).toBe(true);
    expect(theirs.committed).toBe(true);

    const mineWorker = h.worker();
    mineWorker.start();
    await mineWorker.flush('write');
    const theirsWorker = other.worker();
    theirsWorker.start();
    await theirsWorker.flush('write');

    // TWO rows. Different devices are different intents; the app never silently merges two
    // caregivers' logs, and the duplicate guard is per device because the guard is a local table.
    expect(h.server.rowCount('activities', { type: 'diaper' })).toBe(2);
    const authors = h.server.activities.map(r => r['created_by']).sort();
    expect(authors).toEqual([USER, PARTNER].sort());
  });
});

describe('@SYNC-TIMER-MERGE the losing phone adopts the winning timer', () => {
  it('keeps one running timer, started at the earlier time, and tells the loser once', async () => {
    const h = await setup('timer-merge-device');
    const other = await addDevice(h, PARTNER);

    // The partner's phone starts the nap at 10:00 and syncs.
    const earlier = h.clock.iso();
    const winnerId = h.uuid('winner-timer');
    await startTimer(other.db, h.clock, {
      householdId: HOUSEHOLD,
      createdBy: PARTNER,
      deviceId: 'device-2',
      source: 'today',
      childId: CHILD_A,
      type: 'sleep',
      startedAt: earlier,
      timerId: winnerId,
    });
    const theirs = other.worker();
    theirs.start();
    await theirs.flush('write');
    expect(h.server.rowCount('running_timers')).toBe(1);

    // This phone started the same nap four minutes later, offline.
    h.net.connected = false;
    h.clock.advance(4 * 60_000);
    const loserId = h.uuid('loser-timer');
    await startTimer(h.db, h.clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: 'device-1',
      source: 'today',
      childId: CHILD_A,
      type: 'sleep',
      startedAt: h.clock.iso(),
      timerId: loserId,
    });

    h.net.connected = true;
    const mine = h.worker();
    mine.start();
    await mine.flush('reconnect');

    // One timer on the server, started at the EARLIER time. No nap is lost and none is doubled.
    expect(h.server.rowCount('running_timers')).toBe(1);
    const server = h.server.running_timers[0];
    expect(server?.['started_at']).toBe(earlier);

    // The loser is told once, with the data the sentence needs — never with the sentence.
    const merged = h.notices.filter(n => n.kind === 'timer_merged');
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ startedAt: earlier, startedBy: PARTNER });

    // And this phone's own losing row is gone, not a second nap sitting beside the winner. D26
    // does not re-key: the loser DELETES its row inside the push transaction (`adoptServerRow`).
    // In CuddleCue the winner then arrives on the pull the same pass makes; NibbleCue pulls no
    // `running_timers` (`tables.ts`: it has no timers, and only the dev inspector starts one), so
    // the winner stays the server's and this phone holds no copy of either.
    const local = await h.db.all<{ id: string; started_at: string }>(
      'select id, started_at from running_timers',
      [],
    );
    expect(local.map(r => r.id)).not.toContain(loserId);
    expect(local).toHaveLength(0);
  });
});
