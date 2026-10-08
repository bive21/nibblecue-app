/**
 * StepTrack (docs/DESIGN_SYSTEM.md §5, §8; docs/ACCOUNTS.md §"five-step flow"): the design
 * system's progress indicator. There was none — onboarding hand-rolled five flat bars inside its
 * own screen file — so the gap is filled here, where it can be reused and where the accessible
 * name is written once.
 *
 * THREE SIGNALS, AND NOT ONE OF THEM IS COLOR ALONE (§8):
 *   1. fill — the done bars take the accent, the rest `line2`;
 *   2. HEIGHT — the current step is marked by a 7pt bar against every other bar's 3pt, so position
 *      is carried by size as well as hue, for a parent with a color-vision difference or a screen
 *      dimmed at 3 a.m.;
 *   3. the numeral — `2 / 5` in the mono face with tabular figures, so the digits do not shift
 *      between steps.
 * Every bar stands in a 7pt cell with its foot on the cell's floor, so the baseline does not jump
 * as the current step moves along the row.
 *
 * IT HOPS (the owner, 2026-09-26: *"Think about on boarding process too, surely there are things we
 * can do to make it better with certain animation"*). The tall marker used to blink from one bar to
 * the next; now, when the step changes while the track is on screen, it hops there — a small arc,
 * a squash as it lands — onto a bar that has already filled, and the number beside it rolls like an
 * odometer (`stepHop.ts` has every number). This used to be refused, for two reasons that still
 * hold and that the hop keeps: a WIDTH animation on a flex bar cannot run on the native driver and
 * would stutter on the frame the new step mounts — so nothing here changes a size, the marker is
 * its own view moved by transforms; and an animated fill invites the eye back to the indicator on
 * every step — so the hop is once per step change, 360 ms, and it happens at the top of a page the
 * parent has just been scrolled back to the top of, which is where their eye is going anyway.
 *
 * THE MARKER IS DRAWN IN THE CURRENT STEP'S CELL, so at rest it needs no measuring at all: it is
 * that cell's 7pt bar, as it always was. Only a hop needs the bars' pitch (measured once, from the
 * row), because it starts the marker one pitch away and brings it home. The cell it stands in is
 * lifted over its neighbours (`zIndex`) so a marker hopping back is never drawn under the bar it
 * is leaving.
 *
 * REDUCE MOTION AND THE AMBER NIGHT (`motionStill`): the marker is simply on its new bar and the
 * number simply changes.
 *
 * DRAWN AGAIN ONLY FOR ITS OWN STEP (2026-09-29, `memo`). Setup renders on every keystroke and
 * every switch, and each render used to draw the track again mid-hop, which writes the hop's
 * START into React's props for the marker and both numbers (the old number whole, the new one
 * hidden). On iOS those props are put back whenever a moving view's layout changes (§7.1 rule 6,
 * `MovingView` says how), so a track resized mid-hop could be left showing the step it came from.
 * Its props are three plain values, so a render that changes none of them skips it.
 *
 * The wrapper is `accessible`, so the numeral collapses into the one progressbar node and a
 * screen reader hears "Step 2 of 5" once rather than that plus "2 slash 5" — and never the old
 * number on its way out, which is a drawing inside the same node. It is not interactive: no press,
 * no focus stop of its own, and so no 44pt target to meet.
 */
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { num } from './PictureToggle';
import { barPitch, hopFrames, hopOffset, HOP_MS, rollFrames, trackStep } from './stepHop';
import { Numeric } from './Text';
import { motionStill } from './tickDraw';

/** `height` is outside the spacing lint, but both are named so a future change is deliberate. */
export const STEP_BAR_HEIGHT = 3;
export const STEP_BAR_CURRENT_HEIGHT = 7;

export interface StepTrackProps {
  /** 1-based. */
  current: number;
  total: number;
  testID?: string;
}

/** What the track last showed, and which change it is animating. */
interface Shown {
  current: number;
  total: number;
  /** The track as it was shown before this one: where the marker hops FROM. */
  from: number;
  fromTotal: number;
  /** Counts the changes, so each one is played once and a re-render replays none. */
  n: number;
}

export const StepTrack = memo(function StepTrack({ current, total, testID }: StepTrackProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  const gap = t.space.sm;

  /* THE CHANGE IS STATE, SET IN THE SAME RENDER (React's "information from previous renders"): the
     step the marker hops from has to survive every re-render of the hop — setup re-renders on each
     keystroke — and a ref read during render would forget it on the next one. */
  const [shown, setShown] = useState<Shown>({
    current,
    total,
    from: current,
    fromTotal: total,
    n: 0,
  });
  if (shown.current !== current || shown.total !== total) {
    setShown({ current, total, from: shown.current, fromTotal: shown.total, n: shown.n + 1 });
  }
  const step = trackStep(
    shown.n === 0 ? null : { current: shown.from, total: shown.fromTotal },
    { current, total },
    still,
  );

  // one clock for the hop and the roll; 1 is rest, where every frame is at rest
  const clock = useRef(new Animated.Value(1)).current;
  const played = useRef(shown.n);
  // the row's width and the number's line, measured; a hop waits for neither — without a pitch the
  // marker is simply drawn where it lands. The pitch is worked out here rather than stored, so a
  // track that gains or loses a bar in the same width is never measured with the old count.
  const [rowWidth, setRowWidth] = useState(0);
  const [line, setLine] = useState(0);
  const pitch = barPitch(rowWidth, total, gap);
  const onRow = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    setRowWidth(w => (Math.abs(w - next) < 0.5 ? w : next));
  };
  const onDigit = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.height;
    setLine(h => (Math.abs(h - next) < 0.5 ? h : next));
  };

  /* A LAYOUT effect: the marker is drawn on its new bar in this commit, and the clock is sent back
     to the old one before the frame is shown — a passive effect would let the marker be seen on
     its new bar for a frame and then jump back to hop there. */
  useLayoutEffect(() => {
    if (played.current === shown.n) return;
    played.current = shown.n;
    if (step === null || pitch === 0) {
      clock.setValue(1);
      return;
    }
    clock.setValue(0);
    const run = Animated.timing(clock, {
      toValue: 1,
      duration: HOP_MS,
      // the frames carry the hop's own easing, turning point to turning point (`keyframes.ts`)
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start();
    // a second change, reduce motion, Night, or the track going away: at rest, never mid-air
    return () => {
      run.stop();
      clock.setValue(1);
    };
    // `step` and `pitch` are read for this change only: a re-measure or a re-render mid-hop must not
    // restart it, and `still` arriving mid-hop is answered by the cleanup above (see `n`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.n, still, clock]);

  // the step the marker hops from; `current` is the one it lands on (the state has caught up with
  // the prop by the time anything is drawn)
  const from = shown.from;
  const motion = useMemo(() => {
    const hop = hopFrames(hopOffset(from, current, pitch));
    const roll = rollFrames(from > current ? -1 : 1, line);
    const foot = STEP_BAR_CURRENT_HEIGHT / 2;
    return {
      marker: {
        transform: [
          { translateX: num(clock, hop.x) },
          { translateY: num(clock, hop.y) },
          // the squash is about the marker's foot, which stays on the floor as it lands
          { translateY: foot },
          { scaleY: num(clock, hop.squash) },
          { translateY: -foot },
        ],
      },
      rollIn: {
        opacity: num(clock, roll.inOpacity),
        transform: [{ translateY: num(clock, roll.inY) }],
      },
      rollOut: {
        opacity: num(clock, roll.outOpacity),
        transform: [{ translateY: num(clock, roll.outY) }],
      },
    };
  }, [clock, from, current, pitch, line]);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current} of ${total}`}
      // min 0, not 1. TalkBack turns this triple into a percentage, and (1-1)/(5-1) announces
      // "Step 1 of 5, 0 percent" on the first step and "100 percent" on the last. From 0 it reads
      // 20% through 100%, which is what a parent on step 1 of 5 has actually done.
      accessibilityValue={{ min: 0, max: total, now: current }}
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: t.space.lg }}
      {...(testID ? { testID } : {})}
    >
      <View onLayout={onRow} style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap }}>
        {Array.from({ length: total }, (_, i) => {
          const isCurrent = i === current - 1;
          return (
            <View key={i} style={[styles.cell, isCurrent ? styles.lifted : null]}>
              <View
                style={{
                  height: STEP_BAR_HEIGHT,
                  borderRadius: t.radius.pill,
                  // The DONE bars carry the state and are the accent, measured on every ground.
                  // The waiting bars are `line2`, which is a low-contrast hairline token by
                  // design — they are the absence of progress, not a thing to read, and WCAG
                  // 1.4.11 applies to the part that identifies the state. Between the accent
                  // fill, the 7pt marker and the mono numeral, nothing here depends on seeing
                  // line2 at all.
                  backgroundColor: i < current ? t.color.accent : t.color.line2,
                }}
              />
              {isCurrent ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.marker,
                    {
                      height: STEP_BAR_CURRENT_HEIGHT,
                      borderRadius: t.radius.pill,
                      backgroundColor: t.color.accent,
                    },
                    motion.marker,
                  ]}
                />
              ) : null}
            </View>
          );
        })}
      </View>
      <View style={styles.numeral}>
        {/* THE ODOMETER'S WINDOW: one line tall, so the number rolling in from below and the one
            rolling out above are both cut at its edges */}
        <View style={styles.window} onLayout={onDigit}>
          <Animated.View style={motion.rollIn}>
            <Numeric variant="label" ink="text2">
              {String(current)}
            </Numeric>
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, motion.rollOut]}>
            <Numeric variant="label" ink="text2">
              {String(from)}
            </Numeric>
          </Animated.View>
        </View>
        <Numeric variant="label" ink="text2">{` / ${total}`}</Numeric>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  cell: { flex: 1, height: STEP_BAR_CURRENT_HEIGHT, justifyContent: 'flex-end' },
  lifted: { zIndex: 1 },
  marker: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  numeral: { flexDirection: 'row', alignItems: 'flex-end' },
  window: { overflow: 'hidden' },
});
