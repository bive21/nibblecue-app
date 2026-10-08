/**
 * THE ONE PLACE SUBSCRIBING IS DRAWN, rendered by both the paywall sheet and the Plan screen.
 *
 * Two surfaces sell the same thing, so they render the same component: a parent who meets a
 * gate and a parent who walked to Settings should be offered exactly the same deal in exactly
 * the same words, and two copies of this markup would be two places for that to stop being
 * true.
 *
 * WHAT IT REFUSES TO DO, all from CLAUDE.md rule 14. No countdown and no scarcity. Nothing is
 * preselected that the config did not preselect. "Manage or cancel" is a plain link out with
 * nothing in front of it — no "are you sure", no offer to stay, no survey.
 *
 * THE ANNUAL PLAN SHOWS WHAT IT SAVES (the owner, 2026-09-26: *"don't just show the price 59.00,
 * think what we can do better to entice user to click. perhaps do the 6.99x12 price = $83.88
 * (scribbled) $59.00, then save x% off"*): twelve months at the monthly price, struck through, then
 * its own price, then "Save N%". It is a comparison with the real monthly price this same panel
 * sells one row down — not an invented "was" price — so it is true, and a parent can check it
 * against the row below. Every figure is the store's own string and the percent is floored from
 * the store's own two numbers, in `annualSaving` (`saving.ts`, which says when it says nothing);
 * this file does no sum. Both surfaces that sell render this panel, so the paywall and the Plan
 * page show it alike.
 *
 * AND IT NEVER PRETENDS. When the provider says its figures are targets, the note saying so
 * renders above the choices rather than below them, where somebody reading downward meets it
 * before the number rather than after.
 *
 * ONE SUBSCRIPTION FOR THE WHOLE HOUSEHOLD, OVER THE CHOICES (2026-09-28): the partner's phone,
 * the grandparents', the night nurse's (migration 0101; `BILLING.household`). It was said on the
 * trial-end sheets alone, so a parent who met a lock or walked to the Plan page never heard the
 * plan's biggest difference from buying an app per phone. It is said here, so wherever Plus is sold.
 *
 * A PURCHASE IS TOLD TO NO ANALYTICS. Who bought, and after which preview, is counted on the
 * server from the store's own records (the owner, 2026-09-28, "server count"; docs/PRICING.md §7),
 * so the panel does not say which surface it is on.
 *
 * THE TERMS ARE WHERE THE PURCHASE IS (App Store guideline 3.1.2; the launch review, 2026-09-27):
 * one quiet line under the two buttons says the subscription renews until canceled and that a
 * cancellation keeps Plus to the end of the paid period, then links the Terms of Use and the
 * Privacy Policy. Both addresses are the brand package's, never typed; the price and the length
 * are already on the choices, as the store formatted them, and on the store's own sheet.
 */
import { BRAND } from '@nibblecue/brand';
import { Badge, BodySm, BodyStrong, Button, Card, Meta, useTheme } from '@nibblecue/ui';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useToast } from '../ui/toast';
import { useBilling } from './BillingContext';
import { BILLING } from './copy';
import { annualSaving, type AnnualSaving } from './saving';
import type { IntroOffer, PurchaseOutcome, StoreProduct } from './types';

/** What a parent is told after an outcome. `cancelled` says nothing, which is the point. */
function toastFor(outcome: PurchaseOutcome, restoring: boolean): string | null {
  switch (outcome.kind) {
    case 'purchased':
      return restoring ? BILLING.restored : BILLING.purchased;
    case 'already':
      return restoring ? BILLING.restored : BILLING.already;
    case 'pending':
      return BILLING.pending;
    case 'nothing':
      return BILLING.nothing;
    case 'unavailable':
      return outcome.why;
    case 'failed':
      return BILLING.failed;
    // a parent who backed out of the store sheet is told nothing at all
    case 'cancelled':
      return null;
  }
}

function periodLabel(p: StoreProduct): string {
  return p.period === 'YEAR' ? BILLING.perYear : BILLING.perMonth;
}

/**
 * THE STORE'S INTRODUCTORY OFFER, as the line under the price (docs/SUBSCRIPTIONS.md §3c), in the
 * store's own strings. On the monthly plan it is the second month free for a first subscription:
 * "Second month free, then {price} a month". Any other stretch a store offers is said as it is.
 */
function introLine(intro: IntroOffer, product: StoreProduct): string {
  return intro.kind === 'secondMonthFree'
    ? BILLING.secondMonthFree(intro.thenLabel, periodLabel(product))
    : BILLING.introOffer(intro.months, intro.priceLabel, intro.thenLabel, periodLabel(product));
}

function ProductChoice({
  product,
  saving,
  selected,
  onPress,
}: {
  product: StoreProduct;
  /** The annual plan's saving, on the annual plan's row only; null draws the price alone. */
  saving: AnnualSaving | null;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  /*
    AN INTRODUCTORY OFFER (docs/SUBSCRIPTIONS.md §3c) takes the line under the price: on the
    monthly plan, "Second month free, then {price} a month". It stands where the renewal line or a
    per-month figure would, because either would describe the regular price alone. The figures
    above it stay the regular ones, and so does the annual saving, regular against regular
    (`annualSaving`), so every number on the panel is true on its own and the offer is said once.
  */
  const under =
    product.introDays !== null
      ? BILLING.introDays(product.introDays)
      : product.introOffer !== null
        ? introLine(product.introOffer, product)
        : product.perMonthLabel !== null
          ? BILLING.perMonthEquivalent(product.perMonthLabel)
          : BILLING.renews;
  const price = `${product.priceLabel} ${periodLabel(product)}`;
  // one sentence for a screen reader, which cannot see the line through the struck figure
  const spoken =
    saving === null
      ? `${price}. ${under}`
      : `${price}. ${BILLING.saveSpoken(saving.percent, saving.wasLabel)}. ${under}`;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={spoken}
      onPress={onPress}
      testID={`billing.product.${product.id}`}
      style={[
        styles.choice,
        {
          borderColor: selected ? t.color.accent : t.color.line,
          borderWidth: selected ? 2 : 1,
          borderRadius: t.radius.m,
          padding: t.space.md,
          gap: 2,
          // the selected state is carried by the border AND the mark below, never by color
          // alone (CLAUDE.md §6: nothing conveyed by color alone)
          backgroundColor: selected ? t.color.accentSoft : 'transparent',
        },
      ]}
    >
      <View style={[styles.choiceHead, { gap: t.space.sm }]}>
        {/* the figures wrap under each other on a narrow phone or at a large text size, rather
            than squeezing "Selected" off the row */}
        <View style={[styles.figures, { columnGap: t.space.sm, rowGap: 2 }]}>
          {saving === null ? null : (
            // struck by a line, not by a color (CLAUDE.md §6), and named in words by the badge
            // after it and by the row's own label
            <Meta ink="text2" style={styles.struck} testID={`billing.product.${product.id}.was`}>
              {saving.wasLabel}
            </Meta>
          )}
          <BodyStrong>{price}</BodyStrong>
          {saving === null ? null : (
            <Badge
              label={BILLING.save(saving.percent)}
              tone="accent"
              testID={`billing.product.${product.id}.save`}
            />
          )}
        </View>
        <Meta ink="text2">{selected ? 'Selected' : ''}</Meta>
      </View>
      <BodySm ink="text2">{under}</BodySm>
    </Pressable>
  );
}

export function SubscribePanel({ testID = 'billing' }: { testID?: string }) {
  const t = useTheme();
  const billing = useBilling();
  const toast = useToast();
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => billing.load(), [billing]);
  // the store's own numbers, or nothing: `saving.ts` decides whether there is a saving to show
  const saving = useMemo(() => annualSaving(billing.products), [billing.products]);
  useEffect(() => {
    if (chosen !== null || billing.products.length === 0) return;
    const pre = billing.products.find(p => p.preselected) ?? billing.products[0];
    if (pre !== undefined) setChosen(pre.id);
  }, [billing.products, chosen]);

  const say = (outcome: PurchaseOutcome, restoring: boolean) => {
    const line = toastFor(outcome, restoring);
    if (line !== null) toast.show(line);
  };

  /* NO STORE AT ALL: say so, say what happens when there is one, and render no control. A
     disabled Subscribe button is a worse answer than an honest sentence. */
  if (!billing.canSell) {
    return (
      <Card testID={`${testID}.nostore`}>
        <View style={{ gap: t.space.sm }}>
          <BodyStrong>{BILLING.noStoreTitle}</BodyStrong>
          <BodySm ink="text2">{BILLING.noStoreBody}</BodySm>
        </View>
      </Card>
    );
  }

  return (
    <View style={{ gap: t.space.md }} testID={testID}>
      {billing.figuresAreTargets ? (
        <BodySm ink="text2" testID={`${testID}.targets`}>
          {BILLING.targetsNote}
        </BodySm>
      ) : null}

      {/* what one subscription covers, before the choices (see the header) */}
      <BodySm ink="text2" testID={`${testID}.household`}>
        {BILLING.household}
      </BodySm>

      <BodyStrong>{BILLING.choose}</BodyStrong>
      <View accessibilityRole="radiogroup" style={{ gap: t.space.sm }}>
        {billing.products.map(p => (
          <ProductChoice
            key={p.id}
            product={p}
            saving={saving !== null && saving.annualId === p.id ? saving : null}
            selected={chosen === p.id}
            onPress={() => setChosen(p.id)}
          />
        ))}
      </View>

      <Button
        label={billing.busy ? BILLING.subscribing : BILLING.subscribe}
        size="lg"
        onPress={() => {
          if (chosen === null) return;
          void billing.purchase(chosen).then(o => say(o, false));
        }}
        disabled={billing.busy || chosen === null}
        testID={`${testID}.subscribe`}
      />

      {/* Both stores require a restore control wherever a subscription is sold, and a parent on
          a new phone needs it whether or not a store requires it. */}
      <Button
        label={billing.busy ? BILLING.restoring : BILLING.restore}
        variant="secondary"
        onPress={() => void billing.restore().then(o => say(o, true))}
        disabled={billing.busy}
        testID={`${testID}.restore`}
      />

      <PurchaseTerms testID={testID} />

      <ManageRow testID={testID} />
    </View>
  );
}

/**
 * The renewal facts and the two documents, right under the buttons that buy (3.1.2). Quiet: the
 * meta size in the secondary ink, and links in the accent-2 ink that clears 4.5:1 on every ground.
 * Each link reaches the 44 pt target through its hit slop, as Today's text links do.
 */
function PurchaseTerms({ testID }: { testID: string }) {
  const t = useTheme();
  const slop = Math.ceil((t.hit.min - t.type.bodySm.lineHeight) / 2);
  const link = (label: string, url: string, id: string) => (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => void Linking.openURL(url)}
      hitSlop={slop}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      testID={id}
    >
      <BodySm ink="accent2">{label}</BodySm>
    </Pressable>
  );
  return (
    <View style={{ gap: t.space.xs }} testID={`${testID}.terms_line`}>
      <BodySm ink="text2" testID={`${testID}.renewal`}>
        {BILLING.renewal}
      </BodySm>
      <View style={[styles.links, { columnGap: t.space.xl, rowGap: t.space.xs }]}>
        {link(BILLING.terms, BRAND.termsUrl, `${testID}.terms`)}
        {link(BILLING.privacy, BRAND.privacyPolicyUrl, `${testID}.privacy`)}
      </View>
    </View>
  );
}

/**
 * Cancellation is never obstructed (rule 14), so this is one tap to the platform's own
 * subscription screen and nothing else. It is absent rather than dead when there is nowhere to
 * send anybody.
 */
export function ManageRow({ testID = 'billing' }: { testID?: string }) {
  const billing = useBilling();
  const url = billing.manageUrl();
  if (url === null) return null;
  return (
    <View style={{ gap: 4 }}>
      <Button
        label={BILLING.manage}
        variant="secondary"
        onPress={() => void Linking.openURL(url)}
        testID={`${testID}.manage`}
      />
      <BodySm ink="text2">{BILLING.manageNote}</BodySm>
    </View>
  );
}

const styles = StyleSheet.create({
  choice: { minHeight: 44 },
  choiceHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  figures: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', flexShrink: 1 },
  struck: { textDecorationLine: 'line-through' },
  links: { flexDirection: 'row', flexWrap: 'wrap' },
});
