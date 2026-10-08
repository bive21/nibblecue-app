/**
 * SavedWash — a row that washes once with the accent's tint when what it says was just saved (the
 * owner, 2026-09-26, of setup's "How often?" rows; `savedWash.ts` has the numbers and the rule).
 * The wash is a layer UNDER the row's own content, filling the row's box: the row's words, glyphs
 * and chevron are drawn over it exactly as before, so nothing on the row moves or changes color.
 *
 * ONCE PER SAVE: the caller counts the saves into `token`, and each new count washes once; a row
 * that opens with an answer the page wrote itself washes nothing.
 *
 * TO EVERYTHING BUT THE EYE IT IS NOT THERE: the layer takes no touch and is hidden from assistive
 * technology, and it adds no name — the row's own label already says the new sentence.
 *
 * Under REDUCE MOTION and in the AMBER NIGHT nothing washes (`motionStill`). An opacity on the
 * native driver, and nothing else; a wash cut short is set straight back to nothing.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { num, type AnimatedStyle } from './PictureToggle';
import { WASH_DELAY_MS, WASH_MS, washes, washFrames } from './savedWash';
import { motionStill } from './tickDraw';

export interface SavedWashProps {
  /** How many times this row has been saved; each new count washes once. 0: never. */
  token: number;
  /** The wash: the accent's `tint`, measured under the row's words (`savedWash.test.ts`). */
  color: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function SavedWash({ token, color, children, style }: SavedWashProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  // 1 at rest, where the frame is nothing: the wash starts and ends invisible
  const wash = useRef(new Animated.Value(1)).current;
  const was = useRef(token);

  useEffect(() => {
    const play = washes(was.current, token, still);
    was.current = token;
    if (!play) return;
    wash.setValue(0);
    const run = Animated.timing(wash, {
      toValue: 1,
      duration: WASH_MS,
      delay: WASH_DELAY_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start();
    // another save, reduce motion, Night, or the row going away: nothing left washed
    return () => {
      run.stop();
      wash.setValue(1);
    };
  }, [token, still, wash]);

  const layer = useMemo<AnimatedStyle>(
    () => ({ backgroundColor: color, opacity: num(wash, washFrames().opacity) }),
    [color, wash],
  );
  return (
    <View style={style}>
      <Animated.View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[StyleSheet.absoluteFill, layer]}
      />
      {children}
    </View>
  );
}
