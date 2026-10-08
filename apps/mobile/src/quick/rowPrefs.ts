/**
 * Where the Quick row's arrangement lives (the owner, 2026-09-15: "which module to show first,
 * and which module to show"). One preference key holding `QuickRowPrefs`; the shape and the
 * rule that turns it into a row are in packages/core, so the row and its editor read the same
 * function and a node test can prove it.
 *
 * It belongs to a HOUSEHOLD, not a device, so it is deliberately absent from
 * `DEVICE_LEVEL_KEYS`: signing out clears it with everything else that is somebody's.
 */
import {
  DEFAULT_QUICK_ROW_PREFS,
  MODULE_BY_ID,
  type ModuleId,
  type QuickRowPrefs,
} from '@nibblecue/core';
import { useCallback, useEffect, useState } from 'react';
import type { KeyValueStore } from '../prefs';
import { prefsStore } from '../prefs/async-storage';

const QUICK_ROW_KEY = 'quick_row';

const ids = (value: unknown): ModuleId[] =>
  Array.isArray(value)
    ? value.filter((v): v is ModuleId => typeof v === 'string' && v in MODULE_BY_ID)
    : [];

/** Anything stored by an older build, a newer one, or a corrupted write reads as the default. */
function parseQuickRow(raw: string | null): QuickRowPrefs {
  if (raw === null) return DEFAULT_QUICK_ROW_PREFS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return DEFAULT_QUICK_ROW_PREFS;
    const value = parsed as { order?: unknown; hidden?: unknown };
    return { order: ids(value.order), hidden: ids(value.hidden) };
  } catch {
    return DEFAULT_QUICK_ROW_PREFS;
  }
}

async function loadQuickRow(store: KeyValueStore = prefsStore): Promise<QuickRowPrefs> {
  return parseQuickRow(await store.get(QUICK_ROW_KEY));
}

function saveQuickRow(prefs: QuickRowPrefs, store: KeyValueStore = prefsStore): Promise<void> {
  return store.set(QUICK_ROW_KEY, JSON.stringify(prefs));
}

/** The stored arrangement, and the one way to change it. Writes at once; the row re-renders. */
export function useQuickRowPrefs(): { prefs: QuickRowPrefs; save: (next: QuickRowPrefs) => void } {
  const [prefs, setPrefs] = useState<QuickRowPrefs>(DEFAULT_QUICK_ROW_PREFS);
  useEffect(() => {
    let live = true;
    void loadQuickRow().then(p => {
      if (live) setPrefs(p);
    });
    return () => {
      live = false;
    };
  }, []);
  const save = useCallback((next: QuickRowPrefs) => {
    setPrefs(next);
    void saveQuickRow(next);
  }, []);
  return { prefs, save };
}

/**
 * WHICH CARE CELLS THE HOUSEHOLD WANTS (the owner, 2026-09-18: "instead of being able to unhide
 * 'baby care', just have users be able to select which module is shown instead").
 *
 * A list of the care modules switched OFF, not the ones on, and that is deliberate: a household
 * that has never opened the picker stores nothing and gets all three, so an empty file and a
 * fresh install read the same. `careShown` in core ignores `bath` here whatever is stored, so no
 * write and no stale entry can empty the strip.
 *
 * It lives in this file, beside the Log row's arrangement, because it is the same decision one
 * section down — what is on Today — and a parent who finds Edit on one expects it on the other.
 */
const CARE_ROW_KEY = 'care_row_hidden';

function parseCareHidden(raw: string | null): ModuleId[] {
  if (raw === null) return [];
  try {
    return ids(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** The stored choice, and the one way to change it. Writes at once; the strip re-renders. */
export function useCarePrefs(): { hidden: ModuleId[]; save: (next: readonly ModuleId[]) => void } {
  const [hidden, setHidden] = useState<ModuleId[]>([]);
  useEffect(() => {
    let live = true;
    void prefsStore.get(CARE_ROW_KEY).then(raw => {
      if (live) setHidden(parseCareHidden(raw));
    });
    return () => {
      live = false;
    };
  }, []);
  const save = useCallback((next: readonly ModuleId[]) => {
    const list = [...next];
    setHidden(list);
    void prefsStore.set(CARE_ROW_KEY, JSON.stringify(list));
  }, []);
  return { hidden, save };
}
