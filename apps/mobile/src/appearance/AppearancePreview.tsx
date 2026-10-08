/**
 * The Appearance sheet's live preview (docs/DESIGN_SYSTEM.md §17.2; PRODUCT_SPEC Addendum
 * L4): the surface that makes the change also shows it. Built from the REAL components — the
 * top bar, the Quick row and the tab bar — reading the same tokens through the same provider, so
 * it cannot drift from the app: a treatment that reaches the app reaches the preview by
 * construction, and a token swap re-renders it with nothing to call.
 *
 * Choices that are not obvious:
 *  - It is SMALL, and it is scaled with a transform rather than with overridden sizes. §17.2
 *    rule 4 forbids the transform on the web because it breaks `position: sticky`; React Native
 *    has no sticky at all — the BottomSheet's `header` slot pins it by layout — so the objection
 *    does not apply, and a transform keeps every size inside the preview the component's own.
 *    The content lays out at `inner / SCALE` wide and is scaled from the top-left corner to fill
 *    the preview exactly; the wrapper takes its height from the content's onLayout × SCALE so
 *    the sheet's body starts right under it.
 *  - IT IS THE CHROME AND THE QUICK ROW, AND NOTHING ELSE. It used to carry a NEXT card too,
 *    and between that and a larger scale it stood so tall that the controls it exists to serve
 *    were a squint below it (the owner, 2026-09-17: "the UI view display example is too high,
 *    making the setting to be very small, need to shorten it"). The card was also the one block
 *    that showed nothing new: a Quick tile already carries the card radius, the surface, the
 *    accent and the shadow, which is the whole of what an appearance choice changes. Pinned
 *    above a scrolling list, every point it costs is a point the list does not get — so the
 *    preview shows the top bar, the household's own Quick row and the tab bar, at `PREVIEW_SCALE`,
 *    and `preview-height.test.ts` holds the budget.
 *  - It is INERT. `pointerEvents="none"` on the outer view, and the whole thing is one
 *    accessibility element named "Preview of the current look" with its descendants hidden,
 *    so no tile, tab or avatar inside it is ever announced or reachable as a control (§17.2
 *    rule 3, MOBILE.md §9).
 *  - The mini app sits on the theme's `paper` ground inside the `surface2` frame — the one
 *    every Screen paints (Screen.tsx `page`) — so the cards and the bar are previewed on the
 *    ground they really sit on. It was `app`, the scheme-tinted lit ground, until 2026-09-21:
 *    the preview tinted its page with the chosen color while no screen did (the owner: "we
 *    change the background to static color (not selected theme-dependent) make sure this is
 *    fixed"). The scheme is for what you tap; the page is one color per theme.
 *  - The Quick row is the HOUSEHOLD's shape (that is the point of previewing it). Cards show
 *    three and never scroll; the wrapping shapes show four.
 *  - The mark's name and monogram come from brand.json through the app, as the real bar's do
 *    (BRANDING.md §2b) — this file is on the placement allow-list for exactly that.
 */
import { BRAND } from '@nibblecue/brand';
import { MODULE_BY_ID, MODULES, quickRow } from '@nibblecue/core';
import {
  initialOf,
  Label,
  Meta,
  MODULE_ICON,
  QuickRow,
  TAB_BAR_INSET,
  TAB_LABELS,
  TabBar,
  TopBar,
  useTheme,
  type IconName,
  type QuickActionProps,
  type TabItem,
} from '@nibblecue/ui';
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { MARK_SOURCE } from '../brand/assets';
import { useChild } from '../household/ChildContext';
import { useMemberPictures } from '../household/MemberPictures';
import { useAppearance } from './AppearanceProvider';
import { appearanceSummary } from './options';

export interface AppearancePreviewProps {
  /** The preview's outer width: the sheet's inner width. */
  width: number;
}

/**
 * How far down the mini app is scaled. Smaller is shorter — the displayed height is the
 * content's natural height times this — and it is the one number to move if the preview ever
 * crowds the controls again.
 */
export const PREVIEW_SCALE = 0.44;

/** Sample "time since" labels; the preview is a picture, not the household's log. */
const SINCE = ['2h 10m', '40m', '1h 05m', '25m'] as const;

// the bar's own glyphs (the owner's set, 2026-09-23), so the preview's bar is the real one's
const TABS: TabItem[] = [
  {
    key: 'today',
    label: TAB_LABELS.today,
    icon: 'tab-home-regular',
    activeIcon: 'tab-home-active',
  },
  {
    key: 'plan',
    label: TAB_LABELS.plan,
    icon: 'tab-schedule-regular',
    activeIcon: 'tab-schedule-active',
  },
  { key: 'foods', label: TAB_LABELS.foods, icon: 'solids' },
  { key: 'more', label: TAB_LABELS.more, icon: 'tab-more-regular', activeIcon: 'tab-more-active' },
];

const noop = () => undefined;

const appearanceIconFor = (theme: 'light' | 'dark' | 'night'): IconName =>
  theme === 'night' ? 'sleep' : theme === 'dark' ? 'moon' : 'sun';

export function AppearancePreview({ width }: AppearancePreviewProps) {
  const t = useTheme();
  const { resolved } = useAppearance();
  const { account } = useAuth();
  const { chipName, chipAge, isAll, children } = useChild();
  const [contentHeight, setContentHeight] = useState(0);

  const inner = Math.max(0, width - 2 * t.space.lg);
  const layoutWidth = Math.round(inner / PREVIEW_SCALE);

  const household = account?.memberships[0];
  const enabled = (account?.modules ?? [])
    .filter(m => m.household_id === household?.household_id && m.enabled)
    .map(m => m.module_id);
  // before the household's module rows arrive, the registry defaults keep the row from being empty
  const source =
    enabled.length > 0 ? enabled : MODULES.filter(m => m.defaultEnabled).map(m => m.id);
  const ids = quickRow(source).slice(0, 4);
  const items: QuickActionProps[] = ids.map((id, i) => ({
    moduleId: id,
    label: MODULE_BY_ID[id].label,
    icon: MODULE_ICON[MODULE_BY_ID[id].icon] ?? 'note',
    onPress: noop,
    sinceLabel: SINCE[i % SINCE.length] ?? SINCE[0],
  }));

  const profileName = account?.profile?.display_name?.trim() || 'You';
  // the bar in the preview is the bar on every page: the person's own picture in it (0148)
  const { mine: myPicture } = useMemberPictures();
  const child =
    children.length > 0
      ? { name: chipName, ageLabel: chipAge, initial: initialOf(chipName), isBoth: isAll }
      : null;

  return (
    <View
      accessible
      accessibilityLabel="Preview of the current look"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.frame,
        {
          width,
          backgroundColor: t.color.surface2,
          borderColor: t.color.line,
          borderRadius: t.radius.xl,
          padding: t.space.md,
        },
      ]}
      testID="appearance.preview"
    >
      <View style={[styles.head, { marginBottom: t.space.xs }]}>
        <Label>Preview</Label>
        <Meta>{appearanceSummary(resolved)}</Meta>
      </View>
      <View
        style={[styles.window, { width: inner, height: Math.round(contentHeight * PREVIEW_SCALE) }]}
      >
        <View
          onLayout={(e: LayoutChangeEvent) => setContentHeight(e.nativeEvent.layout.height)}
          style={[
            styles.content,
            {
              width: layoutWidth,
              // PAPER, the ground the app really paints (Screen.tsx `page`), not the scheme-
              // tinted `app`: the preview showed a lavender page no screen has had since the
              // shopping brief, so picking a color seemed to tint the page (the owner, 2026-09-21)
              backgroundColor: t.color.paper,
              borderRadius: t.radius.l,
              paddingBottom: t.space.sm,
              transform: [{ scale: PREVIEW_SCALE }],
              transformOrigin: 'top left',
            },
          ]}
        >
          <TopBar
            child={child}
            onChildPress={noop}
            markLabel={BRAND.appDisplayName}
            markMonogram={BRAND.monogram}
            markSource={MARK_SOURCE}
            sync={{ state: 'ok' }}
            onAppearance={noop}
            appearanceIcon={appearanceIconFor(t.theme)}
            onNotifications={noop}
            avatar={{
              initial: initialOf(profileName),
              name: profileName,
              ...(myPicture !== null ? { photoUri: myPicture } : {}),
            }}
            onAccount={noop}
            width={layoutWidth}
            topInset={0}
          />
          {/*
            The Log-row preference is previewed, not only described (§17.2: the surface that makes
            the change shows it). Four tiles is exactly enough to tell the two apart at this scale
            — sliding, three fill the row and the fourth peeks; wrapping, the fourth starts a
            second row — so the preview visibly changes shape as the switch is tapped. It costs no
            height at the default, which is off and is what the preview already drew.
          */}
          <View style={{ paddingHorizontal: t.space.xxl }}>
            <QuickRow items={items} scroll={resolved.logSlider} />
          </View>
          <TabBar
            tabs={TABS}
            currentKey="today"
            onPress={noop}
            onQuickLog={noop}
            bottomInset={0}
            width={layoutWidth}
            // static inside the preview: the bar floats absolutely everywhere else
            style={{
              position: 'relative',
              left: 0,
              right: 0,
              bottom: 0,
              marginTop: t.space.md,
              marginHorizontal: TAB_BAR_INSET,
            }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderWidth: 1, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  window: { overflow: 'hidden' },
  content: { position: 'absolute', top: 0, left: 0 },
});
