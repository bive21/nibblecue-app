/**
 * Button (docs/DESIGN_SYSTEM.md §5, docs/MOBILE.md §4). `primary` is the brand gradient with a
 * white label (the light end is tuned for white — §11); `secondary` is the surface with a
 * hairline; `danger` is the dangerFill token, never the crit text ink (§12 rule 3); `ghost` is
 * the accent ink on nothing. A filled control is never frosted (§13 rule 1): whatever the skin,
 * a button stays solid. Disabled looks disabled (R-11): opacity, accessibilityState, no press
 * feedback. Min height 44; `lg` is the 54pt sheet CTA.
 *
 * `loading` is a button waiting on the server — signing in, sending a link, joining a household —
 * and it draws the mark travelling its ∞ in the label's own ink (`LogoLoader`, the owner's
 * decision of 2026-09-26; docs/BRANDING.md §2, "Waiting"), or the platform's spinner in that ink
 * where the app has installed no mark. The label and its glyph stay LAID OUT underneath, unseen,
 * so the button keeps its width and height while it waits: it does not shrink round a spinner
 * and jump back when the answer comes. It says busy; the loader itself is hidden from assistive
 * technology, so a screen reader hears the button once.
 *
 * `done` is a Save whose entry has been written (the owner, 2026-09-26, "agreed"; `saveTick.ts`):
 * the words step up and fade in 100 ms and a check draws itself where they were, in their ink — the
 * checklists' own `TickMark`, the same glyph and the same 220 ms pen. The words stay laid out, as a
 * waiting button's do, so nothing around the button moves, and a press while it shows the check is
 * let go: the entry it would write is already written. Nothing new is said or focusable — the check
 * is hidden from assistive technology, the toast has already said what was saved — and nothing is
 * felt here: the one haptic a save makes is the write funnel's. Reduce motion and the amber Night
 * show the finished check at once, the words already gone.
 *
 * INSIDE A LOG SHEET a `primary` button is the MODULE'S (the owner, 2026-09-26: *"perhaps it will
 * look better if it's in the module's color instead"*; `theme/moduleButton.ts`): a sheet that wraps
 * its body in `ModuleTint` gets its Save, its Start and its running panel's button drawn as a solid
 * fill of the module's deep ink with a white label measured at 5.5:1, in place of the scheme's
 * gradient — the check above draws in that label's ink, so a Save still ticks. Every other variant,
 * every button outside a log sheet, and every button in the amber Night is drawn as before. A SOFT
 * module's button (the diaper's, since 2026-09-26: *"the red color is too intimidating like in
 * diaper"*) is a coral fill under an oxblood label, edged in that oxblood (`paint.edge`), because a
 * fill that light does not part itself from a white sheet on its own.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconProps } from '../icons/Icon';
import { MODULE_BUTTON_EDGE } from '../theme/moduleButton';
import { LogoLoader } from './LogoLoader';
import { useModuleButtonPaint } from './ModuleTint';
import { SAVE_WORDS_EASE, SAVE_WORDS_OUT_MS, saveTickSize, saveWordsFrames } from './saveTick';
import { AppText } from './Text';
import { TickMark } from './TickMark';
import { motionStill } from './tickDraw';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
/**
 * `lg` the primary (54), `md` the default (44), `sm` the compact pill (44 with a smaller face),
 * and `xs` the SHORT pill — 34 tall, the height `IconButton` already uses, reaching the 44 pt
 * target through its own hitSlop rather than through its box.
 *
 * `xs` exists for a control that sits BESIDE something rather than under it (the Schedule
 * hero's Log now and Skip, stacked next to three lines of text). Two 44 pt buttons stacked are
 * taller than the text they sit beside, so the card grows to fit the buttons and the buttons
 * are what the eye lands on — the owner, 2026-09-20: *"the buttons that you moved are size too
 * big, making it look disproportionate with everything else. make the buttons smaller so the
 * size of the box also shorter."*
 */
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xs';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  /**
   * THE SAVE LANDED (see the header): the words give way to a check that draws itself. Leave it
   * off for a button that never ticks — nothing extra is mounted. `false` on one that may, so the
   * check is there to be drawn the moment this turns `true`; a button that ARRIVES done shows the
   * finished check, since only a change it sees is played.
   */
  done?: boolean;
  /** A leading glyph; sized by the button (18 for sm, 20 otherwise). */
  icon?: IconProps['name'];
  /**
   * A leading mark that is not one of our glyphs — a sign-in provider's own logo, drawn in its
   * own colors (2026-09-26: Google's multi-colored G). Handed the size `icon` would get and the
   * button's ink, for a mark drawn in one color (Apple's). Wins over `icon`.
   */
  leading?: (size: number, ink: string) => ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /**
   * HOW FAR THE WORDS GROW WITH THE PHONE'S TEXT SIZE, where a button sits in a strip that must stay
   * shorter than what it belongs to (the long-run ask under its timer card, 2026-09-30). Absent, the
   * label grows as body text does, uncapped.
   */
  maxFontSizeMultiplier?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const WORDS_EASE = Easing.bezier(...SAVE_WORDS_EASE);
const WORDS = saveWordsFrames();

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  done,
  icon,
  leading,
  accessibilityLabel,
  accessibilityHint,
  maxFontSizeMultiplier,
  style,
  testID,
}: ButtonProps) {
  const t = useTheme();
  // the module's paint, when this primary button logs a module (`ModuleTint`); null otherwise
  const modulePaint = useModuleButtonPaint();
  const tinted = variant === 'primary' ? modulePaint : null;
  const scale = useRef(new Animated.Value(1)).current;
  const inert = !!disabled || !!loading;
  // the words' way out, 0 → 1, constructed at rest: a button that arrives done shows its check
  const settle = useRef(new Animated.Value(done ? 1 : 0)).current;
  const still = motionStill(t.reduceMotion, t.theme);
  /*
    A LAYOUT EFFECT, as `TickMark`'s is: each branch SETS what the next frame shows, and a passive
    effect would let one frame of the words through on a button that turned done under reduce
    motion. The run is a style (opacity and a lift), so it rides the native driver.
  */
  useLayoutEffect(() => {
    if (!done) {
      settle.setValue(0);
      return undefined;
    }
    if (still) {
      settle.setValue(1);
      return undefined;
    }
    const run = Animated.timing(settle, {
      toValue: 1,
      duration: SAVE_WORDS_OUT_MS,
      easing: WORDS_EASE,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [done, still, settle]);
  const wordsOut = useMemo(
    () => ({
      opacity: settle.interpolate({
        inputRange: [...WORDS.opacity.inputRange],
        outputRange: [...WORDS.opacity.outputRange],
        extrapolate: 'clamp',
      }),
      transform: [
        {
          translateY: settle.interpolate({
            inputRange: [...WORDS.lift.inputRange],
            outputRange: [...WORDS.lift.outputRange],
            extrapolate: 'clamp',
          }),
        },
      ],
    }),
    [settle],
  );
  const press = (to: number) => {
    if (inert || done || t.reduceMotion) return;
    Animated.timing(scale, { toValue: to, duration: 90, useNativeDriver: true }).start();
  };
  const short = size === 'xs';
  const compact = short || size === 'sm';
  // 34 is the design system's small round target (IconButton); the slop below makes it 44+
  const height = size === 'lg' ? t.hit.primary : short ? 34 : t.hit.min;
  const radius = compact ? t.radius.pill : t.radius.m;
  const ink =
    tinted !== null
      ? tinted.ink
      : variant === 'primary'
        ? t.onGradient
        : variant === 'danger'
          ? t.onGradient
          : variant === 'secondary'
            ? t.color.text
            : t.color.accent2;
  /**
   * A FILLED BUTTON ALWAYS HAS A FILL OF ITS OWN, even where a gradient is about to cover it.
   *
   * `primary` used to carry no `backgroundColor` at all and leave the paint entirely to the
   * `LinearGradient` below. On the owner's phone (2026-09-17) the tour bubble's Next button drew
   * as an empty white box: the gradient painted nothing, so the box was transparent over a white
   * sheet, and the label — which is white BECAUSE it is meant to be on the gradient — was
   * invisible on it. A button nobody can read is worse than an ugly one, and a white-on-white
   * label is unreadable in a way no contrast harness sees, because the tokens were both right.
   *
   * The accent underneath is the gradient's own dark end in spirit and is covered whenever the
   * gradient paints, so this costs nothing visually and removes the failure mode. The FAB has
   * always done it this way ("the glow's host: a solid circle", TabBar.tsx) — this is the same
   * belt, on the control that needed it more.
   */
  const fill: ViewStyle =
    tinted !== null
      ? {
          backgroundColor: tinted.fill,
          // a soft module's fill is edged in its words' own ink, inside the box (`moduleButton.ts`)
          ...(tinted.edge !== null
            ? { borderColor: tinted.edge, borderWidth: MODULE_BUTTON_EDGE }
            : {}),
        }
      : variant === 'secondary'
        ? { backgroundColor: t.color.surfaceSolid, borderColor: t.color.line2, borderWidth: 1 }
        : variant === 'danger'
          ? { backgroundColor: t.color.dangerFill }
          : variant === 'ghost'
            ? { backgroundColor: 'transparent' }
            : { backgroundColor: t.color.accent };
  const shadow: ViewStyle =
    variant === 'primary' && !t.isNight && t.skinTokens.surface.shadow !== 'none'
      ? {
          // the lift in the button's own color: a module's Save casts the module's shadow
          shadowColor: tinted?.fill ?? t.color.accent,
          shadowOpacity: 0.32,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          elevation: 3,
        }
      : {};
  const content = (
    <View
      style={[
        styles.row,
        {
          gap: short ? t.space.xs : t.space.sm,
          paddingHorizontal: short ? t.space.lg : size === 'sm' ? t.space.xl : t.space.xxl,
        },
        // held, not removed: the words keep the button's size while the loader stands in for them
        loading ? styles.held : null,
      ]}
    >
      {leading ? (
        leading(short ? 16 : size === 'sm' ? 18 : 20, ink)
      ) : icon ? (
        <Icon name={icon} size={short ? 16 : size === 'sm' ? 18 : 20} color={ink} />
      ) : null}
      <AppText
        variant={compact ? 'bodySm' : 'bodyStrong'}
        color={ink}
        style={styles.label}
        numberOfLines={2}
        {...(maxFontSizeMultiplier !== undefined ? { maxFontSizeMultiplier } : {})}
      >
        {label}
      </AppText>
    </View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      accessibilityState={{ disabled: inert, busy: !!loading }}
      disabled={inert}
      // a Save showing its check has already written its entry: a second press is let go
      onPress={done ? undefined : onPress}
      onPressIn={() => press(0.97)}
      onPressOut={() => press(1)}
      /* THE TARGET IS NEVER THE BOX for a compact button: `sm` is 44 and takes 8 either side to
         be generous; `xs` is 34 and takes 6, which is the 46 that keeps it over the 44 minimum
         (CLAUDE.md §6 conventions). A button that LOOKS small and cannot be hit is worse than
         one that looks big. */
      hitSlop={short ? t.space.sm : size === 'sm' ? t.space.md : 0}
      style={style}
      {...(testID ? { testID } : {})}
    >
      <Animated.View
        style={[
          styles.base,
          {
            minHeight: height,
            borderRadius: radius,
            opacity: disabled ? 0.5 : 1,
            transform: [{ scale }],
          },
          fill,
          shadow,
        ]}
      >
        {/* the scheme's gradient on a primary button — not on one a log sheet has tinted, whose
            solid fill is the module's deep ink */}
        {variant === 'primary' && tinted === null ? (
          <LinearGradient
            colors={[...t.gradient.brand]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
          />
        ) : null}
        {/* a button that may tick carries its words in a layer that can step aside (saveTick.ts) */}
        {done === undefined ? content : <Animated.View style={wordsOut}>{content}</Animated.View>}
        {done !== undefined ? (
          /* The check, over the held words and centered on the whole button, in their ink: the
             ink the words were measured in on this fill (`saveTick.test.ts` measures the mark
             again as a graphic). Hidden from touch and from assistive technology, as the loader
             is: the toast has already said what was saved. */
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[StyleSheet.absoluteFill, styles.busy]}
          >
            <TickMark checked={done} size={saveTickSize(height)} color={ink} ring={0} />
          </View>
        ) : null}
        {loading ? (
          /* Over the held words, centered on the whole button. Hidden from assistive technology
             and from touch: the button already says busy, and it is the thing being pressed. The
             small loader is 30 tall, inside every button size (`logoLoader.test.ts` holds it). */
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[StyleSheet.absoluteFill, styles.busy]}
          >
            <LogoLoader variant="small" tint={ink} />
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  label: { textAlign: 'center' },
  held: { opacity: 0 },
  busy: { alignItems: 'center', justifyContent: 'center' },
});
