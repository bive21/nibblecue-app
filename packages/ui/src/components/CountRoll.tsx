/**
 * CountRoll — a line of words about a number that ROLLS to its new number when something lands
 * (the owner, 2026-09-26, of the Supplies page's cart: *"the cart bounces"*, and its count with it).
 * The words for the new number come in as the old ones leave, like the wheel of a counter: up when
 * the number goes up, down when it goes down (`countRollFrames`, 260 ms).
 *
 * `value` is the number and the children are its words — "3 on the shopping list", or "Nothing on
 * the shopping list yet" for none — so the whole line rolls, whatever it says.
 *
 * IT ROLLS ON A LANDING AND ON NOTHING ELSE. Each new `bump` is one thing landing, and a number
 * that changes with it rolls; a number that changes without one — the list read in as the page
 * opens, a line taken off, a change from the other phone — is simply set. Otherwise every page
 * that opens would roll its count up from nothing as its list loaded.
 *
 * The words leaving are a copy, drawn over the new ones and hidden from assistive technology and
 * from touch: the line is read once, as it now is. The two are clipped to the line's own box while
 * they roll, and not otherwise. Under reduce motion and in the amber Night the words simply change
 * (`motionStill`). Transforms and opacity on the native driver.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { COUNT_ROLL_MS, countRollFrames } from './cartFlight';
import { num } from './PictureToggle';
import { AppText, type AppTextProps } from './Text';
import { motionStill } from './tickDraw';

export interface CountRollProps extends Omit<AppTextProps, 'children'> {
  /** The number the words are about. */
  value: number;
  /** Each new number is one thing landing: a change of `value` with it rolls. */
  bump: number;
  /** The words for it. */
  children: string;
}

/** The words that are leaving, and which way the wheel turns. */
interface Leaving {
  words: string;
  dir: 1 | -1;
}

export function CountRoll({ value, bump, children, ...text }: CountRollProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  const v = useRef(new Animated.Value(1)).current;
  const was = useRef({ value, bump, words: children });
  const [leaving, setLeaving] = useState<Leaving | null>(null);

  // a layout effect, so the frame that shows the new words already has them rolling in
  useLayoutEffect(() => {
    const before = was.current;
    was.current = { value, bump, words: children };
    if (before.value === value) return;
    if (still || before.bump === bump) {
      // nothing may move, or nothing landed: the number is simply the new one
      setLeaving(null);
      v.setValue(1);
      return;
    }
    setLeaving({ words: before.words, dir: value > before.value ? 1 : -1 });
    v.setValue(0);
  }, [value, bump, children, still, v]);

  useEffect(() => {
    if (leaving === null) return undefined;
    const run = Animated.timing(v, {
      toValue: 1,
      duration: COUNT_ROLL_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start(({ finished }) => {
      if (finished) setLeaving(null);
    });
    return () => run.stop();
  }, [leaving, v]);

  // the line's own height, from its type role: how far the words roll
  const spec = t.type[text.variant ?? 'body'];
  const line = 'lineHeight' in spec && spec.lineHeight ? spec.lineHeight : spec.fontSize * 1.3;
  const motion = useMemo(() => {
    if (leaving === null) return null;
    const f = countRollFrames(line, leaving.dir);
    return {
      out: { opacity: num(v, f.outOpacity), transform: [{ translateY: num(v, f.outY) }] },
      in: { opacity: num(v, f.inOpacity), transform: [{ translateY: num(v, f.inY) }] },
    };
  }, [leaving, line, v]);

  if (motion === null || leaving === null || still) return <AppText {...text}>{children}</AppText>;
  return (
    <View style={styles.clip}>
      <Animated.View style={motion.in}>
        <AppText {...text}>{children}</AppText>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[StyleSheet.absoluteFill, motion.out]}
      >
        <AppText {...text}>{leaving.words}</AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
