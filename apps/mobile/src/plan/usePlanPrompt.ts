/**
 * WHEN THE TRIAL-END SHEET RISES — Today's half of `PlanPromptSheet` (docs/AUTH_AND_TRIAL.md §3).
 *
 * Which sheet is owed is the plan's to say (`usePlan().prompt`, core's `welcomePrompt`); WHEN it
 * may rise is core's `promptMayShow`, and this hook's only job is to hand it the facts honestly:
 *
 *   · A SAVE BY THIS PARENT. Every activity write bumps the household's key (`data/store.ts`
 *     `activityKeys`), so the count of this parent's own entries is re-read the moment one is
 *     saved; a count that went UP since Today last read it is a save made on this phone. The first
 *     read only sets the baseline, so opening the app is never mistaken for a save, and another
 *     parent's entries arriving by sync are someone else's.
 *   · BUSY, read broadly as `useGrowthPrompt` reads it: a timer running anywhere in the household,
 *     any sheet or popover up, the tour on, Today not in front or the app not open.
 *   · THE HOUR, on the phone's own clock, and whether Night is on.
 *
 * The check runs when `afterSaveMs` has passed since the save, and again every few seconds while
 * something else is still going on, until `withinMs`; after that it waits for the next save. When
 * it passes, the prompt is marked seen FIRST and the sheet opened second, so a kill in between can
 * only lose a prompt, never show one twice.
 */
import { promptMayShow, PROMPT_TIMING } from '@nibblecue/core';
import { useEffect, useRef, useState } from 'react';
import { useAppearance } from '../appearance/AppearanceProvider';
import { useScreenAwake } from '../app/useScreenAwake';
import { useShell, useShellOpen } from '../app/shell';
import { useAuth } from '../auth/AuthContext';
import { keys } from '../data/store';
import { useLocalQuery } from '../data/useLocalQuery';
import { useAllRunningTimers } from '../sheets/quick/useRunningTimers';
import { useTour } from '../tour/TourProvider';
import { usePlan } from './PlanProvider';

/** How often the check looks again while something else is going on. */
export const PROMPT_RECHECK_MS = 2_000;

export function usePlanPrompt(): void {
  const plan = usePlan();
  const shell = useShell();
  const openKind = useShellOpen();
  const tour = useTour();
  const timers = useAllRunningTimers();
  const awake = useScreenAwake();
  const { resolved } = useAppearance();
  const { account } = useAuth();

  const householdId = account?.memberships[0]?.household_id ?? null;
  const userId = account?.profile?.id ?? null;
  const due = plan.prompt;

  // this parent's own entries, re-read on every write to the household (the header says why)
  const mine = useLocalQuery<number | null>(
    due !== null && householdId !== null && userId !== null
      ? [keys.household(householdId)]
      : ['plan/prompt/idle'],
    async db => {
      if (due === null || householdId === null || userId === null) return null;
      const row = await db.get<{ n: number }>(
        `select count(*) as n from activities
          where household_id = ? and created_by = ? and deleted_at is null`,
        [householdId, userId],
      );
      return row?.n ?? 0;
    },
    null,
  );

  const baseline = useRef<number | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  useEffect(() => {
    if (mine === null) {
      baseline.current = null;
      return;
    }
    if (baseline.current !== null && mine > baseline.current) setSavedAt(Date.now());
    baseline.current = mine;
  }, [mine]);

  // the latest facts, for a check that fires on a timer rather than on a render
  const facts = useRef({ busy: true, night: false });
  facts.current = {
    busy:
      !awake ||
      openKind !== null ||
      timers.length > 0 ||
      (tour !== null && (tour.phase !== 'off' || tour.guide !== null)),
    night: resolved.theme === 'night',
  };

  useEffect(() => {
    if (due === null || savedAt === null) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      const now = Date.now();
      const sinceSave = now - savedAt;
      if (sinceSave > PROMPT_TIMING.withinMs) return;
      const may = promptMayShow({
        msSinceSave: sinceSave,
        busy: facts.current.busy,
        hour: new Date(now).getHours(),
        night: facts.current.night,
      });
      if (may) {
        plan.markPromptSeen(due);
        shell.openPlanPrompt(due);
        return;
      }
      timer = setTimeout(check, PROMPT_RECHECK_MS);
    };
    timer = setTimeout(check, Math.max(0, PROMPT_TIMING.afterSaveMs - (Date.now() - savedAt)));
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
    // `plan` and `shell` are read at the moment of the check; a new object from either must not
    // restart the wait a save began
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due, savedAt]);
}

/**
 * THE HOOK IN A COMPONENT OF ITS OWN, drawing nothing — how Today asks for the sheet (2026-09-28).
 * Everything above is a fact that moves while a parent uses the app: every sheet that opens and
 * closes, every timer, the tour, the count re-read on every save. Called from `TodayScreen`, each
 * of those re-rendered the whole page, a sheet's twice (up and down) in the same commit as its
 * first and last frames; here only this empty element re-renders. The same reason the Log row's
 * count hold is said round the row (`CountsWaitForSheets`).
 */
export function PlanPromptWatch(): null {
  usePlanPrompt();
  return null;
}
