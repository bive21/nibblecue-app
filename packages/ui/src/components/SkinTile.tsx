/**
 * SkinTile — one of the designs as a picture of itself (the owner, 2026-09-25, of the Appearance
 * sheet: *"maybe on the design selection theme, instead of showing just like liquid glass and
 * paper, separate it into 2 sections options, left and right; and then has a 'preview' of what it
 * is"*). Two of these side by side replace two rows of words: a design IS a look, and two looks
 * are told apart faster by looking at them than by reading "Flat, quiet, high contrast" against
 * "Translucent, blurred, floating".
 *
 * THE PICTURE IS DRAWN IN THIS TILE'S DESIGN, LIVE. Whatever the caller hands in as `children` is
 * rendered inside a second <ThemeProvider> whose appearance is the painted one — this theme, this
 * color — with the skin's material swapped for the tile's own: `skinForTheme(SKINS[skin], theme)`,
 * exactly the call the resolver makes for the app. Over it goes the app's own ground for that
 * design (`Ground`, the washes and the soft orbs Glass paints behind every screen, nothing on
 * Paper), and in it the design system's real components, so a card in the picture is made by the
 * same `Surface` every card in the app is made by. Two consequences, both on purpose:
 *
 *  - It changes as the sheet is used. Tap a color or a theme above and both pictures repaint with
 *    everything else, because they read the same tokens through the same provider (§17.2).
 *  - It shows what THIS phone paints. Glass on Android has no blur (Surface.tsx says why), so its
 *    panels are opaque there, and so are the picture's — the tile never promises a translucency
 *    the phone will not deliver. In the amber theme both designs are flattened by the resolver's
 *    own night rule and the two pictures are nearly the same, which is the truth at 3 a.m.
 *
 * The sample is laid out at a phone's width and scaled into the window with a transform
 * (`skinTile.ts` says why), and it is a picture: `pointerEvents="none"` and hidden from assistive
 * technology, so the one control and the one focus stop is the tile.
 *
 * TO A SCREEN READER IT IS THE ROW IT REPLACED: a button named with the design's name and its
 * line from the skin table ("Paper, Flat, quiet, high contrast" — the words the picture shows the
 * eye), `selected` on the chosen one where the row said "On", and a locked one hinting what
 * unlocks it. A locked tile carries the swatch's lock disc on its picture BEFORE the tap
 * (CLAUDE.md §4), and the press still fires so the caller can open the gate; the picture is left
 * whole, because it is the thing being sold (§4: a gate shows what is behind it).
 *
 * A STATUS WORD BESIDE THE NAME (`badge`, 2026-09-28): the app's quiet "Plus" tag on Liquid Glass
 * during the 14-day preview, the design system's `Badge` on the name's line and spoken after the
 * name, as a `Row`'s badge is ("Liquid Glass, Plus, Translucent…"). Never on the picture, where the
 * lock goes: a design that works is not dressed as one that does not.
 *
 * THE CHOSEN TILE IS RINGED AND CHECKED, in the marks the swatches use (`choiceMarks`), and the
 * mark ARRIVES: the ring fades in and the check pops, on the native driver (`SKIN_TILE_FRAMES`).
 * Reduce motion and the amber theme set it directly — it is there or it is not.
 *
 * A CHOICE IS FELT, by the design system's one rule for options (`feedback/choice.ts`): a `tap`
 * when the design changes, a `warning` when a locked one opens the gate, and nothing for the
 * design already chosen, because tapping it changes nothing.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { feelChoice } from '../feedback/choice';
import { Icon } from '../icons/Icon';
import type { ResolvedAppearance } from '../theme/appearance';
import { choiceMarks } from '../theme/choiceMarks';
import { SKINS, skinForTheme, type SkinName } from '../theme/skins';
import { ThemeProvider, useTheme } from '../theme/ThemeProvider';
import { Badge } from './Badge';
import type { BadgeTone } from './badge-tone';
import { Ground } from './Ground';
import { rowLabel } from './row-label';
import { SKIN_TILE, SKIN_TILE_FRAMES, SKIN_TILE_MOTION, skinTileGeometry } from './skinTile';
import { AppText } from './Text';

/** The pair's arithmetic, for the caller laying two tiles out; it stays in `skinTile.ts`. */
export { skinTilePair } from './skinTile';

export interface SkinTileProps {
  /** The design the picture is drawn in. */
  skin: SkinName;
  /** Its name, under the picture ("Paper"). */
  label: string;
  /** What the picture shows, in words, for whoever cannot see it: the skin table's line. */
  description: string;
  selected: boolean;
  /** Sold on this plan: drawn with a lock, and still tappable so the caller can open the gate. */
  locked?: boolean;
  /** Read after a locked tile's name ("Included with …"), in the caller's words. */
  lockedHint?: string;
  /** A status word beside the name, spoken after it (see the header). */
  badge?: { label: string; tone?: BadgeTone };
  onPress: () => void;
  /** The tile's width: `skinTilePair(room).tile`. */
  width: number;
  /** The sample, laid out in `SKIN_TILE.sample` and drawn in this tile's design. */
  children?: ReactNode;
  testID?: string;
}

const EASE = Easing.bezier(...SKIN_TILE_MOTION.ease);

/** A frame as `interpolate` wants it: mutable copies of the frozen arrays. */
const drive = (v: Animated.Value, f: (typeof SKIN_TILE_FRAMES)[keyof typeof SKIN_TILE_FRAMES]) =>
  v.interpolate({
    inputRange: [...f.inputRange],
    outputRange: [...f.outputRange],
    extrapolate: f.extrapolate,
  });

export function SkinTile({
  skin,
  label,
  description,
  selected,
  locked = false,
  lockedHint,
  // named apart from the corner mark's geometry (`g.badge`), which this file calls `badge`
  badge: status,
  onPress,
  width,
  children,
  testID,
}: SkinTileProps) {
  const t = useTheme();
  const g = useMemo(() => skinTileGeometry(width), [width]);
  const marks = choiceMarks(t.color);
  // nothing moves at 3 a.m., and nothing moves for a parent who asked for no motion
  const still = t.reduceMotion || t.isNight;

  /*
    THE PICTURE'S APPEARANCE: the painted one, with this tile's design. A skin changes material,
    radius and elevation and nothing else (skins.ts), so the palette, the gradients and the theme
    stay the app's, and `skinForTheme` is the resolver's own call — dark's tinted glass, night's
    flattening and all. Memoized on the painted theme, so a token swap above repaints it once.
  */
  const look = useMemo<ResolvedAppearance>(
    () => ({ ...t, skin, skinTokens: skinForTheme(SKINS[skin], t.theme) }),
    [t, skin],
  );

  // constructed AT the resting value, so the first frame already has its mark or has none
  const on = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const shown = useRef(selected);
  useEffect(() => {
    if (still) {
      // set, even over a move in flight: the cleanup stopped it, and it must not freeze half way
      on.setValue(selected ? 1 : 0);
      shown.current = selected;
      return;
    }
    // the first render, and any render that did not change the choice, has nothing to move
    if (shown.current === selected) return;
    shown.current = selected;
    const run = Animated.timing(on, {
      toValue: selected ? 1 : 0,
      duration: selected ? SKIN_TILE_MOTION.inMs : SKIN_TILE_MOTION.outMs,
      easing: EASE,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [on, selected, still]);

  const anim = useMemo(
    () => ({
      ring: { opacity: drive(on, SKIN_TILE_FRAMES.ring) },
      badge: {
        opacity: drive(on, SKIN_TILE_FRAMES.badge),
        transform: [{ scale: drive(on, SKIN_TILE_FRAMES.badgeScale) }],
      },
    }),
    [on],
  );

  // the window's corners are the SHEET's, not the picture's: the two frames are one kind of thing
  // side by side, and the design inside each is what differs
  const r = t.radius.m;
  const { sample } = SKIN_TILE;
  const badge = g.badge;
  const badgeBox = {
    top: badge.top,
    right: badge.right,
    width: badge.size,
    height: badge.size,
    borderRadius: badge.size / 2,
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rowLabel({
        title: label,
        ...(status ? { badge: status.label } : {}),
        detail: description,
      })}
      {...(locked && lockedHint ? { accessibilityHint: lockedHint } : {})}
      accessibilityState={{ selected, disabled: false }}
      onPress={() => {
        feelChoice({ locked, current: selected, kind: 'tap' });
        onPress();
      }}
      style={({ pressed }) => [{ width: g.tile, opacity: pressed ? 0.85 : 1 }]}
      {...(testID ? { testID } : {})}
    >
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: g.tile, height: g.framed }}
      >
        {/* the chosen ring, `clear` outside the window all round */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: r + g.frame, borderWidth: SKIN_TILE.ring, borderColor: marks.ring },
            anim.ring,
          ]}
        />
        <View
          style={[
            styles.window,
            {
              left: g.frame,
              top: g.frame,
              width: g.window.width,
              height: g.window.height,
              borderRadius: r,
              // the page every screen is painted on (Screen.tsx `page`), under the design's ground
              backgroundColor: t.color.paper,
            },
          ]}
        >
          <ThemeProvider appearance={look} fontsReady={t.fontsReady} reduceMotion={t.reduceMotion}>
            <View
              style={[
                styles.sample,
                {
                  width: sample.width,
                  height: sample.height,
                  transform: [{ scale: g.scale }],
                },
              ]}
            >
              <Ground width={sample.width} height={sample.height} />
              {children}
            </View>
          </ThemeProvider>
          {/* the window's edge, drawn OVER the picture: on Android a border is part of the view's
              own background, and the picture inside would paint straight over it */}
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: r,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: t.color.line2,
              },
            ]}
          />
        </View>
        {locked && !selected ? (
          <View
            style={[
              styles.badge,
              badgeBox,
              { backgroundColor: marks.lockDisc, borderColor: marks.lockEdge, borderWidth: 1 },
            ]}
          >
            <Icon name="lock" size={badge.glyph} color={marks.lock} />
          </View>
        ) : null}
        <Animated.View
          style={[
            styles.badge,
            badgeBox,
            // the badge's own edge is the clear ring, so a dark badge never touches a dark picture
            {
              backgroundColor: marks.badge,
              borderColor: marks.ringGap,
              borderWidth: SKIN_TILE.clear,
            },
            anim.badge,
          ]}
        >
          <Icon name="check" size={badge.glyph} color={marks.check} strokeWidth={2.6} />
        </Animated.View>
      </View>
      {status ? (
        <View style={[styles.named, { gap: t.space.xs, marginTop: t.space.sm }]}>
          <AppText variant="bodySm" ink="text" align="center" numberOfLines={2}>
            {label}
          </AppText>
          <Badge
            label={status.label}
            {...(status.tone ? { tone: status.tone } : {})}
            style={styles.badgeWord}
            {...(testID ? { testID: `${testID}.badge` } : {})}
          />
        </View>
      ) : (
        <AppText
          variant="bodySm"
          ink="text"
          align="center"
          numberOfLines={2}
          style={{ marginTop: t.space.sm }}
        >
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  window: { position: 'absolute', overflow: 'hidden' },
  // scaled from its own top left corner, so the scaled box fills the window exactly
  sample: { position: 'absolute', top: 0, left: 0, transformOrigin: 'top left' },
  badge: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  // the name and its status word, centered under the picture together, wrapping as a pair
  named: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' },
  badgeWord: { alignSelf: 'center' },
});
