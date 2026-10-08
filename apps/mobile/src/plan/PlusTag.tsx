/**
 * THE QUIET "PLUS" TAG (the owner, 2026-09-28: *"From marketing point of view, how can I sell the
 * system more? I want at least 20% on plus"*).
 *
 * WHY IT EXISTS. Every new household spends its first 14 days on Plus with no card, and until now
 * nothing on a Plus surface said it was Plus while it was unlocked. A parent used the nap outlook,
 * the comparisons on Reports and Night for two weeks, then met the locks on day 15 without ever
 * having been told which parts they were. A preview that does not say what it is previewing
 * converts on luck.
 *
 * WHAT IT IS. One word, "Plus", in the design system's `Badge` in the calm `info` tone (`PREVIEW_TAG`,
 * `plan/gate.ts`), beside the name of a surface that is on only because of the preview. Never a
 * lock (the thing it sits on works), never a price, never a countdown, never a button: tapping it
 * does nothing, and it opens no sheet. It is part of the surface's spoken name ("Nap outlook,
 * Plus", `withPlusTag`), so a screen reader hears what the eye sees.
 *
 * WHO DECIDES. `usePlusTag` asks the plan's `previewTag(feature)` (core's `previewOnly`): true only
 * while the household's plan is the preview and the free plan would not have the feature. So there
 * is no tag on a paid plan, whose parent chose Plus, and none on Free, where the lock says it. No
 * component reads a status or a tier name to know this (CLAUDE.md §4).
 *
 * WHAT IT COUNTS. The day it is drawn, on this phone, for the recap the trial-end sheets and the
 * "preview ended" card say (`plusUsage.ts`): the tag and the count are one call, so the recap can
 * only name what the parent was shown was Plus.
 *
 * WHERE IT IS WORN: Today's nap outlook; Reports' comparisons, charts, usual windows, visit summary
 * and a range past the free window; the vaccine cards' door to the visit summary; the Activity log's line where the free window would end, and
 * since 2026-09-30 the same line on the Schedule's History page; the
 * stash's Use first list; the Schedule tab's offer from your log and the saved day plans; since
 * 2026-10-01 the Naps sheet's From your log and the Naps row's card's Use a heads-up instead; the
 * Appearance sheet's Night, colors and Liquid Glass, and since 2026-10-01 its Bubble, Capsule and
 * Swipe the log row sideways; and since 2026-09-28 the weekly summary's
 * comparison with the week before, each child's first-year keepsake row, on Reports and on the
 * first birthday's note, and Community's Start a discussion and Suggest a feature, never its
 * replies, votes or Report a problem. docs/PRICING.md §6 keeps the list.
 */
import type { FeatureKey } from '@nibblecue/core';
import { Badge } from '@nibblecue/ui';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { prefsStore } from '../prefs/async-storage';
import { PREVIEW_TAG } from './gate';
import { usePlan } from './PlanProvider';
import {
  notePlusUse,
  plusUsageKey,
  readPlusUsage,
  type PlusUsage,
  type PlusUse,
} from './plusUsage';

/** Where this person's count for this household is kept, or null while nobody is signed in. */
export function usePlusUsageKey(): string | null {
  const { account, session } = useAuth();
  const userId = session?.user.id ?? null;
  const householdId = account?.memberships[0]?.household_id ?? null;
  return userId !== null && householdId !== null ? plusUsageKey(userId, householdId) : null;
}

/**
 * WHETHER THIS SURFACE WEARS THE TAG, and the day counted when it does. `feature` is the matrix key
 * the surface is sold under; `use` is the name the recap gives it, or null where the use is counted
 * somewhere else (the Appearance sheet's looks, counted where they are painted: `PlusUsageWatch`);
 * `when` is the surface's own condition (a range past the free window is only tagged while one is
 * chosen), so a tag that is not drawn is never counted.
 */
export function usePlusTag(feature: FeatureKey, use: PlusUse | null, when = true): boolean {
  const plan = usePlan();
  const key = usePlusUsageKey();
  const tagged = when && plan.previewTag(feature);
  useEffect(() => {
    if (tagged && key !== null && use !== null) void notePlusUse(prefsStore, key, use, Date.now());
  }, [tagged, key, use]);
  return tagged;
}

/**
 * The pill. Drawn only where `usePlusTag` said so; it decides nothing itself. Centered on the line
 * it sits in, beside a name whatever the name's size: a badge alone starts at the top of its row.
 * `spoken={false}` where the surface's own name already says "Plus" (`withPlusTag`) and the pill
 * sits apart from it, so a screen reader hears the word once.
 */
export function PlusTag({
  spoken = true,
  style,
  testID,
}: {
  spoken?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const pill = (
    <Badge
      label={PREVIEW_TAG.label}
      tone={PREVIEW_TAG.tone}
      accessibilityLabel={PREVIEW_TAG.label}
      {...(spoken ? { style: [styles.tag, style] } : {})}
      {...(testID ? { testID } : {})}
    />
  );
  return spoken ? (
    pill
  ) : (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.tag, style]}
    >
      {pill}
    </View>
  );
}

const styles = StyleSheet.create({ tag: { alignSelf: 'center' } });

/**
 * WHAT THIS PHONE COUNTED, for the recap: read when `active` turns on (a trial sheet rising, the
 * ended card drawn) and kept after, so the words do not blank out while a sheet slides away.
 */
export function usePlusUsage(active: boolean): PlusUsage | null {
  const key = usePlusUsageKey();
  const [usage, setUsage] = useState<PlusUsage | null>(null);
  useEffect(() => {
    if (!active || key === null) return undefined;
    let live = true;
    void readPlusUsage(prefsStore, key).then(u => {
      if (live) setUsage(u);
    });
    return () => {
      live = false;
    };
  }, [active, key]);
  return usage;
}
