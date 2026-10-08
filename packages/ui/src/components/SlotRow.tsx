/**
 * SLOT ROW — a few choices as pills that SHARE ONE ROW EQUALLY (the owner's rhythm and solids
 * handoff, 2026-10-06). The time row's Now · −15m · −30 · custom and the rhythm editor's
 * 1h30m · 2h · 2h30m · 3h · 4h are the same control: each choice gets an equal slot of the
 * measured row, `(width − (n − 1) × gap) / n`, the first starting at the content's left edge and
 * the last ending at its right, so a row never leaves a ragged gap at its end.
 *
 * SELECTION CHANGES COLORS ONLY. A Chip draws a check and a bold face when chosen, which made the
 * chosen pill wider and pushed its neighbors along the row every tap. Here every slot has the same
 * border (transparent at rest), the same padding, the same face and the same size whatever its
 * state; chosen is the accent filled with its own ink, at rest the scheme's soft tint with the
 * page's ink. The filled-against-tinted difference is one of lightness as much as of hue, and the
 * radio's checked state says it to a screen reader.
 *
 * LARGE TEXT IS NEVER CUT OR SHRUNK AWAY. At the ordinary text sizes every label fits its slot on
 * one line; past `WRAP_SCALE` the slots become two per line instead, still equal, so a parent who
 * reads at a large size gets whole words rather than "2h3…".
 *
 * LONG WORDS WHERE THERE IS ROOM (the owner, 2026-10-08: "when there is clear space for the text,
 * show -5 min, -15 min, -30 min, and custom instead. Keep it short if it does not fit"). An option
 * may carry a `longLabel`; the row draws every option's long words when EVERY slot holds its own
 * with `LONG_CLEAR` to spare, and every short word otherwise — one spelling per row, never "−5 min"
 * beside "−15m". The decision is measured, not guessed: the row's own width (`onLayout`) and each
 * long word as the slot would draw it, in the face, size and text scale on the phone, laid out once
 * in an invisible copy (`slotWordsFit` does the sum). Until both are measured the row draws the
 * long words, which is what a phone of ordinary width holds, so the usual first frame does not jump.
 * A screen reader hears the option's `accessibilityLabel` either way.
 */
import { useCallback, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { composite } from '../theme/contrast';
import { accentInk } from '../theme/moduleAccent';
import { useTheme } from '../theme/ThemeProvider';
import { useAccent } from '../theme/useAccent';
import type { PathModule } from './pathCard';
import { moduleSlotPaint } from '../theme/slotPaint';
import { SLOT_EDGE, slotWordsFit } from './slotFit';
import { AppText } from './Text';

export interface SlotOption<T extends string> {
  value: T;
  label: string;
  /** What a screen reader hears; the label when omitted. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /**
   * The same choice spelled out (`−15 min` for `−15m`), drawn when every slot of the row holds its
   * long words with room to spare (see the header); `label` otherwise.
   */
  longLabel?: string;
  /**
   * This one choice cannot be taken now (a pump's −30m end before the pump began; 2026-10-06): it
   * is drawn faded and takes no tap, rather than taking a tap and saying no where nobody sees it.
   */
  disabled?: boolean;
}

export interface SlotRowProps<T extends string> {
  options: readonly SlotOption<T>[];
  /** The chosen value, or null when none of these is it (a custom value elsewhere). */
  value: T | null;
  onChange: (value: T) => void;
  /** The row's name for a screen reader. */
  accessibilityLabel?: string;
  /** Space between slots: 8 for the time row, 6 for the rhythm presets. */
  gap?: number;
  /** The visible height of every slot (38–40). */
  height?: number;
  /**
   * The ground the slots stand on, so the resting tint and its edge are measured against it: the
   * sheet's white by default, a Day or Night card's soft color where they sit in one.
   */
  ground?: string;
  disabled?: boolean;
  /**
   * The words at 13 rather than 14: five slots of "1h30m" in a card at 320 dp, where each slot is
   * 47 points and the word at 14 would want 49 (`rhythmSlots.test.ts`).
   */
  small?: boolean;
  /**
   * THE MODULE'S OWN COLORS instead of the scheme's (the owner, 2026-10-06: "when on starting timer,
   * the minutes chip need to follow the module's color instead, to make it more uniform"): at rest
   * the start tile's soft fill and edge, chosen its ink with the fill's color for the words — the
   * same pair the Start tile above it draws (`pathTileColors`).
   */
  module?: PathModule;
  style?: StyleProp<ViewStyle>;
  /** Each slot is `${testID}-${value}`, unless `slotTestID` names it. */
  testID?: string;
  /** A slot's own id, where a screen's ids predate the row (`rhythm.every.120`). */
  slotTestID?: (value: T) => string;
}

/** The default visible height of a slot. */
export const SLOT_HEIGHT = 40;
/** Past this text scale the slots go two to a line (see the header). */
export const SLOT_WRAP_SCALE = 1.35;
/** The edge every slot carries, in every state: transparent at rest so nothing moves when chosen. */
const EDGE = SLOT_EDGE;
/** A resting slot's fine edge: the accent a little stronger than its tint, the same hue. */
const REST_EDGE = 0.3;
/** The air either side of a slot's words: 2 in a slot sharing one line, 4 in a half. */
const SLOT_AIR = 2;
const HALF_AIR = 4;

export function SlotRow<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  gap = 8,
  height = SLOT_HEIGHT,
  ground,
  disabled = false,
  small = false,
  module,
  style,
  testID,
  slotTestID,
}: SlotRowProps<T>) {
  const t = useTheme();
  const a = useAccent();
  const base = ground ?? t.color.surfaceSolid;
  const paint =
    module !== undefined
      ? moduleSlotPaint(t.color, module, t.theme)
      : {
          rest: a.tint,
          // on a log sheet the accent is the module's PASTEL (`moduleAccentPalette`), and its edge
          // at 0.3 all but vanished on the sheet's wash (the owner, 2026-10-08: the diaper's and
          // the feed's chips, "way too subtle … make it darker a little"): there the edge is drawn
          // from the module's deep ink instead; a scheme's accent already reads and is unchanged
          restEdge: composite(base, accentInk(t.color), REST_EDGE),
          on: a.accent,
          onEdge: a.accent,
          onInk: a.onAccent,
        };
  const wrap = t.fontScale.body > SLOT_WRAP_SCALE;
  // LONG WORDS WHERE THEY FIT (see the header): the row's width and each long word's, measured
  const longs = options.filter(o => o.longLabel !== undefined && o.longLabel !== o.label);
  const [rowWidth, setRowWidth] = useState<number | null>(null);
  const [wordWidths, setWordWidths] = useState<Readonly<Record<string, number>>>({});
  const onRowLayout = useCallback(
    (e: LayoutChangeEvent) => setRowWidth(e.nativeEvent.layout.width),
    [],
  );
  const measured = (word: string) => (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWordWidths(prev => (prev[word] === w ? prev : { ...prev, [word]: w }));
  };
  const long =
    longs.length > 0 &&
    slotWordsFit({
      rowWidth,
      perLine: wrap ? Math.min(2, options.length) : options.length,
      gap,
      air: wrap ? HALF_AIR : SLOT_AIR,
      wordWidths: longs.map(o => wordWidths[o.longLabel ?? ''] ?? null),
    });
  const wordStyle = small ? styles.wordSmall : styles.word;
  return (
    <View
      accessibilityRole="radiogroup"
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      style={[styles.row, wrap ? styles.wrap : null, { gap }, style]}
      {...(longs.length > 0 ? { onLayout: onRowLayout } : {})}
      {...(testID ? { testID } : {})}
    >
      {/* THE LONG WORDS, MEASURED AND NEVER SEEN: each at its own width, in the slot's face, size
          and text scale, out of the flow, the touch and the screen reader's way */}
      {longs.length > 0 ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.measure}
        >
          {longs.map(o => (
            <View key={o.value} onLayout={measured(o.longLabel ?? '')} style={styles.measured}>
              <AppText variant="bodySm" numberOfLines={1} style={wordStyle}>
                {o.longLabel}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
      {options.map(o => {
        const on = o.value === value;
        const off = disabled || o.disabled === true;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.accessibilityLabel ?? o.label}
            {...(o.accessibilityHint ? { accessibilityHint: o.accessibilityHint } : {})}
            accessibilityState={{ checked: on, selected: on, disabled: off }}
            disabled={off}
            onPress={() => onChange(o.value)}
            // the 44 target from above and below; never sideways into a neighbor
            hitSlop={{
              top: Math.max(0, (t.hit.min - height) / 2),
              bottom: Math.max(0, (t.hit.min - height) / 2),
            }}
            style={({ pressed }) => [
              wrap ? styles.half : styles.slot,
              {
                minHeight: height,
                borderRadius: t.radius.pill,
                borderWidth: EDGE,
                borderColor: on ? paint.onEdge : paint.restEdge,
                backgroundColor: on ? paint.on : paint.rest,
                opacity: off ? 0.4 : pressed ? 0.85 : 1,
              },
            ]}
            {...(slotTestID
              ? { testID: slotTestID(o.value) }
              : testID
                ? { testID: `${testID}-${o.value}` }
                : {})}
          >
            <AppText
              variant="bodySm"
              color={on ? paint.onInk : t.color.text}
              align="center"
              numberOfLines={1}
              style={wordStyle}
            >
              {long && o.longLabel !== undefined ? o.longLabel : o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignSelf: 'stretch' },
  wrap: { flexWrap: 'wrap' },
  // equal slots: the same basis and grow for every one, never their words' width
  slot: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SLOT_AIR,
  },
  half: {
    flexGrow: 1,
    flexBasis: '40%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: HALF_AIR,
    paddingVertical: 4,
  },
  // out of the row's flow and invisible; each word laid out at its own width (`alignItems`)
  measure: { position: 'absolute', left: 0, top: 0, opacity: 0, alignItems: 'flex-start' },
  measured: { alignSelf: 'flex-start' },
  word: { fontSize: 14, lineHeight: 19 },
  wordSmall: { fontSize: 13, lineHeight: 18 },
});
