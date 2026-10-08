/**
 * EVERY LOCAL WRITE STARTS A SYNC (the owner, 2026-09-24, in Expo Go: "it says not sync or sync
 * pending a lot. is this normal? is this just a bug in expo go, or the app once launched will
 * have these problems as well?").
 *
 * It was a bug, and not Expo Go's. `SyncEngine.afterCommit` was the write trigger on paper and
 * nothing handed it to a write: every sheet calls `logActivity(db, clock, …)` with no deps, so an
 * entry sat "1 queued" until the next 60-second tick. `SyncProvider` now listens to the one key
 * every local write bumps after its commit (`keys.outbox()`) and nudges the engine from it. These
 * hold that in node — the provider itself is React Native and is read as source.
 */
import type { Net } from '@nibblecue/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { logActivity } from '../data/activities';
import { keys, store } from '../data/store';
import { CHILD_A, HOUSEHOLD, USER, seedHousehold } from '../testing/fixtures';
import { SyncEngine } from './index';
import { MockSyncApi, MockSyncServer } from './providers/mock';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const settle = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

describe('a write reaches the server without waiting for the tick', () => {
  it('sends an entry logged with no deps at all, the way every sheet logs one', async () => {
    const f = await seedHousehold();
    cleanups.push(f.restoreIds);
    let tick = 0;
    const server = new MockSyncServer({ now: () => f.clock.now() + ++tick });
    server.addMember({ household_id: HOUSEHOLD, user_id: USER, role: 'OWNER' });
    const net: Net = {
      isConnected: () => Promise.resolve(true),
      onReconnect: () => () => undefined,
    };
    const engine = new SyncEngine({
      db: f.db,
      api: new MockSyncApi(server, USER),
      net,
      clock: f.clock,
      householdId: HOUSEHOLD,
      userId: USER,
      analytics: () => undefined as never,
      // backgrounded, with a scheduler that never fires: no foreground flush, no tick — the
      // only thing that can send the entry is the write itself
      appState: { current: () => 'background', addListener: () => () => undefined },
      scheduler: { every: () => 1, cancel: () => undefined },
    });
    engine.start();
    cleanups.push(() => engine.stop());
    // exactly what SyncProvider does once the engine has started
    const off = store.subscribe(keys.outbox(), () => engine.afterCommit());
    cleanups.push(off);

    const out = await logActivity(f.db, f.clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: 'device-1',
      source: 'sheet',
      childId: CHILD_A,
      type: 'diaper',
      startAt: f.clock.iso(),
      detail: { kind: 'WET' },
    });
    expect(out.committed).toBe(true);
    for (let i = 0; i < 20 && server.rowCount('activities') === 0; i++) await settle();
    expect(server.rowCount('activities')).toBe(1);
    const row = await f.db.get<{ state: string }>(
      'select state from outbox where client_op_id = ?',
      [out.opIds[0] ?? ''],
    );
    expect(row?.state).toBe('SYNCED');
  });
});

describe('the wiring', () => {
  it('SyncProvider nudges the engine from the outbox key, and stops on teardown', () => {
    const provider = read('SyncProvider.tsx').replace(/\s+/g, ' ');
    expect(provider).toContain(
      'offWrites = store.subscribe(keys.outbox(), () => e.afterCommit());',
    );
    // unsubscribed both when the provider unmounts and when sign-out freezes the triggers
    expect(provider.match(/offWrites\?\.\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('nothing in sync bumps the outbox key, so a nudge can never feed a nudge', () => {
    for (const file of ['worker.ts', 'pull.ts', 'index.ts', 'apply.ts', 'triggers.ts']) {
      const code = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');
      expect(code, file).not.toMatch(/invalidate\([^)]*keys\.outbox\(\)/);
    }
  });
});
