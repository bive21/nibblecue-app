/**
 * THE DEV BUILD'S FAKE KNOWS THE BABY (the owner, 2026-09-24, in Expo Go: "it says not sync or
 * sync pending a lot. is this normal?").
 *
 * The sync sweep of that day found the loudest cause: `createSyncProviders` told the fake who the
 * member was, the default locations and the vaccine schedule — and never the children, which
 * live in the AUTH mock. Every op the server checks a child for was refused, so every vaccine
 * record went straight to FAILED ("Not synced") and every later edit of it retried for minutes as
 * "N queued". These hold the fix against the real fake and the real worker: the control proves the
 * refusal was real, the rest that seeding ends it — at launch and for a child added later.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { recordDose } from '../../data/vaccines';
import { CHILD_A, CHILD_B, HOUSEHOLD, USER, seedHousehold } from '../../testing/fixtures';
import { OutboxWorker } from '../worker';
import { MockSyncApi, MockSyncServer } from './mock';
import { ensureMockChildren, ensureMockMembership, type MockChildSeed } from './mockSeed';

const here = dirname(fileURLToPath(import.meta.url));
const flat = (s: string) => s.replace(/\s+/g, ' ');

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

const ctx = {
  householdId: HOUSEHOLD,
  createdBy: USER,
  deviceId: 'device-1',
  source: 'sheet' as const,
};
const child = (id: string, household = HOUSEHOLD): MockChildSeed => ({
  id,
  household_id: household,
  name: id === CHILD_A ? 'Ada' : 'Ben',
  birth_date: '2026-03-01',
  due_date: null,
});

/** A phone and the fake, seeded the way `createSyncProviders` seeds it — children optional. */
async function device(children: readonly MockChildSeed[] | null) {
  const f = await seedHousehold();
  restores.push(f.restoreIds);
  let tick = 0;
  const server = new MockSyncServer({ now: () => f.clock.now() + ++tick });
  ensureMockMembership(server, HOUSEHOLD, USER);
  server.seedDefaultLocations(HOUSEHOLD);
  server.seedVaccineProfile();
  if (children !== null) ensureMockChildren(server, HOUSEHOLD, children);
  const worker = new OutboxWorker(
    f.db,
    new MockSyncApi(server, USER),
    { isConnected: () => Promise.resolve(true), onReconnect: () => () => undefined },
    f.clock,
    { analytics: () => undefined as never, onState: () => undefined, rng: () => 0.5 },
  );
  worker.start();
  return { ...f, server, worker };
}

const unsent = (d: Awaited<ReturnType<typeof device>>) =>
  d.db.all<{ entity: string; state: string; last_error: string | null }>(
    `select entity, state, last_error from outbox where state != 'SYNCED' order by seq`,
    [],
  );

const giveHepB = (d: Awaited<ReturnType<typeof device>>, childId: string) =>
  recordDose(d.db, d.clock, {
    ...ctx,
    childId,
    doseId: 'hepb_1',
    status: 'GIVEN',
    occurredOn: '2026-06-02',
  });

describe('a vaccine record in the dev build', () => {
  it('CONTROL — without the children, the fake refuses it and the chip says "Not synced"', async () => {
    const d = await device(null);
    await giveHepB(d, CHILD_A);
    await d.worker.flush('manual');
    const left = await unsent(d);
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ entity: 'vaccine_record', state: 'FAILED' });
    expect(left[0]?.last_error ?? '').toMatch(/child/i);
  });

  it('with the children seeded as the app now does, it syncs on the first pass', async () => {
    const d = await device([child(CHILD_A), child(CHILD_B)]);
    await giveHepB(d, CHILD_A);
    await giveHepB(d, CHILD_B);
    await d.worker.flush('manual');
    expect(await unsent(d)).toEqual([]);
    expect(d.server.rowCount('vaccine_records', { child_id: CHILD_A })).toBe(1);
    expect(d.server.rowCount('vaccine_records', { child_id: CHILD_B })).toBe(1);
  });

  it('a child added after launch is taught to the fake before its first record', async () => {
    const d = await device([child(CHILD_A)]);
    // "Add a child": the account grows, and SyncProvider's effect hands the fake the new list
    expect(ensureMockChildren(d.server, HOUSEHOLD, [child(CHILD_A), child(CHILD_B)])).toBe(1);
    await giveHepB(d, CHILD_B);
    await d.worker.flush('manual');
    expect(await unsent(d)).toEqual([]);
  });
});

describe('ensureMockMembership — in the account’s own role (M6’s dev-build half)', () => {
  it('seeds the role the account holds, and corrects it when the account’s role changes', () => {
    const server = new MockSyncServer();
    ensureMockMembership(server, HOUSEHOLD, USER, 'CAREGIVER');
    expect(server.rowCount('household_members', { user_id: USER, role: 'CAREGIVER' })).toBe(1);
    // made a parent on the Family page: the same row, the new role — never a second member
    ensureMockMembership(server, HOUSEHOLD, USER, 'PARENT');
    expect(server.rowCount('household_members', { user_id: USER })).toBe(1);
    expect(server.rowCount('household_members', { user_id: USER, role: 'PARENT' })).toBe(1);
    expect(server.setMemberRole(HOUSEHOLD, USER, 'PARENT')).toBe(false);
  });

  it('is told the role when the providers are built and whenever it changes', () => {
    const index = flat(readFileSync(join(here, 'index.ts'), 'utf8'));
    expect(index).toContain(
      "ensureMockMembership(server, deps.householdId, deps.userId, deps.role ?? 'OWNER');",
    );
    const provider = flat(readFileSync(join(here, '..', 'SyncProvider.tsx'), 'utf8'));
    expect(provider).toContain('role: accountRole.current');
    expect(provider).toContain('if (mock.setMemberRole(householdId, userId, role))');
  });
});

describe('ensureMockChildren', () => {
  it('only ever adds, once per child, and never a child of another household', async () => {
    const server = new MockSyncServer();
    const other = 'aaaaaaaa-0000-4000-8000-0000000000ff';
    expect(ensureMockChildren(server, HOUSEHOLD, [child(CHILD_A), child(CHILD_B, other)])).toBe(1);
    expect(ensureMockChildren(server, HOUSEHOLD, [child(CHILD_A)])).toBe(0);
    expect(server.rowCount('children', { id: CHILD_A })).toBe(1);
    expect(server.rowCount('children', { id: CHILD_B })).toBe(0);
  });

  it('is called when the providers are built and whenever the account’s children change', () => {
    const index = flat(readFileSync(join(here, 'index.ts'), 'utf8'));
    expect(index).toContain('ensureMockChildren(server, deps.householdId, deps.children ?? []);');
    const provider = flat(readFileSync(join(here, '..', 'SyncProvider.tsx'), 'utf8'));
    expect(provider).toContain('children: accountChildren.current,');
    expect(provider).toContain('mockServer.current = providers.mock;');
    expect(provider).toContain(
      'if (ensureMockChildren(mock, householdId, accountChildren.current) > 0)',
    );
    expect(provider).toContain('}, [childKey, householdId]);');
  });
});
