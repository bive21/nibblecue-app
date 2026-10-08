/**
 * THE CARD BACKGROUNDS ARE READABLE, held as a test rather than as a memory of having looked.
 *
 * `tools/brand/render-card-art.mjs` measures the shipped pictures — decoded from the bytes that
 * ship — and writes `cardArt.generated.ts`; this is the gate on what it wrote. The numbers
 * themselves come from the pixels, so a swapped artwork changes them, and `pnpm check:card-art`
 * regenerates — between them, no version of these seven files can reach a phone with text a parent
 * cannot read on it, except where the owner has decided so in the open (`contrastOwed`, below).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_APPEARANCE,
  PLUS_APPEARANCE,
  resolveAppearance,
  SCHEME_NAMES,
} from '@nibblecue/ui/appearance';
import { artInkColor, type CardArt } from '@nibblecue/ui/artInk';
import { AA_GRAPHIC, composite, contrastRatio } from '@nibblecue/ui/contrast';
import { materialBase, SKIN_NAMES, surfaceAlphaFor } from '@nibblecue/ui/skins';
import { paletteFor, themeNames } from '@nibblecue/ui/theme';
import { describe, expect, it } from 'vitest';
import {
  AA_LARGE,
  AA_TEXT,
  ART_MEASURED,
  CONTENT_FLOOR,
  CONTENT_MAX,
  CONTENT_MIN,
  VEIL_CEILING,
  VEIL_MAX,
  type ArtMeasurement,
} from './cardArt.generated';
import { stashCardInks, supplyDrawingOpacity, supplyPairInks } from './cardInks';

/**
 * A JPEG's frame header (SOF0, or SOF2 for a progressive one): the components and each one's
 * sampling factors, so a test can see the color was kept at full resolution (4:4:4).
 */
function jpegComponents(bytes: Buffer): { id: number; h: number; v: number }[] {
  for (let at = 2; at + 4 <= bytes.length;) {
    if (bytes[at] !== 0xff) return [];
    const marker = bytes[at + 1] ?? 0;
    const size = bytes.readUInt16BE(at + 2);
    if (marker === 0xc0 || marker === 0xc2) {
      const count = bytes[at + 9] ?? 0;
      return Array.from({ length: count }, (_, k) => {
        const c = at + 10 + k * 3;
        const sampling = bytes[c + 1] ?? 0;
        return { id: bytes[c] ?? 0, h: sampling >> 4, v: sampling & 0x0f };
      });
    }
    at += 2 + size;
  }
  return [];
}

describe('the owner’s card backgrounds', () => {
  // as the interface, so a field only some cards carry (`contrastOwed`) reads as optional
  const slots: [string, ArtMeasurement][] = Object.entries(ART_MEASURED);

  /**
   * THE FILES ARE WHERE `cardArt.ts` IMPORTS THEM FROM. A measurement of an artwork that is not
   * in the bundle is a number about nothing: Metro resolves a missing asset import to
   * `undefined` and `<Image>` then draws nothing at all, with no error anywhere — so the only
   * place this can be caught cheaply is here, against the same relative path the module uses.
   */
  it('ships a file for every slot, at the path the module imports', () => {
    const module = readFileSync(join(__dirname, 'cardArt.ts'), 'utf8');
    for (const [slot, m] of slots) {
      const file = join(__dirname, '..', '..', 'assets', 'card-art', m.file);
      expect(existsSync(file), file).toBe(true);
      expect(statSync(file).size, slot).toBeGreaterThan(1024);
      // the file the tool wrote is the file the module imports, by its own name
      expect(m.file.startsWith(`${slot}.`), slot).toBe(true);
      expect(module, slot).toContain(`from '../../assets/card-art/${m.file}';`);
    }
    // and nothing else in the folder: a picture nothing imports is weight for nothing
    expect(readdirSync(join(__dirname, '..', '..', 'assets', 'card-art')).sort()).toEqual(
      slots.map(([, m]) => m.file).sort(),
    );
  });

  /**
   * EVERY PICTURE SHIPS AS A JPEG (2026-10-01): lossy WebP from 2026-09-27, until the one picture
   * with see-through pixels, the stash summary's, drew nothing on an iPhone (the owner's
   * screenshot: the card's ground and its words, no picture). A JPEG has no alpha, so every
   * picture is opaque, the stash summary laid on its own ground as the card always painted it
   * beneath; and its color is kept at full resolution (4:4:4), as the WebP kept it.
   */
  it('ships every picture as an opaque JPEG with its color at full resolution', () => {
    for (const [slot, m] of slots) {
      const bytes = readFileSync(join(__dirname, '..', '..', 'assets', 'card-art', m.file));
      expect(m.file, slot).toBe(`${slot}.jpg`);
      expect([bytes[0], bytes[1]], `${slot} is a JPEG`).toEqual([0xff, 0xd8]);
      const components = jpegComponents(bytes);
      expect(components.length, `${slot} is in color`).toBe(3);
      for (const c of components) expect([c.h, c.v], `${slot} component ${c.id}`).toEqual([1, 1]);
    }
  });

  it('has the owner’s seven, at the rendered width', () => {
    expect(
      slots
        .filter(([, m]) => m.version === undefined)
        .map(([s]) => s)
        .sort(),
    ).toEqual([
      'breastfeed',
      'pump',
      'shopping',
      'sleep',
      // the stash has TWO: `stash` is Today's 4:1 stamp, `stashCard` the 2.4:1 hero the owner
      // drew for the Milk stash page's summary card (2026-09-22). A crop is not a design.
      'stash',
      'stashCard',
      'tummy',
    ]);
    for (const [slot, m] of slots) expect(m.width, slot).toBe(1280);
  });

  /**
   * AND THE VERSIONS DRAWN FROM THEM (2026-09-29; the owner: *"And yes, do dark version for milk
   * stash too / And night theme as well"*): a dark one of every picture drawn for dark ink (the pale
   * three), and a Night one of all seven. Each is named for the picture it is `of`, drawn from that
   * picture's own master at its own size, so it lies on a card exactly where the owner's does.
   */
  it('has a dark version of each pale picture and a Night version of every picture', () => {
    const own = slots.filter(([, m]) => m.version === undefined).map(([s]) => s);
    const versions = slots.filter(([, m]) => m.version !== undefined);
    for (const [slot, m] of versions) {
      const base: ArtMeasurement = ART_MEASURED[m.of as keyof typeof ART_MEASURED];
      expect(base.version, `${slot} is a version of the owner’s own picture`).toBeUndefined();
      expect(slot).toBe(`${m.of}${m.version === 'dark' ? 'Dark' : 'Night'}`);
      expect(m.master, slot).toBe(base.master);
      expect([m.width, m.height], slot).toEqual([base.width, base.height]);
      expect(m.span, slot).toBe(base.span);
    }
    const of = (version: string) =>
      versions
        .filter(([, m]) => m.version === version)
        .map(([, m]) => m.of)
        .sort();
    expect(of('dark')).toEqual(
      own.filter(s => ART_MEASURED[s as keyof typeof ART_MEASURED].ink === 'dark').sort(),
    );
    expect(of('night')).toEqual([...own].sort());
  });

  /**
   * A NIGHT VERSION IS DRAWN IN ITS MODULE'S OWN NIGHT COLOR: the one amber tone the Night palette
   * gives that module (`theme.ts`), the stash's in its milk and the shopping list's in its olive. A
   * Night palette that moves takes its pictures with it, or this fails.
   */
  it('draws each Night version in its module’s own Night color', () => {
    const night = paletteFor('night');
    const tone: Record<string, string> = {
      breastfeed: night.breastfeed,
      sleep: night.sleep,
      pump: night.pump,
      tummy: night.tummy,
      stash: night.milk,
      stashCard: night.milk,
      shopping: night.olive,
    };
    const nights = slots.filter(([, m]) => m.version === 'night');
    expect(nights).toHaveLength(7);
    for (const [slot, m] of nights)
      expect(m.tone?.toUpperCase(), slot).toBe(tone[m.of ?? '']?.toUpperCase());
  });

  /**
   * THE BAR IS WCAG'S LARGE-TEXT ONE, and the tool says at length why: 4.5:1 under white on a
   * saturated mid-tone costs half the artwork, and the owner has redrawn the pumping ground four
   * times asking for that wash to stop. What sits over these grounds is a 31 px semibold elapsed
   * time and an 18 px extrabold title — large by the rule that sets the bar.
   *
   * The two cards that need no veil are not let off with it: they measure over 11:1 bare, so
   * they are held to the full body-text bar, and so is every accent figure.
   */
  it('clears the bar it is measured against, with the ink the owner drew it with', () => {
    for (const [slot, m] of slots) {
      // WHICH BAR: the large-text one for a running timer's words, which are large, over the
      // owner's picture and its Night version alike; the body-text one on every other card
      const timer = ['breastfeed', 'sleep', 'pump', 'tummy'].includes(m.of ?? slot);
      expect(m.bar, slot).toBe(timer ? AA_LARGE : AA_TEXT);
      if (m.contrastOwed !== undefined) {
        // kept under the bar by the owner (below), and never under what it is owed at
        expect(m.contrast, slot).toBeLessThan(AA_LARGE);
        expect(m.contrast, slot).toBeGreaterThanOrEqual(m.contrastOwed);
        continue;
      }
      expect(m.contrast, slot).toBeGreaterThanOrEqual(m.bar);
    }
    /**
     * EXCEPT WHERE THE OWNER KEPT THEIR INK UNDER IT: playtime's white (2026-09-27, *"Keep white. i
     * dont see what the fuss is all about, they look fine in my eyes."*). No wash under the cap
     * lifts that blue to 3:1 at any width, so the card carries the cap across its floor and the
     * tool records what that measures, in the slot's ledger, as owed. Only a card named here may.
     */
    expect(
      slots.filter(([, m]) => m.contrastOwed !== undefined).map(([s]) => s),
      'a card kept its ink under the bar without a line in the test saying why',
    ).toEqual(['tummy']);
    // and nothing is owed on a version: nothing there was drawn by the owner, so a version under
    // its bar is a recipe to change, never a decision to record
    expect(
      slots.filter(([, m]) => m.version !== undefined && m.contrastOwed !== undefined),
    ).toEqual([]);
    // and the large-text bar is the looser of the two, never a way to raise the other
    expect(AA_LARGE).toBeLessThan(AA_TEXT);
  });

  /**
   * THE OWNER'S OWN CHOICE OF INK, and the record of it: white on the two saturated grounds,
   * dark on the two pale ones (2026-09-18, with a mockup of Today — *"i dont want dark ink, this
   * is roughly what it should look like"*). The measurement decides the VEIL; it does not get to
   * overrule the ink and quietly turn their rose card into a gray one.
   */
  it('takes light ink on the saturated grounds, dark on the pale ones', () => {
    expect(ART_MEASURED.breastfeed.ink).toBe('light');
    // and on the new lavender (2026-09-26), as on the teal before it
    expect(ART_MEASURED.sleep.ink).toBe('light');
    /**
     * AND WHITE ON THE PUMPING ORANGE (the owner, 2026-09-19: "the font on pumping timer should
     * be white"), which took four masters to make cheap.
     *
     * A veil may only cover the column the words occupy, so where the drawing begins decides
     * what white costs. Their first pumping artwork put the pump at 48% and white came cheap;
     * the repositioned one moved it to 32%, where the timer's own numeral ends, and white would
     * have meant a 50% wash over half the card — so that one shipped dark. The third put it at
     * 38.4% and bought white for a 39% wash. The fourth is darker orange, and the same search
     * now returns 18% of the card's own deepened hue.
     *
     * Every one of those numbers is their artwork's, not the app's: that is the point of
     * measuring, and it is why nobody had to edit a constant across four rounds of it.
     */
    expect(ART_MEASURED.pump.ink).toBe('light');
    /**
     * AND WHITE ON THE PLAYTIME BLUE AGAIN (the owner, 2026-09-27: "this looks very different to
     * the other and bad, revert it make sure text comes back to white"). The measurement had taken
     * it to dark on 2026-09-26 — the new sky blue carries white at 2.3:1 even in its darkest tenth,
     * past what any wash under the cap can lift — and the owner kept white knowing it: "Keep white.
     * i dont see what the fuss is all about, they look fine in my eyes." So it wears the cap, like
     * the deepest of the other white cards, and what it falls short by is owed (above).
     */
    expect(ART_MEASURED.tummy.ink).toBe('light');
    expect(ART_MEASURED.tummy.veil).toBe(VEIL_MAX);
    expect(ART_MEASURED.stash.ink).toBe('dark');
    expect(ART_MEASURED.shopping.ink).toBe('dark');
    // AND EACH VERSION TAKES THE INK IT WAS DRAWN FOR (2026-09-29): white on a dark version, with a
    // light gold or green beside it, and Night's amber on every Night one
    for (const [slot, m] of slots) {
      if (m.version === 'dark') expect(m.ink, slot).toBe('light');
      if (m.version === 'night') expect(m.ink, slot).toBe('amber');
    }
    expect(ART_MEASURED.stashDark.accent).toBe('honey');
    expect(ART_MEASURED.stashCardDark.accent).toBe('honey');
    expect(ART_MEASURED.shoppingDark.accent).toBe('mint');
  });

  /**
   * AND THE VEIL IS ONLY WHERE IT IS EARNED. The two pale grounds measure over 11:1 bare and get
   * none at all — a veil on a card that does not need one is the owner's artwork made muddier for
   * nothing. The three that do need one get the smallest that reaches the bar, and it is bounded
   * at a fifth: past that a wash is a thing you can see laid on the picture, which is the
   * complaint this cap exists to answer.
   */
  it('veils only the cards that need it, and never past the ceiling', () => {
    expect(ART_MEASURED.stash.veil).toBe(0);
    expect(ART_MEASURED.shopping.veil).toBe(0);
    // the stash's gold figure is measured like an ink, over the same column (the owner,
    // 2026-09-19: "needs to be dark gold also the icon")
    expect(ART_MEASURED.stash.accent).toBe('gold');
    expect(ART_MEASURED.stash.accentContrast).toBeGreaterThanOrEqual(AA_TEXT);
    // and the shopping card's dark green, its own words' ink (the owner, 2026-09-19)
    expect(ART_MEASURED.shopping.accent).toBe('green');
    expect(ART_MEASURED.shopping.accentContrast).toBeGreaterThanOrEqual(AA_TEXT);
    for (const [slot, m] of slots) {
      expect(m.veil, slot).toBeGreaterThanOrEqual(0);
      // each card is held to the cap its own slot ran under, and no slot may raise its cap past
      // the ceiling — a per-slot cap is a decision about one artwork, not a way round the gate
      expect(m.veil, slot).toBeLessThanOrEqual(m.veilMax);
      expect(m.veilMax, slot).toBeLessThanOrEqual(VEIL_CEILING);
      // the owner's white-ink pictures each need one; a version is drawn for its ink and needs none
      if (m.version !== undefined) expect(m.veil, slot).toBe(0);
      else if (m.ink === 'light') expect(m.veil, slot).toBeGreaterThan(0);
      // and every accent figure, on every picture, clears the body-text bar
      if (m.accent) expect(m.accentContrast, slot).toBeGreaterThanOrEqual(AA_TEXT);
    }
    // NO CARD BUYS A DEEPER VEIL TODAY, and the ceiling is what stops that becoming a way round
    // the gate. A slot that raises its cap, or lowers its column floor, has to be named here
    // with the reason, in the same change.
    expect(
      slots.filter(([, m]) => m.veilMax > VEIL_MAX).map(([s]) => s),
      'a card raised its veil cap without a line in the test saying why',
    ).toEqual([]);
    // THE SLEEPING PICTURE LOWERS ITS FLOOR (2026-09-26): the halo round its moon begins at 35%,
    // and the owner drew the words' column exactly that wide — the baby in the middle, the stop
    // button on the plain right. (The pumping card lowered it for its old orange; the green does
    // not need to.) AND THE PLAYTIME PICTURE (2026-09-27): white again, no width of its blue
    // reaches the bar under the cap, so its column is its floor — and the plain sky ends at 34%,
    // where the mat and the cloud behind the baby begin.
    expect(
      slots.filter(([, m]) => m.contentMin < CONTENT_MIN).map(([s]) => s),
      'a card lowered its column floor without a line in the test saying why',
    ).toEqual(['sleep', 'tummy']);
  });

  /**
   * AND IT IS DRAWN IN THE ARTWORK'S OWN COLOR. This is the half of "ugly" that no amount of
   * arithmetic would have found: a neutral wash over a saturated ground desaturates it, so the
   * owner's orange reached the phone as brown and their green as olive, and they named it twice
   * (2026-09-19: *"it looks ugly if it's with the darker left layer you made"*).
   *
   * The gate is that the veil carries CHROMA — that its channels are not all within a few points
   * of each other, which is what a gray is. It cannot check taste, but it can check that nobody
   * has quietly put the neutral back.
   */
  it('draws each veil in its own artwork’s hue, never in a gray', () => {
    for (const [slot, m] of slots) {
      expect(m.veilColor, slot).toMatch(/^#[0-9a-f]{6}$/);
      if (m.veil === 0) continue;
      const channels = [1, 3, 5].map(i => parseInt(m.veilColor.slice(i, i + 2), 16));
      const chroma = Math.max(...channels) - Math.min(...channels);
      expect(chroma, `${slot} veil is a neutral`).toBeGreaterThan(16);
    }
  });

  /**
   * THE CONTENT COLUMN IS PER CARD, and the six differ because the artworks do. The pumping
   * ground turns at its bottle and is cut there; the two pale grounds stay pale nearly all the
   * way across and carry text to the ceiling of the search — which is what the owner's own mockup
   * of Today shows, its stash line running well past halfway. One number for all six would have
   * cramped five cards to suit the tightest.
   */
  it('gives each card the widest column its own artwork can carry', () => {
    for (const [slot, m] of slots) {
      // held to the floor its own slot ran under, and no slot may go under the absolute one
      expect(m.contentFraction, slot).toBeGreaterThanOrEqual(m.contentMin);
      expect(m.contentMin, slot).toBeGreaterThanOrEqual(CONTENT_FLOOR);
      expect(m.contentFraction, slot).toBeLessThanOrEqual(CONTENT_MAX);
      // the veil always outlasts the column it is there for, or the last words sit on bare art
      expect(m.veilEnd, slot).toBeGreaterThan(m.contentFraction);
    }
    // the sleeping card is the tight one: its halo cuts in just past a third
    expect(ART_MEASURED.sleep.contentFraction).toBeLessThanOrEqual(0.36);
    // and the three timer pictures keep their words off the drawing in the middle
    for (const slot of ['sleep', 'pump', 'tummy'] as const)
      expect(ART_MEASURED[slot].contentFraction, slot).toBeLessThanOrEqual(0.55);
    // and the pale pair are not made to share its limit
    expect(ART_MEASURED.shopping.contentFraction).toBeGreaterThan(0.6);
  });

  /**
   * EVERY PICTURE HAS ITS OWN GROUND, AND ITS INK READS ON IT (2026-09-29). A card lays the picture
   * on it (`CardArtLayer`'s `ground`), so this is what its words sit on before the picture arrives,
   * if it never does — a development phone fetches it from a dev server, and the owner's went to
   * sleep — and through whatever of it is translucent. Held to the bar the slot's column is held
   * to, and every accent to the body-text bar, on the ground as on the picture.
   */
  it('lays each picture on its own ground, which carries its ink', () => {
    const module = readFileSync(join(__dirname, 'cardArt.ts'), 'utf8');
    // the app hands the measured ground to the card with the picture
    expect(module).toContain('ground: m.ground,');
    for (const [slot, m] of slots) {
      expect(m.ground, slot).toMatch(/^#[0-9a-f]{6}$/);
      expect(m.groundContrast, slot).toBeGreaterThanOrEqual(m.bar);
      // what the tool recorded is what the arithmetic says, under the column's veil
      const veiled = composite(m.ground, m.veilColor, m.veil);
      expect(contrastRatio(artInkColor(m.ink), veiled), slot).toBeCloseTo(m.groundContrast, 1);
      if (m.accent) {
        expect(m.accentGroundContrast, slot).toBeGreaterThanOrEqual(AA_TEXT);
        expect(contrastRatio(artInkColor(m.accent), veiled), slot).toBeCloseTo(
          m.accentGroundContrast ?? 0,
          1,
        );
      }
    }
  });

  /**
   * AND THE STASH SUMMARY IS MEASURED ACROSS THE WHOLE CARD (`span: 'card'`): its words do not keep
   * to a column — the outlook sits against the right edge, over the bags, and the strip of places
   * spans the width — so its ink and its gold are held to 4.5:1 over every pixel of it, as it is
   * drawn on its ground. That is also the one picture that is translucent: measured as if it were
   * opaque, it had read 4.97:1 for the gold, and in dark theme, over the card's dark tint, a phone
   * drew it at 1.19:1.
   */
  it('holds the stash summary’s words across the whole picture, as it is drawn', () => {
    // the owner's, and its dark and Night versions, whose words cross them the same way
    const summaries = ['stashCard', 'stashCardDark', 'stashCardNight'] as const;
    for (const slot of summaries) {
      const m: ArtMeasurement = ART_MEASURED[slot];
      expect(m.span, slot).toBe('card');
      expect(m.veil, `${slot}: a picture whose words cross it takes no veil`).toBe(0);
      expect(m.cardContrast, slot).toBeGreaterThanOrEqual(AA_TEXT);
      expect(m.accentCardContrast, slot).toBeGreaterThanOrEqual(AA_TEXT);
    }
    // the only ones; Today's pair keep their words in the column the tool measures
    expect(slots.filter(([, s]) => s.span === 'card').map(([s]) => s)).toEqual([...summaries]);
  });
});

/** Which measurement each picture handed to a card was built from, so a sweep can name it. */
const MEASURED_AS = new WeakMap<CardArt, keyof typeof ART_MEASURED>();

/**
 * The picture as `cardArt.ts` builds it for a card, from what the tool measured, with the versions
 * it builds on it — or without them, for a build whose versions did not resolve. No file: a node
 * test draws nothing, and what matters here is which inks and which ground it brings.
 */
function picture(slot: keyof typeof ART_MEASURED, versions = true): CardArt {
  const m: ArtMeasurement = ART_MEASURED[slot];
  const version = (name: 'Dark' | 'Night') => {
    const file = `${slot}${name}`;
    return versions && file in ART_MEASURED
      ? picture(file as keyof typeof ART_MEASURED, false)
      : null;
  };
  const dark = version('Dark');
  const night = version('Night');
  const art: CardArt = {
    source: 1,
    width: m.width,
    height: m.height,
    ink: m.ink,
    veil: m.veil,
    veilColor: m.veilColor,
    veilEnd: m.veilEnd,
    contentFraction: m.contentFraction,
    ground: m.ground,
    ...(m.accent ? { accent: m.accent } : {}),
    ...(m.version ? { version: m.version } : {}),
    ...(dark ? { dark } : {}),
    ...(night ? { night } : {}),
  };
  MEASURED_AS.set(art, slot);
  return art;
}

/** The measurement of a picture a card was handed, and its name. */
const measured = (art: CardArt): { slot: string; m: ArtMeasurement } => {
  const slot = MEASURED_AS.get(art);
  if (slot === undefined) throw new Error('a picture the sweep did not build');
  return { slot, m: ART_MEASURED[slot] };
};

/**
 * How many checks the sweep below runs: 2 skins × 6 schemes × 3 themes × 3 builds, each a summary
 * card and Today's pair twice over, and a drawn picture's inks held to the ones it was measured with.
 */
const CHECKS_FLOOR = 2520;

/** The five places a band or a dot can stand for (`PlaceKind`), and a kind this build does not know. */
const PLACE_KINDS = ['ROOM', 'FRIDGE', 'FREEZER', 'DEEP_FREEZER', 'THAWED', 'GARAGE'] as const;

/**
 * THE CARDS THAT WEAR THE PALE PICTURES: EVERY WORD ON THE GROUND IT LANDS ON, IN EVERY SKIN, SCHEME
 * AND THEME (2026-09-29). The Milk stash page's summary card and Today's stash and shopping pair,
 * through `cardInks.ts`, the very functions the screens call.
 *
 * The owner's evening in dark theme is why: a daytime picture drawn on a dark page on one phone,
 * and on the other its words, written for that picture, on the dark tint that showed through it or
 * stood in for it. So the ground is decided first (`artForTheme`: each theme's own version of the
 * picture, on that version's own solid ground; the card's own color, solid, where the build has no
 * version for the theme) and every ink is measured here on the ground it actually has. Words at
 * 4.5:1, all of them (the figure too, though it is large enough for 3:1), and a place's band and
 * dot, a graphic beside its own name and amount, at 3:1 on the ground it lies on.
 */
describe('the cards that wear the pale pictures, in every skin, scheme and theme', () => {
  const failures: string[] = [];
  /** Every picture a card drew: which file, for which picture, in which theme. */
  const drawn: { slot: string; of: string; theme: string; where: string }[] = [];
  let checks = 0;
  const check = (where: string, what: string, ink: string, ground: string, min: number) => {
    checks += 1;
    const v = contrastRatio(ink, ground);
    if (v < min)
      failures.push(`${where}: ${what} ${ink} on ${ground} = ${v.toFixed(2)}:1 (min ${min})`);
  };
  const same = (where: string, what: string, ink: string, measured: string) => {
    checks += 1;
    if (ink !== measured)
      failures.push(`${where}: ${what} is ${ink}, not the ink the picture was measured with`);
  };

  /** Every word and band on both cards, for one skin, scheme and theme, and the pictures a build has. */
  const sweep = (
    where: string,
    theme: (typeof themeNames)[number],
    r: ReturnType<typeof resolveAppearance>,
    art: (slot: 'stash' | 'stashCard' | 'shopping') => CardArt | null,
  ) => {
    const c = r.palette;

    /* THE STASH PAGE'S SUMMARY CARD. On a picture its words take the inks the tool held to 4.5:1
       across the whole of that picture as drawn (`cardContrast`, above), and are held here on its
       ground alone; off it, on the stash's gold, drawn solid. */
    const card = stashCardInks(c, theme, art('stashCard'));
    const words: [string, string][] = [
      ['words', card.onArt],
      ['quiet words', card.onArt2],
      ['figure', card.gold3],
      ['asterisk', card.mark],
    ];
    let cardGround = card.gold;
    if (card.art) {
      const { slot, m } = measured(card.art);
      drawn.push({ slot, of: 'stashCard', theme, where });
      cardGround = m.ground;
      same(where, 'the summary’s words', card.onArt, artInkColor(m.ink));
      same(where, 'the summary’s quiet words', card.onArt2, artInkColor(m.ink));
      same(where, 'the summary’s figure', card.gold3, artInkColor(m.accent ?? m.ink));
      same(where, 'the summary’s asterisk', card.mark, artInkColor(m.accent ?? m.ink));
    }
    for (const [what, ink] of words) check(where, `summary ${what}`, ink, cardGround, AA_TEXT);
    for (const kind of PLACE_KINDS)
      check(where, `summary ${kind} band`, card.place(kind), cardGround, AA_GRAPHIC);

    /* TODAY'S PAIR, with something to buy and with nothing. On a picture the heading and the figure
       take its measured inks, which the tool holds across the column the card keeps its words to
       (`contrast`, `accentContrast`), and on its ground alone here; off it, the card's own color,
       drawn solid — or, for a shopping list with nothing on it, the plain card. */
    for (const some of [true, false]) {
      const pair = supplyPairInks(
        c,
        theme,
        { stash: art('stash'), shopping: art('shopping') },
        some,
      );
      for (const name of ['stash', 'shopping'] as const) {
        const half = pair[name];
        const at = `${where}${some ? '' : ', nothing to buy'}`;
        if (half.art) {
          const { slot, m } = measured(half.art);
          drawn.push({ slot, of: name, theme, where: at });
          same(at, `Today’s ${name} heading`, half.ink, artInkColor(m.ink));
          same(at, `Today’s ${name} figure`, half.accent, artInkColor(m.accent ?? m.ink));
          check(at, `Today’s ${name} heading`, half.ink, m.ground, AA_TEXT);
          check(at, `Today’s ${name} figure`, half.accent, m.ground, AA_TEXT);
          continue;
        }
        if (name === 'shopping' && !some) {
          // the plain card: its material over the app ground as declared, at the alpha a phone
          // without a blur paints it (skins.ts surfaceAlphaFor), and opaque — the far end of that
          // number's range, so the ink holds wherever it is moved
          const s = r.skinTokens.surface;
          for (const plain of [
            composite(c.app, materialBase(c, s), s.alpha),
            composite(c.app, materialBase(c, s), surfaceAlphaFor(s, false)),
            composite(c.app, materialBase(c, s), 1),
          ])
            check(at, 'Today’s shopping heading on the plain card', half.ink, plain, AA_TEXT);
          continue;
        }
        check(at, `Today’s ${name} heading`, half.ink, half.ground, AA_TEXT);
        check(at, `Today’s ${name} figure`, half.accent, half.ground, AA_TEXT);
      }
    }
  };

  /*
    AND A BUILD THAT LOST PICTURES (`artFor` is null, or a version is: `cardArt.ts` says how a
    bundle can lose one). Without its versions, dark and Night draw each card in its own color,
    solid, as they did before there were any; without any picture even the light theme does. That
    is the one state in which the light theme's inks are chosen off a picture: the stash's gold ink
    is 3.8:1 on its light card, and three schemes' accents are under 4.5:1 there, so both fall back
    to the page ink, and this is what holds them to it.
  */
  const BUILDS = ['every picture', 'no versions in the build', 'no picture in the build'] as const;
  for (const skin of SKIN_NAMES)
    for (const scheme of SCHEME_NAMES)
      for (const theme of themeNames)
        for (const build of BUILDS) {
          const r = resolveAppearance(
            { ...DEFAULT_APPEARANCE, theme, scheme, skin },
            'light',
            PLUS_APPEARANCE,
          );
          const where = `${skin}/${scheme}/${theme}${build === 'every picture' ? '' : `, ${build}`}`;
          sweep(where, theme, r, slot =>
            build === 'no picture in the build' ? null : picture(slot, build === 'every picture'),
          );
        }

  it(`holds every word to 4.5:1 and every band to 3:1 on the ground it lands on (${checks} run)`, () => {
    // a floor at the real number (2 skins × 6 schemes × 3 themes, each with its pictures, without
    // their versions and without any), so the sweep cannot quietly shrink: a skin, a scheme or a
    // theme that stopped being iterated would take it under
    expect(checks).toBeGreaterThanOrEqual(CHECKS_FLOOR);
    expect(failures).toEqual([]);
  });

  /**
   * AND EACH THEME DRAWS ITS OWN VERSION OF A PALE PICTURE: the owner's in light, the dark one in
   * dark, where it was a daytime box on a dark page before (the owner, 2026-09-29), and the dim
   * amber one in Night. Without its versions a build draws the owner's in light alone.
   */
  it('draws each theme its own version of the pale pictures, and the owner’s only in light', () => {
    const version = { light: '', dark: 'Dark', night: 'Night' } as const;
    for (const d of drawn)
      expect(d.slot, d.where).toBe(`${d.of}${version[d.theme as keyof typeof version]}`);
    // the summary once and Today's two for either state of the list: in every skin, scheme and
    // theme with every picture, and in light alone for a build without the versions
    const perState = 1 + 2 * 2;
    expect(drawn).toHaveLength(
      SKIN_NAMES.length * SCHEME_NAMES.length * perState * (themeNames.length + 1),
    );
  });
});

describe('Today’s stash and shopping drawings in dark and Night', () => {
  it('keeps light whole and dark and Night near-full (2026-10-06)', () => {
    expect(supplyDrawingOpacity('light')).toBe(1);
    expect(supplyDrawingOpacity('dark')).toBeGreaterThanOrEqual(0.9);
    expect(supplyDrawingOpacity('dark')).toBeLessThanOrEqual(1);
    expect(supplyDrawingOpacity('night')).toBe(supplyDrawingOpacity('dark'));
    // (CuddleCue's Today draws them through `SupplyPair.tsx`; NibbleCue's Today does not draw them)
  });
});
