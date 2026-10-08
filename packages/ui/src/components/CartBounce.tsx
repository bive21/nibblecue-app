/**
 * CartBounce — a cart that bounces when something lands in it (the owner, 2026-09-26: *"adding
 * from Supplies flies the item into the list, and the cart bounces"*). Wrap the cart; bump `bump`
 * when a thing lands. `cartFlight.ts` has the bounce: 1 → 1.18 → 0.95 → 1.03 → 1 with a wobble
 * either way, 340 ms (`CART_BOUNCE_KEYS`).
 *
 * Only a change this sees is played: the value it is first given bounces nothing, so opening the
 * page never plays a landing nobody made. A second landing while it bounces starts it again.
 *
 * It is the cart's own box, moved and nothing else: no size of its own, no touch of its own and
 * nothing to read out — the control it sits in is the caller's. Under reduce motion and in the
 * amber Night it never moves (`motionStill`). Transforms on the native driver.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { CART_BOUNCE_MS, cartBounceFrames } from './cartFlight';
import { deg, num } from './PictureToggle';
import { motionStill } from './tickDraw';

export interface CartBounceProps {
  /** Each new number is one thing landing: one bounce. */
  bump: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function CartBounce({ bump, children, style }: CartBounceProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  // at rest at the END of a bounce, which is where the cart stands still
  const v = useRef(new Animated.Value(1)).current;
  const seen = useRef(bump);

  useEffect(() => {
    if (bump === seen.current) return undefined;
    seen.current = bump;
    if (still) return undefined;
    v.setValue(0);
    const run = Animated.timing(v, {
      toValue: 1,
      duration: CART_BOUNCE_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start();
    // a second landing, or the cart going away: it stands where it is and the next one starts over
    return () => run.stop();
  }, [bump, still, v]);

  // reduce motion or Night turned on mid-bounce: the cart stands still at once
  useEffect(() => {
    if (still) v.setValue(1);
  }, [still, v]);

  const motion = useMemo(() => {
    const f = cartBounceFrames();
    return { transform: [{ scale: num(v, f.scale) }, { rotate: deg(v, f.turn) }] };
  }, [v]);

  return <Animated.View style={[style, motion]}>{children}</Animated.View>;
}
