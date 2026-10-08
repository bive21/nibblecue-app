/**
 * ModuleCard + ModuleCardGrid — a module you track, as a card that is its own switch (the owner,
 * 2026-09-26, of More → What you track: *"add the icons to the first 4 modules too … they can be in
 * card tyle for each category, where the border lights up a little in theme color if it's selected.
 * make it look nicer"*). `moduleCard.ts` holds every number and every color and says why.
 *
 * THE CARD: the module's own picture in its disc — Today's pebble tile's, at Today's size, so the
 * module looks the same on both screens — its name under it, and its state in the corner. ON, the
 * edge lights up in the household's accent with a faint wash of it over the card and a soft glow
 * outside it, and a check draws itself in the corner (`TickMark`); OFF, the card is the plain
 * surface with an empty ring there. Edge, fill and glyph all say it, so nothing is said by color
 * alone.
 *
 * THE LIT EDGE AND THE WASH ARE ONE LAYER OVER THE CARD, not a child inside it. A Surface lays its
 * children out in a content view that is only as tall as they are (`surfacePadding.ts`), so a
 * layer in there stops short of the foot of a card the grid has stretched to its neighbor's
 * height. Over the card, in the pressable that is exactly the card's box, it always meets every
 * edge — and a wash of 8% over the words is measured through, not guessed at (`moduleCard.test.ts`).
 *
 * THE WHOLE CARD IS THE SWITCH, as a switch row's whole row is (`Row`): one target (the card, far
 * over 44 pt either way), one focus stop, `role="switch"` with the module's name and its checked
 * state, felt as a `tap` as it flips. Its id is the caller's plus `.switch`, inside a wrapper that
 * carries the plain id — the convention the switch rows set, so a flow or a test that knew the row
 * knows the card.
 *
 * THE PICTURE WAKES UP when the module is switched on (`WakingIcon`: the bottle pours, the moon
 * sways, the diaper hops), once, never on mount. REDUCE MOTION and the amber NIGHT play nothing —
 * the wake, the check's draw — and Night has no glow: the edge and the check still say it.
 *
 * THE GRID lays the cards two to a row and stretches each row to its taller card, so a row's two
 * cards are one height; a card alone on its row — an odd last one — spans it and lays out across
 * it (`wide`). It goes to one a row, every card laid out across, when a name's longest word would
 * not fit half the width at the reader's text size, and it measures its own width to decide
 * (`moduleCardColumns`), guessing the first frame from the window as `StatTable` does.
 *
 * COMPACT (2026-09-30, More → What you track; `MODULE_CARD_COMPACT` has the owner's words): the
 * same switch as a 64 pt line — the picture small at the start with the check badge on its corner,
 * the name beside it, a thin edge and a faint wash when on, the picture faded when off, no glow.
 * The ids, the role, the label, the haptic, the waking picture and the note are the full card's,
 * word for word; only the drawing is smaller. A page with several grids hands each the names of
 * all of them (`fitTitles`), so they go to one across together and the page stays lined up.
 */
import type { ModuleId } from '@nibblecue/core';
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { haptic } from '../feedback/haptics';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/paths';
import { composite } from '../theme/contrast';
import { useCategory, useTheme } from '../theme/ThemeProvider';
import {
  CARD_GLOW_BLUR,
  MODULE_CARD,
  MODULE_CARD_COMPACT,
  MODULE_CARD_COMPACT_MIN_HEIGHT,
  MODULE_CARD_MIN_HEIGHT,
  MODULE_CARD_WIDE_MIN_HEIGHT,
  moduleCardColumns,
  moduleCardCompactPaint,
  moduleCardPaint,
  moduleCardRows,
} from './moduleCard';
import { Surface } from './Surface';
import { BodySm, BodyStrong } from './Text';
import { TickMark } from './TickMark';
import { WakingIcon } from './WakingIcon';

export interface ModuleCardProps {
  /** The module's name, in the household's word ("Playtime" once tummy time has graduated). */
  title: string;
  /** The module whose disc, hue and wake-up move the card wears. */
  module: ModuleId;
  /** The picture: the module's own (`MODULE_ICON`), drawn as Today draws it. */
  icon: IconName;
  on: boolean;
  /** Called with the value the card is switching TO. */
  onChange: (on: boolean) => void;
  /** A line under the name — What you track's "No entries in the last 14 days". */
  note?: string;
  disabled?: boolean;
  /** Across its row: the picture, the name and the mark in one line (a card that spans a row). */
  wide?: boolean;
  /**
   * The 64 pt line (`MODULE_CARD_COMPACT`): the picture small at the start with the check badge on
   * its corner and the name beside it, the picture faded when off. Always laid out across, so
   * `wide` changes nothing on it.
   */
  compact?: boolean;
  /** Spoken instead of the name and the note. */
  accessibilityLabel?: string;
  /** The wrapper's id; the card itself — the switch — is `${testID}.switch`. */
  testID?: string;
}

export function ModuleCard({
  title,
  module,
  icon,
  on,
  onChange,
  note,
  disabled = false,
  wide = false,
  compact = false,
  accessibilityLabel,
  testID,
}: ModuleCardProps) {
  const t = useTheme();
  const cat = useCategory(module);
  const paint = moduleCardPaint(t.color, on, t.theme, t.skinTokens.surface.shadow !== 'none');
  const small = moduleCardCompactPaint(t.color, on);
  // THE LIT EDGE, ITS WASH AND THE GLOW: the full card's 1.5 pt accent edge and its glow, or the
  // compact card's thin, softer line and no glow at all (`moduleCardCompactPaint` says why)
  const edge = compact ? small.edge : paint.edge;
  const wash = compact ? small.wash : paint.wash;
  const edgeWidth = compact ? MODULE_CARD_COMPACT.edge : MODULE_CARD.edge;
  const glow = compact ? null : paint.glow;
  const r = compact ? t.radius.m : t.radius.l;
  const disc = cat.disc ?? composite(cat.soft, cat.fg, 0.2);
  const flip = () => {
    onChange(!on);
    haptic('tap');
  };
  const words = (
    <View style={[wide || compact ? styles.wideWords : styles.words, { gap: t.space.xs }]}>
      {/* never cut short: a name or a note that needs another line takes one, and the grid
          keeps the row's two cards one height */}
      <BodyStrong>{title}</BodyStrong>
      {note ? <BodySm>{note}</BodySm> : null}
    </View>
  );
  const mark = (
    <View
      style={[
        styles.mark,
        {
          width: MODULE_CARD.mark,
          height: MODULE_CARD.mark,
          borderRadius: MODULE_CARD.mark / 2,
          borderWidth: MODULE_CARD.markRing,
          borderColor: paint.markRing,
          backgroundColor: paint.markFill ?? 'transparent',
        },
      ]}
    >
      <TickMark
        checked={on}
        size={MODULE_CARD.markGlyph}
        color={paint.check}
        ring={MODULE_CARD.mark / 2}
      />
    </View>
  );
  const card = compact ? (
    <Surface
      radius="m"
      style={[
        styles.card,
        styles.middle,
        {
          minHeight: MODULE_CARD_COMPACT_MIN_HEIGHT,
          paddingVertical: MODULE_CARD_COMPACT.padV,
          paddingLeft: MODULE_CARD_COMPACT.padStart,
          paddingRight: MODULE_CARD_COMPACT.padEnd,
        },
      ]}
    >
      <View style={[styles.top, { gap: MODULE_CARD_COMPACT.gap }]}>
        {/* the picture, faded while the module is off, and the check badge on its corner — a
            sibling of the disc, so the picture's own move never carries the badge with it */}
        <View style={{ width: MODULE_CARD_COMPACT.disc, height: MODULE_CARD_COMPACT.disc }}>
          <View
            style={[
              styles.disc,
              {
                width: MODULE_CARD_COMPACT.disc,
                height: MODULE_CARD_COMPACT.disc,
                borderRadius: MODULE_CARD_COMPACT.disc / 2,
                backgroundColor: disc,
                opacity: small.picture,
              },
            ]}
          >
            <WakingIcon module={module} on={on} size={MODULE_CARD_COMPACT.picture}>
              <Icon name={icon} size={MODULE_CARD_COMPACT.picture} color={cat.fg} />
            </WakingIcon>
          </View>
          <View
            style={[
              styles.badge,
              {
                width: MODULE_CARD_COMPACT.badge,
                height: MODULE_CARD_COMPACT.badge,
                borderRadius: MODULE_CARD_COMPACT.badge / 2,
                right: -MODULE_CARD_COMPACT.badgeOut,
                bottom: -MODULE_CARD_COMPACT.badgeOut,
                borderWidth: MODULE_CARD_COMPACT.badgeRing,
                // drawn only while the card is on: off, nothing sits on the picture's corner
                borderColor: on ? small.badgeRing : 'transparent',
                backgroundColor: on ? small.badgeFill : 'transparent',
              },
            ]}
          >
            <TickMark
              checked={on}
              size={MODULE_CARD_COMPACT.badgeGlyph}
              color={small.check}
              ring={MODULE_CARD_COMPACT.badge / 2}
            />
          </View>
        </View>
        {words}
      </View>
    </Surface>
  ) : (
    <Surface
      radius="l"
      style={[
        styles.card,
        {
          minHeight: wide ? MODULE_CARD_WIDE_MIN_HEIGHT : MODULE_CARD_MIN_HEIGHT,
          padding: MODULE_CARD.pad,
        },
      ]}
    >
      {/* the padding lays out the content view; the gap has to be on a view inside it */}
      <View style={{ gap: MODULE_CARD.gap }}>
        <View style={[styles.top, { gap: t.space.lg }]}>
          <View
            style={[
              styles.disc,
              {
                width: MODULE_CARD.disc,
                height: MODULE_CARD.disc,
                borderRadius: MODULE_CARD.disc / 2,
                backgroundColor: disc,
              },
            ]}
          >
            <WakingIcon module={module} on={on} size={MODULE_CARD.picture}>
              <Icon name={icon} size={MODULE_CARD.picture} color={cat.fg} />
            </WakingIcon>
          </View>
          {wide ? words : <View style={styles.grow} />}
          {mark}
        </View>
        {wide ? null : words}
      </View>
    </Surface>
  );
  return (
    <View
      style={[
        styles.fill,
        { borderRadius: r },
        glow
          ? {
              boxShadow: [
                {
                  offsetX: 0,
                  offsetY: 0,
                  blurRadius: CARD_GLOW_BLUR,
                  spreadDistance: 0,
                  color: glow,
                },
              ],
            }
          : null,
      ]}
      {...(testID ? { testID } : {})}
    >
      <Pressable
        accessible
        accessibilityRole="switch"
        accessibilityLabel={accessibilityLabel ?? (note ? `${title}, ${note}` : title)}
        accessibilityState={{ checked: on, disabled }}
        disabled={disabled}
        onPress={flip}
        style={({ pressed }) => [styles.fill, { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}
        {...(testID ? { testID: `${testID}.switch` } : {})}
      >
        {card}
        {/* THE LIT EDGE AND ITS WASH, over the whole card's box (the header says why) */}
        {edge ? (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: r,
                borderWidth: edgeWidth,
                borderColor: edge,
                backgroundColor: wash ?? 'transparent',
              },
            ]}
          />
        ) : null}
      </Pressable>
    </View>
  );
}

/** One card of a grid: a card's props and the key the grid lists it under. */
export interface ModuleCardSpec extends Omit<ModuleCardProps, 'wide' | 'compact'> {
  key: string;
}

export interface ModuleCardGridProps {
  cards: readonly ModuleCardSpec[];
  /** Every card the compact 64 pt line (`ModuleCard compact`). */
  compact?: boolean;
  /**
   * THE NAMES THE COLUMNS ARE DECIDED BY, when a page draws several grids: all of the page's, so
   * every grid goes to one across at the same text size and the page stays lined up (What you
   * track's five). Without it, the grid's own names.
   */
  fitTitles?: readonly string[];
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ModuleCardGrid({
  cards,
  compact = false,
  fitTitles,
  style,
  testID,
}: ModuleCardGridProps) {
  const t = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  // the Screen's own gutter either side (`space.xxl`) is the first frame's guess
  const gridWidth = measured > 0 ? measured : windowWidth - 2 * t.space.xxl;
  const columns = moduleCardColumns(
    gridWidth,
    t.fontScale.body,
    fitTitles ?? cards.map(c => c.title),
    compact,
  );
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - measured) >= 0.5) setMeasured(w);
  };
  return (
    <View
      style={[{ gap: MODULE_CARD.gridGap }, style]}
      onLayout={onLayout}
      {...(testID ? { testID } : {})}
    >
      {moduleCardRows(cards, columns).map((row, r) => (
        <View key={r} style={[styles.row, { gap: MODULE_CARD.gridGap }]}>
          {row.map(({ key, ...card }) => (
            <View key={key} style={styles.cell}>
              {/* a card alone on its row — the odd last one, or every one at a large text size —
                  spans it, and lays out across it */}
              <ModuleCard {...card} wide={row.length === 1} compact={compact} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { flexGrow: 1 },
  // a compact card stretched to a taller neighbor keeps its line in the middle of it
  middle: { justifyContent: 'center' },
  top: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
  disc: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  mark: { alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  badge: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  words: { minWidth: 0 },
  wideWords: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  cell: { flex: 1, minWidth: 0 },
});
