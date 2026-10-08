/**
 * PathCard + PathRow (docs/DESIGN_SYSTEM.md §15.1): "pick one of two ways" — time it live, or
 * enter one you have already done. A form visible before it is chosen reads as the rest of the
 * page, so the two routes are two equal tiles and nothing below asks for input until one is
 * tapped.
 *
 * VERSION TWO, 2026-09-26 (the owner, of the first redraw that morning: *"feels basic … the icon
 * still stays where it is, and the start feeding becomes 2 rows on the right side of the icon …
 * inverted color for … already finish"*). The route's disc stays at the left of the tile — PLAY for
 * Start, a CLOCK for Already finished — and the title is set beside it on two rows, "Start" over
 * "feeding". Start is the module's fill with a solid disc of its ink; Already finished is the same
 * pair inside out: the surface, edged in the ink, with a disc of the fill and the clock in the ink.
 * `pathCard.ts` holds the numbers, the colors, the layout rule and the motion, and says why the
 * title is split rather than given a second line; `pathCard.test.ts` measures them in every theme,
 * scheme and skin.
 *
 * THE PAIR DECIDES ITS SHAPE ONCE (`pathTileLayout`). The row measures its own width and reads the
 * phone's text size; if every word of both titles fits beside the disc, both tiles are drawn that
 * way, and if one word would not, both go back to the disc over the title. Two tiles of different
 * shapes would read as one of them having gone wrong, and a word is never broken or cut.
 *
 * CHOSEN, WITHOUT COLOR ALONE: the tile's edge becomes a heavy ink ring, and a check in its own disc
 * lands on the route disc's lower corner — plus the radio's checked state. The ring is the tile's
 * own border, thickened INTO its padding (`padding = pad − border`), so the tile keeps its size
 * and its content does not move by a point when it is chosen.
 *
 * A SMALL SPRING, AND A BREATH. A press dips the tile and springs it back; the check pops in on
 * the same spring; and while nothing is chosen the Start disc breathes a ring of its ink — the
 * timer is one tap away. Under reduce motion and in the amber Night none of it moves and nothing
 * glows (`pathStill`); the chosen tile is simply drawn chosen. No haptic: the Start that writes a
 * timer is felt once, by the write (`useTimerActions`), and a route picked is not a save.
 *
 * The props stay simple on purpose — a title, a kind, selected, onPress — so a sheet can hide the
 * whole row behind one condition (an edit of an entry has no route to choose). PathRow refuses
 * anything but two children in development: three routes is a list, not a pair of tiles.
 */
import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Icon } from '../icons/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useMotionAwake } from './MotionGate';
import {
  PATH_GLYPH,
  PATH_MOTION,
  PATH_TILE,
  PATH_TITLE_CAP,
  pathPulseFrames,
  pathStill,
  pathTileColors,
  pathTileLayout,
  pathTitleRows,
  type PathKind,
  type PathLayout,
  type PathModule,
} from './pathCard';
import { BodyStrong } from './Text';

export type { PathKind, PathModule } from './pathCard';

/** What the row tells its two tiles: whose color they wear, whether either is chosen, their shape. */
interface PathRowState {
  module: PathModule | null;
  /** Neither tile is chosen: the Start disc may breathe. */
  open: boolean;
  layout: PathLayout;
}

const PathRowContext = createContext<PathRowState>({ module: null, open: true, layout: 'beside' });

export interface PathCardProps {
  title: string;
  /** `start` times it live (a play mark); `finished` enters one already done (a clock). */
  kind: PathKind;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function PathCard({
  title,
  kind,
  selected,
  onPress,
  disabled = false,
  style,
  testID,
}: PathCardProps) {
  const t = useTheme();
  const row = useContext(PathRowContext);
  const c = pathTileColors(t.color, row.module, t.theme, kind);
  const still = pathStill(t.reduceMotion, t.theme);
  const scale = useRef(new Animated.Value(1)).current;
  const badge = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const frames = useMemo(pathPulseFrames, []);
  const rows = useMemo(() => pathTitleRows(title), [title]);

  /*
    THE CHECK POPS IN WHEN THIS TILE BECOMES THE CHOSEN ONE — and only then: a tile that opens
    already chosen (a sheet opened on a slot that is over starts on Already finished) is drawn
    with its check in place, because nothing was just chosen to answer.
  */
  const wasSelected = useRef(selected);
  useEffect(() => {
    const became = selected && !wasSelected.current;
    wasSelected.current = selected;
    if (!became || still) {
      badge.setValue(1);
      return undefined;
    }
    badge.setValue(PATH_MOTION.badgeFrom);
    const pop = Animated.spring(badge, {
      toValue: 1,
      ...PATH_MOTION.spring,
      useNativeDriver: true,
    });
    pop.start();
    return () => pop.stop();
  }, [selected, still, badge]);

  // the Start disc breathes while nothing is chosen (see the header); stopped, it is gone at once
  const breathing = kind === 'start' && row.open && !disabled && !still && c.pulse !== null;
  // and its clock turns only while the sheet can be seen — the app open, its page in front
  // (`useMotionAwake`, docs/DESIGN_SYSTEM.md §7.1); paused, the ring rests where a breath begins
  const awake = useMotionAwake();
  const turning = breathing && awake;
  useEffect(() => {
    if (!turning) {
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: PATH_MOTION.pulse.ms,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(PATH_MOTION.pulse.restMs),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [turning, pulse]);

  // the small spring: dip while the finger is down, spring past 1 and home as it lifts
  const press = (down: boolean) => {
    if (still || disabled) return;
    if (down) {
      Animated.timing(scale, {
        toValue: PATH_MOTION.pressScale,
        duration: PATH_MOTION.pressMs,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(scale, { toValue: 1, ...PATH_MOTION.spring, useNativeDriver: true }).start();
    }
  };

  const border = selected ? PATH_TILE.ring : PATH_TILE.edge[kind];
  const disc = PATH_TILE.disc;
  const beside = row.layout === 'beside';
  // the check's disc with the ring of tile that cuts it out of the route disc, as one circle
  const cut = PATH_TILE.badge + 2 * PATH_TILE.badgeCut;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={title}
      accessibilityState={{ checked: selected, selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => press(true)}
      onPressOut={() => press(false)}
      style={({ pressed }) => [
        styles.press,
        // still, a press is seen as a dim rather than a movement
        { opacity: disabled ? 0.5 : pressed && still ? 0.85 : 1 },
        style,
      ]}
      {...(testID ? { testID } : {})}
    >
      <Animated.View
        style={[
          styles.tile,
          beside ? styles.beside : styles.stacked,
          {
            borderRadius: t.radius.l,
            backgroundColor: c.ground,
            borderColor: selected ? c.ring : c.edge,
            borderWidth: border,
            // the outline grows INTO the padding, so the tile and what it holds never move
            padding: PATH_TILE.pad - border,
            gap: beside ? PATH_TILE.gap : PATH_TILE.stackGap,
            transform: [{ scale }],
          },
        ]}
      >
        <View style={{ width: disc, height: disc }}>
          {/* the breath: drawn only while it runs, so a still or a chosen row has no ring at all */}
          {breathing && c.pulse !== null ? (
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: disc / 2,
                  borderWidth: 2,
                  borderColor: c.pulse,
                  opacity: pulse.interpolate(frames.opacity),
                  transform: [{ scale: pulse.interpolate(frames.scale) }],
                },
              ]}
            />
          ) : null}
          <View
            style={[
              styles.center,
              { width: disc, height: disc, borderRadius: disc / 2, backgroundColor: c.disc },
            ]}
          >
            <Icon
              name={PATH_GLYPH[kind]}
              size={PATH_TILE.glyph}
              color={c.glyph}
              {...(kind === 'finished' ? { strokeWidth: PATH_TILE.glyphStroke } : {})}
            />
          </View>
          {/* the check, on the disc's lower corner: the title beside the disc keeps every point
              of its room, and a ring of the tile cuts the check out of the disc it overlaps */}
          {selected ? (
            <Animated.View
              style={[
                styles.center,
                styles.badge,
                {
                  right: -PATH_TILE.badgeOut - PATH_TILE.badgeCut,
                  bottom: -PATH_TILE.badgeOut - PATH_TILE.badgeCut,
                  width: cut,
                  height: cut,
                  borderRadius: cut / 2,
                  borderWidth: PATH_TILE.badgeCut,
                  borderColor: c.cut,
                  backgroundColor: c.badge,
                  transform: [{ scale: badge }],
                },
              ]}
            >
              <Icon name="check" size={PATH_TILE.check} color={c.check} strokeWidth={2.8} />
            </Animated.View>
          ) : null}
        </View>
        {/* the title on its rows ("Start" / "feeding"). Each row may wrap between its words
            ("tummy" / "time") and never inside one: the row has already checked that every word
            fits (`pathTileLayout`). The tile is named by the whole title, so these are not read. */}
        <View
          style={beside ? styles.words : null}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {rows.map((line, i) => (
            <BodyStrong key={`${i}.${line}`} color={c.title} maxFontSizeMultiplier={PATH_TITLE_CAP}>
              {line}
            </BodyStrong>
          ))}
        </View>
      </Animated.View>
    </Pressable>
  );
}

export interface PathRowProps {
  /** Exactly two PathCards: `start`, then `finished`. */
  children: ReactNode;
  /** The module the sheet logs: both tiles wear its color, as its tile on Today does. */
  moduleId: PathModule;
  /**
   * The choice being made ("How do you want to log this pump?"), read as the radio group's
   * name. Optional: each tile announces its own title; a label tells a screen reader what the
   * pair decides before the first one.
   */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Two path tiles, side by side, equal width and equal height (§15.1 `.pathrow`). */
export function PathRow({ children, moduleId, accessibilityLabel, style, testID }: PathRowProps) {
  const t = useTheme();
  const { fontScale } = useWindowDimensions();
  // the row's own width, measured: the layout is decided against it (0 until the first layout,
  // which `pathTileLayout` draws beside — the layout every phone gets at its own text size)
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };
  const count = Children.count(children);
  if (count !== 2 && process.env.NODE_ENV !== 'production') {
    throw new Error(
      `PathRow takes exactly two PathCards (got ${count}): three routes is a list, not a pair of cards (docs/DESIGN_SYSTEM.md §15.1).`,
    );
  }
  // whether either tile is chosen, and what both say, read off the tiles' own props: the row holds
  // no state of its own but its width
  const cards = Children.toArray(children).filter((child): child is ReactElement<PathCardProps> =>
    isValidElement<PathCardProps>(child),
  );
  const open = !cards.some(child => child.props.selected);
  const layout = pathTileLayout(
    width,
    t.space.lg,
    fontScale,
    cards.map(child => child.props.title),
  );
  const state = useMemo(() => ({ module: moduleId, open, layout }), [moduleId, open, layout]);
  return (
    <PathRowContext.Provider value={state}>
      <View
        accessibilityRole="radiogroup"
        {...(accessibilityLabel ? { accessibilityLabel } : {})}
        onLayout={onLayout}
        style={[styles.row, { gap: t.space.lg }, style]}
        {...(testID ? { testID } : {})}
      >
        {Children.map(children, child => (child ? <View style={styles.half}>{child}</View> : null))}
      </View>
    </PathRowContext.Provider>
  );
}

const styles = StyleSheet.create({
  press: { flex: 1, minWidth: 0 },
  tile: { flex: 1 },
  beside: { flexDirection: 'row', alignItems: 'center' },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  words: { flex: 1, minWidth: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute' },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  half: { flex: 1, minWidth: 0, flexDirection: 'row' },
});
