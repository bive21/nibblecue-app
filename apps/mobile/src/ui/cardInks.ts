/**
 * THE COLORS OF THE CARDS THAT WEAR A PALE PICTURE: the Milk stash page's summary card and Today's
 * stash and shopping pair (2026-09-29). Pure, so `cardArt.test.ts` measures exactly what the
 * screens draw, in every skin, scheme and theme, rather than a copy of it.
 *
 * ONE ORDER, AND IT IS THE WHOLE FIX. First WHICH GROUND the card has, then the INKS for that
 * ground. The owner's evening of 2026-09-29 was the two decided apart:
 *
 *   * From an Android phone: *"the top textbox still shows bright yellow as if it was in day
 *     theme, was this supposed to happen?"* It was not. The picture is a pale gold file, the same
 *     in every theme, and the card drew it in dark.
 *   * From an iPhone: *"the milk stash in dark theme, the text is still dark gold color, making it
 *     very hard to see".* The words were written for that pale picture, and under them was
 *     something else: the stash summary's picture is translucent everywhere (22% to 98%), so the
 *     card's dark tint came through it (the dark-gold figure at 1.19:1 at its worst), and while the
 *     picture had not loaded there was only the dark tint (1.28:1). In development a phone fetches
 *     the picture from the dev server, and the owner's had gone to sleep.
 *
 * So the ground is decided first, by `artForTheme`, the rule `Card` itself follows: each theme
 * draws its own version of the picture (the owner's in light; since the same evening a dark one in
 * dark and a dim amber one in Night, drawn from theirs), always on that version's own solid ground
 * (`CardArt.ground`, which `Surface` lays under it), and where a build has no version for the theme
 * the card draws its own module color, solid. Every ink is then chosen for that ground: the
 * picture's MEASURED inks on a picture (`cardArt.generated.ts`), and off it the theme's inks, with a
 * module's own colored ink only where `readableInk` finds it clears 4.5:1 on the card.
 */
// the pure subpaths, never the package's index: that one brings React Native with it, and this
// module is read by a node test in every skin, scheme and theme (`cardArt.test.ts`)
import { artForTheme, artInkColor, type CardArt } from '@nibblecue/ui/artInk';
import { readableInk } from '@nibblecue/ui/ink';
import { placeOnArt, placeTone } from '@nibblecue/ui/placeTones';
import { liftedTint } from '@nibblecue/ui/skins';
import { moduleCardFill, type Palette, type ThemeName } from '@nibblecue/ui/theme';

/** Every color the Milk stash page's summary card draws with, and the picture it draws, if any. */
export interface StashCardInks {
  /** The picture this theme draws on the card, or null (`artForTheme`). */
  art: CardArt | null;
  /** The card's own tint: the stash's gold, drawn solid wherever no picture is. */
  gold: string;
  /** The card's words, and its quieter ones. On a picture they are one ink: it has no quiet tone. */
  onArt: string;
  onArt2: string;
  /** The figure, its unit and its count of containers: the owner's gold (2026-09-22). */
  gold3: string;
  /** The rate's asterisk, the one mark on the card in a color of its own. */
  mark: string;
  /** A place's band in the bar, and its dot in the strip under it. */
  place: (kind: string | null) => string;
}

/**
 * THE SUMMARY CARD'S COLORS, for a theme and the picture the build carries (`artFor('stashCard')`,
 * null where it did not resolve).
 *
 *   * ON THE PICTURE: its measured inks, held to 4.5:1 over every pixel of the card as it is drawn
 *     on its ground (the words cross the whole card, so the whole card is measured) and on the
 *     ground alone. In light that is the near-black and the dark gold `#6B4409`; on the dark
 *     version white and a light gold, and on the Night version Night's amber for both. The asterisk
 *     takes the accent as well: the scheme's was never measured for the picture and does not hold
 *     on it (over the light picture's darker gold, Ocean's blue is 3.3:1 and Sunny's orange 3.0:1).
 *     The places' bands and dots take their lighter on-picture tone over the owner's pale picture
 *     (`placeOnArt`, the owner's 2026-09-22 ask) and their own theme's hue over a dark or Night
 *     version, which is the hue a place is drawn in on every other dark card.
 *   * OFF IT (a build whose picture, or its version for the theme, did not resolve): the stash's
 *     own gold, solid
 *     (`moduleCardFill`, measured for `text` and `text2` in every theme and scheme), the theme's two
 *     inks on it, the figure in the stash's gold ink wherever that clears 4.5:1 there (5.7:1 in
 *     dark, 4.5:1 in Night; the light theme's is 3.8:1, which only a build without the picture
 *     meets, and takes the page ink), the asterisk in the scheme's accent on the same terms, and the
 *     places in their own hue.
 */
export function stashCardInks(
  color: Palette,
  theme: ThemeName,
  picture: CardArt | null,
): StashCardInks {
  const gold = moduleCardFill(color, 'stash', theme);
  const art = artForTheme(picture, theme);
  const onArt = art ? artInkColor(art.ink) : color.text;
  const onArt2 = art ? artInkColor(art.ink) : color.text2;
  const gold3 = art?.accent ? artInkColor(art.accent) : readableInk(color.feed, gold, onArt);
  const mark = art?.accent ? artInkColor(art.accent) : readableInk(color.accent, gold, onArt);
  return {
    art,
    gold,
    onArt,
    onArt2,
    gold3,
    mark,
    // the lighter on-picture tone is for the owner's pale picture; a version is a dark ground
    place: kind =>
      art && art.version === undefined ? placeOnArt(color, kind) : placeTone(color, kind).fg,
  };
}

/** One half of Today's pair: its picture, the ground it has without one, and its inks. */
export interface PairCardInks {
  /** The picture this theme draws, or null (`artForTheme`). */
  art: CardArt | null;
  /** The card's own color, drawn solid wherever no picture is. */
  ground: string;
  /** The heading inside the card. */
  ink: string;
  /** The figure, its icon and the words under it: the owner's gold, or their green. */
  accent: string;
}

/**
 * TODAY'S STASH AND SHOPPING PAIR (`SupplyPair`), for a theme and the two pictures the build
 * carries. Each theme draws its own version of both, with that version's measured inks (white and
 * a light gold or green in dark, Night's amber in Night). Where a build has no version for the
 * theme, each card is drawn in its own module color, solid:
 *
 *   * THE STASH in the gold the Stash page's card is (`moduleCardFill`; the owner, 2026-09-22:
 *     *"The color for milk stash should be yellow-gold. Like in the main page"*). It used to take
 *     the pump's tint, which is green since the owner's color reference; the picture hid it.
 *   * THE SHOPPING LIST in its lifted olive while there is something to buy (`liftedTint`), and the
 *     plain card when there is nothing, where the heading's `text2` always reads.
 *
 * Off the picture the heading is `text2` wherever that clears 4.5:1 on the card (the lifted olive
 * does not carry it in dark or Night: 4.4 and 3.1:1), and the figure is the module's own ink on
 * the same terms, the page ink where it falls short (the olive does not read on its own lifted
 * tint in any theme; the stash's gold does in dark and Night).
 */
/**
 * How strongly Today's stash and shopping drawings show.
 *
 * NEAR-FULL IN EVERY THEME SINCE 2026-10-06 (the owner's regression handoff: "the milk cluster and
 * basket are tiny/faint"). The 0.42 below came from when the picture lay under the words; it is a
 * small stamp clear of them now (`SupplyPair`'s `ART_RESERVE`), so dimming it only hid it.
 *
 * Light is the owner's picture, whole. In dark and in Night the cream bags, the white
 * bottle and the basket stay bright on a half-width card and crowd the words (the owner,
 * 2026-10-05). The drawing stays. The picture's own dark ground shows through it, so the
 * words are easier to read. The Stash page's summary is not this pair, and light is 1.
 */
export const SUPPLY_DRAWING_OPACITY = { light: 1, dark: 0.92, night: 0.92 } as const;

export function supplyDrawingOpacity(theme: ThemeName): number {
  return SUPPLY_DRAWING_OPACITY[theme];
}

export function supplyPairInks(
  color: Palette,
  theme: ThemeName,
  pictures: { stash: CardArt | null; shopping: CardArt | null },
  somethingToBuy: boolean,
): { stash: PairCardInks; shopping: PairCardInks } {
  const stashArt = artForTheme(pictures.stash, theme);
  const shoppingArt = artForTheme(pictures.shopping, theme);
  const stashGround = moduleCardFill(color, 'stash', theme);
  const shoppingGround = liftedTint(color.oliveSoft, color.olive);
  return {
    stash: {
      art: stashArt,
      ground: stashGround,
      ink: stashArt ? artInkColor(stashArt.ink) : readableInk(color.text2, stashGround, color.text),
      accent: stashArt?.accent
        ? artInkColor(stashArt.accent)
        : readableInk(color.feed, stashGround, color.text),
    },
    shopping: {
      art: shoppingArt,
      ground: shoppingGround,
      ink: shoppingArt
        ? artInkColor(shoppingArt.ink)
        : somethingToBuy
          ? readableInk(color.text2, shoppingGround, color.text)
          : color.text2,
      accent: shoppingArt?.accent
        ? artInkColor(shoppingArt.accent)
        : readableInk(color.olive, shoppingGround, color.text),
    },
  };
}
