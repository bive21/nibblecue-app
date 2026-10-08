/**
 * CartBadge — the number of things still to buy, on the cart's corner (the owner, 2026-09-26: *"the
 * cart has no count badge ... add this feature"*). `cartBadge.ts` has the rules and the numbers;
 * `theme/cartBadge.ts` the colors.
 *
 * Put it INSIDE the cart's own box, last, so it rides the cart's bounce (`CartBounce`) and sits on
 * its top-right corner; it takes no room of its own and no touch. Hand it the count the words
 * beside the cart show and the same `bump` the cart bounces on: a landing that raises the count
 * bumps the disc (or pops it in, into an empty cart) as its digit rolls (`CountRoll`); any other
 * change is simply set. Hidden at zero.
 *
 * HIDDEN FROM ASSISTIVE TECHNOLOGY: the control the cart is in already says the count in words
 * ("Shopping list, 3 on the shopping list"), and a stray "3" read after it would be the same number
 * twice — the top bar's bell badge makes the same call (§8). Reduce motion and the amber Night:
 * nothing moves, and the number is simply the new one.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { cartBadgeColors } from '../theme/cartBadge';
import { useTheme } from '../theme/ThemeProvider';
import {
  CART_BADGE,
  CART_BADGE_MS,
  CART_BADGE_OUT,
  CART_BADGE_RING,
  cartBadgeFrames,
  cartBadgeMove,
  cartBadgeShown,
  cartBadgeText,
  type CartBadgeMove,
} from './cartBadge';
import { CountRoll } from './CountRoll';
import { num } from './PictureToggle';
import { motionStill } from './tickDraw';

export interface CartBadgeProps {
  /** Lines still to buy, as the words beside the cart say it. Nothing drawn at zero. */
  count: number;
  /** Each new number is one thing landing in the cart (the cart's own `bump`). */
  bump: number;
  /** What the badge's corner sits over — the card's color — for the keyline round the disc. */
  ground: string;
  testID?: string;
}

export function CartBadge({ count, bump, ground, testID }: CartBadgeProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  const c = cartBadgeColors(t.color, ground);
  // at rest at the END of a move, which is where the badge stands still
  const v = useRef(new Animated.Value(1)).current;
  const was = useRef({ count, bump });
  const [move, setMove] = useState<{ kind: CartBadgeMove; bump: number } | null>(null);

  // a layout effect, so the frame that shows the new number already has the disc where it starts
  useLayoutEffect(() => {
    const before = was.current;
    was.current = { count, bump };
    const kind = cartBadgeMove(before, { count, bump }, still);
    if (kind === null) {
      // nothing landed, or nothing may move: the badge is simply as it now is
      if (before.count !== count || before.bump !== bump) {
        setMove(null);
        v.setValue(1);
      }
      return;
    }
    v.setValue(0);
    setMove({ kind, bump });
  }, [count, bump, still, v]);

  useEffect(() => {
    if (move === null) return undefined;
    const run = Animated.timing(v, {
      toValue: 1,
      duration: CART_BADGE_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start(({ finished }) => {
      if (finished) setMove(null);
    });
    // a second landing, or the cart going away: stopped, and the next one starts over
    return () => run.stop();
  }, [move, v]);

  // reduce motion or Night turned on mid-move: the disc is whole at once
  useEffect(() => {
    if (still) v.setValue(1);
  }, [still, v]);

  const motion = useMemo(
    () =>
      move === null ? null : { transform: [{ scale: num(v, cartBadgeFrames(move.kind).scale) }] },
    [move, v],
  );

  if (!cartBadgeShown(count)) return null;
  return (
    <Animated.View
      pointerEvents="none"
      // the control round the cart says the count in words; the digit is presentation (§8)
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.badge,
        {
          top: -CART_BADGE_OUT,
          right: -CART_BADGE_OUT,
          minWidth: CART_BADGE,
          height: CART_BADGE,
          borderRadius: CART_BADGE / 2,
          borderWidth: CART_BADGE_RING,
          paddingHorizontal: t.space.xs,
          backgroundColor: c.fill,
          borderColor: c.ring,
        },
        motion,
      ]}
      {...(testID ? { testID } : {})}
    >
      <CountRoll
        variant="badge"
        // the bell badge's tabular digits: a 3 rolling to a 4 keeps the disc exactly its size
        numeric
        color={c.ink}
        value={count}
        bump={bump}
        // a11y-fixed-scale: a count in a badge disc of fixed size; the control the cart is in
        // says it in words
        allowFontScaling={false}
        style={styles.digits}
      >
        {cartBadgeText(count)}
      </CountRoll>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  // the badge role's tracking is for a word in capitals; a number is tighter
  digits: { letterSpacing: 0 },
});
