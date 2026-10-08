/**
 * The tab bar's contents: CuddleCue's bar (`packages/ui` TabBar, the raised + drawn by the bar
 * itself, dead centre) with NibbleCue's five destinations, **Today · Plan · Foods · Shopping ·
 * More** (docs/PRODUCT.md). Shopping keeps its cell, as the CuddleCue owner asked of that app
 * (2026-09-16: "I don't want shopping hidden in More"), and because it is the same list.
 *
 * Pure and tested in node; the labels are typed against the design system's `TAB_LABELS` with a
 * type-only import, so a label that drifts fails `tsc`.
 */
import type { TAB_BAR_MAX_CELLS, IconName, TabItem, TabKey, TAB_LABELS } from '@nibblecue/ui';
import type { TabParams } from './types';

const MAX_CELLS: typeof TAB_BAR_MAX_CELLS = 6;

const LABELS: typeof TAB_LABELS = {
  today: 'Today',
  plan: 'Plan',
  foods: 'Foods',
  shopping: 'Shopping',
  more: 'More',
};

/** The owner's CuddleCue glyphs where one fits; Foods wears the solids module's own. */
export const TAB_ICONS: Record<TabKey, IconName> = {
  today: 'tab-home-regular',
  plan: 'tab-schedule-regular',
  foods: 'solids',
  shopping: 'tab-shopping-regular',
  more: 'tab-more-regular',
};

export const TAB_ACTIVE_ICONS: Record<TabKey, IconName> = {
  today: 'tab-home-active',
  plan: 'tab-schedule-active',
  foods: 'solids',
  shopping: 'tab-shopping-active',
  more: 'tab-more-active',
};

export type TabRouteKey = TabKey;

/** Bar order. The navigator's own `<Tabs.Screen>` list is kept in step with it. */
export const TAB_ORDER: readonly TabRouteKey[] = ['today', 'plan', 'foods', 'shopping', 'more'];

/** Each destination's route name in the tab navigator. */
export const TAB_ROUTE: Record<TabRouteKey, keyof TabParams> = {
  today: 'Today',
  plan: 'PlanTab',
  foods: 'Foods',
  shopping: 'Shopping',
  more: 'More',
};

/** The tab behind a navigator route name; null for a name that is not a tab. */
export function tabKeyOf(routeName: string): TabRouteKey | null {
  const keys = Object.keys(TAB_ROUTE) as TabRouteKey[];
  return keys.find(k => TAB_ROUTE[k] === routeName) ?? null;
}

/** The bar's items, in order, never more than the bar can draw. */
export function tabItems(): TabItem<TabRouteKey>[] {
  return TAB_ORDER.slice(0, MAX_CELLS).map(key => ({
    key,
    label: LABELS[key],
    name: LABELS[key],
    icon: TAB_ICONS[key],
    activeIcon: TAB_ACTIVE_ICONS[key],
  }));
}
