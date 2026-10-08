/**
 * AN ENTRY THE OTHER PARENT LOGGED REACHES THIS PHONE'S OPEN SCREENS (the launch sweep,
 * 2026-09-27). The pull has always worked out the keys of everything it writes
 * (`apply.ts` `invalidationKeys`), and `PullEngine` bumps them when it is handed the store. But
 * `SyncProvider` never handed the engine the store, so a feed logged on Dana's phone landed in
 * Sam's database and Sam's Today, Log and Reports went on showing the old numbers until Sam wrote
 * something or the page was opened again: the household "on the same page" was not, on screen.
 *
 * It was left unwired while every idle pass still rewrote unchanged rows, which would have
 * woken every screen twice a minute; since the idle pass writes nothing (`writePage`, the same
 * sweep), a bump means something really arrived.
 */
import type { Net } from '@nibblecue/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { keys, store } from '../data/store';
import { CHILD_A, HOUSEHOLD, USER, seedHousehold } from '../testing/fixtures';
import { PARTNER } from './harness';
import { SyncEngine } from './index';
import { MockSyncApi, MockSyncServer } from './providers/mock';

const here = dirname(fileURLToPath(import.meta.url));

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

describe('a pull wakes the screens that show what it brought', () => {
  it('bumps the baby’s Today and Log keys when the other parent’s entry arrives, and not when nothing did', async () => {
    const f = await seedHousehold();
    cleanups.push(f.restoreIds);
    let tick = 0;
    const server = new MockSyncServer({ now: () => f.clock.now() + ++tick });
    server.addMember({ household_id: HOUSEHOLD, user_id: USER, role: 'OWNER' });
    server.addMember({ household_id: HOUSEHOLD, user_id: PARTNER, role: 'PARENT' });
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
      appState: { current: () => 'background', addListener: () => () => undefined },
      scheduler: { every: () => 1, cancel: () => undefined },
      store,
    });
    engine.start();
    cleanups.push(() => engine.stop());
    await engine.bootstrap();

    const heard: string[] = [];
    cleanups.push(store.subscribe(keys.todayTotals(CHILD_A), () => heard.push('today')));
    cleanups.push(store.subscribe(keys.timeline(CHILD_A, 'all'), () => heard.push('log')));

    // a pass with nothing new wakes nothing
    await engine.pullNow('foreground');
    expect(heard).toEqual([]);

    // Dana logs a diaper on her phone; Sam's phone pulls it
    server.insertAsOtherDevice('activities', {
      id: 'eeeeeeee-0000-4000-8000-00000000d1a0',
      client_op_id: 'eeeeeeee-0000-4000-8000-00000000d1a1',
      household_id: HOUSEHOLD,
      child_id: CHILD_A,
      type: 'diaper',
      start_at: f.clock.iso(),
      end_at: null,
      created_by: PARTNER,
      is_private: false,
      deleted_at: null,
      metadata: {},
    });
    await engine.pullNow('foreground');
    expect(heard).toContain('today');
    expect(heard).toContain('log');
  });

  it('SyncProvider hands the engine the store', () => {
    const provider = readFileSync(join(here, 'SyncProvider.tsx'), 'utf8').replace(/\s+/g, ' ');
    const deps = provider.slice(provider.indexOf('new SyncEngine({'));
    expect(deps.slice(0, deps.indexOf('onState'))).toMatch(/\bstore,/);
  });
});
