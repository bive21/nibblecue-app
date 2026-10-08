/**
 * AllDoneCart, AllDoneWords — the trip's last tick (2026-09-26, S4 of the shopping list's batch):
 * a little cart rolls along the progress line and "All done" comes up where it stops, then both
 * fade away. `allDone.ts` has every number and why.
 *
 * TWO PIECES, ONE CLOCK. The cart rides the line and the words sit in the card's heading row, two
 * places in the tree; each runs its own value, started by the same `run` on the same commit, the
 * way `RowMotion` runs its two. Put `AllDoneCart` last inside a box round the line (it fills that
 * box, taking no room and no touch, and stands on the line's top edge) and `AllDoneWords` where the
 * words go — it takes room only while it plays.
 *
 * ONLY A CHANGE IS PLAYED: the `run` a piece is first given plays nothing, so a card that mounts
 * with the list already finished never rolls. A new `run` plays once, `delay` ms later, while
 * `live` — the list still finished and in front of the parent; `live` going false cuts it, and
 * nothing is drawn. Once it has played nothing is left on the screen and nothing runs.
 *
 * DECORATION: hidden from touch and from assistive technology — the card's own "6 of 6 in the
 * basket" says it. No haptic: the tick that finished the list was felt. Opacity and transforms on
 * the native driver. Reduce motion and the amber Night: nothing drawn (`motionStill`).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Icon } from '../icons/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useAccent } from '../theme/useAccent';
import { allDoneFrames, DONE_CART, DONE_MS, DONE_WHEEL_GAP } from './allDone';
import { deg, num } from './PictureToggle';
import { PROGRESS_LINE_HEIGHT } from './ProgressLine';
import { AppText } from './Text';
import { motionStill } from './tickDraw';

export interface AllDoneProps {
  /** Each new number is the list finished by a tap here: one play. The first number plays nothing. */
  run: number;
  /** The list is still finished, and in front of the parent. False cuts a play short. */
  live: boolean;
  /** Start this many ms after `run` changes. Read as the play starts. */
  delay?: number;
}

/** One play: its value, and whether it is under way. */
function useAllDone({ run, live, delay = 0 }: AllDoneProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  const v = useRef(new Animated.Value(0)).current;
  const seen = useRef(run);
  const lateBy = useRef(delay);
  lateBy.current = delay;
  const [playing, setPlaying] = useState(false);

  // a new run plays — if there is anything to play it on
  useEffect(() => {
    if (run === seen.current) return;
    seen.current = run;
    setPlaying(!still && live);
  }, [run, still, live]);

  // the list opened again, the screen left, or reduce motion or Night turned on: cut, and gone
  useEffect(() => {
    if (!live || still) setPlaying(false);
  }, [live, still]);

  useEffect(() => {
    if (!playing) return undefined;
    v.setValue(0);
    const play = Animated.timing(v, {
      toValue: 1,
      duration: DONE_MS,
      delay: Math.max(0, lateBy.current),
      easing: Easing.linear,
      useNativeDriver: true,
    });
    // played to the end, nothing is left drawn and nothing runs
    play.start(({ finished }) => {
      if (finished) setPlaying(false);
    });
    return () => play.stop();
  }, [playing, v]);

  return { v, playing: playing && live && !still };
}

/** The cart, rolling along the line. Last inside a box round the line; it fills that box. */
export function AllDoneCart(props: AllDoneProps) {
  const a = useAccent();
  const { v, playing } = useAllDone(props);
  const [width, setWidth] = useState(0);
  const motion = useMemo(() => {
    const f = allDoneFrames(width - DONE_CART);
    return {
      opacity: num(v, f.cartOpacity),
      transform: [{ translateX: num(v, f.x) }, { rotate: deg(v, f.rock) }],
    };
  }, [width, v]);
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={StyleSheet.absoluteFill}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
    >
      {playing ? (
        <Animated.View style={[styles.cart, motion]}>
          <Icon name="cart" size={DONE_CART} color={a.accent} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** "All done", coming up where the cart stops. Takes room only while it plays. */
export function AllDoneWords({ children, ...props }: AllDoneProps & { children: string }) {
  const { v, playing } = useAllDone(props);
  const motion = useMemo(() => {
    const f = allDoneFrames(0);
    return { opacity: num(v, f.wordOpacity), transform: [{ translateY: num(v, f.wordY) }] };
  }, [v]);
  if (!playing) return null;
  return (
    <Animated.View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={motion}
    >
      <AppText variant="meta" ink="text2">
        {children}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // on the line's top edge by its wheels, from the line's left end
  cart: {
    position: 'absolute',
    left: 0,
    bottom: PROGRESS_LINE_HEIGHT - DONE_WHEEL_GAP,
    width: DONE_CART,
    height: DONE_CART,
  },
});
