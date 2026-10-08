/**
 * The heart that stretches with a pull (`markPull.ts` has the curve, the springs and every rule):
 * the three values it moves on, the transform it hands the top bar, and the four moments a page
 * reports. The page drives `offset` with its own scroll events on the native side; the top bar
 * wraps the mark in `style` (anchored at the mark's top); this hook never renders anything.
 *
 * THREE VALUES, ONE STRETCH (`scaleY − 1`), all on the native driver:
 *   `offset`  the page's offset, driven by its scroll events — the pull;
 *   `follow`  1 while a finger is on the page, 0 otherwise: the heart follows the pull only then;
 *   `bounce`  the heart's own spring once the finger lets go, from exactly the stretch it had.
 * The stretch is `pull × follow + bounce`, so letting go hands the heart from the page to its spring
 * with no jump: `follow` drops to 0 in the same breath as `bounce` takes the stretch it had.
 *
 * WHEN NOTHING MOVES — reduce motion, the amber Night (`motionStill`) — there is no style and every
 * report is ignored: the mark is the mark, and the page's refresh is the platform's own.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Platform, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import {
  MARK_PULL,
  MARK_PULL_FRAME,
  markKick,
  markOnSync,
  markRelease,
  type MarkRun,
} from './markPull';
import { motionStill } from './tickDraw';

export interface MarkPull {
  /** The page's offset: drive it with the page's scroll events (`Animated.event`, native). */
  offset: Animated.Value;
  /** The mark's transform, for the top bar's `markMotion`; undefined when nothing may move. */
  style: Animated.WithAnimatedObject<ViewStyle> | undefined;
  /** A finger went down on the page. Nothing follows while the page is already syncing. */
  beginDrag(syncing: boolean): void;
  /** The finger let go, with the page at `offsetY`. */
  endDrag(offsetY: number): void;
  /** The page started syncing — during a pull (iOS) or as it was let go (Android). */
  synced(): void;
}

/**
 * WHETHER THE PAGE ITSELF GOES PAST ITS TOP when it is pulled: iOS's scroll view does, and its
 * refresh control starts the sync while the finger is still down; Android's refresh layout keeps the
 * page where it is, draws its spinner over it, and starts the sync as the finger lets go.
 */
const PAGE_OVERSCROLLS = Platform.OS !== 'android';

export function useMarkPull(external?: Animated.Value): MarkPull {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  const own = useRef(new Animated.Value(0)).current;
  const offset = external ?? own;
  const follow = useRef(new Animated.Value(0)).current;
  const bounce = useRef(new Animated.Value(0)).current;
  const run = useRef<Animated.CompositeAnimation | null>(null);
  const dragging = useRef(false);
  const syncedInDrag = useRef(false);

  const spring = useCallback(
    (r: MarkRun) => {
      run.current?.stop();
      // the page lets go of the heart in the same breath as its spring takes it
      follow.setValue(0);
      bounce.setValue(r.from);
      const next = Animated.spring(bounce, {
        toValue: 0,
        velocity: r.velocity,
        ...r.spring,
        useNativeDriver: true,
      });
      run.current = next;
      next.start();
    },
    [bounce, follow],
  );

  // reduce motion or the amber Night arriving, or the page going away: the heart at rest, at once
  useEffect(() => {
    if (!still) return undefined;
    run.current?.stop();
    follow.setValue(0);
    bounce.setValue(0);
    dragging.current = false;
    return undefined;
  }, [still, follow, bounce]);
  useEffect(() => () => run.current?.stop(), []);

  const beginDrag = useCallback(
    (syncing: boolean) => {
      if (still || syncing) return;
      run.current?.stop();
      bounce.setValue(0);
      follow.setValue(1);
      dragging.current = true;
      syncedInDrag.current = false;
    },
    [still, bounce, follow],
  );

  const endDrag = useCallback(
    (offsetY: number) => {
      if (!dragging.current) return;
      dragging.current = false;
      const r = markRelease(offsetY, syncedInDrag.current);
      if (r === null) follow.setValue(0);
      else spring(r);
    },
    [follow, spring],
  );

  const synced = useCallback(() => {
    if (still) return;
    // a finger still on a pulled page (iOS starts its sync mid-pull): the letting go bounces
    if (markOnSync(dragging.current, PAGE_OVERSCROLLS) === 'wait') {
      syncedInDrag.current = true;
      return;
    }
    // none, or a page that never moved (Android's refresh layout starts it as the finger lifts)
    dragging.current = false;
    spring(markKick());
  }, [still, spring]);

  const style = useMemo(() => {
    if (still) return undefined;
    const pull = offset.interpolate({
      inputRange: [...MARK_PULL_FRAME.inputRange],
      outputRange: [...MARK_PULL_FRAME.outputRange],
      extrapolate: MARK_PULL_FRAME.extrapolate,
    });
    const stretch = Animated.add(Animated.multiply(pull, follow), bounce);
    // linear in the stretch, and extended: the bounce passes rest the other way, a squash
    const { squash } = MARK_PULL;
    return {
      transform: [
        {
          scaleX: stretch.interpolate({
            inputRange: [-1, 1],
            outputRange: [1 + squash, 1 - squash],
            extrapolate: 'extend',
          }),
        },
        {
          scaleY: stretch.interpolate({
            inputRange: [-1, 1],
            outputRange: [0, 2],
            extrapolate: 'extend',
          }),
        },
      ],
    };
  }, [still, offset, follow, bounce]);

  return { offset, style, beginDrag, endDrag, synced };
}
