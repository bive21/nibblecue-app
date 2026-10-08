import { describe, expect, it } from 'vitest';
import {
  Quarantine,
  QUARANTINE_TTL_MS,
  type QuarantineDeps,
  type StoredQuarantineHeader,
} from './quarantine';

function harness(start = Date.parse('2026-09-14T12:00:00Z')) {
  let now = start;
  let file: { header: StoredQuarantineHeader; body: string } | null = null;
  let key: string | null = null;
  const deps: QuarantineDeps = {
    file: {
      read: async () => file,
      write: async (header, body) => {
        file = { header, body };
      },
      delete: async () => {
        file = null;
      },
    },
    keychain: {
      get: async () => key,
      set: async k => {
        key = k;
      },
      clear: async () => {
        key = null;
      },
    },
    cipher: {
      newKey: () => 'k-' + Math.random().toString(36).slice(2),
      encrypt: (k, plain) => `${k}:${Buffer.from(plain).toString('base64')}`,
      decrypt: (k, ct) => {
        const [used, b64] = ct.split(':');
        if (used !== k) throw new Error('wrong key');
        return Buffer.from(b64 ?? '', 'base64').toString();
      },
    },
    now: () => now,
  };
  return {
    deps,
    q: new Quarantine(deps),
    file: () => file,
    key: () => key,
    advance: (ms: number) => (now += ms),
  };
}

const dana = { id: 'u1', email: 'dana@example.test' };
const ops = [{ client_op_id: 'a' }, { client_op_id: 'b' }, { client_op_id: 'c' }];

describe('the outbox quarantine (ACCOUNTS.md §6.3)', () => {
  it('writes nothing for an empty queue', async () => {
    const h = harness();
    expect(await h.q.write(dana, [])).toBe(false);
    expect(h.file()).toBeNull();
    expect(await h.q.pending()).toBeNull();
  });

  it('keeps the ops encrypted under the signing-out user id, with only a count and address in clear', async () => {
    const h = harness();
    expect(await h.q.write(dana, ops)).toBe(true);
    const f = h.file();
    const shelf = {
      user_id: 'u1',
      email: 'dana@example.test',
      count: 3,
      written_at: '2026-09-14T12:00:00.000Z',
    };
    expect(f?.header).toEqual({ v: 2, users: [shelf] });
    expect(f?.body).not.toContain('client_op_id');
    expect(f?.body.startsWith(`${h.key()}:`)).toBe(true);
    expect(await h.q.pending()).toEqual(shelf);
  });

  it('gives the same user their ops back exactly once', async () => {
    const h = harness();
    await h.q.write(dana, ops);
    expect(await h.q.takeFor('u1')).toEqual(ops);
    expect(h.file()).toBeNull();
    expect(h.key()).toBeNull();
    expect(await h.q.takeFor('u1')).toEqual([]);
  });

  it('leaves another person’s entries exactly as they were when a different user signs in', async () => {
    // it deleted them unread until 2026-09-29: the babysitter's second account lost the first
    // family's last entries (the header of quarantine.ts)
    const h = harness();
    await h.q.write(dana, ops);
    const before = h.file();
    expect(await h.q.takeFor('u2')).toEqual([]);
    expect(h.file()).toBe(before);
    expect((await h.q.pending())?.user_id).toBe('u1');
    expect(await h.q.takeFor('u1')).toEqual(ops);
    expect(h.file()).toBeNull();
  });

  it('expires after 30 days', async () => {
    const h = harness();
    await h.q.write(dana, ops);
    h.advance(QUARANTINE_TTL_MS + 1);
    expect(await h.q.pending()).toBeNull();
    expect(h.file()).toBeNull();
  });

  it('never throws when the key is gone or the body is unreadable — the sign-in proceeds', async () => {
    const h = harness();
    await h.q.write(dana, ops);
    await h.deps.keychain.clear();
    expect(await h.q.takeFor('u1')).toEqual([]);
    expect(h.file()).toBeNull();
  });
});

/**
 * A SECOND WRITE FOR THE SAME PERSON ADDS TO THE FIRST (2026-09-25). A household can now leave the
 * phone with its person still signed in (`teardown.ts`, scope `household`), which keeps its
 * unsynced ops here and signs nobody in to take them back — so a later teardown can meet the file.
 * Replacing it there would lose the first household's entries.
 */
describe('the quarantine, written twice before anyone signs in', () => {
  const later = [{ client_op_id: 'd' }, { client_op_id: 'e' }];

  it('keeps the first household’s ops when the next teardown writes', async () => {
    const h = harness();
    await h.q.write(dana, ops);
    h.advance(3 * 24 * 60 * 60 * 1000);
    expect(await h.q.write(dana, later)).toBe(true);
    expect((await h.q.pending())?.count).toBe(5);
    expect(await h.q.takeFor('u1')).toEqual([...ops, ...later]);
  });

  it('holds one copy of an op written twice — the newer one, in the older one’s place', async () => {
    // a household teardown interrupted after step 3 and run again finds the same rows
    const h = harness();
    await h.q.write(dana, [{ client_op_id: 'a', state: 'PENDING' }, { client_op_id: 'b' }]);
    await h.q.write(dana, [{ client_op_id: 'a', state: 'FAILED' }, { client_op_id: 'c' }]);
    expect((await h.q.pending())?.count).toBe(3);
    expect(await h.q.takeFor('u1')).toEqual([
      { client_op_id: 'a', state: 'FAILED' },
      { client_op_id: 'b' },
      { client_op_id: 'c' },
    ]);
  });

  it('starts the 30 days again from the latest write, for everything it holds', async () => {
    const h = harness();
    await h.q.write(dana, ops);
    h.advance(QUARANTINE_TTL_MS - 1000);
    await h.q.write(dana, later);
    h.advance(2000); // past the first write's 30 days, well inside the second's
    expect(await h.q.takeFor('u1')).toEqual([...ops, ...later]);
  });

  it('keeps somebody else’s shelf beside the new one, and replaces an expired or unreadable file', async () => {
    const mia = { id: 'u2', email: 'mia@example.test' };
    const other = harness();
    await other.q.write(mia, ops);
    await other.q.write(dana, later);
    expect(await other.q.takeFor('u1')).toEqual(later);
    expect(await other.q.takeFor('u2')).toEqual(ops);
    expect(other.file()).toBeNull();

    const expired = harness();
    await expired.q.write(dana, ops);
    expired.advance(QUARANTINE_TTL_MS + 1);
    await expired.q.write(dana, later);
    expect(await expired.q.takeFor('u1')).toEqual(later);

    const unreadable = harness();
    await unreadable.q.write(dana, ops);
    await unreadable.deps.keychain.clear();
    await unreadable.q.write(dana, later);
    expect(await unreadable.q.takeFor('u1')).toEqual(later);
  });

  it('an empty write still writes nothing, and leaves the first file exactly as it was', async () => {
    const h = harness();
    await h.q.write(dana, ops);
    const before = h.file();
    expect(await h.q.write(dana, [])).toBe(false);
    expect(h.file()).toBe(before);
  });
});

/**
 * ONE SHELF PER PERSON (2026-09-29). A babysitter who helps two families keeps one account for
 * each (docs/ACCOUNTS.md §7.4) and signs out of one to sign in to the other. The first family's
 * last entries, still queued when the shift ended out of signal, used to be deleted the moment
 * the second account signed in (rule 7, the quiet way). Now each person's ops wait for that person.
 */
describe('the quarantine, with two people on one phone', () => {
  const mia = { id: 'u2', email: 'mia@example.test' };
  const hers = [{ client_op_id: 'm1' }, { client_op_id: 'm2' }];
  const DAY = 24 * 60 * 60 * 1000;

  it('keeps the first account’s entries through the second account’s whole visit', async () => {
    const h = harness();
    // family A's account signs out with three entries queued
    await h.q.write(dana, ops);
    // family B's account signs in: nothing of theirs, and nothing of A's touched
    expect(await h.q.takeFor('u2')).toEqual([]);
    // and signs out with two of its own queued
    h.advance(DAY);
    await h.q.write(mia, hers);
    // the AUTH screen names the one who left most recently
    expect(await h.q.pending()).toMatchObject({ user_id: 'u2', count: 2 });
    // each account, signing in again, gets back its own and nothing else
    expect(await h.q.takeFor('u1')).toEqual(ops);
    expect(await h.q.pending()).toMatchObject({ user_id: 'u2', count: 2 });
    expect(await h.q.takeFor('u2')).toEqual(hers);
    expect(h.file()).toBeNull();
    expect(h.key()).toBeNull();
  });

  it('gives each shelf its own 30 days', async () => {
    const h = harness();
    await h.q.write(dana, ops);
    h.advance(20 * DAY);
    await h.q.write(mia, hers);
    h.advance(15 * DAY); // A's shelf is 35 days old, B's 15
    expect(await h.q.pending()).toMatchObject({ user_id: 'u2' });
    expect(await h.q.takeFor('u1')).toEqual([]);
    expect(await h.q.takeFor('u2')).toEqual(hers);
  });

  it('reads a file an earlier version wrote (one person’s header, the body one array)', async () => {
    const h = harness();
    const key = 'k-old';
    await h.deps.keychain.set(key);
    await h.deps.file.write(
      {
        user_id: 'u1',
        email: 'dana@example.test',
        count: 3,
        written_at: '2026-09-14T12:00:00.000Z',
      },
      h.deps.cipher.encrypt(key, JSON.stringify(ops)),
    );
    expect(await h.q.pending()).toMatchObject({ user_id: 'u1', count: 3 });
    // another account's sign-out adds its shelf beside the old one rather than replacing it
    await h.q.write(mia, hers);
    expect(await h.q.takeFor('u1')).toEqual(ops);
    expect(await h.q.takeFor('u2')).toEqual(hers);
  });
});
