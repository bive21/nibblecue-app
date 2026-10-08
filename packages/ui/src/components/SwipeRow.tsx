/**
 * SwipeRow — THE APP'S ONE SWIPE (2026-09-29): a row slid to the left shows an action behind it.
 * The shopping list's lines slide to Remove (S5, 2026-09-26), and since the owner's request of
 * 2026-09-29 the log's entries slide to Delete, on Today and on the Activity log. `swipeRow.ts`
 * holds every number and rule and tests them; this file hands a finger's travel to them and draws
 * what they return. It was `ListRow.tsx`'s own until the log needed the same thing: one swipe, so a
 * thumb that knows one list knows the other.
 *
 * `PanResponder` AND `Animated`, NO GESTURE LIBRARY. `react-native-gesture-handler` and
 * `react-native-reanimated` are not in this app, and adding two native dependencies for one gesture
 * is a rebuild, a review and a bundle (`QuickArrange.tsx` made the same call for the same reason).
 *
 * WHAT A FINGER DOES. The row never takes a touch where it lands, so everything on it keeps its
 * taps. It takes one only once the finger has gone `SWIPE_CLAIM` points sideways and further
 * sideways than down (`swipeClaims`), so a vertical drag anywhere on the list scrolls the page. THE
 * WHOLE WIDTH IS THE TRACK: the row follows the finger as far left as it goes, and where it is let
 * go decides (`swipeRelease`): home, open on the action, or — for a row whose swipe takes its action
 * (`removes`, the shopping list) — straight into it, felt once. The gesture is built once, so what
 * it calls at the end reads through refs that every render keeps current.
 *
 * ONE ROW OUT AT A TIME, anywhere in the app (`swipes`). A row that comes out sends the one before
 * it home. While a row is out, a tap on it only sends it home (its words are covered by a catcher
 * that takes the tap), a touch on any other row sends it home and is spent on that, a touch
 * anywhere in an area that says so (`swipeAreaCapture`: Today's page, the Activity log's list) sends
 * it home without being spent, a scroll the caller reports does (`shutSwipes`), and so does its page
 * going out of view. A swipe back to the right shuts it, as it always did.
 *
 * WHAT IS BEHIND IT (`backing`). The action's word, white on the danger fill as the danger Button's
 * is, the action's own width at the row's right edge: a button of 88 × the row's height, never
 * under 44. Where the row is a shopping line (`always`), the action is drawn behind the row
 * whenever it can swipe and a screen reader reaches it as a button of its own, as it always did —
 * some lines have no other way off the list. Where the row is one element with its own actions
 * (`out`, a log entry), the action is drawn only while the row is out, so a screen reader never
 * meets a button hidden under a row; the caller gives the row the same action as a custom
 * accessibility action (`TimelineItem`).
 *
 * THE SLIDING LAYER HOLDS ITS SIZE WHILE IT IS OUT (docs/DESIGN_SYSTEM.md §7.1 rule 6). Its
 * transform runs on the native driver, and on iOS React Native re-applies a view's transform from
 * React's props whenever the view's size changes — props that hold a native-driven value's starting
 * point until its animation ends. A row whose words changed mid-swipe (a sync, a queued badge going)
 * would be put back where the swipe began and stay there. So from the moment a finger takes the row
 * until it is home again, the layer is pinned at the size it had, and what is inside it lays out
 * within that; home, it takes its own size again, with its transform already at rest.
 *
 * WHILE IT IS OUT the layer stands on the solid surface, covering the danger fill until it is
 * slid off it; at rest a log row keeps no ground of its own and sits on its card as it always has.
 * Reduce motion and the amber Night keep the swipe as it is: the row follows the finger and slides
 * the last few points home or open in 140 ms, the answer to the drag rather than a flourish, and
 * there is nothing else here to hold still (what a screen draws as a row LEAVES is the screen's own,
 * under its own still rule).
 */
import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { haptic } from '../feedback/haptics';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenInFront } from './MotionGate';
import { AppText } from './Text';
import {
  SWIPE_BACK_MS,
  SWIPE_OPEN,
  SWIPE_SETTLE_MS,
  swipeClaims,
  swipeFollow,
  swipeRelease,
  swipes,
} from './swipeRow';

/** What the caller is handed with its action: the row, to send home when the action is done with. */
export interface SwipeRowHandle {
  /** Home: slid there (the default), or at once — a row about to go should not first slide back. */
  shut(animated?: boolean): void;
}

export interface SwipeRowProps {
  children: ReactNode;
  /** The action's word behind the row, the caller's copy: `Remove`, `Delete`. */
  label: string;
  /** What a screen reader hears for the action's button, naming the row: `Remove Wipes`. */
  accessibilityLabel: string;
  /**
   * The action, asked for by its button (and, with `removes`, by a swipe let go far enough). It is
   * handed the row, which stays where it is until the caller says otherwise: the shopping list lets
   * it go off the edge from there, the log sends it home once its question is answered.
   */
  onAction: (row: SwipeRowHandle) => void;
  /**
   * Off: the row does not swipe, nothing is drawn behind it and nothing clips it. The tree keeps its
   * shape either way, so whatever is inside stays mounted across the change (ListRow's basket).
   */
  enabled?: boolean;
  /**
   * A swipe let go past half the row, or flicked out once the action shows, takes the action at
   * once (the shopping list, S5). Off: the row stops open on it, and the action is a tap away — the
   * log's Delete asks first, so no swipe may take it.
   */
  removes?: boolean;
  /** Where the action lives while the row is home (see the header). */
  backing?: 'always' | 'out';
  /** The sliding layer's own style: a row that lays its contents out here (ListRow). */
  style?: StyleProp<ViewStyle>;
  /** The row's own id, on its outer view. A row whose id is on its contents leaves this out. */
  testID?: string;
  /** The action's button. */
  actionTestID: string;
  /** The row's handle, for an action asked for from inside it (a screen reader's, `TimelineItem`). */
  ref?: Ref<SwipeRowHandle>;
}

/** The size the sliding layer is pinned at while the row is out. */
interface Pinned {
  width: number;
  height: number;
}

/** What moves the row, rebuilt each render and read through one ref by the gesture built once. */
interface RowMoves {
  /** A finger took it: out, and pinned at its size. */
  leave(): void;
  /** Home: no longer out, and no longer pinned. */
  rest(): void;
  /** Slide (or set, `animated` false) to `to`: 0 is home, `-SWIPE_OPEN` open on the action. */
  settle(to: number, animated?: boolean): void;
}

export function SwipeRow({
  children,
  label,
  accessibilityLabel,
  onAction,
  enabled = true,
  removes = false,
  backing = 'always',
  style,
  testID,
  actionTestID,
  ref,
}: SwipeRowProps) {
  const t = useTheme();
  const inFront = useScreenInFront();
  const [id] = useState(() => swipes.nextId());
  const x = useRef(new Animated.Value(0)).current;
  /** Resting open on the action: where the next drag starts from. */
  const open = useRef(false);
  /** A finger has the row: nothing sends it home until it lets go. */
  const held = useRef(false);
  /** The row's width: the track, and half of it is far (`swipeRelease`). */
  const width = useRef(0);
  /** The sliding layer's size as last laid out: what it is pinned at while it is out. */
  const size = useRef<Pinned>({ width: 0, height: 0 });
  /** Out of its place (a finger took it, it rests open, or it was let go into its action). */
  const [out, setOut] = useState<Pinned | null>(null);
  const isOut = useRef(false);
  /** The slide back for a row let go into its action whose write never drew it going. */
  const back = useRef<ReturnType<typeof setTimeout> | null>(null);

  const act = useRef(onAction);
  act.current = onAction;
  const removesNow = useRef(removes);
  removesNow.current = removes;

  const moves = useRef<RowMoves | null>(null);
  /** Sends the row home, for the registry and for the caller; one function for the row's life. */
  const [shutRow] = useState(() => (animated: boolean) => moves.current?.settle(0, animated));
  const handle = useMemo<SwipeRowHandle>(
    () => ({ shut: (animated = true) => shutRow(animated) }),
    [shutRow],
  );
  useImperativeHandle(ref, () => handle, [handle]);

  moves.current = {
    leave: () => {
      if (isOut.current) return;
      isOut.current = true;
      setOut({ ...size.current });
    },
    rest: () => {
      open.current = false;
      swipes.home(id);
      if (!isOut.current) return;
      isOut.current = false;
      setOut(null);
    },
    settle: (to, animated = true) => {
      // a finger has it: it goes where the finger lets it go, and nowhere before
      if (held.current) return;
      open.current = to !== 0;
      if (open.current) swipes.out(id, shutRow);
      if (!animated) {
        x.setValue(to);
        if (to === 0) moves.current?.rest();
        return;
      }
      // home only once it has arrived: a slide cut short by a new drag leaves the row out, pinned
      Animated.timing(x, { toValue: to, duration: SWIPE_SETTLE_MS, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished && to === 0) moves.current?.rest();
        },
      );
    },
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => swipeClaims(g.dx, g.dy),
      onPanResponderGrant: () => {
        held.current = true;
        swipes.out(id, shutRow);
        moves.current?.leave();
      },
      onPanResponderMove: (_e, g) => {
        x.setValue(swipeFollow(open.current ? -SWIPE_OPEN : 0, g.dx, width.current));
      },
      onPanResponderRelease: (_e, g) => {
        held.current = false;
        const from = open.current ? -SWIPE_OPEN : 0;
        const at = Math.min(0, from + g.dx);
        const end = swipeRelease(at, g.vx, width.current, SWIPE_OPEN, removesNow.current);
        if (end !== 'remove') {
          moves.current?.settle(end === 'open' ? -SWIPE_OPEN : 0);
          return;
        }
        /*
          LET GO INTO ITS ACTION (the shopping list's S5): felt once, and left where the finger let
          it go — its screen draws it carrying on from there as its gap closes. It is no longer the
          row out: nothing may send it home under that. If it is still here a moment later, its
          write did not land and nothing drew it going: it slides back home.
        */
        open.current = false;
        swipes.home(id);
        haptic('tap');
        act.current(handle);
        if (back.current !== null) clearTimeout(back.current);
        back.current = setTimeout(() => {
          back.current = null;
          moves.current?.settle(0);
        }, SWIPE_BACK_MS);
      },
      onPanResponderTerminate: () => {
        held.current = false;
        moves.current?.settle(0);
      },
    }),
  ).current;

  // a row that goes leaves no timer behind to move it, and no claim to being out
  useEffect(
    () => () => {
      if (back.current !== null) clearTimeout(back.current);
      swipes.home(id);
    },
    [id],
  );

  // a row that can no longer swipe — a line ticked from the other phone while it was out — comes
  // to rest where it stands rather than slid half off a row with nothing behind it any more
  useEffect(() => {
    if (enabled) return;
    held.current = false;
    x.setValue(0);
    moves.current?.rest();
  }, [enabled, x]);

  // its page out of view: home at once, so nobody comes back to a Delete left showing
  useEffect(() => {
    if (!inFront) shutRow(false);
  }, [inFront, shutRow]);

  const behind = enabled && (backing === 'always' || out !== null);
  return (
    <View
      style={behind ? styles.clip : undefined}
      // the swipe's track: how far is half the row, and how far is off it
      onLayout={e => {
        width.current = e.nativeEvent.layout.width;
      }}
      // a touch on this row while another is out sends that one home, and is spent on it
      onStartShouldSetResponderCapture={() => swipes.touchRow(id)}
      {...(testID !== undefined ? { testID } : {})}
    >
      {/* the action, drawn underneath and reached by a finger once the row is slid off it */}
      {behind ? (
        <View style={[styles.behind, { backgroundColor: t.color.dangerFill }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            // the row is left where it is: the caller decides where it goes from here
            onPress={() => act.current(handle)}
            style={({ pressed }) => [
              styles.center,
              { width: SWIPE_OPEN, height: '100%', opacity: pressed ? 0.8 : 1 },
            ]}
            testID={actionTestID}
          >
            {/* WHITE ON THE DANGER FILL, the pairing measured in every theme ("white on
                dangerFill", contrast.test.ts) and the danger Button's own. It was the flat accent's
                ink (`onAccent`), which is white only in light: dark and Night drew the word in a near
                black on a dark red, 1.7:1 and less (swipeRow.test.ts measures both). */}
            <AppText variant="bodySm" color={t.onGradient} style={styles.semibold}>
              {label}
            </AppText>
          </Pressable>
        </View>
      ) : null}

      <Animated.View
        {...(enabled ? pan.panHandlers : {})}
        onLayout={e => {
          const { width: w, height: h } = e.nativeEvent.layout;
          size.current = { width: w, height: h };
        }}
        style={[
          style,
          // the row slides; where anything is behind it, it stands on the solid surface over it
          enabled ? { transform: [{ translateX: x }] } : null,
          behind ? { backgroundColor: t.color.surfaceSolid } : null,
          // §7.1 rule 6: out of its place, the layer that moves holds its size (a row a finger took
          // before its first layout arrived has no size to hold, and is never pinned at nothing)
          out !== null && out.width > 0 && out.height > 0
            ? { width: out.width, height: out.height }
            : null,
        ]}
      >
        {children}
        {/* OUT, THE ROW'S OWN WORDS ARE COVERED: a tap on them sends it home and does nothing else,
            and a drag on them is still the row's (its gesture claims the move from this catcher) */}
        {out !== null ? (
          <View
            style={StyleSheet.absoluteFill}
            onStartShouldSetResponder={() => true}
            onResponderRelease={() => shutRow(true)}
          />
        ) : null}
      </Animated.View>
    </View>
  );
}

/**
 * A TOUCH IN AN AREA THAT SENDS AN OUT ROW HOME, for the area's own capture phase: Today's page, the
 * Activity log's list. It never takes the touch — it only notes it, and once the touch has been
 * dispatched a row out that it did not land on goes home (`SwipeRegistry.touchArea`).
 */
export const swipeAreaCapture = (): boolean => {
  swipes.touchArea();
  return false;
};

/** Every row home: a page that scrolled calls this. A row a finger still has is left to the finger. */
export const shutSwipes = (): void => swipes.shutAll(true);

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  behind: { ...StyleSheet.absoluteFill, alignItems: 'flex-end', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  semibold: { fontWeight: '600' },
});
