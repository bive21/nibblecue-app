/**
 * ChoiceCard + ChoiceCardGrid — pick ONE of a few things, each a card with its picture (2026-09-26,
 * the medicine form's "What is it?"; the owner: *"add different icosn to medicine, vitamin, cream or
 * ointment, and other. just to add some graphic"*).
 *
 * WHAT YOU TRACK'S CARD, MADE A RADIO. The picture in its module's disc, the name under it, the state
 * in the corner, and — chosen — the lit accent edge, the faint wash, the soft glow and the check that
 * draws itself: `ModuleCard`'s look to the point, from the same numbers and the same paint
 * (`moduleCard.ts`, measured there in every design, scheme and theme), so the app has one card
 * language whether a card is a switch or one of a set.
 *
 * WHAT DIFFERS IS WHAT A TAP MEANS. A module card flips; a choice card CHOOSES. Tapping the chosen
 * card again changes nothing and is felt as nothing, choosing another takes the check off this one,
 * and each is felt as the segmented control's choices are (`feedback/choice.ts`). To a screen reader
 * the grid is a `radiogroup` named with the question, each card a `radio` with its title and whether
 * it is checked — the segmented control's semantics, for a choice its pictures explain.
 *
 * NOTHING NEED BE CHOSEN YET (`value` null): a question asked before anything is decided — the
 * medicine form asks what a thing is before its name — draws every card with its empty ring.
 *
 * THE PICTURE MOVES WHEN ITS CARD IS CHOSEN: the module's own move (`WakingIcon` — the medicine is
 * shaken), once, never on mount. Reduce motion and the amber Night play nothing, and the check is
 * simply there.
 *
 * THE GRID is `ModuleCardGrid`'s: two to a row, a row as tall as its taller card, an odd last card
 * spanning its row and laid out across it, and one to a row — every card across — when a title's
 * longest word would not fit half the width at the reader's text size (`moduleCardColumns`, from
 * word widths held to the shipped TTF). It measures its own width and guesses the first frame from
 * the window, less the gutter a Screen and a sheet both have.
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
import { feelChoice } from '../feedback/choice';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/paths';
import { composite } from '../theme/contrast';
import { useCategory, useTheme } from '../theme/ThemeProvider';
import {
  CARD_GLOW_BLUR,
  MODULE_CARD,
  MODULE_CARD_MIN_HEIGHT,
  MODULE_CARD_WIDE_MIN_HEIGHT,
  moduleCardColumns,
  moduleCardPaint,
  moduleCardRows,
} from './moduleCard';
import { Surface } from './Surface';
import { BodyStrong } from './Text';
import { TickMark } from './TickMark';
import { WakingIcon } from './WakingIcon';

export interface ChoiceCardProps {
  /** The option's name, never cut short. */
  title: string;
  /** Its picture, drawn at What you track's size in the module's disc. */
  icon: IconName;
  /** Whose disc the picture sits on, and whose move it makes when chosen. */
  module: ModuleId;
  chosen: boolean;
  /** Called when the card is tapped while it is not the chosen one. */
  onChoose: () => void;
  disabled?: boolean;
  /** Across its row: the picture, the title and the mark in one line (a card alone on its row). */
  wide?: boolean;
  /** Spoken instead of the title. */
  accessibilityLabel?: string;
  /** The radio's own id: what a flow taps. */
  testID?: string;
}

export function ChoiceCard({
  title,
  icon,
  module,
  chosen,
  onChoose,
  disabled = false,
  wide = false,
  accessibilityLabel,
  testID,
}: ChoiceCardProps) {
  const t = useTheme();
  const cat = useCategory(module);
  const paint = moduleCardPaint(t.color, chosen, t.theme, t.skinTokens.surface.shadow !== 'none');
  const r = t.radius.l;
  // the chosen card tapped again moves nothing, so nothing is felt and nothing is reported
  const choose = () => {
    feelChoice({ locked: false, current: chosen, kind: 'tap' });
    if (!chosen) onChoose();
  };
  const words = (
    <View style={wide ? styles.wideWords : styles.words}>
      <BodyStrong>{title}</BodyStrong>
    </View>
  );
  return (
    <View
      style={[
        styles.fill,
        { borderRadius: r },
        paint.glow
          ? {
              boxShadow: [
                {
                  offsetX: 0,
                  offsetY: 0,
                  blurRadius: CARD_GLOW_BLUR,
                  spreadDistance: 0,
                  color: paint.glow,
                },
              ],
            }
          : null,
      ]}
    >
      <Pressable
        accessible
        accessibilityRole="radio"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityState={{ checked: chosen, selected: chosen, disabled }}
        disabled={disabled}
        onPress={choose}
        style={({ pressed }) => [
          styles.fill,
          { opacity: disabled ? 0.5 : pressed && !chosen ? 0.85 : 1 },
        ]}
        {...(testID ? { testID } : {})}
      >
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
                    backgroundColor: cat.disc ?? composite(cat.soft, cat.fg, 0.2),
                  },
                ]}
              >
                <WakingIcon module={module} on={chosen} size={MODULE_CARD.picture}>
                  <Icon name={icon} size={MODULE_CARD.picture} color={cat.fg} />
                </WakingIcon>
              </View>
              {wide ? words : <View style={styles.grow} />}
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
                  checked={chosen}
                  size={MODULE_CARD.markGlyph}
                  color={paint.check}
                  ring={MODULE_CARD.mark / 2}
                />
              </View>
            </View>
            {wide ? null : words}
          </View>
        </Surface>
        {/* THE LIT EDGE AND ITS WASH, over the whole card's box (`ModuleCard` says why) */}
        {paint.edge ? (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: r,
                borderWidth: MODULE_CARD.edge,
                borderColor: paint.edge,
                backgroundColor: paint.wash ?? 'transparent',
              },
            ]}
          />
        ) : null}
      </Pressable>
    </View>
  );
}

/** One option of a choice grid. */
export interface ChoiceCardOption<T extends string> {
  value: T;
  title: string;
  icon: IconName;
  accessibilityLabel?: string;
}

export interface ChoiceCardGridProps<T extends string> {
  options: readonly ChoiceCardOption<T>[];
  /** The chosen option, or null while nothing is chosen yet. */
  value: T | null;
  onChange: (value: T) => void;
  /** Whose disc every picture sits on (the options are one module's things). */
  module: ModuleId;
  /** The question, read as the radio group's name: a group without one is a row of unnamed radios. */
  label: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** The group's id; each card's is `${testID}.${idOf(value)}`. */
  testID?: string;
  /** How an option's value becomes its id's last segment — the value itself by default. */
  idOf?: (value: T) => string;
}

export function ChoiceCardGrid<T extends string>({
  options,
  value,
  onChange,
  module,
  label,
  disabled = false,
  style,
  testID,
  idOf = v => v,
}: ChoiceCardGridProps<T>) {
  const t = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  // a Screen's and a sheet's gutter either side (`space.xxl`) is the first frame's guess
  const gridWidth = measured > 0 ? measured : windowWidth - 2 * t.space.xxl;
  const columns = moduleCardColumns(
    gridWidth,
    t.fontScale.body,
    options.map(o => o.title),
  );
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - measured) >= 0.5) setMeasured(w);
  };
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[{ gap: MODULE_CARD.gridGap }, style]}
      onLayout={onLayout}
      {...(testID ? { testID } : {})}
    >
      {moduleCardRows(options, columns).map((row, r) => (
        <View key={r} style={[styles.row, { gap: MODULE_CARD.gridGap }]}>
          {row.map(o => (
            <View key={o.value} style={styles.cell}>
              <ChoiceCard
                title={o.title}
                icon={o.icon}
                module={module}
                chosen={o.value === value}
                onChoose={() => onChange(o.value)}
                disabled={disabled}
                wide={row.length === 1}
                {...(o.accessibilityLabel ? { accessibilityLabel: o.accessibilityLabel } : {})}
                {...(testID ? { testID: `${testID}.${idOf(o.value)}` } : {})}
              />
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
  top: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
  disc: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  mark: { alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  words: { minWidth: 0 },
  wideWords: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  cell: { flex: 1, minWidth: 0 },
});
