/**
 * MilkContainerPicker — which container milk is stored in, as three little pictures with the milk
 * in them (docs/DESIGN_SYSTEM.md §5; the owner, 2026-09-26: *"make the bag bottle container, a more
 * interesting option"*). It replaces a segmented control of three words and keeps its contract: one
 * radio group, one option chosen, the same values, the same ids (`${testID}.${value}`), and a tap
 * felt as the segmented control's is (`feelChoice`).
 *
 * THE MILK IS THE AMOUNT ON THE SHEET: each container holds it up to the level it would reach in a
 * container of that kind (`fills`, worked out by the caller, which knows the sizes), so moving the
 * amount raises the milk in all three — eased there in a quarter of a second (`milkLevelAt`), set
 * at once under reduce motion and in Night.
 *
 * A TAP IS ANSWERED WITH A WIGGLE: the container rocks on its foot and stands still (`WIGGLE`),
 * on the native driver. Never under reduce motion, never in the amber Night (`motionStill`).
 *
 * THE CHOSEN ONE IS NEVER TOLD BY COLOR ALONE (CLAUDE.md §6): its tile takes the accent's soft
 * ground, an accent border twice the rest's weight, a check in the corner, its word in bold, and
 * the radio's checked state. `theme/milkContainers.test.ts` measures each where it lands.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { feelChoice } from '../feedback/choice';
import { Icon } from '../icons/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { MilkContainerArt } from './MilkContainerArt';
import { milkLevelAt, WIGGLE, WIGGLE_MS, type MilkShape } from './milkContainers';
import { motionStill } from './tickDraw';
import { AppText, Label } from './Text';

export interface MilkContainerOption<T extends string> {
  value: T;
  label: string;
  shape: MilkShape;
}

export interface MilkContainerPickerProps<T extends string> {
  options: readonly MilkContainerOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** The group's name, drawn above it and read as the radio group's label. */
  label: string;
  /** How full each container is, 0–1, for the amount on the sheet. */
  fills: Readonly<Partial<Record<T, number>>>;
  /**
   * THE COMPACT TILES (the owner's Milk stash Option 1, 2026-10-05): about 74 pt tall with a 34 pt
   * picture, the same pictures, milk and wiggle. The caller draws the group's heading in its own
   * sentence-case style, so the picker draws none; the radio group keeps `label` as its name.
   */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** The picture's height in a tile, in points. */
export const MILK_TILE_ART = 56;
/** The compact tile's picture and height. */
export const MILK_TILE_COMPACT = { art: 34, height: 74 } as const;
const CHECK = 20;

export function MilkContainerPicker<T extends string>({
  options,
  value,
  onChange,
  label,
  fills,
  compact = false,
  style,
  testID,
}: MilkContainerPickerProps<T>) {
  const t = useTheme();
  return (
    <View style={[{ gap: t.space.sm }, style]}>
      {compact ? null : <Label>{label}</Label>}
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={[styles.row, { gap: t.space.sm }]}
        {...(testID ? { testID } : {})}
      >
        {options.map(o => (
          <ContainerTile
            key={o.value}
            option={o}
            on={o.value === value}
            fill={fills[o.value] ?? 0}
            compact={compact}
            onPress={() => {
              if (o.value !== value) onChange(o.value);
            }}
            {...(testID ? { testID: `${testID}.${o.value}` } : {})}
          />
        ))}
      </View>
    </View>
  );
}

function ContainerTile<T extends string>({
  option,
  on,
  fill,
  compact,
  onPress,
  testID,
}: {
  option: MilkContainerOption<T>;
  on: boolean;
  fill: number;
  compact: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  const shown = useEasedFill(fill, still);
  const rock = useRef(new Animated.Value(0)).current;
  const wiggle = (): void => {
    if (still) return;
    rock.stopAnimation();
    rock.setValue(0);
    Animated.timing(rock, {
      toValue: WIGGLE_MS,
      duration: WIGGLE_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  };
  const rotate = rock.interpolate({
    inputRange: [...WIGGLE.input],
    outputRange: WIGGLE.degrees.map(d => `${d}deg`),
  });
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={option.label}
      accessibilityState={{ checked: on, selected: on }}
      onPress={() => {
        feelChoice({ locked: false, current: on, kind: 'tap' });
        wiggle();
        onPress();
      }}
      style={({ pressed }) => [
        styles.tile,
        {
          minHeight: compact ? MILK_TILE_COMPACT.height : t.hit.min * 2,
          borderRadius: t.radius.m,
          paddingVertical: compact ? t.space.sm : t.space.md,
          paddingHorizontal: t.space.sm,
          gap: t.space.xs,
          backgroundColor: on ? t.color.accentSoft : t.color.surfaceSolid,
          borderColor: on ? t.color.accent : t.color.line2,
          borderWidth: on ? 2 : 1,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      {...(testID ? { testID } : {})}
    >
      {/* it rocks on its foot: the turn is about the bottom of the picture */}
      <Animated.View style={[styles.foot, { transform: [{ rotate }] }]}>
        <MilkContainerArt
          shape={option.shape}
          fill={shown}
          height={compact ? MILK_TILE_COMPACT.art : MILK_TILE_ART}
        />
      </Animated.View>
      <AppText
        variant={on ? 'bodyStrong' : 'bodySm'}
        ink="text"
        align="center"
        numberOfLines={1}
        style={{ fontSize: t.type.bodySm.fontSize, lineHeight: t.type.bodySm.lineHeight }}
      >
        {option.label}
      </AppText>
      {on ? (
        <View
          style={[
            styles.check,
            {
              top: t.space.xs,
              right: t.space.xs,
              width: CHECK,
              height: CHECK,
              borderRadius: CHECK / 2,
              backgroundColor: t.color.accent,
            },
          ]}
        >
          <Icon name="check" size={12} color={t.color.onAccent} />
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * THE MILK FINDS ITS LEVEL: from where it stands to a new amount in `MILK_RISE_MS`, one frame at a
 * time — a fill is a prop of the SVG, not a style, so it cannot ride the native driver, and it is
 * three small pictures for a quarter of a second. Still, it is simply set.
 */
function useEasedFill(target: number, still: boolean): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  useEffect(() => {
    if (still || shownRef.current === target) {
      shownRef.current = target;
      setShown(target);
      return undefined;
    }
    const from = shownRef.current;
    const start = Date.now();
    let frame: number | null = null;
    const step = (): void => {
      const level = milkLevelAt(from, target, Date.now() - start);
      shownRef.current = level;
      setShown(level);
      frame = level === target ? null : requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [target, still]);
  return shown;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  tile: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'flex-end' },
  foot: { transformOrigin: 'bottom' },
  check: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
