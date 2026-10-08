/**
 * NIGHT AND THE COLORS, COUNTED WHERE THEY ARE PAINTED (2026-09-28; `plusUsage.ts` has the rest).
 *
 * Every other Plus surface is counted where its tag is drawn. The looks cannot be: the Appearance
 * sheet, where Night, the colors and Liquid Glass wear their tags, is opened once and then closed,
 * while the look it chose is on every screen for weeks. So what is counted is the PAINTED look, read
 * from the same resolver that paints it (`useAppearance().resolved`): a night Night was on, a day a
 * color other than the default was, a day Liquid Glass was. Only while the preview is what lends it
 * (`previewTag`), so a household on Plus or on Free is never counted.
 *
 * It renders nothing and lives beside the other always-mounted watchers in `App.tsx`, inside the
 * Appearance and Plan providers it reads. It looks again every few minutes while a look is on,
 * because a night that runs past noon, or a day past midnight, changes nothing it could observe.
 */
import { DEFAULT_SKIN } from '@nibblecue/ui/skins';
import { DEFAULT_SCHEME } from '@nibblecue/ui/theme';
import { useEffect } from 'react';
import { useAppearance } from '../appearance/AppearanceProvider';
import { prefsStore } from '../prefs/async-storage';
import { usePlan } from './PlanProvider';
import { usePlusUsageKey } from './PlusTag';
import { notePlusUse, type PlusUse } from './plusUsage';

/** How often a look that stays on is counted again: the day it falls on may have turned. */
export const LOOK_RECOUNT_MS = 10 * 60_000;

export function PlusUsageWatch(): null {
  const plan = usePlan();
  const { resolved } = useAppearance();
  const key = usePlusUsageKey();
  const night = resolved.theme === 'night' && plan.previewTag('nightTheme');
  const colors = resolved.scheme !== DEFAULT_SCHEME && plan.previewTag('themes');
  const glass = resolved.skin !== DEFAULT_SKIN && plan.previewTag('themes');

  useEffect(() => {
    if (key === null || !(night || colors || glass)) return undefined;
    const uses: PlusUse[] = [
      ...(night ? (['night'] as const) : []),
      ...(colors ? (['colors'] as const) : []),
      ...(glass ? (['glass'] as const) : []),
    ];
    const count = () => {
      for (const use of uses) void notePlusUse(prefsStore, key, use, Date.now());
    };
    count();
    const timer = setInterval(count, LOOK_RECOUNT_MS);
    return () => clearInterval(timer);
  }, [key, night, colors, glass]);

  return null;
}
