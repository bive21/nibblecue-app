/**
 * THE CLOCK BEHIND AUTOMATIC DARK (the owner, 2026-09-20: *"Add the option to turn on automatic
 * dark mode at certain times (night) or follow Chiara's bed time"*).
 *
 * Every RULE lives in `@nibblecue/ui/appearance` as a pure function — when the window is open,
 * which pair it runs on, whether it may paint over the stored theme. This file owns the two
 * impure things those rules need: what time it is, and what the household said its bed time is.
 *
 * WHAT IT RETURNS IS THE ANSWER, NOT THE TIME. A hook returning `Date.now()` every minute would
 * re-render the entire app under the provider sixty times an hour for a boolean that changes
 * twice a day. This returns the look to paint — `'dark' | 'night' | null` — so React's own bail-out
 * does the work: the state is set every minute and is identical every minute but two, and an
 * identical state is not a re-render.
 *
 * AND WHAT MADE IT SO, SINCE 2026-09-25 (`AutoDarkAnswer.cause`): the minute tick finding the
 * window's edge while the app is in front of the parent (`clock`), the app coming back from the
 * background (`resume`), or a change to what the answer is computed from (`input`). The provider
 * lets exactly one of those repaint as a slow fade — the clock's, the evening going dark while
 * someone is looking (`sunset.ts`) — and the answer object is only ever replaced when the LOOK
 * changes, so the minute's identical answer is still the same object and still nothing.
 *
 * WHY THE MINUTE TICK AND NOT A TIMEOUT TO THE NEXT EDGE. A timeout aimed at 20:00 is wrong
 * whenever the phone's wall clock moves under it — a DST change, a flight, a manual correction,
 * a device that suspended the timer while asleep — and the failure is an app that stays light all
 * evening with nothing on screen to explain it. A minute is cheap and self-correcting, and the
 * AppState listener covers the case where the timer did not fire at all while the phone was away.
 *
 * WHY THE BED TIME IS READ HERE AND NOT THROUGH `useDayWindow`. That hook is the household's
 * window for the screens that edit it, and it opens the local database on mount. This provider
 * mounts above the auth screens on a first launch, before there is a household or a reason to
 * touch SQLite — so the read is guarded: nothing is opened unless the parent actually chose to
 * follow the bed time and there is a household to read one from.
 */
import {
  autoDarkThemeAt,
  type AutoDarkPrefs,
  type AutoDarkTheme,
  type DimBedtime,
} from '@nibblecue/ui/appearance';
import { DEFAULT_DAY_WINDOW, windowTimeOr } from '@nibblecue/core';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { crumb } from '../app/boot';
import { useAuth } from '../auth/AuthContext';
import { keys, store } from '../data/store';
import { openLocalDb } from '../db';
import { dayWindowRow } from '../db/queries/schedule';
import { tickCause, type AnswerCause, type AutoDarkAnswer } from './sunset';

const MINUTE = 60_000;

/** Minutes since local midnight, on the device's own clock — the room the phone is in. */
const nowMinutes = (): number => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/**
 * The household's wake/bed pair, or null while there is nothing to read. Only ever asked for
 * when `mode === 'bedtime'`; every other mode gets null and never opens the database.
 *
 * Exported because the SETTINGS SHEET has to read it back to the parent, and it must read the
 * same thing the resolver runs on. A sheet that printed `DEFAULT_DAY_WINDOW` where there is no
 * row would name two times the app is not actually using.
 */
export function useDimBedtime(enabled: boolean): DimBedtime | null {
  const { account } = useAuth();
  const householdId = account?.memberships[0]?.household_id ?? null;
  const [pair, setPair] = useState<DimBedtime | null>(null);

  useEffect(() => {
    if (!enabled || householdId === null) {
      setPair(null);
      return;
    }
    let live = true;
    const run = () => {
      void openLocalDb()
        .then(db => dayWindowRow(db, householdId))
        .then(row => {
          if (!live) return;
          // NO ROW IS NULL, NOT A DEFAULT PAIR. The resolver falls back to the parent's own
          // chips, which is a better answer than a 19:30 nobody typed.
          // `windowTimeOr` because the same column arrives as `07:00` from a local write and
          // `07:00:00` from the server's `time` type (today/dayWindow.ts says why)
          setPair(
            row === null
              ? null
              : {
                  wake: windowTimeOr(row.wake_time, DEFAULT_DAY_WINDOW.wake),
                  bed: windowTimeOr(row.bed_time, DEFAULT_DAY_WINDOW.bed),
                },
          );
        })
        .catch((err: unknown) => {
          crumb(`auto dark: day window unreadable — ${err instanceof Error ? err.message : ''}`);
          if (live) setPair(null);
        });
    };
    run();
    // the other parent moving bed time on their phone moves this one's evening too
    const off = store.subscribe(keys.dayWindow(householdId), run);
    return () => {
      live = false;
      off();
    };
  }, [enabled, householdId]);

  return pair;
}

/**
 * What the automatic window wants painted right now — null for "leave the stored theme alone" —
 * and what made it so (`AutoDarkAnswer`; `sunset.ts` has what each cause may do).
 */
export function useAutoDarkTheme(auto: AutoDarkPrefs): AutoDarkAnswer {
  const { mode, from, to, theme } = auto;
  const bedtime = useDimBedtime(mode === 'bedtime');
  // the six primitives the answer depends on, so the effect's dependencies are the real ones
  // and not an object literal rebuilt on every render of the provider
  const bedWake = bedtime?.wake ?? null;
  const bedBed = bedtime?.bed ?? null;
  const key = `${mode}|${from}|${to}|${theme}|${bedWake ?? ''}|${bedBed ?? ''}`;

  const look = (): AutoDarkTheme | null => {
    if (mode === 'off') return null;
    const pair = bedWake === null || bedBed === null ? null : { wake: bedWake, bed: bedBed };
    return autoDarkThemeAt({ mode, from, to, theme }, nowMinutes(), pair);
  };

  // the first answer of a launch is an input's: nothing about it may fade
  const [answer, setAnswer] = useState<AutoDarkAnswer>(() => ({ theme: look(), cause: 'input' }));
  const [seen, setSeen] = useState(key);
  // what a tick needs to tell the clock from an app waking up (`tickCause`): when the answer was
  // last looked at, and whether the app has left the foreground since
  const lastLook = useRef(0);
  const away = useRef(false);

  /**
   * A new answer only when the LOOK changes — otherwise the same object back, which React bails
   * out on, so the fifty-eight identical minutes an evening are still nothing. A cause without a
   * change of look is not news.
   */
  const settle = (next: AutoDarkTheme | null, cause: AnswerCause) =>
    setAnswer(prev => (prev.theme === next ? prev : { theme: next, cause }));

  /**
   * THE ANSWER IS RECOMPUTED DURING RENDER WHEN AN INPUT CHANGES, not in an effect — React's
   * own "adjusting state when a prop changes" pattern, and here it is the difference between
   * a correct first frame and a visible one.
   *
   * Effects run AFTER paint. The stored preference arrives asynchronously (`loadAppearance`),
   * so a household on automatic dark opening the app at 10 p.m. would paint one light frame
   * and then snap. This provider exists to stop exactly that (see its header: nothing paints
   * until the stored choice is in), and an evening window is no different from a stored theme.
   * It is an `input`: the parent's own times, their mode, their bed time — never faded.
   */
  if (seen !== key) {
    setSeen(key);
    settle(look(), 'input');
  }

  useEffect(() => {
    // off costs nothing: no timer, no listener, no state that can go stale
    if (mode === 'off') return;
    lastLook.current = Date.now();
    away.current = AppState.currentState !== 'active';
    // identical every minute but two — React bails out and nothing re-renders
    const tick = () => {
      const now = Date.now();
      const cause = tickCause({
        appState: AppState.currentState,
        away: away.current,
        sinceLastLook: now - lastLook.current,
      });
      lastLook.current = now;
      away.current = AppState.currentState !== 'active';
      settle(look(), cause);
    };
    const id = setInterval(tick, MINUTE);
    const app = AppState.addEventListener('change', s => {
      if (s !== 'active') {
        // gone from the foreground: whatever the next tick finds, the parent did not watch it
        away.current = true;
        return;
      }
      lastLook.current = Date.now();
      away.current = false;
      settle(look(), 'resume');
    });
    return () => {
      clearInterval(id);
      app.remove();
    };
    // `look` and `settle` are read through the closure on purpose: they are rebuilt every render,
    // and listing them would tear the interval down and rebuild it on each one. `key` carries
    // everything they read, so the effect restarts exactly when the answer could have changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mode]);

  return answer;
}
