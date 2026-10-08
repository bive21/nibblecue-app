/**
 * The paywall a parent walked into (docs/PRICING.md §6; docs/AUTH_AND_TRIAL.md §6 A7;
 * docs/BRANDING.md §2 "Paywall"): a sheet titled with the tier name, opening with the `why`
 * line for THAT feature — never a generic "go Plus" — then what the tier adds and, truthfully,
 * what every plan keeps, and only THEN the offer — `SubscribePanel`, which the Plan screen
 * renders too, so the two surfaces cannot drift apart. No price is written here: every figure
 * arrives from the billing provider already formatted, and when that provider is the mock the
 * panel says on the screen that its figures are targets rather than an offer. No countdown, no
 * scarcity, and closing is always one tap on "Not now".
 *
 * The sheet is mounted whenever the shell is, and `feature` is what opens it: null closes.
 * The last feature is kept through the closing slide so the copy does not blank out while
 * the sheet is still on its way down. Every line here — the why and both lists — comes through
 * `gateCopy`, which turns the matrix's typographic dashes into the app's middle dot (§9), so
 * nothing is rendered verbatim from the table. The two lists are drawn by `PlanLists`, the Plan
 * page's own component: two cards of short names, each name's whole sentence its spoken label
 * (the owner, 2026-09-27: *"very crowded with text"*). The why stays a sentence, as the H2.
 *
 * A LOCK TAPPED BY SOMEONE WHO DOES NOT DECIDE (2026-09-28). The plan is bought for the whole
 * household (migration 0101) by the owner or a parent (`usePlan().decides`), and the plan cards
 * and the trial-end sheets already went to them alone; this sheet did not ask, so a grandparent or
 * a night nurse tapping a lock met the whole offer, prices and all, for a decision that is not
 * theirs to make. They now see what anyone sees about the feature, its `why` and the two lists,
 * and in place of the offer one plain line, that Plus is chosen by a parent in the household
 * (`gateNotYours`); no purchase buttons, and "Close" rather than "Not now", since there is no later
 * for them to decide in. The owner and the parents are shown exactly what they were.
 *
 * An opening is told to no analytics. Who bought is counted on the server, from the store's own
 * records (the owner, 2026-09-28, "server count"; PRICING.md §7).
 */
import type { FeatureKey } from '@nibblecue/core';
import { IN_APP_STRINGS } from '@nibblecue/brand';
import { Body, BottomSheet, Button, H2, useTheme } from '@nibblecue/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SubscribePanel } from '../billing/SubscribePanel';
import { gateCopy, gateNotYours } from '../plan/gate';
import { PlanLists } from '../plan/PlanLists';
import { usePlan } from '../plan/PlanProvider';
import { NOT_ON_THIS_PLATFORM, WORDED_ON_THIS_PLATFORM } from '../plan/platform';

export interface GateSheetProps {
  /** The feature whose gate was tapped; null when the sheet is closed. */
  feature: FeatureKey | null;
  onClose: () => void;
}

export function GateSheet({ feature, onClose }: GateSheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { decides } = usePlan();
  const [shown, setShown] = useState<FeatureKey | null>(feature);
  useEffect(() => {
    if (feature !== null) setShown(feature);
  }, [feature]);
  const key = feature ?? shown;
  const copy = key
    ? gateCopy(key, IN_APP_STRINGS.paywallTitle, NOT_ON_THIS_PLATFORM, WORDED_ON_THIS_PLATFORM)
    : null;

  return (
    <BottomSheet
      visible={feature !== null}
      title={IN_APP_STRINGS.paywallTitle}
      onClose={onClose}
      bottomInset={insets.bottom}
      footer={
        <Button
          label={decides ? 'Not now' : 'Close'}
          variant="secondary"
          size="lg"
          onPress={onClose}
          testID="gate.close"
        />
      }
      testID="gate"
    >
      {copy ? (
        <View style={{ gap: t.space.sm }}>
          <H2 testID="gate.why">{copy.why}</H2>
          <PlanLists
            plus={copy.plus}
            free={copy.free}
            testIDs={{ plus: 'gate.plus', free: 'gate.free' }}
            style={{ marginVertical: t.space.md }}
          />
          {/* THE OFFER, under the lists rather than over them. A parent arrives here because a
              control was locked, so the first thing they read is why THAT feature is Plus, then
              what the tier is, and only then what it costs — never the price first, which would
              be the sheet selling before it has explained. Someone who does not decide for the
              household is told who does, and offered nothing (see the header). */}
          {decides ? (
            <SubscribePanel testID="gate.billing" />
          ) : (
            <Body testID="gate.not_yours">{gateNotYours(IN_APP_STRINGS.paywallTitle)}</Body>
          )}
        </View>
      ) : null}
    </BottomSheet>
  );
}
