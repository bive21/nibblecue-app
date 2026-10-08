/**
 * TabBar (docs/DESIGN_SYSTEM.md §13 "Tab labels" and rules 2–3, §23.1): THE bar. A floating pill
 * inset 12 from the edges and 10 above the safe area, on the chrome material (97% of the solid
 * surface behind a 24 blur in soft — chrome frosts harder than content, because it carries labels
 * over whatever scrolls beneath it), radius `xl` (30 in soft and glass; paper's 16 is intended,
 * paper is flat), 64 tall, with NO border: the pill floats, and the paper skin's border-top on a
 * bar is exactly the line a floating pill must not have. It owns its layer: absolutely positioned
 * above the scroller so content shows UNDER the bar, never through its labels.
 *
 * The cells share the row equally, at any count. The log button is a 48 circle in the brand
 * gradient that floats ABOVE the bar on its centre line, clear of it by 8 — not cut into it
 * (`tabLayout.ts` has the arithmetic and the reason). The accent glow lives under it (never in
 * night), on an OUTER circle that clips nothing — iOS clips a layer's own shadow the moment the
 * view is `overflow: hidden` — and the gradient is clipped to the circle by an inner view.
 * Color never animates (a theme switch spent 160ms in a color belonging to neither theme until
 * that rule existed): the pill and the inks change with a re-render.
 *
 * ONE THING MOVES WHEN THE TAB CHANGES, AND ONLY THEN: the new tab's icon gives ONE small HOP
 * (`tabMotion.ts` has the numbers). The dot is simply under the tab you are on — it slid from the
 * tab you left until the owner found the movement at both ends of the bar distracting (2026-09-26:
 * *"the vibration should be only to where the new menu page is clicked on"*). A transform only, on
 * the native driver. Nothing about the cells moves — their places, their labels, their targets,
 * their ids, and their tab role and selected state are exactly what they were, and the first-run
 * tour measures the same cells it always did. Under reduce motion and in the amber Night nothing
 * hops. The bar is never felt: no haptic, then or now.
 *
 * THE CURRENT CELL IS A SOFT ACCENT PILL, the prototype's own marker
 * (`.tabbar button[aria-current] { background: var(--accent-soft) }`), with the 5px dot still at
 * its foot. A patch of fill is a shape a person sees before they read a hue, which is the point
 * of §12's "never by color alone" — and it is what makes the bar read as designed rather than as
 * five glyphs in a box (the owner, 2026-09-16: "redesign this as this looks very bad").
 *
 * The current tab is `accent2` ink — `accent` measured 4.31:1 on this ground in the rose scheme,
 * and the same declaration paints the glyph — AND a 5px dot at its foot, because the reference
 * marks the current tab with the icon's color alone and that is 1.4.1 Use of Color. There is ONE
 * dot, drawn over the row and placed under the current cell (`tabDotLeft`), so that it can travel.
 * The row is padded vertically (the prototype's `padding: 9px 10px`), so the dot, 1px above the
 * cell's foot, lands inside the pill rather than on the curve of its rim, where a 5px marker on
 * a radius-30 edge would be half lost. The inactive GLYPH is `text3` (3:1 suffices for a glyph,
 * §12 rule 6); the inactive LABEL is `text2`, because a label is text a person taps (§12 rule 5)
 * and `text3` at 9px measured 3.62:1.
 *
 * The label policy (`t.tabs`: icons | focus | rounded) chooses the label and nothing else — the
 * shape, the raise and the dot are the bar's own. tabLayout.ts decides each label's size after the
 * chrome font-scale cap and the fit, so `allowFontScaling` is off on the label: the scale is
 * already in the number. The sprite has no 600 face loaded (§4 lists ExtraBold, Bold, Regular),
 * so the 600 of the spec renders in Bold and the 800 in ExtraBold — hierarchy is size and ink.
 * The label face is the UI face; the doc's `ui-rounded` is a web fallback that §19 later
 * withdrew: one face for words, and a skin (or a bar) may not introduce a third.
 */
import { Fragment, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/paths';
import { useTheme } from '../theme/ThemeProvider';
import type { Frame } from './dayNightSwitch';
import { Surface } from './Surface';
import { AppText } from './Text';
import {
  FAB_GAP,
  FAB_SIZE,
  TAB_BAR_INSET,
  TAB_BAR_PAD,
  TAB_BAR_PADDING,
  TAB_CELL_PAD,
  TAB_DOT,
  TAB_GLYPH,
  TAB_LABEL_GAP,
  TAB_BAR_BOTTOM,
  tabBarHeight,
  tabLayout,
  type TabWeight,
} from './tabLayout';
import { TAB_DOT_BOTTOM, TAB_HOP, TAB_HOP_FRAME, tabDotLeft, tabMove } from './tabMotion';
import { motionStill } from './tickDraw';
import type { TabLabelPolicy } from '../theme/appearance';

export { TAB_BAR_BOTTOM, tabBarHeight };
/**
 * A floating button takes room: the screen pads its foot by the bar's height for the policy, the
 * bar's offset, and the whole of the button standing above it, plus the safe area (§23.1).
 * Icons-only is 19 px shorter than a labelled bar (tabLayout.ts), so the page gets that back.
 *
 * ONLY TODAY CARRIES THE LOG BUTTON (navigation's `hideQuickLog`), so only Today pays for it. Every
 * other tab reserved 54 px for a button that was not there, and the end of the page stood that far
 * above the bar (the owner, 2026-10-06: "after CuddleCue footer, the gap is too high, make it closer
 * to the menu bar … same in all these other pages"). Without it the page ends `TAB_FOOT_GAP` above
 * the bar's top edge.
 */
export const TAB_FOOT_GAP = 12;
export const screenBottomPadding = (
  bottomInset: number,
  policy: TabLabelPolicy,
  logButton = true,
): number =>
  tabBarHeight(policy) +
  TAB_BAR_BOTTOM +
  (logButton ? FAB_GAP + FAB_SIZE + 2 : TAB_FOOT_GAP) +
  bottomInset;

/** Clear space between the log button's top and a screen's own floating action above it. */
export const FLOAT_GAP = 14;

/**
 * WHERE A SCREEN'S OWN FLOATING ACTION SITS, so that it and the log button are never the same
 * two inches of screen (the owner, 2026-09-19: "the + add supplies on the bottom right, is
 * clashing with the quick log + button from the menu").
 *
 * The shopping list's "Add supplies" pill was placed 20 above the bar, which is inside the log
 * button's own 44 + 8 — so on a phone the two overlapped and the pill's left edge ran under a
 * circle the same colour. This is the arithmetic in ONE place instead: the bar, its offset, the
 * safe area, and — unless the screen has hidden the log button (`overLogButton: false`, which
 * the stash does) — the whole of that button and a gap above it.
 */
export const floatingActionBottom = (
  bottomInset: number,
  policy: TabLabelPolicy,
  overLogButton = true,
): number =>
  tabBarHeight(policy) +
  TAB_BAR_BOTTOM +
  bottomInset +
  (overLogButton ? FAB_GAP + FAB_SIZE + FLOAT_GAP : 20);

const FAB_GLYPH = 22;

export interface TabItem<K extends string = string> {
  key: K;
  /** The visible label. EMPTY draws the glyph alone — the More cell, which is a chevron. */
  label: string;
  /** What assistive technology calls it, when the visible label is empty or abbreviated. */
  name?: string;
  icon: IconName;
  /**
   * The drawing for the tab you are on — the owner's set (2026-09-23) draws each destination
   * twice, the current one with a light fill of its own ink. The regular one when absent. It is
   * never the only mark: the pill, the ink and the dot still say which tab this is.
   */
  activeIcon?: IconName;
}

export interface TabBarProps<K extends string = string> {
  /** The five destinations, in order. */
  tabs: TabItem<K>[];
  currentKey: K;
  onPress: (key: K) => void;
  onQuickLog: () => void;
  /**
   * HIDE THE CENTRE BUTTON ON A SCREEN THAT HAS ITS OWN (docs/MILK_STASH.md §10 §7). The stash
   * carries a floating "Add milk" pill of its own, and two floating actions a thumb's width
   * apart is a screen where the parent has to read before tapping. Off by default: every other
   * tab keeps the log button exactly as it was, and the bar's LAYOUT is untouched either way —
   * the button stands above the cells and never divides them (`tabLayout.ts`).
   */
  hideQuickLog?: boolean;
  /** The bottom safe-area inset. */
  bottomInset: number;
  /** The window width. */
  width: number;
  style?: StyleProp<ViewStyle>;
  /**
   * A chance to wrap one cell, for a caller that needs to MEASURE it — the first-run tour points
   * at a tab and has to know where it is on the glass. The wrapper must take the cell's own
   * `flex: 1`, so `wrapperStyle` is handed back with it rather than left for the caller to guess.
   * Returning the cell unchanged is the default and costs nothing.
   */
  wrapCell?: (key: K, cell: ReactNode, wrapperStyle: ViewStyle) => ReactNode;
  /**
   * The same chance for the raised + button, which the first-run tour also points at: the
   * wrapper takes the button's place in the centred row and adds nothing to it. Returning the
   * button unchanged is the default.
   */
  wrapFab?: (fab: ReactNode) => ReactNode;
  testID?: string;
}

/** What a wrapper has to adopt so the row still divides evenly (`styles.cell`). */
const CELL_WRAPPER: ViewStyle = { flex: 1, minWidth: 0, alignSelf: 'stretch' };

/** The nearest LOADED face for each weight (§4): 800 is ExtraBold (h2), the rest Bold. */
const variantFor = (weight: TabWeight) => (weight === 800 ? 'h2' : 'bodyStrong');

// copies, because `interpolate` is typed for mutable arrays and the frames are frozen data
const drive = (v: Animated.Value, fr: Frame) =>
  v.interpolate({
    inputRange: [...fr.inputRange],
    outputRange: [...fr.outputRange],
    extrapolate: fr.extrapolate,
  });

export function TabBar<K extends string = string>({
  tabs,
  currentKey,
  onPress,
  onQuickLog,
  bottomInset,
  width,
  style,
  wrapCell,
  wrapFab,
  hideQuickLog,
  testID,
}: TabBarProps<K>) {
  const t = useTheme();
  const currentIndex = tabs.findIndex(tab => tab.key === currentKey);
  const layout = tabLayout(
    tabs.map(tab => tab.label),
    width,
    t.tabs,
    t.fontScale.chrome,
    currentIndex,
  );

  /*
    THE HOP (`tabMotion.ts`). One value, at rest between changes (1: the icon home), so the render
    in which the tab changes draws the new tab with its icon in its place, and the effect after it
    runs the hop 0 → 1. The dot is not animated at all: it is drawn under the tab you are on.
  */
  const still = motionStill(t.reduceMotion, t.theme);
  const dotLeft = currentIndex >= 0 ? tabDotLeft(currentIndex, layout.cellWidth) : null;
  const hop = useRef(new Animated.Value(1)).current;
  const shown = useRef<number | null>(null);

  useEffect(() => {
    if (currentIndex < 0) return undefined;
    const move = tabMove(shown.current, currentIndex, still);
    shown.current = currentIndex;
    if (!move.hop) {
      // the first render, the same tab again, or nothing may move: the icon is home
      hop.setValue(1);
      return undefined;
    }
    hop.setValue(0);
    // the hop carries its own shape in its frame: its clock runs straight
    const run = Animated.timing(hop, {
      toValue: 1,
      duration: TAB_HOP.ms,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [currentIndex, still, hop]);

  const motion = useMemo(
    () => ({ hop: { transform: [{ translateY: drive(hop, TAB_HOP_FRAME) }] } }),
    [hop],
  );
  const glow: ViewStyle = t.isNight
    ? {}
    : {
        shadowColor: t.color.accent,
        shadowOpacity: 0.55,
        shadowRadius: 13,
        shadowOffset: { width: 0, height: 10 },
        elevation: 6,
      };

  const fab = (
    <Pressable
      key="fab"
      accessibilityRole="button"
      accessibilityLabel="Quick log"
      onPress={onQuickLog}
      {...(testID ? { testID: `${testID}.fab` } : {})}
      style={({ pressed }) => [
        styles.fabHost,
        {
          width: FAB_SIZE,
          height: FAB_SIZE,
          borderRadius: t.radius.pill,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      {/* the glow's host: a solid circle with nothing clipped, so iOS draws its shadow */}
      <View
        style={[
          styles.fabGlow,
          { width: FAB_SIZE, height: FAB_SIZE, borderRadius: t.radius.pill },
          { backgroundColor: t.color.accent },
          glow,
        ]}
      >
        {/* the clip: the gradient and the glyph stay inside the circle */}
        <View style={[styles.fab, { borderRadius: t.radius.pill }]}>
          <LinearGradient
            colors={[...t.gradient.brand]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: t.radius.pill }]}
          />
          <Icon name="plus" size={FAB_GLYPH} color={t.onGradient} />
        </View>
      </View>
    </Pressable>
  );

  const pad = TAB_CELL_PAD[t.tabs];
  const cells = tabs.map((tab, i) => {
    const cell = layout.cells[i];
    const current = i === currentIndex;
    const ink = current ? t.color.accent2 : t.color.text2;
    const glyphInk = current ? t.color.accent2 : t.color.text3;
    // an empty label draws no line of type: the cell is its glyph, and the row keeps its height
    const labelled = cell !== undefined && cell.fontSize > 0 && tab.label !== '';
    const pressable = (
      <Pressable
        accessibilityRole="tab"
        accessibilityLabel={tab.name ?? tab.label}
        accessibilityState={{ selected: current }}
        onPress={() => onPress(tab.key)}
        {...(testID ? { testID: `${testID}.${tab.key}` } : {})}
        style={({ pressed }) => [
          styles.cell,
          {
            gap: TAB_LABEL_GAP,
            paddingTop: pad.top,
            paddingBottom: pad.bottom,
            borderRadius: t.radius.s,
            // the prototype's marker for the tab you are on: a patch of the soft accent behind
            // the whole cell, which is a shape before it is a hue
            ...(current ? { backgroundColor: t.color.accentSoft } : {}),
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        {/* the tab you are on hops as it becomes it; the box is the glyph's own, so nothing moves */}
        <Animated.View style={current ? motion.hop : null}>
          <Icon
            name={current && tab.activeIcon ? tab.activeIcon : tab.icon}
            size={TAB_GLYPH}
            color={glyphInk}
          />
        </Animated.View>
        {labelled ? (
          <AppText
            variant={variantFor(cell.weight)}
            color={ink}
            allowFontScaling={false}
            numberOfLines={1}
            style={{
              fontSize: cell.fontSize,
              lineHeight: Math.ceil(cell.fontSize * 1.15),
              letterSpacing: 0,
            }}
          >
            {tab.label}
          </AppText>
        ) : null}
      </Pressable>
    );
    return wrapCell ? (
      <Fragment key={tab.key}>{wrapCell(tab.key, pressable, CELL_WRAPPER)}</Fragment>
    ) : (
      <Fragment key={tab.key}>{pressable}</Fragment>
    );
  });
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.float,
        { left: TAB_BAR_INSET, right: TAB_BAR_INSET, bottom: TAB_BAR_BOTTOM + bottomInset },
        style,
      ]}
      {...(testID ? { testID } : {})}
    >
      {/* the log button stands ON THE BAR'S CENTRE LINE, above it. It is not a cell: a button in
          the row divides the bar in two, and two halves hold the same number of cells only at an
          even count — which is what made the glyphs unevenly spaced (tabLayout.ts). */}
      <View pointerEvents="box-none" style={[styles.fabRow, { marginBottom: FAB_GAP }]}>
        {hideQuickLog ? null : wrapFab ? wrapFab(fab) : fab}
      </View>
      <Surface
        kind="chrome"
        radius="xl"
        // a floating pill has no edge — the paper skin's border-top is the line it must not have
        style={{ borderWidth: 0 }}
      >
        <View
          accessibilityRole="tablist"
          style={[
            styles.row,
            {
              // icons-only is shorter: it carries no line of type (tabLayout.ts)
              height: tabBarHeight(t.tabs),
              paddingHorizontal: TAB_BAR_PADDING,
              // the prototype's 9px: the cells (and the dot at their foot) sit inside the pill
              paddingVertical: TAB_BAR_PAD,
            },
          ]}
        >
          {cells}
        </View>
        {dotLeft !== null ? (
          /* ONE dot for the bar, over the row, under the current cell: the Surface's inner box has
             no padding, so `left` and `bottom` here are measured from its edges and nowhere else */
          <View
            pointerEvents="none"
            style={[
              styles.dot,
              {
                left: dotLeft,
                bottom: TAB_DOT_BOTTOM,
                width: TAB_DOT,
                height: TAB_DOT,
                borderRadius: t.radius.pill,
                backgroundColor: t.color.accent2,
              },
            ]}
          />
        ) : null}
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  // above the scroller: content shows under the bar, never through its labels (§13 rule 3)
  float: { position: 'absolute', zIndex: 10, elevation: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // the glyph and the label sit at the TOP of the cell under its own padding, so the label's
  // foot is a known distance above the dot — centering left the two nearly touching
  cell: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'flex-start',
    position: 'relative',
  },
  dot: { position: 'absolute' },
  // the button's own line, centred over the bar and passing taps through everywhere else
  fabRow: { alignItems: 'center', justifyContent: 'center' },
  fabHost: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  fabGlow: { overflow: 'visible' },
  fab: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
