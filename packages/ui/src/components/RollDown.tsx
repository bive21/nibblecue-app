/**
 * RollDown — what a control asks next, rolled down out from under it (the owner, 2026-09-26, of the
 * bottle sheet: *"instead of instantly summon, it rolls down from the button aboe ive (some left)"*).
 * `rollDown.ts` holds every number and tests it; this file only hands them to two values.
 *
 * Put it directly under the control it answers, in one block with it, and put the room between the
 * two INSIDE it (the caller's own padding on its content): that room then opens and closes with the
 * roll, and the column's gap stays where it was — a gap that appeared all at once would be the jump
 * this exists to remove.
 *
 * WHAT IT DOES. `open` rolls the content down: the clip grows from nothing to the content's own
 * height (the JavaScript driver: a height is layout), and the content slides down out of it and
 * fades in (the native driver: a transform and an opacity). Everything under it moves down with it.
 * Closing rolls it back up the same way, and a change of answer mid-move turns it round from where
 * it is. At rest open, the content lays itself out, with no clip at all.
 *
 * WHAT ROLLS AWAY IS WHAT WAS THERE. On the way up the content is drawn as it last stood open — its
 * words and numbers do not change as it goes (the bottle's "Took 3 oz" would otherwise read the
 * whole bottle for a quarter of a second) — and it is out of reach of touch and of assistive
 * technology from the moment the answer changes. Rolled up, it is not in the tree at all, so
 * nothing in it can take focus.
 *
 * Under REDUCE MOTION, and in the amber NIGHT theme, nothing moves (`motionStill`): the content is
 * simply there or not.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { num } from './PictureToggle';
import {
  planRoll,
  ROLL_EASE,
  rollClipped,
  rollDrawn,
  rollFrames,
  rollHidden,
  rollPhase,
  rollSettled,
  type RollEnd,
  type RollMotion,
  type RollPhase,
} from './rollDown';
import { motionStill } from './tickDraw';

export interface RollDownProps {
  /** Rolled down, or tucked away under the control above. */
  open: boolean;
  /** What rolls down. Its own padding is the room between it and the control above. */
  children: ReactNode;
  /**
   * MEASURED AHEAD, for a disclosure that must answer on the tap's own frame (the Sleep outlook's
   * What this means, 2026-10-05). A roll-down cannot start until it knows the content's height, and
   * that height comes back from native layout one round trip after the content mounts: two or
   * three frames on an idle phone, more on a busy one, all of it a blank pause after the tap. With
   * this, the closed content is laid out unseen — no opacity, no touch, no screen reader — so the
   * height is already known and the roll starts with the tap.
   */
  measureAhead?: boolean;
  testID?: string;
}

const EASE = Easing.bezier(...ROLL_EASE);
/** Less than this is a re-layout's rounding, not a new height. */
const HEIGHT_SLACK = 0.5;

export function RollDown({ open, children, measureAhead = false, testID }: RollDownProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);

  // what is drawn on the way up: the content as it last stood open (see the header)
  const kept = useRef<ReactNode>(children);
  if (open) kept.current = children;

  // THE PHASE FOLLOWS THE ANSWER IN THE SAME RENDER, not an effect later: a roll-down's first frame
  // is already clipped to nothing, and a roll-up's first frame is already out of reach
  const [phase, setPhase] = useState<RollPhase>(open ? 'open' : 'closed');
  const [asked, setAsked] = useState({ open, still });
  if (asked.open !== open || asked.still !== still) {
    setAsked({ open, still });
    setPhase(rollPhase(phase, open, still));
  }

  // the content's own height, as last laid out; null until it has been, and again once rolled up
  const [height, setHeight] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.height;
    setHeight(h => (h !== null && Math.abs(h - next) < HEIGHT_SLACK ? h : next));
  };

  // p, twice: the clip's height on the JavaScript driver, the slide and the fade on the native one
  const extent = useRef(new Animated.Value(open ? 1 : 0)).current;
  const roll = useRef(new Animated.Value(open ? 1 : 0)).current;
  // where the roll was last sent, and the move taking it there
  const at = useRef<RollEnd>(open ? 1 : 0);
  const motion = useRef<RollMotion | null>(null);

  useEffect(() => {
    if (phase === 'open' || phase === 'closed') {
      // at rest — or put there by reduce motion or Night, over a move in flight: the end state
      const end: RollEnd = phase === 'open' ? 1 : 0;
      at.current = end;
      motion.current = null;
      extent.setValue(end);
      roll.setValue(end);
      // rolled up, the content is gone: the next roll-down measures it afresh (unless it is being
      // measured ahead, in which case the unseen copy keeps the height current)
      if (phase === 'closed' && !measureAhead) setHeight(null);
      return undefined;
    }
    // a roll-down waits for the content's first layout: until then it is clipped to nothing
    if (height === null) return undefined;
    const to: RollEnd = phase === 'opening' ? 1 : 0;
    const now = Date.now();
    const p = planRoll(motion.current, at.current, to, now);
    at.current = to;
    motion.current = { from: p.from, to, startedAt: now, duration: p.duration };
    const run = Animated.parallel([
      Animated.timing(extent, {
        toValue: to,
        duration: p.duration,
        easing: EASE,
        useNativeDriver: false,
      }),
      Animated.timing(roll, {
        toValue: to,
        duration: p.duration,
        easing: EASE,
        useNativeDriver: true,
      }),
    ]);
    // settles only the move it belongs to: a finish that lands just after the answer changed back
    // must not rest a roll-down that has not run
    run.start(({ finished }) => {
      if (finished) setPhase(current => (current === phase ? rollSettled(current) : current));
    });
    // a new answer, reduce motion, Night, a new height, or the roll going away: stop where it is
    return () => run.stop();
  }, [phase, height, extent, roll, measureAhead]);

  const anim = useMemo(() => {
    const f = rollFrames(height ?? 0);
    return {
      clip: { height: num(extent, f.height) },
      content: {
        opacity: num(roll, f.opacity),
        transform: [{ translateY: num(roll, f.slide) }],
      },
    };
  }, [height, extent, roll]);

  if (!rollDrawn(phase) && !measureAhead) return null;
  /*
    ONE TREE, OPEN OR SHUT (2026-10-06, the owner's "returning stutter" on Sleep outlook's What this
    means). Measured ahead, the unseen copy used to be a tree of its own — one view — and the drawn
    roll another — a clip round the content — so every open unmounted the rows and mounted them
    again, and every close did it back: the work the tap waited on, on every tap, not only the
    first. Now it is the same two views either way, and only their styles change: shut, the outer
    one is the unseen copy (`ahead`: out of the flow, transparent, out of reach and out of a screen
    reader's way) and the inner one keeps measuring; drawn, the outer one is the clip. The rows
    are mounted once and stay.
  */
  const drawn = rollDrawn(phase);
  const clipped = drawn && rollClipped(phase);
  const hidden = !drawn || rollHidden(phase);
  return (
    <Animated.View
      style={!drawn ? styles.ahead : clipped ? [styles.clip, anim.clip] : null}
      {...(!drawn
        ? {
            pointerEvents: 'none' as const,
            accessibilityElementsHidden: true,
            importantForAccessibility: 'no-hide-descendants' as const,
          }
        : {})}
      {...(testID && drawn ? { testID } : {})}
    >
      <Animated.View
        onLayout={onLayout}
        pointerEvents={hidden ? 'none' : 'auto'}
        {...(hidden
          ? {
              accessibilityElementsHidden: true,
              importantForAccessibility: 'no-hide-descendants' as const,
            }
          : {})}
        style={clipped ? anim.content : null}
      >
        {open || !drawn ? children : kept.current}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  // out of the column's flow and out of sight: laid out only to know its height
  ahead: { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 },
});
