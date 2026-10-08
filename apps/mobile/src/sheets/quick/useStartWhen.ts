/**
 * A TIMER SHEET'S START ROW, HELD: which chip is chosen, the instant it came to, a time the wheel
 * gave that could not be a start, and where each baby's last entry of the kind ended. The rules are
 * `startWhen.ts`'s; `StartedRow.tsx` draws them; the sheet writes `startFor` at its Start.
 *
 * THE CLOCK WHEEL IS THE SHEET'S OWN (`useTimePicker`, handed in as `pickTime`): on iOS the picker
 * is a component, and a Modal can only rise over the sheet it is mounted inside, so each sheet
 * mounts its own `picker.element` and this hook only asks it for a time.
 *
 * THE LAST ENDS ARE READ ONCE, WHEN THE ROW CAN SHOW (`enabled`), one narrow query per baby
 * (`lastEndAt`): a start held at one is said before the tap, so the read has to have landed by
 * then, and a sheet that only ever shows a running timer's panel never makes it.
 */
import type { TimerType } from '@nibblecue/core';
import { applyCustom, wallClockOf, type WallClock } from '@nibblecue/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { openLocalDb } from '../../db';
import { lastEndAt } from '../../db/queries/details';
import { useModuleLabels } from '../../modules/useModuleLabels';
import { startWordsFor, type StartWords } from './copy';
import {
  EARLIER_OPENS_BACK_MS,
  earlierPick,
  isOffset,
  offsetPick,
  startAtTap,
  startLimitMs,
  type StartChoice,
  type StartPick,
} from './startWhen';

export interface StartWhen {
  /** The start chosen, or null for "Now". */
  pick: StartPick | null;
  choice: StartChoice;
  /** The limit a time from the wheel went past, in ms; null when nothing was refused. */
  refusedLimitMs: number | null;
  /**
   * Choose a chip. True once the start is what was asked for — at once for "Now" and the two
   * offsets, and for "Custom" when the wheel gave a time the kind can take.
   */
  choose: (choice: StartChoice) => Promise<boolean>;
  /** Back to "Now", with nothing refused. */
  reset: () => void;
  /** Where this baby's (or the household's, for a pump) last entry of the kind ended. */
  lastEndOf: (childId: string | null) => number | null;
  /** The start one baby's timer is written with, at the tap on Start (`startAtTap`). */
  startFor: (childId: string | null, tapMs: number) => number;
}

const keyOf = (childId: string | null): string => childId ?? '';

/**
 * WHERE EACH BABY'S LAST ENTRY OF THE KIND ENDED — or the household's, for a pump (`[null]`) — read
 * once per sheet while `enabled` (see the header), for the start row and for a young timer's sheet.
 */
export function useLastEnds({
  type,
  householdId,
  childIds,
  enabled,
}: {
  type: TimerType;
  householdId: string | null;
  childIds: readonly (string | null)[];
  enabled: boolean;
}): (childId: string | null) => number | null {
  const [lastEnds, setLastEnds] = useState<ReadonlyMap<string, number | null>>(() => new Map());
  // one string for the babies, so a new array of the same ids each render reads nothing again
  const ids = childIds.map(keyOf).join('|');
  useEffect(() => {
    if (!enabled || householdId === null) return undefined;
    let live = true;
    const wanted = ids.split('|').map(k => (k === '' ? null : k));
    // sleep has no earlier-start limit, so the last sleep is read however far back it ended
    const limit = startLimitMs(type);
    const since = limit === null ? 0 : Date.now() - limit;
    void openLocalDb()
      .then(db =>
        Promise.all(wanted.map(childId => lastEndAt(db, { householdId, childId }, type, since))),
      )
      .then(ends => {
        if (live) setLastEnds(new Map(wanted.map((id, i) => [keyOf(id), ends[i] ?? null])));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [enabled, householdId, type, ids]);
  return useCallback((childId: string | null) => lastEnds.get(keyOf(childId)) ?? null, [lastEnds]);
}

/** The timer's own words in the start row, tummy time's in the household's word (`startWordsFor`). */
export function useStartWords(type: TimerType): StartWords {
  const labels = useModuleLabels();
  return useMemo(
    () => startWordsFor(type, { label: labels.label('tummy'), word: labels.word('tummy') }),
    [type, labels],
  );
}

export function useStartWhen({
  type,
  householdId,
  childIds,
  timeZone,
  pickTime,
  enabled,
}: {
  type: TimerType;
  householdId: string | null;
  childIds: readonly (string | null)[];
  timeZone: string;
  pickTime: (current: WallClock) => Promise<WallClock | null>;
  /** Whether a start row can show at all: false while the sheet shows a running timer or an edit. */
  enabled: boolean;
}): StartWhen {
  const [pick, setPick] = useState<StartPick | null>(null);
  // Start reads the pick the chips last chose, even if its onPress closed over an older render
  // (the same race the iPhone's Done had on the wheel — `timePickerClock.ts`)
  const pickRef = useRef<StartPick | null>(null);
  const [refusedLimitMs, setRefused] = useState<number | null>(null);
  const lastEndOf = useLastEnds({ type, householdId, childIds, enabled });

  const hold = useCallback((next: StartPick | null) => {
    pickRef.current = next;
    setPick(next);
  }, []);

  const choose = useCallback(
    async (choice: StartChoice): Promise<boolean> => {
      setRefused(null);
      if (choice === 'now') {
        hold(null);
        return true;
      }
      if (isOffset(choice)) {
        hold(offsetPick(choice, Date.now()));
        return true;
      }
      // the wheel opens on the start already chosen, or a quarter of an hour back (`startWhen.ts`)
      const opening = pickRef.current?.atMs ?? Date.now() - EARLIER_OPENS_BACK_MS;
      const wall = await pickTime(wallClockOf(opening, timeZone));
      // dismissed: whatever was chosen before stays chosen
      if (wall === null) return false;
      // placed against the moment it was picked: a time later than now is last night (`applyCustom`)
      const now = Date.now();
      const verdict = earlierPick(type, applyCustom(wall, now, timeZone), now);
      if (!verdict.ok) {
        setRefused(verdict.limitMs);
        return false;
      }
      hold(verdict.pick);
      return true;
    },
    [hold, pickTime, timeZone, type],
  );

  const reset = useCallback(() => {
    hold(null);
    setRefused(null);
  }, [hold]);

  const startFor = useCallback(
    (childId: string | null, tapMs: number) =>
      startAtTap(pickRef.current, tapMs, lastEndOf(childId)),
    [lastEndOf],
  );

  return {
    pick,
    choice: pick?.choice ?? 'now',
    refusedLimitMs,
    choose,
    reset,
    lastEndOf,
    startFor,
  };
}
