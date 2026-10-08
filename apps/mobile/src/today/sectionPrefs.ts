/**
 * Which of Today's optional sections this household wants on the screen.
 *
 * ONE SECTION SO FAR, and the shape is a record rather than a boolean because the next one will
 * arrive: a parent who does not want the Care strip on Today (the owner, 2026-09-17: "let users
 * hide baby care module reminder at home if they dont want to track this") is asking the same
 * question a parent bored of the stash strip will ask next.
 *
 * HIDING IS NOT TURNING OFF. The modules themselves stay on — bath and tummy time keep their
 * rhythms, their reminders and their place in the Log sheet, the Schedule tab and every report.
 * This is one strip on one screen, which is why it lives here and not in the module registry: a
 * parent who wants to stop tracking bathing altogether has "What you track" for that, and
 * conflating the two would quietly delete a rhythm somebody set up.
 *
 * It belongs to a HOUSEHOLD, not a device, so it is deliberately absent from `DEVICE_LEVEL_KEYS`:
 * signing out clears it with everything else that is somebody's.
 */
import { useCallback, useEffect, useState } from 'react';
import type { KeyValueStore } from '../prefs';
import { prefsStore } from '../prefs/async-storage';

export const TODAY_SECTIONS_KEY = 'today_sections';

export interface TodaySectionPrefs {
  /** The Baby care strip: bath, tummy time and medicine, above Today's totals. */
  care: boolean;
}

export const DEFAULT_TODAY_SECTIONS: TodaySectionPrefs = { care: true };

/** Anything stored by an older build, a newer one, or a corrupted write reads as the default. */
export function parseTodaySections(raw: string | null): TodaySectionPrefs {
  if (raw === null) return DEFAULT_TODAY_SECTIONS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return DEFAULT_TODAY_SECTIONS;
    const value = parsed as { care?: unknown };
    // ONLY AN EXPLICIT false HIDES IT. A key that is missing, misspelled or of the wrong type is
    // a read that failed, and a section vanishing from Today is the wrong way to fail.
    return { care: value.care !== false };
  } catch {
    return DEFAULT_TODAY_SECTIONS;
  }
}

export async function loadTodaySections(
  store: KeyValueStore = prefsStore,
): Promise<TodaySectionPrefs> {
  return parseTodaySections(await store.get(TODAY_SECTIONS_KEY));
}

export function saveTodaySections(
  prefs: TodaySectionPrefs,
  store: KeyValueStore = prefsStore,
): Promise<void> {
  return store.set(TODAY_SECTIONS_KEY, JSON.stringify(prefs));
}

/** The stored choice, and the one way to change it. Writes at once; Today re-renders. */
export function useTodaySectionPrefs(): {
  prefs: TodaySectionPrefs;
  save: (next: TodaySectionPrefs) => void;
} {
  const [prefs, setPrefs] = useState<TodaySectionPrefs>(DEFAULT_TODAY_SECTIONS);
  useEffect(() => {
    let live = true;
    void loadTodaySections().then(p => {
      if (live) setPrefs(p);
    });
    return () => {
      live = false;
    };
  }, []);
  const save = useCallback((next: TodaySectionPrefs) => {
    setPrefs(next);
    void saveTodaySections(next);
  }, []);
  return { prefs, save };
}
