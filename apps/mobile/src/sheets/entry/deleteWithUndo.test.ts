/**
 * THE ONE DELETE (2026-09-29): the entry sheet's Delete, the Activity log's long press and the
 * Delete behind a swiped row of Today's log and of the Activity log all write through
 * `deleteWithUndo`. Two halves, the way this app tests what a screen does:
 *
 *  - the delete itself, run end to end in node against a real database: the soft delete and its
 *    op, the toast and its Undo bringing the entry back, the refusal of somebody else's entry
 *    before anything is written, and the screen's three steps heard in their order;
 *  - that every screen really goes through it, read off the source (this suite has no renderer):
 *    no screen writes a delete of its own, so the swipe's Delete cannot drift from the sheet's.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { logActivity } from '../../data/activities';
import type { Db } from '../../db/driver';
import { failedPermission } from '../../sync/copy';
import { CHILD_A, HOUSEHOLD, liveActivities, seedHousehold, USER } from '../../testing/fixtures';
import type { SheetWriteContext } from '../quick/useWriteContext';
import { deleteWithUndo, type DeleteHands } from './deleteWithUndo';
import { ENTRY_DELETED, ENTRY_RESTORED } from './editor';

const MIA = 'bbbbbbbb-0000-4000-8000-0000000000c2';
const TAP = '2026-09-14T03:12:00.000Z';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

async function fixture() {
  const f = await seedHousehold();
  restores.push(f.restoreIds);
  return f;
}

const ctx = { householdId: HOUSEHOLD, createdBy: USER, deviceId: null, source: 'sheet' as const };
/** The write context a screen hands the delete, for whoever is signed in. */
const writer = (db: Db, createdBy = USER): SheetWriteContext => ({ db, ...ctx, createdBy });

interface Said {
  message: string;
  undo?: () => void;
}

/** The app's hands, recorded: the context the screen would have, and every toast it would show. */
function hands(context: SheetWriteContext | null, clock: DeleteHands['clock']) {
  const said: Said[] = [];
  const h: DeleteHands = {
    context: () => Promise.resolve(context),
    show: (message, options) =>
      said.push({ message, ...(options?.undo ? { undo: options.undo } : {}) }),
    ...(clock ? { clock } : {}),
  };
  return { h, said };
}

async function aDiaper(db: Db, clock: NonNullable<DeleteHands['clock']>) {
  const out = await logActivity(db, clock, {
    ...ctx,
    childId: CHILD_A,
    type: 'diaper',
    startAt: TAP,
    detail: { kind: 'WET' },
  });
  return out.entityIds[0] ?? '';
}

const tombstone = async (db: Db, id: string): Promise<string | null> =>
  (
    await db.get<{ deleted_at: string | null }>('select deleted_at from activities where id = ?', [
      id,
    ])
  )?.deleted_at ?? null;
const deletes = async (db: Db): Promise<number> =>
  (
    await db.all<{ op: string }>(
      "select op from outbox where entity = 'activity' and op = 'DELETE'",
      [],
    )
  ).length;

/** Lets every promise already under way settle: the Undo's restore and the toast after it. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('the one delete, end to end', () => {
  it('deletes softly, says so with an Undo, and the Undo brings the entry back and says that', async () => {
    const { db, clock } = await fixture();
    const id = await aDiaper(db, clock);
    const { h, said } = hands(writer(db), clock);
    const steps: string[] = [];

    const done = await deleteWithUndo(
      h,
      { activityId: id, childId: CHILD_A, type: 'diaper' },
      {
        before: () => steps.push('before'),
        notWritten: () => steps.push('notWritten'),
        written: () => steps.push('written'),
      },
    );

    expect(done).toBe(true);
    expect(steps).toEqual(['before', 'written']);
    // soft: the row stays with its tombstone, and one DELETE op is queued (rule 7)
    expect(await tombstone(db, id)).toBe(clock.iso());
    expect(await liveActivities(db)).toBe(0);
    expect(await deletes(db)).toBe(1);
    // the sheet's own sentence, with the 5.2 s Undo
    expect(said.map(s => s.message)).toEqual([ENTRY_DELETED]);
    expect(said[0]?.undo).toBeTypeOf('function');

    said[0]?.undo?.();
    await settle();
    await settle();
    expect(await tombstone(db, id)).toBeNull();
    expect(await liveActivities(db)).toBe(1);
    expect(said.map(s => s.message)).toEqual([ENTRY_DELETED, ENTRY_RESTORED]);
  });

  it('refuses somebody else’s entry for a caregiver BEFORE anything is written, in the app’s sentence', async () => {
    const { db, clock } = await fixture();
    const at = clock.iso();
    for (const [user, role] of [
      [USER, 'OWNER'],
      [MIA, 'CAREGIVER'],
    ] as const)
      await db.run(
        `insert into household_members (household_id, user_id, role, joined_at, removed_at, updated_at)
         values (?, ?, ?, ?, ?, ?)`,
        [HOUSEHOLD, user, role, at, null, at],
      );
    // Dana (the owner) logged it; Mia, a caregiver, asks to delete it
    const id = await aDiaper(db, clock);
    const { h, said } = hands(writer(db, MIA), clock);
    const steps: string[] = [];

    const done = await deleteWithUndo(
      h,
      { activityId: id, childId: CHILD_A, type: 'diaper' },
      {
        before: () => steps.push('before'),
        notWritten: () => steps.push('notWritten'),
        written: () => steps.push('written'),
      },
    );

    expect(done).toBe(false);
    // the Log kept the row for its paper, and lets it be the row again
    expect(steps).toEqual(['before', 'notWritten']);
    expect(await tombstone(db, id)).toBeNull();
    expect(await deletes(db)).toBe(0);
    expect(said).toEqual([{ message: failedPermission }]);
  });

  it('does nothing at all without a signed-in context', async () => {
    const { db, clock } = await fixture();
    const id = await aDiaper(db, clock);
    const { h, said } = hands(null, clock);
    const steps: string[] = [];
    const done = await deleteWithUndo(
      h,
      { activityId: id, childId: CHILD_A, type: 'diaper' },
      { before: () => steps.push('before') },
    );
    expect(done).toBe(false);
    expect(steps).toEqual([]);
    expect(said).toEqual([]);
    expect(await tombstone(db, id)).toBeNull();
  });
});

/* ---------------------------------------------------------------- every screen goes through it */

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = join(here, '..', '..');
/** A file's source with its comments taken out, flattened to one line. */
const code = (...p: string[]): string =>
  readFileSync(join(appSrc, ...p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('the swipe’s Delete is the sheet’s Delete', () => {
  it('writes a delete in one place: no screen, sheet or hook calls the data layer’s delete itself', () => {
    const callers = sources(appSrc)
      .filter(f => !f.includes(`${join('src', 'testing')}`))
      .filter(f => /\b(deleteEntry|restoreEntry)\(/.test(code(relative(appSrc, f))))
      .map(f => relative(appSrc, f).split('\\').join('/'))
      .sort();
    // the data layer that defines them, and the one delete that calls them
    expect(callers).toEqual(['data/entries.ts', 'sheets/entry/deleteWithUndo.ts']);
  });

  it('is reached through the one hook by the sheet', () => {
    const hook = code('sheets', 'entry', 'useDeleteEntry.ts');
    expect(hook).toContain(
      'deleteWithUndo({ context, show: (m, o) => toast.show(m, o) }, entry, steps)',
    );
    // (CuddleCue's Activity log and Today rows also swipe to delete; NibbleCue has neither page)
    for (const f of [['sheets', 'quick', 'edit', 'EditEntrySheet.tsx']])
      expect(code(...f), f.join('/')).toContain('const deleteOne = useDeleteEntry();');
  });

  it('the sheet deletes with it too, and closes only once the delete has landed', () => {
    const sheet = code('sheets', 'quick', 'edit', 'EditEntrySheet.tsx');
    expect(sheet).toContain('await deleteOne(');
    expect(sheet).toContain('written: () => { entryDeleted(record.activity.id); onClose(); },');
  });
});
