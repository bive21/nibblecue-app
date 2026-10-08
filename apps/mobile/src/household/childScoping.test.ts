/**
 * THE CHILD-SCOPING TRIPWIRES (the owner, 2026-09-22: *"i just foudn a bug when breastfeeding for
 * second child, it is not shown on the home page, and not updated on the main quick log … im sure
 * there are many bugs like this"*).
 *
 * They were right, and every one of them was the same mistake in a different file. The SQL is
 * correct and `db/queries/today.test.ts` already proves it against twins; the bugs were all in the
 * React layer, in two shapes:
 *
 *  1. A `useLocalQuery` whose loader closes over `childId` while the watch key does not name it.
 *     `useLocalQuery` captures its loader at the last key change on purpose, so a child that is
 *     not in the key is FROZEN — and because `ChildContext` hydrates the remembered child from
 *     AsyncStorage asynchronously, it freezes at `children[0]`. That is the reported bug exactly:
 *     the second twin's running timer was filtered out of a list scoped to the first.
 *  2. A surface scoped by the child CHIP that must not be: the local-notification plan, which is
 *     reconciled by cancelling everything it does not name, so a chip-scoped plan silently
 *     cancelled the other twin's reminders.
 *
 * Neither shape can be caught by a unit test of the pure code, and there is no hook harness in
 * this repo, so this is a source scan — the same shape `first-run/ground-usage.test.ts` and
 * `onboarding/pending-setup.test.ts` use. It is a tripwire, not a proof: it fails when someone
 * reintroduces one of these three fixes' inverse, which is what regressions here look like.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { childScopedTimers, oneChildInView } from './childScope';
import type { TimerNow } from '../db/queries/today';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const flat = (rel: string) => stripComments(read(rel)).replace(/\s+/g, ' ');

const timer = (id: string, childId: string | null, type: TimerNow['type']): TimerNow => ({
  id,
  type,
  childId,
  startedAtMs: 0,
  pausedMs: 0,
  activeSide: null,
  sideStartedAtMs: null,
  leftSeconds: 0,
  rightSeconds: 0,
  startedBy: 'u1',
  meta: {},
});

describe('the running timers a view may see', () => {
  const rows = [
    timer('a', 'emma', 'breastfeed'),
    timer('b', 'liam', 'breastfeed'),
    timer('c', null, 'pump'),
  ];

  it('is that child’s and the household’s, never the other twin’s', () => {
    expect(childScopedTimers(rows, 'liam').map(r => r.id)).toEqual(['b', 'c']);
    expect(childScopedTimers(rows, 'emma').map(r => r.id)).toEqual(['a', 'c']);
  });

  it('is everything in the both view, which is what `null` has always meant here', () => {
    expect(childScopedTimers(rows, null)).toEqual(rows);
  });

  it('reads the household and narrows in memory, so the child can never be captured stale', () => {
    const src = flat('../sheets/quick/useRunningTimers.ts');
    // `null`, i.e. the whole household, is what goes into the query — the child is applied after
    expect(src).toContain('timersNow(db, householdId, null)');
    expect(src).toContain('useMemo(() => childScopedTimers(all, childId), [all, childId])');
    // and nothing here passes a child into the read behind a key that does not carry one
    expect(src).not.toMatch(/timersNow\(db, householdId, childId\)/);
  });
});

describe('the widgets draw one baby, whatever the chip says (the pre-launch sweep, 2026-09-27)', () => {
  const emma = { id: 'emma', name: 'Emma' };
  const liam = { id: 'liam', name: 'Liam' };
  const children = [emma, liam];

  it('on Both, the first baby — the one the widget names — alone', () => {
    // it used to read Both under Emma's name: Liam's bottle as her last feed, his nap as hers
    expect(
      oneChildInView({ children, selectedId: 'both', child: null, isAll: true, chipName: 'Both' }),
    ).toEqual({ children, selectedId: 'emma', child: emma, isAll: false, chipName: 'Both' });
  });

  it('the baby in view, and a household with no child, as they are', () => {
    const onLiam = { children, selectedId: 'liam', child: liam, isAll: false };
    expect(oneChildInView(onLiam)).toBe(onLiam);
    const none = { children: [], selectedId: null, child: null, isAll: false };
    expect(oneChildInView(none)).toBe(none);
  });
  // (no widget publisher in NibbleCue to mount under it)
});

/*
  CuddleCue's other surfaces here (the notification plan, the stash's Enough for, a widget or
  notification Stop, the celebration card, "From your log", the rhythm preview) are not in
  NibbleCue. NibbleCue's own read is held to the same rule instead: its loader reads the whole
  household and the baby is picked in memory, so a chip change can never meet a stale capture.
*/
describe('NibbleCue’s records and meals are read for the household, never a captured child', () => {
  it('reads by household under household keys, with no child in the loader', () => {
    const src = flat('../nibble/useNibble.ts');
    const raw = src.slice(src.indexOf('export function useNibbleRaw()'));
    const loader = raw.slice(0, raw.indexOf('EMPTY, );'));
    expect(loader).toContain('nibbleRecords(db, householdId)');
    expect(loader).toContain('solidsMeals(db, householdId)');
    expect(loader).toContain('healthNotes(db, householdId)');
    expect(loader).not.toMatch(/childId/);
    expect(loader).toContain("keys.timeline(null, 'all')");
  });
});
