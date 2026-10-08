/**
 * WHERE A CARD'S BACKGROUND PICTURE COMES FROM.
 *
 * The owner delivered four finished backgrounds on 2026-09-18 — breastfeeding, sleeping, the
 * milk stash and the shopping list — then pumping and tummy time on 2026-09-19, with a note that
 * settles how they are drawn: *"These are
 * complete card backgrounds, not transparent illustration overlays. Each PNG already contains
 * the full gradient, decorative shapes, and activity illustration. Text, buttons, borders, and
 * corner rounding remain in the app UI."* So the picture is the card's whole ground; the tint,
 * the gradient and the flat motif it used to draw are all superseded where one exists.
 *
 * ── THE THREE FILES THAT MAKE THIS WORK ─────────────────────────────────────────────────────
 *
 *   * `assets/brand/kit/07-card-backgrounds/` — the owner's masters, 1942 to 4344 px, untouched.
 *   * `tools/brand/render-card-art.mjs` — scales them to 1280 px for the bundle (22 MB of
 *     masters is not something to ship to a phone for a handful of decorations), MEASURES the
 *     contrast of the ink the owner drew each one with, and computes the smallest veil that takes
 *     it to WCAG AA. `pnpm check:card-art` fails the build if a swapped artwork stops being
 *     readable. All seventeen ship as JPEG since 2026-10-01 (lossy WebP from 2026-09-27, until
 *     the stash summary's translucent one drew nothing on an iPhone), 503 KB, measured to look the
 *     same on a phone; the tool's header has the numbers.
 *   * `tools/brand/card-art-versions.mjs` — the DARK AND NIGHT VERSIONS (2026-09-29; the owner:
 *     *"And yes, do dark version for milk stash too / And night theme as well"*): a dark one of each
 *     pale picture, and a dim amber Night one of all seven, drawn from the same masters every time
 *     the tool runs and measured like the rest. Ten more files, 204 KB.
 *   * `cardArt.generated.ts` — what it measured, and which file it wrote. Never edited by hand.
 *
 * Metro resolves an asset import at build time, so the sources cannot be built from a variable —
 * each slot names its own file. That is why this is a literal map rather than a lookup, and why
 * `cardArt.test.ts` holds each import to the file the tool says it wrote.
 */
import type { CardArt } from '@nibblecue/ui';
import breastfeedArt from '../../assets/card-art/breastfeed.jpg';
import breastfeedNightArt from '../../assets/card-art/breastfeedNight.jpg';
import pumpArt from '../../assets/card-art/pump.jpg';
import pumpNightArt from '../../assets/card-art/pumpNight.jpg';
import shoppingArt from '../../assets/card-art/shopping.jpg';
import shoppingDarkArt from '../../assets/card-art/shoppingDark.jpg';
import shoppingNightArt from '../../assets/card-art/shoppingNight.jpg';
import sleepArt from '../../assets/card-art/sleep.jpg';
import sleepNightArt from '../../assets/card-art/sleepNight.jpg';
import stashArt from '../../assets/card-art/stash.jpg';
import stashCardArt from '../../assets/card-art/stashCard.jpg';
import stashCardDarkArt from '../../assets/card-art/stashCardDark.jpg';
import stashCardNightArt from '../../assets/card-art/stashCardNight.jpg';
import stashDarkArt from '../../assets/card-art/stashDark.jpg';
import stashNightArt from '../../assets/card-art/stashNight.jpg';
import tummyArt from '../../assets/card-art/tummy.jpg';
import tummyNightArt from '../../assets/card-art/tummyNight.jpg';
import { ART_MEASURED, type ArtMeasurement } from './cardArt.generated';
import { ART_PARTS } from './cardArtParts';

/** Every file the tool measured: the owner's seven and the versions drawn from them. */
type ArtFile = keyof typeof ART_MEASURED;

/** The owner's own pictures, which are what a card asks for; its versions come with it. */
export type CardArtSlot =
  'breastfeed' | 'sleep' | 'pump' | 'tummy' | 'stash' | 'stashCard' | 'shopping';

const SOURCES: Readonly<Record<ArtFile, unknown>> = {
  breastfeed: breastfeedArt,
  sleep: sleepArt,
  pump: pumpArt,
  tummy: tummyArt,
  stash: stashArt,
  stashCard: stashCardArt,
  shopping: shoppingArt,
  stashDark: stashDarkArt,
  stashCardDark: stashCardDarkArt,
  shoppingDark: shoppingDarkArt,
  stashNight: stashNightArt,
  stashCardNight: stashCardNightArt,
  shoppingNight: shoppingNightArt,
  breastfeedNight: breastfeedNightArt,
  sleepNight: sleepNightArt,
  pumpNight: pumpNightArt,
  tummyNight: tummyNightArt,
};

const build = (file: ArtFile): CardArt => {
  const m: ArtMeasurement = ART_MEASURED[file];
  return {
    source: SOURCES[file],
    width: m.width,
    height: m.height,
    ink: m.ink,
    veil: m.veil,
    veilColor: m.veilColor,
    veilEnd: m.veilEnd,
    contentFraction: m.contentFraction,
    // the solid ground a card draws under it (`CardArt.ground`), measured with its ink on it
    ground: m.ground,
    ...(m.accent ? { accent: m.accent } : {}),
    // which theme's version this is, where it is one (`artForTheme`, `artDimFor`)
    ...(m.version ? { version: m.version } : {}),
    // the parts a running timer moves — the nap's "z"s — measured in `cardArtParts.ts`
    ...(ART_PARTS[file] ? { parts: ART_PARTS[file] } : {}),
  };
};

/**
 * THE OWNER'S PICTURE WITH ITS VERSIONS ON IT: the dark one and the Night one, each only if its own
 * file resolved (`usable`), so a version the bundle lost is no version and the theme falls back to
 * what it drew before there were any (`artForTheme`).
 */
const withVersions = (slot: CardArtSlot): CardArt => {
  const dark = `${slot}Dark` in ART_MEASURED ? usable(build(`${slot}Dark` as ArtFile)) : null;
  const night = `${slot}Night` in ART_MEASURED ? usable(build(`${slot}Night` as ArtFile)) : null;
  return { ...build(slot), ...(dark ? { dark } : {}), ...(night ? { night } : {}) };
};

const CARD_ART: Readonly<Record<CardArtSlot, CardArt>> = {
  breastfeed: withVersions('breastfeed'),
  sleep: withVersions('sleep'),
  pump: withVersions('pump'),
  tummy: withVersions('tummy'),
  stash: withVersions('stash'),
  stashCard: withVersions('stashCard'),
  shopping: withVersions('shopping'),
};

/**
 * The art for a slot, or `null` for one with none.
 *
 * ALL FIVE TIMERS AND CARDS HAVE ONE now that tummy time has arrived (2026-09-19). It was the
 * last slot without a picture, and the gap was not costing it a plain gradient as intended — the
 * call site fell through to `'sleep'` for any timer that was not breastfeeding or pumping, so a
 * running tummy-time card wore a baby asleep on a cloud. A fallback that says something untrue
 * about what is happening is worse than no picture, and it is gone.
 *
 * `null` is therefore about a build rather than a slot now; `usable` below has that account.
 * (Three of the five arrived as 2000 px chat attachments rather than 2400 px masters; the
 * renderer scales to 1280 either way, and a master replaces one in the kit whenever the owner
 * drops it in.)
 */
export const artFor = (slot: string): CardArt | null =>
  slot in CARD_ART ? usable(CARD_ART[slot as CardArtSlot]) : null;

/**
 * AN ARTWORK THAT DID NOT RESOLVE IS NO ARTWORK, and the card goes back to its gradient whole.
 *
 * Metro hands an asset import a registry id; if the bundler has not picked the file up — a
 * server started before the folder existed, a stale cache, a file that did not survive a
 * checkout — the import is `undefined` and `<Image>` draws nothing, silently. Without this the
 * card would still take the artwork's INK, its veil and its content cap: a rose card with a dark
 * wash down one side, text wrapped short of a picture that is not there, and nothing to say why.
 *
 * Falling back is not hiding the problem. A card with no artwork is a finished card — its
 * gradient and motif are what every timer shipped with before the owner drew these — so the
 * failure costs a decoration rather than a screen, and `cardArt.test.ts` holds every file at the
 * path this module imports so a missing one fails the build rather than a phone.
 *
 * A FUNCTION DECLARATION, not a const: `CARD_ART` is built when this module loads and asks it about
 * each version as it goes, and a const declared down here would not exist yet.
 */
function usable(art: CardArt): CardArt | null {
  return art.source ? art : null;
}
