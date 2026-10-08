/**
 * ── THE CUECOIN CATALOG ──────────────────────────────────────────────────────────────────────
 *
 * Twelve adhesive NFC coins in two packs (the owner's spec, 2026-09-22), 39 mm across since
 * 2026-09-26 (the owner: "Diameter will be 39mm."; the spec said 25 mm) — and only the first pack
 * is offered for now (`PACKS_OFFERED`). A parent sticks one where an activity happens and taps
 * their phone; the app opens on that module's quick-log.
 *
 * THIS FILE IS THE PRODUCT, AND IT HAS NO RUNTIME IMPORT ON PURPOSE. The tool that prints the
 * URLs for a production run (`tools/tags/make-tags.mjs`) reads it under plain `node`, whose type
 * stripping cannot resolve an extensionless import — and a second copy of the catalog in the
 * tool is how a box of coins ends up pointing somewhere the app does not answer. `ModuleId`
 * comes in as a type, which is erased before node ever sees it; `coins.test.ts` is what holds
 * every module target to the real registry.
 *
 * WHAT IS PRINTED ON A COIN — the ring colors, the face artwork — is NOT here. It is a print
 * specification (`assets/cue-coins.json`, docs/NFC_TAGS.md §2) and the app has no use for it:
 * the app paints a module in the module's own hue, from the design tokens, as it does everywhere
 * else.
 */
import type { ModuleId } from '../modules/module-registry';

/** The one path segment every coin URL starts with, short because it is printed and typed. */
export const TAG_SEGMENT = 't';

/**
 * RESTOCK IS NOT A MODULE, and it is the one target that is not a log at all: the coin by the
 * diaper caddy opens the shopping list with the add field ready. The spec called it a "module
 * value"; it is a coin target, which is a wider thing, and `stash` below is the other one —
 * a real module, but one with a screen rather than a quick-log sheet.
 */
export const RESTOCK = 'restock';
export type CoinTarget = ModuleId | typeof RESTOCK;

export type CoinPack = 'core' | 'extras';

export interface Coin {
  /** The catalog number, as printed on the pack insert. */
  sku: number;
  pack: CoinPack;
  /** What the coin is called in the shop and on the insert. Not a module label. */
  name: string;
  target: CoinTarget;
  /** Where it goes. The whole point of a coin is that it lives where the thing happens. */
  placement: string;
  /**
   * A SECOND COIN OF AN EARLIER DESIGN, encoded identically (the owner's spec: "the app must not
   * distinguish them"). The diaper bag and the changing table are the same coin; so are the crib
   * and the travel cot. This is why a coin carries no per-unit serial — see `tagUrl` below.
   */
  duplicateOf?: number;
}

export const COINS: readonly Coin[] = [
  {
    sku: 1,
    pack: 'core',
    name: 'Breastfeeding',
    target: 'breastfeed',
    placement: 'the nursing chair',
  },
  { sku: 2, pack: 'core', name: 'Bottle', target: 'bottle', placement: 'the bottle station' },
  { sku: 3, pack: 'core', name: 'Pumping', target: 'pump', placement: 'the breast pump' },
  { sku: 4, pack: 'core', name: 'Diaper', target: 'diaper', placement: 'the changing table' },
  { sku: 5, pack: 'core', name: 'Sleep', target: 'sleep', placement: 'the crib rail' },
  { sku: 6, pack: 'core', name: 'Solids', target: 'solids', placement: 'the high chair' },
  { sku: 7, pack: 'core', name: 'Tummy Time', target: 'tummy', placement: 'the play mat' },
  {
    sku: 8,
    pack: 'extras',
    name: 'Temperature',
    target: 'temp',
    placement: 'the thermometer case',
  },
  { sku: 9, pack: 'extras', name: 'Milk Stash', target: 'stash', placement: 'the freezer door' },
  {
    sku: 10,
    pack: 'extras',
    name: 'Restock',
    target: RESTOCK,
    placement: 'the diaper caddy or the pantry',
  },
  {
    sku: 11,
    pack: 'extras',
    name: 'Diaper',
    target: 'diaper',
    placement: 'the diaper bag',
    duplicateOf: 4,
  },
  {
    sku: 12,
    pack: 'extras',
    name: 'Sleep',
    target: 'sleep',
    placement: 'the bassinet, stroller or travel cot',
    duplicateOf: 5,
  },
];

/**
 * NOT ON SALE YET — COMING SOON, AND NEVER SWITCHED OFF (the owner, 2026-09-24: "i still want to
 * develop this, and try this for my own personal use"; 2026-09-26: "cuecoins will be sold as a
 * package, but i want to sell it on our website, not from the app … the module right now it
 * should say coming soon").
 *
 * One switch for everywhere the coins are SOLD or OFFERED. While it is off, More's coins row says
 * *Coming soon* and does not open the page for the public — it opens only on a phone that has read
 * a coin, or on a development or staging build (`coinsRow`, apps/mobile/src/tags/visibility.ts).
 * The website's product page says *Coming soon* with no price and no buy button, and it and the
 * coin pages are `noindex` (tools/site/build-site.mjs). What a coin DOES is never behind it: a tap
 * opens the app on its entry on every build, and the coins page is whole for whoever reaches it.
 *
 * Turning it on is the owner's decision to start selling them, and `tags.test.ts` pins it, so the
 * flip is a deliberate edit to a test rather than a stray one.
 */
export const COINS_ON_SALE: boolean = false;

/**
 * WHICH PACKS ARE OFFERED: THE CORE PACK ONLY, FOR NOW (the owner, 2026-09-26: "I don't want to
 * introduce extra pack yet. Just for. This is maybe for next year.").
 *
 * One switch for every place a customer is SHOWN or SOLD a pack: the website's product page draws
 * and sells an offered pack and nothing else — its coins, its rooms of the house, its counts — and
 * More's coins page lists an offered pack and nothing else. It withholds a pack's presentation and
 * its sale, NEVER ITS COINS' USE: all twelve stay in this catalog, every one of the ten designs
 * still answers a tap on every build (`COIN_TARGETS`, `LinkRouter`) and keeps its landing page on
 * the website (`/t/<target>/`), and the owner's own test tags (docs/NFC_TAGS.md §0) keep working.
 *
 * Offering the Extra Pack again is this line plus its sale slots — a Stripe Payment Link in
 * brand.json, a price label and a photo slot in assets/cue-coins.json (docs/NFC_TAGS.md §6) — and
 * `tags.test.ts` pins it, so the flip is a deliberate edit to a test rather than a stray one.
 */
export const PACKS_OFFERED: Readonly<Record<CoinPack, boolean>> = { core: true, extras: false };

/** The distinct URLs a production run encodes — ten, not twelve, because two coins are copies. */
export const COIN_DESIGNS: readonly Coin[] = COINS.filter(c => c.duplicateOf === undefined);

export const coinsInPack = (pack: CoinPack): readonly Coin[] => COINS.filter(c => c.pack === pack);

/** The packs a customer is shown, in catalog order. */
export const OFFERED_PACKS: readonly CoinPack[] = [...new Set(COINS.map(c => c.pack))].filter(
  pack => PACKS_OFFERED[pack],
);

/** The coins a customer is shown: every coin in an offered pack, a second copy included. */
export const OFFERED_COINS: readonly Coin[] = COINS.filter(c => PACKS_OFFERED[c.pack]);

/**
 * WHAT EACH PACK IS CALLED AND WHAT IT HOLDS, for the two places that list them: the app's coins
 * page and the website's product page (2026-09-26). One source, for the reason `TAG_COPY` below
 * has one — a pack described two ways is a question from a buyer.
 *
 * EACH PACK IS A PRODUCT (the owner, 2026-09-26: "only 2 products are being sold: CueCoins Core
 * Pack, and CueCoins Extra Pack" — and later the same day, only the first of them for now:
 * `PACKS_OFFERED`). `title` is the pack's own name, a proper noun in title case; the product a
 * person buys is the accessory's name in front of it — `packName` below, so the accessory's name
 * stays brand.json's and is never typed here. The Extra Pack keeps its words for the day it is
 * offered. The id stays `extras`: it routes testIDs and tests, and nobody reads it. The Core Pack
 * comes in two finishes, Day and Night, which are a PRINT difference only (`assets/cue-coins.json`
 * → `finishes`): the same coins, the same addresses, so nothing in this file knows about them.
 */
export const PACK_COPY: Readonly<Record<CoinPack, { title: string; lede: string }>> = {
  core: { title: 'Core Pack', lede: 'The seven that cover most days.' },
  extras: {
    title: 'Extra Pack',
    lede: 'Five more, including a second diaper and a second sleep coin for the bag and the travel cot.',
  },
};

/**
 * A pack's product name, as the shop and the app's coins page both print it: the accessory's
 * name (brand.json's, passed in), then the pack's.
 */
export const packName = (accessoryName: string, pack: CoinPack): string =>
  `${accessoryName} ${PACK_COPY[pack].title}`;

/** The coin a target is sold as, or null for a target the app answers but does not sell. */
export const coinFor = (target: string): Coin | null =>
  COIN_DESIGNS.find(c => c.target === target) ?? null;

/**
 * WHAT A TAP DOES, per target. The spec's §3.3 table, reduced to the four shapes the app has.
 *
 *   sheet    open that module's capture sheet, exactly as the tile does
 *   timer    a session: start it, or END the one already running (never a second parallel one)
 *   milk     move a bag: thaw one, or pour one into a bottle (docs/NFC_TAGS.md §3.8)
 *   restock  the supplies list: tick what has run out, add it, share it (§3.9)
 *
 * THE LAST TWO WERE WRONG IN THE FIRST BUILD and the owner corrected them (2026-09-22). The
 * freezer-door coin is not "open the stash": it is *"related to transforming milk, say from
 * freezer to be thawed… while the app still provides selectable stash from a list sorted by
 * earliest by use date; another scenario is from freeze/thawed straight to feeding"*. And the
 * pantry coin is not "open the shopping list": it is *"the supplies list where user can add
 * what's (almost or has) run out… to shopping cart and then have the option to share all
 * selected right there on the spot"*. Each got a page of its own, because neither existed.
 */
export type CoinAction = 'sheet' | 'timer' | 'milk' | 'restock';

/**
 * THE FOUR TIMER COINS. A tap while one of these is running ENDS it. The spec says "second tap
 * of the same coin", but the app cannot tell one coin from another — by design, since the
 * duplicates are encoded identically — so it is really "a tap on any coin of this module".
 * The outcome is the same one the parent wants and there is nothing to distinguish anyway.
 */
export const TIMER_COINS: ReadonlySet<CoinTarget> = new Set<CoinTarget>([
  'breastfeed',
  'pump',
  'sleep',
  'tummy',
]);

/**
 * The two that START WITHOUT ASKING ANYTHING (the spec's §3.3: sleep is a toggle, tummy time
 * "start a live timer"). Breastfeeding and pumping open their sheet, as the Quick grid does:
 * each asks Start or Already finished, and a feed then asks its side.
 *
 * Starting a sleep on one tap is only safe because the start cannot go unnoticed: it is felt (the
 * timer start's `double`), and the coin lands on Today, where the running card is — with its own
 * Stop — exactly as a start from the sheet would leave it. A coin on a crib rail WILL be brushed by
 * a sleeve. (There is no Undo toast on a start anywhere in the app, the coin's included: nothing
 * was written that an Undo could take back — docs/NFC_TAGS.md §3.4.)
 */
export const STRAIGHT_TO_TIMER: ReadonlySet<CoinTarget> = new Set<CoinTarget>(['sleep', 'tummy']);

export function coinAction(target: CoinTarget): CoinAction {
  if (target === RESTOCK) return 'restock';
  if (target === 'stash') return 'milk';
  return TIMER_COINS.has(target) ? 'timer' : 'sheet';
}

/**
 * WHAT ONE COIN SAYS, in the two places a person meets it: the sheet of coins inside the app,
 * and the page a phone WITHOUT the app lands on when it taps one. One source, so the coin, the
 * app and the website never describe the same thing differently.
 *
 * Every line describes the APP. None of them describes the baby (CLAUDE.md §2), and
 * `tags.test.ts` holds them to `foresight.banned.ts` — the repository's own list.
 */
export interface TagCopy {
  /** What a tap opens. */
  opens: string;
  /** What a tap does while a session of this kind is already running, for the four timer coins. */
  again?: string;
}

/*
  THE TWO SESSION COINS THAT OPEN A SHEET SAY WHAT THE SHEET DOES NOW (2026-09-26). Both used to
  read "Asks which side, then starts the timer", which had stopped being true of either: the coin
  opens the same sheet the Quick grid does, which asks first how it is being logged — *Start* or
  *Already finished* — and only the feed then asks a side, by sliding (`SideSlider`, 2026-09-26).
  The pump has not asked a side since its sheet became two path cards; its sides are amounts, on
  the way out.
*/
export const TAG_COPY: Readonly<Record<string, TagCopy>> = {
  breastfeed: {
    opens: 'Opens a feed: start it and slide to a side, or enter one already finished.',
    again: 'Tap again to end the feed.',
  },
  bottle: { opens: 'Opens a bottle, with the last amount and milk ready to save.' },
  pump: {
    opens: 'Opens pumping: start the timer, or enter a session already finished.',
    again: 'Tap again to end and enter the amount.',
  },
  diaper: { opens: 'Opens a diaper change: wet, dirty, both or dry.' },
  sleep: { opens: 'Starts a sleep.', again: 'Tap again to end it.' },
  solids: { opens: 'Opens solids, with recent foods first.' },
  tummy: { opens: 'Starts the timer.', again: 'Tap again to end it.' },
  temp: { opens: 'Opens a temperature, in the unit you used last.' },
  stash: {
    opens: 'Your bags, earliest use-by first: thaw one, or pour one into a bottle.',
  },
  med: { opens: 'Opens medicine, ready for what you gave.' },
  bath: { opens: 'Opens a bath.' },
  growth: { opens: 'Opens a weight or a length.' },
  [RESTOCK]: {
    opens: 'Your supplies: tick what has run out, add it to the list, share it.',
  },
};

/**
 * ── THE URL ───────────────────────────────────────────────────────────────────────────────────
 *
 *     https://<host>/t/<target>
 *
 * Roughly thirty bytes with the NDEF header, against 504 on an NTAG215.
 *
 * THERE IS NO PER-COIN SERIAL, and that is the spec's own consequence rather than a shortcut.
 * "Duplicate coins are encoded identically to their originals" means coin 11 and coin 4 carry
 * the same bytes; a unique serial per unit would break that, and a serial that is the same for
 * every diaper coin ever made identifies nothing. Dropping it also makes a production run ten
 * bulk encodings instead of N individual writes, which is the difference between an afternoon
 * and a week for the first thousand.
 *
 * `serial` remains supported by the parser for anything already written, and the batch tool can
 * still emit one on request — see `docs/NFC_TAGS.md §7`.
 */
export const TAG_ID_KEY = 'i';
const TAG_ID_ALPHABET = '0123456789bcdfghjkmnpqrstvwxyz';
export const TAG_ID_LENGTH = 6;
const TAG_ID_RE = new RegExp(`^[${TAG_ID_ALPHABET}]{${TAG_ID_LENGTH}}$`);

export const isTagId = (s: string): boolean => TAG_ID_RE.test(s);

/**
 * A serial from a caller's own randomness, for a run that wants one. Six characters of
 * Crockford-ish base32: no vowels, so it cannot spell anything, and no `i`, `l`, `o` or `u`,
 * so it cannot be misread off a printed sheet.
 */
export function tagId(random: () => number): string {
  let out = '';
  for (let i = 0; i < TAG_ID_LENGTH; i += 1) {
    const n = Math.floor(random() * TAG_ID_ALPHABET.length);
    out += TAG_ID_ALPHABET[Math.min(Math.max(n, 0), TAG_ID_ALPHABET.length - 1)];
  }
  return out;
}

/**
 * What gets written to a coin. The host comes from the caller
 * (`brand.json.decided.universalLinkHost`) and is never typed here — CLAUDE.md §1.
 */
export function tagUrl(host: string, target: CoinTarget, id?: string | null): string {
  const base = `https://${host}/${TAG_SEGMENT}/${target}`;
  return id ? `${base}?${TAG_ID_KEY}=${id}` : base;
}

/**
 * ── THE SAME COIN, FOR A BUILD THAT CANNOT CLAIM THE https LINK YET ───────────────────────────
 *
 * A coin that is SOLD carries `tagUrl` and nothing else. But that address only opens the app once
 * the phone has verified the app owns it — Android fetches assetlinks.json at install, from a
 * Play-signed build — and until then it opens the website. The owner is testing on blank tags now
 * (2026-09-26: "i want to start setting up the cuecoin on prototype NFC tags"), on builds that
 * cannot verify it yet, so a TEST tag carries one of two other addresses for the same path. Both
 * resolve to exactly the intent the https one does (`linking.test.ts` proves it for every coin);
 * docs/NFC_TAGS.md, "Test coins with blank tags", says which build wants which, and
 * `make-tags.mjs --test` prints all three.
 *
 * Never on a coin that is sold, and never locked: a test tag is rewritten when the build changes.
 */

/**
 * The app's own scheme: `cuddlecue://t/diaper`. Any installed build answers it — the internal
 * testing track, a preview APK, a development build — because the scheme is registered by the
 * binary itself and needs no file on the website. The scheme comes from the caller
 * (`brand.json.decided.urlScheme`), never typed here.
 */
export function appTagUrl(scheme: string, target: CoinTarget): string {
  return `${scheme}://${TAG_SEGMENT}/${target}`;
}

/**
 * Expo Go's form: `exp://192.168.1.20:8081/--/t/diaper`. Expo Go owns the `exp` scheme, opens the
 * project the address names — the development server, `<LAN IP>:<port>` as `pnpm mobile` prints it
 * — and hands the app whatever follows `/--/`. A tag written this way only works while that server
 * is running at that address, on the same network, which is why it is the least durable of the
 * three and the one to rewrite first.
 */
export function expoGoTagUrl(devServer: string, target: CoinTarget): string {
  return `exp://${devServer}/--/${TAG_SEGMENT}/${target}`;
}
