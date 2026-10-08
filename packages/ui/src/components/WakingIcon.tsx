/**
 * WakingIcon — a module's icon that does its one small move when the module is switched ON (the
 * owner, 2026-09-25, of the "that's cool" list, idea 7: *"might not necessarily be useful, but
 * it's cool … Let's try doing everything"*). The moves, and every rule they keep, are in
 * `wakingIcon.ts`: the bottle pours, the moon sways, the diaper hops, the pump pulses, and so on,
 * once, on the way on — never on mount and never on the way off.
 *
 * IT WRAPS THE ICON, IT DOES NOT DRAW ONE. The caller passes the icon it already drew — in a row,
 * `Row`'s own glyph through `iconNode`, so the chip, its tint and its size are exactly what they
 * were — and this moves the box around it. That is the only way to move the owner's illustrated
 * set at all: a PNG cannot be taken apart, so the move is of the whole picture, about a pivot
 * chosen for the object it shows.
 *
 * ONE VALUE, 0 → 1 WHILE IT PLAYS, and 1 at rest: every channel is an interpolation of it, and a
 * move's frames are at rest at both ends, so the icon at rest is the icon untouched. Transforms
 * only, on the native driver.
 *
 * IT NEVER STOPS HALF WAY. A second tap before the move is over, reduce motion turned on, or the
 * row going away stops the run and sets the value back to rest in the same breath — a
 * native-driven animation that is only stopped stays where it was, and an icon left tilted is the
 * one outcome worse than no move at all. Under REDUCE MOTION and in the AMBER NIGHT theme nothing
 * plays (docs/DESIGN_SYSTEM.md §7): the icon simply is on.
 *
 * TO EVERYTHING BUT THE EYE IT IS NOT THERE. It adds no element and no name: the wrapper takes no
 * touches (`pointerEvents="none"`, so the row's own press is untouched) and is not accessible, so
 * the icon inside keeps whatever it said before — in a row, nothing, because the row's own label
 * names the module.
 *
 * A ROW'S CHIP IS `wakingRowIcon` (below): the two props `Row` takes for it, with the glyph Row
 * would have drawn inside this, so a screen never has to know Row's glyph size or its ink rule.
 */
import type { ModuleId } from '@nibblecue/core';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/paths';
import { useTheme } from '../theme/ThemeProvider';
import type { Frame } from './dayNightSwitch';
import { MODULE_WAKE, ROW_ICON, WAKE_MOVES, wakeFrames, wakes, type WakeMove } from './wakingIcon';

/** The moves and the module table, for a caller that wants to name one. */
export { ROW_ICON, type WakeMove } from './wakingIcon';

export interface WakingIconProps {
  /** Whose move to make: the module's own (`MODULE_WAKE`). */
  module: ModuleId;
  /**
   * A move of the caller's choosing instead of the module's own — setup's supplies list gives
   * every category the same hop when its row is first filled in (2026-09-26): the glyph there is a
   * supply's, not a module's, and a formula tin tipped over to pour reads as a spill.
   */
  move?: WakeMove;
  /** Whether the module is on. The move plays when this turns true after the first render. */
  on: boolean;
  /** The icon's size, in points: a move's reach is measured in it. */
  size: number;
  /**
   * How long after the change the move starts, in ms: a row answered in a sheet moves once the
   * sheet has gone, not under it. 0 by default — a switch's icon wakes with the switch.
   */
  delay?: number;
  /** The icon, drawn as it would be without this. */
  children: ReactNode;
}

export function WakingIcon({
  module,
  move: chosen,
  on,
  size,
  delay = 0,
  children,
}: WakingIconProps) {
  const t = useTheme();
  const still = t.reduceMotion || t.theme === 'night';
  const move = chosen ?? MODULE_WAKE[module];
  // at rest: a move ends where it began, so 1 is the icon untouched
  const progress = useRef(new Animated.Value(1)).current;
  // what the icon last saw: its first value, so opening on "on" wakes nothing
  const was = useRef(on);

  useEffect(() => {
    const play = wakes(was.current, on, still);
    was.current = on;
    if (!play) return;
    progress.setValue(0);
    const run = Animated.timing(progress, {
      toValue: 1,
      duration: WAKE_MOVES[move].ms,
      // held at rest until it starts: every move's frames are at rest at 0 as well as at 1
      delay,
      // the frames carry the move's own easing, turning point to turning point (`keyframes.ts`)
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start();
    // a second tap, reduce motion, night, or the row going away: back to rest, never half way
    return () => {
      run.stop();
      progress.setValue(1);
    };
  }, [delay, move, on, progress, still]);

  const style = useMemo(() => {
    const f = wakeFrames(move, size);
    // copies, because `interpolate` is typed for mutable arrays and the frames are frozen data
    const num = (fr: Frame) =>
      progress.interpolate({
        inputRange: [...fr.inputRange],
        outputRange: [...fr.outputRange],
        extrapolate: fr.extrapolate,
      });
    const deg = (fr: Frame) =>
      progress.interpolate({
        inputRange: [...fr.inputRange],
        outputRange: fr.outputRange.map(d => `${d}deg`),
        extrapolate: fr.extrapolate,
      });
    const { x, y } = f.pivot;
    return {
      width: size,
      height: size,
      // the pose's own travel, then a turn and a stretch about the pivot: out to it, turn, back
      transform: [
        { translateX: num(f.tx) },
        { translateY: num(f.ty) },
        { translateX: x },
        { translateY: y },
        { rotate: deg(f.rotate) },
        { scaleX: num(f.sx) },
        { scaleY: num(f.sy) },
        { translateX: -x },
        { translateY: -y },
      ],
    };
  }, [move, progress, size]);

  return (
    <Animated.View pointerEvents="none" style={[styles.box, style]}>
      {children}
    </Animated.View>
  );
}

/**
 * A MODULE ROW'S CHIP THAT WAKES UP, as the two props `Row` takes for it: `icon`, which is what
 * makes Row draw the chip and its tint at all, and `iconNode`, the glyph inside the chip — the SAME
 * glyph at the SAME size and in the SAME ink Row would have drawn, wrapped in `WakingIcon`.
 *
 * Pass the `tint` the row is given (or nothing, for Row's neutral chip) and the row's OWN switch
 * value as `on`, from the same expression, so the icon wakes in the frame the switch goes on and at
 * no other time: not when a screen opens with the module already on, not on the way off.
 */
export function wakingRowIcon(
  module: ModuleId,
  glyph: IconName,
  on: boolean,
  tint?: { fg: string } | null,
): { icon: IconName; iconNode: ReactNode } {
  return {
    icon: glyph,
    iconNode: <RowGlyph module={module} glyph={glyph} on={on} ink={tint?.fg ?? null} />,
  };
}

/** Row's own glyph, in Row's own ink (`chip.fg`: the tint's hue, else `text2`), able to wake. */
function RowGlyph({
  module,
  glyph,
  on,
  ink,
}: {
  module: ModuleId;
  glyph: IconName;
  on: boolean;
  ink: string | null;
}) {
  const t = useTheme();
  return (
    <WakingIcon module={module} on={on} size={ROW_ICON.glyph}>
      <Icon name={glyph} size={ROW_ICON.glyph} color={ink ?? t.color.text2} />
    </WakingIcon>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
});
