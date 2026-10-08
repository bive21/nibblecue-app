/**
 * Profile picture → Plan → Have a code? (docs/PROMO_CODES.md; the owner, 2026-09-24: "add this
 * promo code module… what I want is to give 1 month free access with purchase, and I would send
 * the code to them by email").
 *
 * WHERE IT LIVES, AND WHY THERE (the owner, 2026-09-26: *"more: redeem code shouldnt be here, it
 * should be in profile picture clicked -> plan, then the choose a plan, should be on the most
 * bottom — have coupon to add? after clicked, then enter the coupon code here"*). It was its own
 * page behind a row on More; it is now the foot of the Plan page, under the plans and the store's
 * own controls, folded behind one quiet line (`PlanScreen`). A code is a way onto a plan, so it
 * sits where plans are chosen, after them: somebody holding the email finds it at the bottom of
 * the one page about their plan, and somebody who is not holding one reads past a single line. The
 * page it was is gone rather than kept as a second door; the words, the store hand-over and every
 * rule below are the page's, moved.
 *
 * THE CODE IS THE STORE'S, NOT OURS. An App Store offer code or a Google Play promo code, made in
 * the store's console and checked by the store: this panel hands it over and does nothing else.
 * The app keeps no list of codes, never decides whether one is good, and never grants anything
 * itself — the plan changes when the store tells the server, and the Plan page above reads it back
 * like any other change (CLAUDE.md rule 14). A code of our own that unlocked Plus would be an
 * unlock outside in-app purchase, which App Review guideline 3.1.1 forbids, so there is not one.
 *
 * HOW MUCH A CODE GIVES IS NEVER WRITTEN HERE. A month, a trial, whether it renews after — the
 * offer decides, and the store's own screen says so before anything is confirmed. A panel that
 * promised "a free month" would be wrong the first time an offer changed, and wrong on Android
 * today, where Google Play's codes are trials that renew unless canceled (docs/PROMO_CODES.md §2).
 *
 * TWO SHAPES, ONE PANEL (`redeemStyle`). On an iPhone the store asks for the code in its own sheet,
 * so the panel is one button; on Android the panel takes the code and opens Google Play with it
 * filled in. A build with no store says so, in place of a button that cannot work.
 *
 * NOTHING HERE NAMES WHAT THE CODE CAME WITH. The owner will send codes with a set of coins that
 * are not public yet (docs/NFC_TAGS.md, the status note), and a code is a code whatever it came
 * with — a gift, an apology, a partner's box.
 */
import { BodySm, BodyStrong, Button, Card, Input, useTheme } from '@nibblecue/ui';
import { useState } from 'react';
import { View } from 'react-native';
import {
  BILLING,
  NO_STORE_REASON,
  REDEEM,
  codeReady,
  tidyCode,
  useBilling,
  type PurchaseOutcome,
} from '../../billing';
import { useToast } from '../../ui/toast';

/** What the panel says after the store answered. Backing out of the store's sheet says nothing. */
function redeemLine(outcome: PurchaseOutcome): string | null {
  switch (outcome.kind) {
    case 'purchased':
      return REDEEM.redeemed;
    case 'already':
      return BILLING.already;
    case 'pending':
      return BILLING.pending;
    case 'unavailable':
      return outcome.why;
    case 'failed':
      return REDEEM.refused;
    case 'nothing':
    case 'cancelled':
      return null;
  }
}

export function RedeemPanel() {
  const t = useTheme();
  const billing = useBilling();
  const toast = useToast();
  const [code, setCode] = useState('');

  const send = async (typed: string | null) => {
    const line = redeemLine(await billing.redeem(typed));
    if (line !== null) toast.show(line);
  };

  return (
    <View style={{ gap: t.space.lg }} testID="redeem">
      <BodySm testID="redeem.lede">{REDEEM.lede}</BodySm>

      {billing.redeemStyle === null ? (
        <Card testID="redeem.nostore">
          <View style={{ gap: t.space.sm }}>
            <BodyStrong>{REDEEM.noStoreTitle}</BodyStrong>
            <BodySm ink="text2">{NO_STORE_REASON}</BodySm>
          </View>
        </Card>
      ) : (
        <View style={{ gap: t.space.md }}>
          {billing.figuresAreTargets ? (
            <BodySm testID="redeem.mock">{REDEEM.mockNote}</BodySm>
          ) : null}
          {billing.redeemStyle === 'sheet' ? (
            <Button
              label={billing.busy ? REDEEM.working : REDEEM.sheetButton}
              loading={billing.busy}
              disabled={billing.busy}
              onPress={() => void send(null)}
              testID="redeem.sheet"
            />
          ) : (
            <>
              <Input
                label={REDEEM.fieldLabel}
                value={code}
                onChangeText={setCode}
                placeholder={REDEEM.fieldPlaceholder}
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                maxLength={80}
                testID="redeem.code"
              />
              <Button
                label={billing.busy ? REDEEM.working : REDEEM.fieldButton}
                loading={billing.busy}
                disabled={billing.busy || !codeReady(code)}
                onPress={() => void send(tidyCode(code))}
                testID="redeem.send"
              />
            </>
          )}
          <BodySm testID="redeem.store">{REDEEM.storeShows}</BodySm>
        </View>
      )}
    </View>
  );
}
