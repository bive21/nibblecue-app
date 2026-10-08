/**
 * Where the appearance choice lives on the device (docs/DESIGN_SYSTEM.md §3 "the stored choice
 * must always win", §11 "Storage and application"; UX_AUDIT R-5). One preference key, read
 * before the first frame, parsed through the resolver's own fallback so a removed scheme or an
 * old client never renders unstyled. Device-level and non-PII, so it survives a sign-out
 * (prefs/index.ts DEVICE_LEVEL_KEYS). `profiles.theme` / `profiles.color_scheme` mirror it on
 * the server from WP4's sync on; the device copy is what paints.
 */
import { parseAppearance, type AppearancePrefs } from '@nibblecue/ui/appearance';
import type { KeyValueStore } from '../prefs';

export const APPEARANCE_KEY = 'appearance';

export async function loadAppearance(store: KeyValueStore): Promise<AppearancePrefs> {
  const raw = await store.get(APPEARANCE_KEY);
  if (!raw) return parseAppearance(undefined);
  try {
    return parseAppearance(JSON.parse(raw));
  } catch {
    return parseAppearance(undefined);
  }
}

export function saveAppearance(store: KeyValueStore, prefs: AppearancePrefs): Promise<void> {
  return store.set(APPEARANCE_KEY, JSON.stringify(prefs));
}
