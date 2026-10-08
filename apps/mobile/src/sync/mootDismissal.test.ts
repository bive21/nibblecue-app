/**
 * A DISMISSED CARD THE SERVER NO LONGER HAS IS NOT "NOT SYNCED" (the sync sweep of 2026-09-24).
 *
 * A card can leave the server between the phone drawing it and the parent's answer arriving — it
 * was retired, or its audience changed. The server refuses the dismissal ("message not found"),
 * and the op used to retry nine times and then sit FAILED under a chip that said "Not synced",
 * for a card nobody could see any more. There is nothing to dismiss there; the answer is done.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { answerMessage } from '../data/messages';
import { HOUSEHOLD, USER, seedHousehold } from '../testing/fixtures';
import { MockSyncApi, MockSyncServer } from './providers/mock';
import { OutboxWorker } from './worker';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

const GONE = 'aaaaaaaa-0000-4000-8000-00000000d15e';

describe('answering a card the server no longer has', () => {
  it('settles as done, and nothing is left queued or failed', async () => {
    const f = await seedHousehold();
    restores.push(f.restoreIds);
    const server = new MockSyncServer({ now: () => f.clock.now() });
    server.addMember({ household_id: HOUSEHOLD, user_id: USER, role: 'OWNER' });
    const worker = new OutboxWorker(
      f.db,
      new MockSyncApi(server, USER),
      { isConnected: () => Promise.resolve(true), onReconnect: () => () => undefined },
      f.clock,
      { analytics: () => undefined as never, onState: () => undefined, rng: () => 0.5 },
    );
    worker.start();

    await answerMessage(f.db, f.clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: 'device-1',
      source: 'sheet',
      messageId: GONE,
      action: 'LATER',
    });
    await worker.flush('manual');

    const left = await f.db.all<{ state: string }>(
      `select state from outbox where entity = 'message_dismissal'`,
      [],
    );
    expect(left.map(r => r.state)).toEqual(['SYNCED']);
    // the answer stays on the phone: the card stays away here too
    const kept = await f.db.all('select message_id from app_message_dismissals', []);
    expect(kept).toHaveLength(1);
  });
});
