/**
 * CartFlight — the chips the Supplies page throws into its cart (the owner, 2026-09-26: *"Shopping:
 * adding from Supplies flies the item into the list, and the cart bounces."*). `cartFlight.ts` has
 * every frame, where the throw goes when the cart is scrolled away, and the tests that hold it.
 *
 * IT IS A LAYER OVER THE PAGE, like `PaperPlane`: the caller puts it in the screen's overlay (over
 * the scroller and clipped to it), and hands it every chip in the air — where it was thrown from
 * (the + that was tapped), where it is going (the cart), what it looks like (the caller's own chip:
 * the item's category square) and when it was thrown. Each chip measures the + and the cart in the
 * window once, as it is thrown, and flies from one to the other.
 *
 * AN END CAN BE A REF (2026-09-26, the shopping list's drop into its basket): a caller whose target
 * is drawn by the same render as the throw — the "In the basket" heading, which the first tick of a
 * trip brings onto the page — hands the ref, and it is read as the chip is measured, after that
 * render has laid the heading out. A view handed as itself is measured as it always was.
 *
 * IT NEVER DECIDES THE LANDING. The haptic, the bounce and the count are the caller's, on its own
 * clock (`cartLanding`): a chip that could not be measured is simply not drawn, and one measured a
 * frame after the tap joins the flight where the clock says it is, so it reaches the cart as the
 * cart bounces. The caller takes a chip out of the list when it lands.
 *
 * DECORATION ONLY: `pointerEvents="none"` and hidden from assistive technology — the + turning into
 * "On list", the count and the toast say it all without it. Under reduce motion and in the amber
 * Night nothing is drawn (`motionStill`).
 *
 * Opacity and transforms on the native driver, one value per chip.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { CART_CHIP, CART_LAND_MS, cartFlightFrames, cartRoute, type CartRoute } from './cartFlight';
import { deg, num } from './PictureToggle';
import { motionStill } from './tickDraw';

/** Where a chip leaves or lands: a view, or a ref to one, read as the chip is measured. */
export type CartEnd = View | null | RefObject<View | null>;

/** The view an end names, as it is now. */
const viewOf = (end: CartEnd): View | null =>
  end !== null && 'current' in end ? end.current : end;

export interface CartThrow {
  /** Which throw this is: one per tap. */
  id: number;
  /** When it was thrown (`Date.now()` on the tap): the chip keeps to the caller's clock. */
  at: number;
  /** The + that was tapped. Measured once, as the chip is thrown. */
  from: CartEnd;
  /** The cart it is thrown into. */
  to: CartEnd;
  /** What flies: the caller's own chip, drawn inside a `CART_CHIP` square. */
  chip: ReactNode;
}

export interface CartFlightProps {
  /** Every chip in the air. A new one is measured and thrown; one taken out is gone. */
  throws: readonly CartThrow[];
}

export function CartFlight({ throws }: CartFlightProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  // the layer itself, measured against the + and the cart so the chip starts on the one it left
  const sky = useRef<View>(null);
  return (
    <View
      ref={sky}
      collapsable={false}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={StyleSheet.absoluteFill}
    >
      {still ? null : throws.map(x => <Chip key={x.id} thrown={x} sky={sky} />)}
    </View>
  );
}

function Chip({ thrown, sky }: { thrown: CartThrow; sky: RefObject<View | null> }) {
  const p = useRef(new Animated.Value(0)).current;
  const [route, setRoute] = useState<CartRoute | null>(null);

  // measured ONCE, on the throw, while the page is where the parent tapped it
  useEffect(() => {
    const layer = sky.current;
    const from = viewOf(thrown.from);
    const to = viewOf(thrown.to);
    if (layer === null || from === null || to === null) return;
    let live = true;
    layer.measureInWindow((lx, ly, lw, lh) => {
      from.measureInWindow((fx, fy, fw, fh) => {
        to.measureInWindow((tx, ty, tw, th) => {
          // a + or a cart with no box is not on the screen to throw from or to
          if (!live || fw <= 0 || fh <= 0 || tw <= 0 || th <= 0 || lw <= 0 || lh <= 0) return;
          setRoute(
            cartRoute(
              { x: fx - lx + fw / 2, y: fy - ly + fh / 2 },
              { x: tx - lx + tw / 2, y: ty - ly + th / 2 },
              { width: lw, height: lh },
            ),
          );
        });
      });
    });
    return () => {
      live = false;
    };
  }, [thrown, sky]);

  // flown on the caller's clock: a chip measured late joins the throw where it should be by now
  useEffect(() => {
    if (route === null) return undefined;
    const gone = Math.min(Math.max(Date.now() - thrown.at, 0), CART_LAND_MS);
    p.setValue(gone / CART_LAND_MS);
    const run = Animated.timing(p, {
      toValue: 1,
      duration: CART_LAND_MS - gone,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [route, thrown.at, p]);

  const style = useMemo(() => {
    if (route === null) return null;
    const f = cartFlightFrames(route);
    return {
      opacity: num(p, f.opacity),
      transform: [
        { translateX: num(p, f.x) },
        { translateY: num(p, f.y) },
        { rotate: deg(p, f.turn) },
        { scale: num(p, f.scale) },
      ],
    };
  }, [route, p]);

  if (style === null) return null;
  return <Animated.View style={[styles.chip, style]}>{thrown.chip}</Animated.View>;
}

const styles = StyleSheet.create({
  // centered on the layer's origin, so its translation is the chip's center
  chip: {
    position: 'absolute',
    left: -CART_CHIP / 2,
    top: -CART_CHIP / 2,
    width: CART_CHIP,
    height: CART_CHIP,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
