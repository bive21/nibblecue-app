/**
 * Plan (docs/PRICING.md §6 "The Plan row in the account menu, always available, never a nag";
 * docs/AUTH_AND_TRIAL.md §3, §4; docs/BRANDING.md §2): what the household's plan is right now,
 * what the tier adds and what every plan keeps — both lists from the matrix through
 * `planLists`, drawn by `PlanLists`, the component the gate sheet draws them with too, so they
 * cannot drift and carry no em dash: two cards of short names, each name's whole sentence its
 * spoken label (the owner, 2026-09-27: *"very crowded with text"*). The status card's
 * words come from `planStatusCopy` (plan/gate.ts), written per state: the 14-day preview is no
 * card and nothing to cancel; a store trial or a subscription canceled at the store counts
 * down and is never told it "renews"; a billing retry is named as one; only a subscription
 * that will renew is told so (CLAUDE.md rule 14). No status name is ever rendered
 * (DESIGN_SYSTEM.md §21); every number goes through <Numeric>.
 *
 * SUBSCRIBING COMES FIRST, right under the status card, in `SubscribePanel`, which the paywall
 * sheet renders too so the two surfaces cannot drift. It sat at the bottom, on the reading that a
 * parent who walks here is checking what they have rather than shopping; the owner put it on top
 * (2026-09-27: *"the choose a plan should be on the very top after 'x days of cuddlecue plus
 * left'"*) — the days left and the way to keep Plus now read as one thought. No price is written here or there: every figure arrives from
 * the billing provider already formatted, and when that provider is the mock the panel says on
 * the screen that the figures are targets rather than an offer.
 *
 * AND RIGHT UNDER IT, ONE QUIET LINE: "Have a code?" (the owner, 2026-09-26: *"redeem code shouldnt
 * be here [More], it should be in profile picture clicked -> plan"*; and on 2026-09-27, moving it
 * up from the foot of the page: *"bring have a code under the plus subscription (so it's at the
 * beginning of the page instead of last)"* — a code is a way onto Plus, so it sits with the ways
 * onto Plus, above the two lists). Closed it is a single line a parent without a code reads past;
 * opened, the code field is right there under it (`RedeemPanel`, the store hand-over the More
 * page's row used to open), and the page scrolls the line to the top, because on a small phone the
 * offer above can leave the field opening below the fold — a tap that seems to do nothing. It is
 * still after "Manage or cancel", never before it: the way out of a subscription is not pushed down
 * by a way in (CLAUDE.md rule 14).
 *
 * ON THE FREE PLAN THE STATUS CARD SAYS HOW MUCH IS KEPT (2026-09-28): "Your household has logged
 * 1,234 entries since Sep 14. The app shows the last 7 days, and every entry is in your download."
 * The count and the first day are the household's own, read from this phone's copy of the log; the
 * seven is the matrix's (`limitFor`), never typed; and the download is one tap under the sentence,
 * because the free download is never harder to find than the paid one (the bill of rights). It is
 * drawn only while the free plan's window is in force, so never on Plus.
 *
 * AND ONLY THE PEOPLE WHO DECIDE ARE OFFERED ANYTHING HERE (the owner, 2026-09-28, of "hide the
 * plans from caregivers on the Plan page, keeping Manage or cancel for anyone who subscribed":
 * yes). The plan is bought for the household by the owner or a parent (`usePlan().decides`). A
 * caregiver or a view-only seat reads the same status card and the same two lists, then the gate
 * sheet's own line, "{tier} is chosen by a parent in your household.", with no plan choices,
 * no Restore and no code field. *Manage or cancel* stays under that line: it only opens the
 * store's own subscriptions page, so whoever subscribed from this phone's store account can still
 * manage or cancel it there, whatever their seat is now (CLAUDE.md rule 14: cancellation is never
 * obstructed).
 */
import { IN_APP_STRINGS } from '@nibblecue/brand';
import { Body, BodySm, Button, Card, Disclosure, H2, Numeric, useTheme } from '@nibblecue/ui';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRef, useState } from 'react';
import { type ScrollView, View } from 'react-native';
import { Screen } from '../../app/Screen';
import type { RootParams } from '../../app/types';
import { useAuth } from '../../auth/AuthContext';
import { REDEEM } from '../../billing/copy';
import { ManageRow, SubscribePanel } from '../../billing/SubscribePanel';
import { keys } from '../../data/store';
import { useLocalQuery } from '../../data/useLocalQuery';
import { freeKeptLine, gateNotYours, planLists, planStatusCopy, sinceLabel } from '../../plan/gate';
import { PlanLists } from '../../plan/PlanLists';
import { NOT_ON_THIS_PLATFORM, WORDED_ON_THIS_PLATFORM } from '../../plan/platform';
import { usePlan } from '../../plan/PlanProvider';
import { EXPECTING } from '../../expecting/copy';
import { RedeemPanel } from './RedeemPanel';

export function PlanScreen() {
  const t = useTheme();
  const plan = usePlan();
  const plusName = IN_APP_STRINGS.paywallTitle;
  const { plus, free } = planLists(NOT_ON_THIS_PLATFORM, WORDED_ON_THIS_PLATFORM);
  const status = planStatusCopy(plan, plusName);
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const { account } = useAuth();
  const householdId = account?.memberships[0]?.household_id ?? null;
  // set up before the birth with the 14 days still owed: they start the day the baby arrives
  // (migration 0150), and the free plan's card says so rather than leaving them unmentioned
  const waits = account?.memberships[0]?.welcome_waits_for_birth === true;
  /*
    HOW MUCH THE FREE PLAN KEEPS (see the header): the free window's days, null on any plan without
    one, and the household's count and first day, read only while there is a window to set them by.
  */
  const freeDays = plan.limitFor('history');
  const kept = useLocalQuery<{ n: number; first: string | null } | null>(
    freeDays !== null && householdId !== null ? [keys.household(householdId)] : ['plan/kept/idle'],
    async db => {
      if (freeDays === null || householdId === null) return null;
      const row = await db.get<{ n: number; first: string | null }>(
        `select count(*) as n, min(start_at) as first from activities
          where household_id = ? and deleted_at is null`,
        [householdId],
      );
      return row ? { n: Number(row.n), first: row.first } : null;
    },
    null,
  );
  const keptLine =
    freeDays !== null && kept !== null && kept.first !== null
      ? freeKeptLine(kept.n, sinceLabel(Date.parse(kept.first), Date.now()), freeDays)
      : null;
  const scroller = useRef<ScrollView | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  // set by the tap that opens the code field, spent by the first layout that has it in it: the
  // scroll waits for the field to exist, or it would stop short of it
  const revealCode = useRef(false);
  // where the code line starts in the page, so opening it can bring it up to the top
  const codeAt = useRef(0);

  return (
    <Screen
      title="Plan"
      testID="plan"
      scrollRef={scroller}
      onContentSizeChange={() => {
        if (!revealCode.current) return;
        revealCode.current = false;
        scroller.current?.scrollTo({
          y: Math.max(0, codeAt.current - t.space.lg),
          animated: !t.reduceMotion,
        });
      }}
    >
      <Card testID={`plan.${status.kind}`}>
        <View style={{ gap: t.space.sm }}>
          <H2 testID={`plan.status.${status.kind}`}>
            {status.headingDays !== null ? (
              <Numeric variant="h2">{status.headingDays}</Numeric>
            ) : null}
            {status.heading}
          </H2>
          <Body testID="plan.status.body">
            {status.bodyDays !== null ? <Numeric variant="body">{status.bodyDays}</Numeric> : null}
            {status.body}
          </Body>
          {waits ? (
            <BodySm ink="text2" testID="plan.waits">
              {EXPECTING.planWaits}
            </BodySm>
          ) : null}
          {keptLine !== null ? (
            <>
              <BodySm ink="text2" testID="plan.kept">
                {keptLine}
              </BodySm>
              {/* the free download, one tap from the sentence that names it (see the header) */}
              <Button
                label="Download everything"
                icon="export"
                size="sm"
                variant="secondary"
                onPress={() => nav.navigate('Account')}
                style={{ alignSelf: 'flex-start' }}
                testID="plan.kept.download"
              />
            </>
          ) : null}
        </View>
      </Card>

      {plan.decides ? (
        <>
          {/* THE OFFER, straight under the days left (see the header). "Manage or cancel" is inside
              it, so moving it up never pushes the way out of a subscription down (CLAUDE.md rule 14). */}
          <View style={{ marginTop: t.space.lg }}>
            <SubscribePanel testID="plan.billing" />
          </View>

          {/* A CODE IS A WAY ONTO PLUS, so it sits with the offer — under it, and so still after
              "Manage or cancel" (see the header) — rather than at the foot of the page */}
          <View
            onLayout={e => {
              codeAt.current = e.nativeEvent.layout.y;
            }}
          >
            <Disclosure
              summary={REDEEM.have}
              open={codeOpen}
              onToggle={next => {
                revealCode.current = next;
                setCodeOpen(next);
              }}
              testID="plan.code"
            >
              <RedeemPanel />
            </Disclosure>
          </View>
        </>
      ) : (
        /* NOT THEIRS TO BUY (see the header): the gate sheet's own line, and the way out of a
           subscription for whoever made one from this phone */
        <View style={{ marginTop: t.space.lg }}>
          <Card testID="plan.not_yours">
            <View style={{ gap: t.space.md }}>
              <BodySm ink="text2" testID="plan.not_yours.line">
                {gateNotYours(plusName)}
              </BodySm>
              <ManageRow testID="plan.billing" />
            </View>
          </Card>
        </View>
      )}

      <PlanLists
        plus={plus}
        free={free}
        testIDs={{ plus: 'plan.adds', free: 'plan.keeps' }}
        style={{ marginTop: t.space.xl }}
      />
    </Screen>
  );
}
