/**
 * RowMotion — one list row arriving, moving or leaving (the owner, 2026-09-26, of the shopping
 * list: *"add animation in shopping list to make it more fun"*). `rowMotion.ts` holds the seven moves,
 * every number and why; this only hands them to two values, the way `RollDown` does.
 *
 * WRAP THE ROW, AND SAY WHAT IT IS DOING. `motion` is one of the nine moves or null:
 *
 *   - an ARRIVAL (`pop`, `drop`, `rise`, `enter`, `slide`) plays once, from the row's first frame:
 *     its room opens from nothing, so the rows under it slide down rather than jump, and the row
 *     comes into it — except an `enter`, which has no room to open (`rowHasRoom`): the row is laid
 *     out where it belongs from the first frame and only rises into its place, taking touches as it
 *     does. A caller that clears `motion` while it plays stops nothing — an arrival always
 *     finishes, then the row simply rests. Asked of a row already on screen, an arrival is not
 *     played: a row that is there does not arrive.
 *   - a DEPARTURE (`sink`, `lift`, `sweep`, `away`) plays from wherever the row is, the moment it
 *     is asked for, and leaves the row shut and unseen until the caller takes it away. From that
 *     moment it is out of reach of touch and of assistive technology: it is a line that has gone,
 *     still being drawn going.
 *   - `wait` holds an arrival back — shut, unseen and out of reach — until it is lifted: a line
 *     added while a sheet covers the list pops in when the sheet goes, not behind it.
 *   - `delay` starts the move late: the lines of a cleared basket go one after another. It is read
 *     as the move starts, so a caller that changes it afterwards restarts nothing.
 *
 * AT REST THERE IS NOTHING HERE: no clip, no transform, no height — the row lays itself out, so a
 * line that changes size later (a name edited, the text grown) is simply its new size.
 *
 * TWO VALUES, TWO DRIVERS. The room is a height, which is layout, on the JavaScript driver; the
 * slide, the sweep, the pop's scale and the fades are on the native driver, on their own value,
 * started together on the same clock. The row's size is MEASURED, never guessed: an arrival is laid
 * out once inside a room of no height — invisible, moving nothing — and its own height is what the
 * room opens to; a departure knows its size from its last layout at rest.
 *
 * REDUCE MOTION AND THE AMBER NIGHT (`motionStill`): an arrival is simply there, a departure simply
 * gone, and nothing waits.
 */
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { num } from './PictureToggle';
import { isRowExit, rowFrames, rowHasRoom, rowMotionMs, type RowMotionKind } from './rowMotion';
import { motionStill } from './tickDraw';

export interface RowMotionProps {
  /** What the row is doing: one of the seven moves, or null to rest. */
  motion: RowMotionKind | null;
  /** Hold an arrival back, shut and unseen, until this is false. */
  wait?: boolean;
  /** Start the move this many ms late. */
  delay?: number;
  children: ReactNode;
}

/** Less than this is a re-layout's rounding, not a new size. */
const SIZE_SLACK = 0.5;

export function RowMotion({ motion, wait = false, delay = 0, children }: RowMotionProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);

  /*
    THE MOVE THIS ROW IS MAKING: whatever it was asked on its first frame, and any departure asked
    after. Decided in the render, not an effect later, so the first frame of a move is already the
    move's own rather than one of the row at rest.
  */
  const [playing, setPlaying] = useState<RowMotionKind | null>(motion);
  const [asked, setAsked] = useState(motion);
  if (asked !== motion) {
    setAsked(motion);
    if (motion !== null && isRowExit(motion)) setPlaying(motion);
  }
  // read as a move starts: a later change of it restarts nothing
  const lateBy = useRef(delay);
  lateBy.current = delay;

  // the row's own size, as last laid out: null until it has been
  const [box, setBox] = useState<{ h: number; w: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { height, width } = e.nativeEvent.layout;
    setBox(b =>
      b !== null && Math.abs(b.h - height) < SIZE_SLACK && Math.abs(b.w - width) < SIZE_SLACK
        ? b
        : { h: height, w: width },
    );
  };

  // the room on the JavaScript driver, what the eye follows on the native one
  const room = useRef(new Animated.Value(0)).current;
  const move = useRef(new Animated.Value(0)).current;
  const measured = box !== null;
  const leaving = playing !== null && isRowExit(playing);
  const held = playing !== null && !leaving && wait;

  /*
    A LAYOUT EFFECT, so the frame that first draws a move already has both values at its start: a
    departure asked of a row at rest would otherwise draw one frame of the END of the move — shut —
    before it began.
  */
  useLayoutEffect(() => {
    if (playing === null) return undefined;
    if (still) {
      // nothing may move: an arrival is simply there, and is not saved up to play later
      if (!isRowExit(playing)) setPlaying(null);
      return undefined;
    }
    room.setValue(0);
    move.setValue(0);
    // a move waits for the row's first layout, and an arrival for the caller to let it go
    if (!measured || held) return undefined;
    const ms = rowMotionMs(playing);
    const wait = Math.max(0, lateBy.current);
    const eye = Animated.timing(move, {
      toValue: 1,
      duration: ms,
      delay: wait,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    // a move with no room runs on the native driver alone: nothing on the JavaScript one at all
    const run = rowHasRoom(playing)
      ? Animated.parallel([
          Animated.timing(room, {
            toValue: 1,
            duration: ms,
            delay: wait,
            easing: Easing.linear,
            useNativeDriver: false,
          }),
          eye,
        ])
      : eye;
    // an arrival settles to rest; a departure stays shut until the caller takes it away
    run.start(({ finished }) => {
      if (finished && !isRowExit(playing)) setPlaying(now => (now === playing ? null : now));
    });
    // a new move, reduce motion or Night, a sheet over the list again, or the row going away
    return () => run.stop();
  }, [playing, still, measured, held, room, move]);

  const anim = useMemo(() => {
    if (playing === null) return null;
    const f = rowFrames(playing, box?.h ?? 0, box?.w ?? 0);
    return {
      // no clip and no height for a move without a room: the row lays itself out as at rest
      room: rowHasRoom(playing) ? [styles.clip, { height: num(room, f.height) }] : null,
      row: {
        opacity: num(move, f.opacity),
        transform: [
          { translateX: num(move, f.x) },
          { translateY: num(move, f.y) },
          { scale: num(move, f.scale) },
        ],
      },
    };
  }, [playing, box, room, move]);

  // nothing moves: a departure is simply gone, an arrival simply there
  if (still && leaving) return null;
  const active = anim !== null && !still;
  const hidden = active && (leaving || held);
  return (
    <Animated.View
      style={active ? anim.room : null}
      pointerEvents={hidden ? 'none' : 'auto'}
      {...(hidden
        ? {
            accessibilityElementsHidden: true,
            importantForAccessibility: 'no-hide-descendants' as const,
          }
        : {})}
    >
      <Animated.View onLayout={onLayout} style={active ? anim.row : null}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
