/**
 * THE TRIAL-END SHEET: seven days before the 14-day preview ends, and three (the owner,
 * 2026-09-27: *"think about the 7days before trial ends pop up if they would like to subscribe,
 * then h-3 trial ends. Think about this and how we can entice customers to start subscribing"*).
 *
 * It is the paywall's own shape — the same `PlanLists` and the same `SubscribePanel` the gate sheet
 * and the Plan page draw — opening with the preview's real end date instead of a feature's `why`.
 * So a parent is offered exactly what the Plan page offers, in the same words, at the store's own
 * prices, with the saving and the terms line under the choices. `promptCopy.ts` has what it says
 * and why; core's `welcomePrompt` decides which one is due and `promptMayShow` when it may rise
 * (`usePlanPrompt`), which is only after a save, past its Undo, in the daytime, with nothing else
 * going on — a parent opening the app at 3 a.m. never meets it.
 *
 * "Not now" closes it, and so does the scrim, the handle and Back; none of them asks twice. The
 * sheet was marked seen the moment it rose, so it never comes back on this phone. A purchase — here
 * or on the partner's phone, reaching this one through the account — ends the preview, and the
 * sheet closes itself: it has nothing left to ask.
 *
 * SINCE 2026-09-28 IT ALSO SAYS WHAT THE HOUSEHOLD USED (`promptCopy.ts` point 3): under the count
 * of entries, the Plus surfaces this phone counted them using during the preview, the three used
 * most (`plusUsage.ts`). The line that one subscription covers the household moved into
 * `SubscribePanel`, which says it wherever Plus is sold, so the sheet no longer says it twice.
 *
 * It tells nothing about itself to any analytics: whether it rose and how it was answered stay on
 * this phone. Who bought is counted on the server, from the store's own records (the owner,
 * 2026-09-28, "server count"; docs/PRICING.md §7).
 */
import type { WelcomePrompt } from '@nibblecue/core';
import { limitFor } from '@nibblecue/core';
import { IN_APP_STRINGS } from '@nibblecue/brand';
import { Body, BodySm, BottomSheet, Button, H2, Numeric, useTheme } from '@nibblecue/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { SubscribePanel } from '../billing/SubscribePanel';
import { keys } from '../data/store';
import { useLocalQuery } from '../data/useLocalQuery';
import { planLists } from './gate';
import { NOT_ON_THIS_PLATFORM, WORDED_ON_THIS_PLATFORM } from './platform';
import { PlanLists } from './PlanLists';
import { usePlan } from './PlanProvider';
import { usePlusUsage } from './PlusTag';
import { endsOnLabel, promptCopy } from './promptCopy';

export interface PlanPromptSheetProps {
  /** The prompt to show; null when the sheet is closed. */
  prompt: WelcomePrompt | null;
  onClose: () => void;
}

export function PlanPromptSheet({ prompt, onClose }: PlanPromptSheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const plan = usePlan();
  const { account } = useAuth();
  // the last prompt, kept through the closing slide so the words do not blank out on the way down
  const [shown, setShown] = useState<WelcomePrompt | null>(prompt);
  useEffect(() => {
    if (prompt !== null) setShown(prompt);
  }, [prompt]);
  const key = prompt ?? shown;

  // Plus bought, here or on another phone of the household: nothing left to ask
  const open = prompt !== null;
  const stillPreview = plan.status === 'WELCOME';
  useEffect(() => {
    if (!open || stillPreview) return;
    onClose();
  }, [open, stillPreview, onClose]);

  // what this phone counted the household using of Plus, read while the sheet is up (point 3)
  const usage = usePlusUsage(open);

  /*
    WHAT THE HOUSEHOLD HAS BUILT: every entry anyone in it has logged, counted in SQL. Read only
    while the sheet is up, and a count, never the entries (`promptCopy.ts` point 2).
  */
  const householdId = account?.memberships[0]?.household_id ?? null;
  const logged = useLocalQuery<number | null>(
    open && householdId !== null ? [keys.household(householdId)] : ['plan/prompt/idle'],
    async db => {
      if (!open || householdId === null) return null;
      const row = await db.get<{ n: number }>(
        'select count(*) as n from activities where household_id = ? and deleted_at is null',
        [householdId],
      );
      return row?.n ?? 0;
    },
    null,
  );

  const copy =
    key !== null && plan.expiresAt !== null && plan.daysLeft !== null
      ? promptCopy({
          prompt: key,
          daysLeft: plan.daysLeft,
          endsOn: endsOnLabel(plan.expiresAt),
          logged,
          freeHistoryDays: limitFor('history', 'FREE') ?? 7,
          usage,
        })
      : null;
  const lists = planLists(NOT_ON_THIS_PLATFORM, WORDED_ON_THIS_PLATFORM);

  return (
    <BottomSheet
      visible={open}
      title={IN_APP_STRINGS.paywallTitle}
      onClose={onClose}
      bottomInset={insets.bottom}
      footer={
        <Button
          label="Not now"
          variant="secondary"
          size="lg"
          onPress={onClose}
          testID="planPrompt.close"
        />
      }
      testID="planPrompt"
    >
      {copy ? (
        <View style={{ gap: t.space.sm }}>
          <H2 testID="planPrompt.heading">
            <Numeric variant="h2">{copy.headingDays}</Numeric>
            {copy.heading}
          </H2>
          <BodySm testID="planPrompt.lead">{copy.lead}</BodySm>
          {copy.logged ? <Body testID="planPrompt.logged">{copy.logged}</Body> : null}
          {copy.used ? <Body testID="planPrompt.used">{copy.used}</Body> : null}
          <PlanLists
            plus={lists.plus}
            free={lists.free}
            testIDs={{ plus: 'planPrompt.plus', free: 'planPrompt.free' }}
            style={{ marginVertical: t.space.md }}
          />
          {/* the offer last, as on the gate sheet: the sheet explains before it sells. The line that
              one subscription covers the household is the panel's own now, over its choices */}
          <SubscribePanel testID="planPrompt.billing" />
        </View>
      ) : null}
    </BottomSheet>
  );
}
