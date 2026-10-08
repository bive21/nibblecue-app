/**
 * The account popover (docs/DESIGN_SYSTEM.md §14; docs/AUTH_AND_TRIAL.md §5 "Sessions"): who is
 * signed in, then three rows — Account & privacy, Plan, Appearance. Everything here is about YOU:
 * your account, your plan, how the app looks to you.
 *
 * IN THAT ORDER SINCE 2026-10-01 (the owner: *"profile picture tab sorting, i think it should be
 * account & privacy on the top, then plan, then appearance"*). Appearance led from 2026-09-18, when it
 * moved here from the top bar; it is the one a household changes twice and then never again, so it
 * goes last, under the two rows that are about the account itself.
 *
 * FAMILY WAS HERE FOR TWO DAYS, under Appearance: it came in on 2026-09-27 (the owner: *"i was
 * thinking family should be in account profile (clicking icon profile picture) under appearance …
 * i want to keep more module clean"*) and went back to More on 2026-09-29, as the first row of its
 * Household group (the owner: *"now that we have more emptier, im thinking family in more suit it
 * better. but im open to either way"*; the lead chose More). Family is about the household — its
 * members, the invite codes, who is on, leaving a household nobody else is in — and More's first
 * group is named for exactly that. One door, so it is not here as well. The switcher planned for
 * this menu, a "Families" row for the households you belong to, is about you and is not this row.
 *
 * TWO ROWS LEFT ON 2026-09-26, each for a door the owner put somewhere else:
 *
 *   · ADD A CHILD went to the baby's name (the owner: *"profile page -> add a child; this
 *     shouldnt be here, it should be when clicking the baby's name and there is an option to add
 *     a child, remove it from the profile"*). The child chip at the top of every screen opens the
 *     switcher for one child as for three, and its last row is Add a child
 *     (`ChildSwitcherSheet.tsx`). A child is the baby's business, not the account's.
 *   · SIGN OUT went inside Account & privacy, as that page's last rows (the owner: *"logging out
 *     is not something user will do a lot, keep it inside this page instead"*). It is still two
 *     taps from the avatar, and one more to the sheet that says what it will do; "sign out
 *     everywhere" sits beside it there, as it always has.
 *
 * A row closes the popover first and navigates after its exit: the popover is a React Native
 * Modal, and iOS will not present a native page while the Modal is still leaving. The wait is
 * the popover's own duration plus a little slack, because the Modal unmounts at the very end of
 * that duration and the platform still has to finish dismissing it; with reduce motion the
 * popover unmounts at once, but that dismissal is just as asynchronous, so the slack alone stays
 * rather than navigating in the same tick. The Plan detail names the tier from the brand strings
 * — this file is on the placement test's allow-list for exactly that line — and never renders
 * the plan status as an enum (§21): WELCOME reads as the days left, PLUS as the tier, FREE as
 * "Free plan".
 */
import { IN_APP_STRINGS } from '@nibblecue/brand';
import type { PlanSnapshot } from '@nibblecue/core';
import {
  Label,
  Meta,
  POPOVER_DURATION_MS,
  Popover,
  Row,
  Rows,
  useTheme,
  type Anchor,
} from '@nibblecue/ui';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { HouseholdsList } from '../household/HouseholdsList';
import { planStatusCopy } from '../plan/gate';
import { usePlan } from '../plan/PlanProvider';
import { useShell } from './shell';
import type { RootParams } from './types';

export interface AccountPopoverProps {
  visible: boolean;
  anchor: Anchor | null;
  onClose: () => void;
}

/** The platform's share of a handover: what it needs after the popover's Modal has unmounted. */
const HANDOVER_SLACK_MS = 60;

/** "12 days of <tier> left" / "<tier>" / "Free plan": the plan page's own heading, so the two never disagree. */
function planDetail(plan: Pick<PlanSnapshot, 'status' | 'tier' | 'daysLeft'>): string {
  const copy = planStatusCopy(plan, IN_APP_STRINGS.paywallTitle);
  return copy.headingDays !== null ? `${copy.headingDays}${copy.heading}` : copy.heading;
}

export function AccountPopover({ visible, anchor, onClose }: AccountPopoverProps) {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const { account, session } = useAuth();
  const plan = usePlan();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const shell = useShell();

  const name = account?.profile?.display_name ?? '';
  const email = account?.profile?.email ?? session?.user.email ?? '';
  const go = (route: 'Account' | 'Plan') => {
    onClose();
    if (timer.current) clearTimeout(timer.current);
    const wait = t.reduceMotion ? HANDOVER_SLACK_MS : POPOVER_DURATION_MS + HANDOVER_SLACK_MS;
    timer.current = setTimeout(() => {
      timer.current = null;
      nav.navigate(route);
    }, wait);
  };

  return (
    <Popover
      visible={visible}
      anchor={anchor}
      onClose={onClose}
      accessibilityLabel="Account"
      testID="popover.account"
    >
      <View style={{ gap: t.space.lg }}>
        <View style={{ gap: t.space.xs }}>
          {name ? <Label ink="text">{name}</Label> : null}
          {email ? <Meta>{email}</Meta> : null}
        </View>
        {/* YOUR FAMILIES (0153): for an account in more than one, a tap shows another. About
            you — which families you are in — so it is here, above your account's own rows. The
            popover closes first, and the switch starts after its exit, as every row here does. */}
        <HouseholdsList
          testID="account.menu.families"
          beforeSwitch={() =>
            new Promise<void>(resolve => {
              onClose();
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(
                () => {
                  timer.current = null;
                  resolve();
                },
                t.reduceMotion ? HANDOVER_SLACK_MS : POPOVER_DURATION_MS + HANDOVER_SLACK_MS,
              );
            })
          }
        />
        <Rows>
          {/* NO FAMILY ROW (2026-09-29; this file's header): it is More's first Household row
              again, with the detail it carried here. */}
          <Row
            title="Account & privacy"
            icon="shield"
            onPress={() => go('Account')}
            testID="account.menu.account"
          />
          <Row
            title="Plan"
            icon="star"
            detail={planDetail(plan)}
            onPress={() => go('Plan')}
            testID="account.menu.plan"
          />
          {/*
            APPEARANCE LIVES HERE NOW (the owner, 2026-09-18: "move the theme setting that is
            located on the most top setting (next to notifications) to inside the profile, so
            users can access it by clicking either user profile, or from setting more").

            It was a third glyph in the top bar, on every screen, for something a household
            changes twice and then never again — while the two controls beside it (notifications,
            the account) are things you reach for. The bar is chrome and chrome should hold what
            is used, so appearance joins the two rows it belongs with and More keeps its own row,
            which is the second door the owner named.

            It opens the SHEET, not the popover it used to: a popover anchored to a row inside
            another popover has nothing sensible to point at, and the sheet is the surface with
            the live preview on it — which is the whole reason to open appearance at all.
          */}
          <Row
            title="Appearance"
            icon="sliders"
            detail="Theme, color, shape and design"
            onPress={() => {
              onClose();
              shell.openAppearanceSheet();
            }}
            testID="account.menu.appearance"
          />
        </Rows>
      </View>
    </Popover>
  );
}
