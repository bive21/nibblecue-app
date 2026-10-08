/**
 * THE PRE-MADE GROWN-UPS (the owner, 2026-09-30: *"keep the avatara pregenerated options minimum
 * but universal to all, keep women and men avatar for each race"*).
 *
 * Twelve illustrated people a member of the household can choose instead of a photo of themselves
 * or the initial: ONE WOMAN AND ONE MAN FOR EACH OF SIX BACKGROUNDS, the five the babies are balanced
 * across (`art.ts`), Black, East Asian, South Asian, white and Hispanic, and Middle Eastern.
 * `adults.test.ts` holds the count and the balance, so a drawing added to one background alone
 * fails the build.
 *
 * TWELVE, SO THE GRID IS FULL (the owner, 2026-10-01: *"add 2 more avatar to make it full on a 3x4
 * options"*). Ten left a short last row whether the sheet fits three or four across; twelve fill
 * both. The two new people are a sixth background's woman and man, so the set still has one woman
 * and one man for each background it draws, as the owner asked on 2026-09-30. Middle Eastern is the
 * cheapest choice to reverse: two entries here, and nothing stored names a background.
 *
 * TEN PEOPLE, TEN FACES (the owner, 2026-09-30: *"making just different color skin tone with same
 * face is kind of useless, if not offensive. Fix this"*). Until that day this file drew one face
 * and colored it ten times, to keep features from ever standing for a background. It kept that
 * promise by drawing nobody in particular. Each person now has a face of their own, put together
 * from a small kit (`AdultFace`): the shape of the head, the eyes, the brows, the nose, the mouth,
 * the cheeks, and for some earrings or a beard, and a top with its own neckline.
 *
 * NO GLASSES (the owner, 2026-10-01: *"the guy with glasses look very ugly, remove the glasses;
 * remove all with glasses"*). Three people wore them; the kit no longer has them.
 *
 * AND STILL NO FEATURE STANDS FOR A BACKGROUND, which is now a rule about how the kit is dealt
 * rather than a rule that nothing differs. Every style of the five main features (head, eyes,
 * brows, nose, mouth) is worn by two or three people, never two of one background, so no
 * background ever gets a style to itself; and no two people share more than one of them, so any two
 * faces differ in at least four. The styles are all common cartoon ones, the same size on everyone
 * who wears them: no feature is drawn bigger, wider or narrower for a background, no one of East
 * Asian background is drawn with closed or narrowed eyes, and the two Middle Eastern faces wear the
 * kit's finer brows and smaller noses, so that no drawing leans on a caricature. `adults.test.ts`
 * holds all of it.
 *
 * NO AFRO ON A DARK SKIN (the owner, 2026-09-30: *"dont draw afro on the black skin, this is
 * racist."*). The Black woman and man wore coils, a full rounded mass and a short textured cap: a
 * hair given to a skin as its sign. They wear what people of every background wear, a bun and a
 * close crop, and `adults.test.ts` holds that no darker skin is drawn with coils or curls again.
 * Their old ids went with the old hair before any server kept one (migration 0148 had reached
 * none); a phone that kept one draws the initial, as it does for any id it does not know.
 *
 * WOMAN OR MAN IS SAID BY THE HAIR, and by the conventions of drawing either that every background
 * shares alike: lashes, and a heart or an oval face, are drawn on women; a square or a long jaw, and
 * closed smiling eyes, on men; a beard on two men and earrings on three women. No age (no gray, no
 * lines), no role, nothing religious or national: nothing that says more about a person than that
 * they are this person.
 *
 * THE IDS NAME THE PICTURE, NEVER THE PERSON. A chosen drawing is stored on the person's profile
 * (`profiles.avatar_preset`, migration 0148) and travels in their download, so an id says which
 * hair was drawn ("bun", "side-part") and never a background or a gender: nothing stored says who
 * somebody is. An id is forever once shipped (a phone reads it off every member's row); a drawing
 * may be redrawn under the same id, as all ten were on 2026-09-30, and a phone that kept the old
 * picture as a file draws the new one, because the file is named for its shapes
 * (`adultDrawingKey`).
 *
 * A SCREEN READER HEARS THE TONE, as it does for the babies: woman or man, the tone in the words
 * the Unicode skin-tone modifiers use, then the hair and anything worn. `group` keeps the set
 * honest; nothing says it.
 *
 * WHY THE COLORS ARE LITERALS HERE: the reason `art.ts` gives. A person's skin must not move with
 * the theme, so this file is the drawing's palette, exempted by name from the no-hex rule
 * (eslint.config.mjs), and the tests hold that no other file borrows a tone from it.
 *
 * PURE, like `art.ts`: node checks exactly the shapes the phone draws, `raster.ts` turns them into
 * the picture a phone keeps (`adultPicture.ts`, `adultFile.ts`), and `shapesSvgMarkup` writes them
 * for a browser (the prototype's block 147 carries that markup).
 */
import { luminance, mix, ring, type ArtShape, type AvatarGroup, type SkinTone } from './art';

export type AdultGender = 'woman' | 'man';

/** The babies' five backgrounds and a sixth, so twelve people are a woman and a man from each. */
export type AdultGroup = AvatarGroup | 'middleEastern';
export const ADULT_GROUPS: readonly AdultGroup[] = [
  'black',
  'eastAsian',
  'southAsian',
  'white',
  'hispanic',
  'middleEastern',
];

type AdultHair =
  | 'bun'
  | 'crop'
  | 'straight-long'
  | 'straight-short'
  | 'waves-long'
  | 'side-part'
  | 'shoulder'
  | 'waves-short'
  | 'curls-long'
  | 'curls-short'
  | 'braid'
  | 'swept-back';

/** The shape of the head below the hairline: the jaw and the chin. */
export type AdultHead = 'oval' | 'round' | 'long' | 'heart' | 'square';
export type AdultEyes = 'dot' | 'big' | 'smile' | 'lash' | 'open';
export type AdultBrows = 'arch' | 'flat' | 'bold' | 'high' | 'soft';
export type AdultNose = 'curve' | 'button' | 'line' | 'round' | 'tip';
export type AdultMouth = 'smile' | 'grin' | 'soft' | 'smirk' | 'laugh';
export type AdultCheeks = 'blush' | 'none' | 'freckles' | 'dimples';
export type AdultNeckline = 'crew' | 'vneck' | 'collar' | 'stripes';

/** One person's face: the kit's six features, and what they wear on it. */
export interface AdultFace {
  head: AdultHead;
  eyes: AdultEyes;
  brows: AdultBrows;
  nose: AdultNose;
  mouth: AdultMouth;
  cheeks: AdultCheeks;
  earrings: 'hoops' | 'studs' | null;
  beard: 'full' | 'short' | null;
}

export interface AdultAvatarDef {
  /** Stable forever: it is what `profiles.avatar_preset` stores, and what a test addresses. */
  id: string;
  group: AdultGroup;
  gender: AdultGender;
  tone: SkinTone;
  /** What a screen reader says after woman or man and the tone: the hair, and anything worn. */
  look: string;
  skin: string;
  hair: AdultHair;
  hairColor: string;
  face: AdultFace;
  /** The top they wear, and its neckline. */
  top: string;
  neckline: AdultNeckline;
  background: string;
}

/**
 * THE SET, IN THE ORDER THE GRID DRAWS IT: the six backgrounds dealt round twice, woman then man in
 * turn (the second round in another order, so the turn holds across it), so no row is one background
 * and the grid never reads as a light-to-dark ramp. The darker half of the range is as well
 * represented as the lighter half (four each; the four in the middle are medium).
 *
 * THE FACES ARE DEALT, NOT CHOSEN PER BACKGROUND: each feature's five styles go to the twelve two or
 * three to a style, never two of one background, so that no two people share more than one feature.
 * The deal for twelve kept the ten faces drawn on 2026-09-30 but for two features (the bun's eyes,
 * the long curls' brows) and gave the two new people what was left (`adults.test.ts` checks the
 * result, not this note).
 */
export const ADULT_AVATARS: readonly AdultAvatarDef[] = [
  {
    id: 'bun',
    group: 'black',
    gender: 'woman',
    tone: 'dark',
    look: 'black hair in a bun and gold hoop earrings',
    skin: '#5C3622',
    hair: 'bun',
    hairColor: '#1A1411',
    face: {
      head: 'round',
      eyes: 'big',
      brows: 'high',
      nose: 'button',
      mouth: 'smile',
      cheeks: 'dimples',
      earrings: 'hoops',
      beard: null,
    },
    top: '#F2A38A',
    neckline: 'vneck',
    background: '#EDE7FA',
  },
  {
    id: 'straight-short',
    group: 'eastAsian',
    gender: 'man',
    tone: 'light',
    look: 'short straight black hair',
    skin: '#F4D7BD',
    hair: 'straight-short',
    hairColor: '#211A16',
    face: {
      head: 'square',
      eyes: 'open',
      brows: 'bold',
      nose: 'line',
      mouth: 'smile',
      cheeks: 'blush',
      earrings: null,
      beard: null,
    },
    top: '#8FB8DE',
    neckline: 'collar',
    background: '#E6F3E3',
  },
  {
    id: 'waves-long',
    group: 'southAsian',
    gender: 'woman',
    tone: 'medium-dark',
    look: 'long wavy black hair and small earrings',
    skin: '#A26740',
    hair: 'waves-long',
    hairColor: '#1A1411',
    face: {
      head: 'heart',
      eyes: 'lash',
      brows: 'soft',
      nose: 'round',
      mouth: 'soft',
      cheeks: 'blush',
      earrings: 'studs',
      beard: null,
    },
    top: '#6FB7B0',
    neckline: 'crew',
    background: '#FFF0D9',
  },
  {
    id: 'waves-short',
    group: 'white',
    gender: 'man',
    tone: 'medium-light',
    look: 'short wavy brown hair and a beard',
    skin: '#EDC7A5',
    hair: 'waves-short',
    hairColor: '#6E4A30',
    face: {
      head: 'long',
      eyes: 'smile',
      brows: 'bold',
      nose: 'tip',
      mouth: 'grin',
      cheeks: 'dimples',
      earrings: null,
      beard: 'full',
    },
    top: '#F2CF6B',
    neckline: 'crew',
    background: '#E3F0FA',
  },
  {
    id: 'curls-long',
    group: 'hispanic',
    gender: 'woman',
    tone: 'medium',
    look: 'long dark brown curls',
    skin: '#CF9567',
    hair: 'curls-long',
    hairColor: '#3E2A1D',
    face: {
      head: 'oval',
      eyes: 'big',
      brows: 'bold',
      nose: 'round',
      mouth: 'smirk',
      cheeks: 'blush',
      earrings: null,
      beard: null,
    },
    top: '#B7A6E0',
    neckline: 'vneck',
    background: '#FBE3EA',
  },
  {
    id: 'swept-back',
    group: 'middleEastern',
    gender: 'man',
    tone: 'medium',
    look: 'short black hair swept back',
    skin: '#C4895C',
    hair: 'swept-back',
    hairColor: '#241A15',
    face: {
      head: 'square',
      eyes: 'dot',
      brows: 'high',
      nose: 'round',
      mouth: 'grin',
      cheeks: 'blush',
      earrings: null,
      beard: null,
    },
    top: '#6FB7B0',
    neckline: 'stripes',
    background: '#FFF3C9',
  },
  {
    id: 'straight-long',
    group: 'eastAsian',
    gender: 'woman',
    tone: 'medium-light',
    look: 'long straight black hair, freckles and small earrings',
    skin: '#E8BD95',
    hair: 'straight-long',
    hairColor: '#211A16',
    face: {
      head: 'heart',
      eyes: 'big',
      brows: 'arch',
      nose: 'curve',
      mouth: 'grin',
      cheeks: 'freckles',
      earrings: 'studs',
      beard: null,
    },
    top: '#F2CF6B',
    neckline: 'crew',
    background: '#E9F5EC',
  },
  {
    id: 'crop',
    group: 'black',
    gender: 'man',
    tone: 'dark',
    look: 'short cropped black hair and a short beard',
    skin: '#6A3F27',
    hair: 'crop',
    hairColor: '#1A1411',
    face: {
      head: 'square',
      eyes: 'smile',
      brows: 'flat',
      nose: 'curve',
      mouth: 'soft',
      cheeks: 'none',
      earrings: null,
      beard: 'short',
    },
    top: '#9CC9A8',
    neckline: 'collar',
    background: '#FFF3C9',
  },
  {
    id: 'shoulder',
    group: 'white',
    gender: 'woman',
    tone: 'light',
    look: 'blond hair to the shoulders and freckles',
    skin: '#F7DCC8',
    hair: 'shoulder',
    hairColor: '#C99F57',
    face: {
      head: 'oval',
      eyes: 'dot',
      brows: 'flat',
      nose: 'line',
      mouth: 'laugh',
      cheeks: 'freckles',
      earrings: null,
      beard: null,
    },
    top: '#9CC9A8',
    neckline: 'stripes',
    background: '#FBE3EA',
  },
  {
    id: 'side-part',
    group: 'southAsian',
    gender: 'man',
    tone: 'medium-dark',
    look: 'short black hair with a side part',
    skin: '#A9714A',
    hair: 'side-part',
    hairColor: '#1A1411',
    face: {
      head: 'long',
      eyes: 'dot',
      brows: 'arch',
      nose: 'button',
      mouth: 'smirk',
      cheeks: 'none',
      earrings: null,
      beard: null,
    },
    top: '#F2A38A',
    neckline: 'stripes',
    background: '#E4F1F8',
  },
  {
    id: 'braid',
    group: 'middleEastern',
    gender: 'woman',
    tone: 'medium',
    look: 'long dark brown hair in a braid',
    skin: '#D19C70',
    hair: 'braid',
    hairColor: '#33241B',
    face: {
      head: 'oval',
      eyes: 'lash',
      brows: 'arch',
      nose: 'tip',
      mouth: 'smile',
      cheeks: 'dimples',
      earrings: null,
      beard: null,
    },
    top: '#B7A6E0',
    neckline: 'vneck',
    background: '#E6F3E3',
  },
  {
    id: 'curls-short',
    group: 'hispanic',
    gender: 'man',
    tone: 'medium',
    look: 'short dark brown curls',
    skin: '#C88B5D',
    hair: 'curls-short',
    hairColor: '#3E2A1D',
    face: {
      head: 'round',
      eyes: 'open',
      brows: 'soft',
      nose: 'tip',
      mouth: 'laugh',
      cheeks: 'none',
      earrings: null,
      beard: null,
    },
    top: '#8FB8DE',
    neckline: 'crew',
    background: '#FFF0D9',
  },
];

/** The drawing a stored id names, or undefined for one this build does not know (the initial). */
export function adultAvatarById(id: string | null | undefined): AdultAvatarDef | undefined {
  return id === null || id === undefined ? undefined : ADULT_AVATARS.find(a => a.id === id);
}

const INK = '#1C1411';
const WHITE = '#FFFFFF';
/** The gold of hoops: never a skin, never a theme color. */
const GOLD = '#E0AE48';
const PEARL = '#F5EFE4';

/** The crew neck, from one side of it to the other: the top's edge dips along it, and so does its line. */
const COLLAR = '40 76.9 Q50 86.8 60 76.9';

/* ------------------------------------------------------------------------------- the head */

/**
 * THE CROWN IS ONE SHAPE FOR EVERYONE, so every hair sits on every head: the upper half of the
 * ellipse the set was drawn on (centre 50,44; 21.5 across, 24.5 down). What differs is below it.
 */
const CROWN = 'M28.5 44 C28.5 30.47 38.13 19.5 50 19.5 C61.87 19.5 71.5 30.47 71.5 44';

/** One side of the jaw, the right one, from the widest point of the head to the chin. */
interface Jaw {
  /** A straight run down the side first (the square jaw), or none. */
  side: number | null;
  c1: readonly [number, number];
  c2: readonly [number, number];
  chin: number;
}

const JAWS: Record<AdultHead, Jaw> = {
  oval: { side: null, c1: [71.5, 57.53], c2: [61.87, 68.5], chin: 68.5 },
  // fuller cheeks, a shorter chin
  round: { side: null, c1: [72.2, 58.5], c2: [62.8, 66.8], chin: 66.8 },
  long: { side: null, c1: [71.2, 59.5], c2: [62, 70.8], chin: 70.8 },
  // wide at the cheekbones, coming to a soft point
  heart: { side: null, c1: [71.8, 55.5], c2: [61, 66.5], chin: 69.6 },
  square: { side: 53, c1: [71.4, 62.5], c2: [63.5, 68.6], chin: 68.6 },
};

/** The same jaw, drawn right to left: what the left side of a shape needs. */
const mirror = (x: number): number => 100 - x;

/** The whole head: the one crown and this person's jaw. */
function headPath(head: AdultHead): string {
  const j = JAWS[head];
  if (j.side === null) {
    const [c1x, c1y] = j.c1;
    const [c2x, c2y] = j.c2;
    return (
      `${CROWN} C${c1x} ${c1y} ${c2x} ${c2y} 50 ${j.chin} ` +
      `C${mirror(c2x)} ${c2y} ${mirror(c1x)} ${c1y} 28.5 44 Z`
    );
  }
  const [c1x, c1y] = j.c1;
  const [c2x, c2y] = j.c2;
  return (
    `${CROWN} L71.4 ${j.side} C${c1x} ${c1y} ${c2x} ${c2y} 50 ${j.chin} ` +
    `C${mirror(c2x)} ${c2y} ${mirror(c1x)} ${c1y} 28.6 ${j.side} Z`
  );
}

/**
 * HOW FAR THE MOUTH AND NOSE SIT FROM WHERE THE OVAL HAS THEM: a longer face carries them a little
 * lower, a rounder one a little higher, so the chin below the mouth is in proportion to the head.
 */
const LOWER: Record<AdultHead, number> = { oval: 0, round: -0.6, long: 1.1, heart: 0.2, square: 0 };

/* ------------------------------------------------------------------------------ the drawing */

/**
 * One person, back to front: the ground, the hair that falls behind (long hair only), the neck, the
 * top, the ears, the head, a beard, the hair in front, then the face and what is worn on it.
 * Coordinates are in a 100-unit box, and the frame that shows it is a circle, so nothing that
 * matters sits in the corners.
 */
export function adultShapes(def: AdultAvatarDef): ArtShape[] {
  const dark = luminance(def.skin) < 0.2;
  const skinShade = mix(def.skin, INK, dark ? 0.26 : 0.15);
  const neck = mix(def.skin, INK, dark ? 0.12 : 0.07);
  const out: ArtShape[] = [];

  out.push({ kind: 'rect', x: 0, y: 0, width: 100, height: 100, fill: def.background });
  out.push(...hairBehind(def));

  /*
    THE NECK, ONE SHAPE, AND THE TOP CUT ROUND IT (the owner, 2026-09-30: *"What happened to the
    avatars necks?"*). It was a narrow column ending at the collar, with a wider patch of skin laid
    over the top for the crew neck: where the two met, a notch and a step showed on each side. Now
    the neck runs down from under the chin, widening into the shoulders, and on down behind the
    top; the top is drawn over it with its neckline cut out of its edge, so the skin in the collar
    IS the neck, and the collar's line runs along that cut. The neck is wider than the cut wherever
    the cut is, and runs deeper than the deepest (the V), so no ground shows between them.
  */
  out.push({
    kind: 'path',
    d: 'M42.5 58 L42.5 69.5 C42.5 73.5 40.5 75.5 38.5 77.5 L38.5 92 L61.5 92 L61.5 77.5 C59.5 75.5 57.5 73.5 57.5 69.5 L57.5 58 Z',
    fill: neck,
  });
  out.push(...topShapes(def));

  // the ears, half behind the head
  for (const x of [28.6, 71.4]) {
    out.push({ kind: 'ellipse', cx: x, cy: 46.5, rx: 4.2, ry: 5.2, fill: def.skin });
    out.push({
      kind: 'ellipse',
      cx: x + (x < 50 ? 0.5 : -0.5),
      cy: 46.5,
      rx: 2.1,
      ry: 3,
      fill: skinShade,
      opacity: 0.6,
    });
  }
  out.push(...earringShapes(def));

  out.push({ kind: 'path', d: headPath(def.face.head), fill: def.skin });
  out.push(...beardShapes(def));
  out.push(...hairInFront(def));
  out.push(...faceShapes(def, skinShade, dark));
  return out;
}

/** The top and its neckline: a crew neck, a V, a shirt's collar, or a crew neck with stripes. */
function topShapes(def: AdultAvatarDef): ArtShape[] {
  const shade = mix(def.top, INK, 0.16);
  const light = mix(def.top, WHITE, 0.55);
  switch (def.neckline) {
    case 'vneck':
      return [
        {
          kind: 'path',
          d: 'M13 101 C13 86 26 77.6 40.2 76.9 L50 88.2 L59.8 76.9 C74 77.6 87 86 87 101 Z',
          fill: def.top,
        },
        { kind: 'path', d: 'M40.2 76.9 L50 88.2 L59.8 76.9', stroke: shade, strokeWidth: 1.6 },
      ];
    case 'collar':
      return [
        {
          kind: 'path',
          d: `M13 101 C13 86 26 77.6 ${COLLAR} C74 77.6 87 86 87 101 Z`,
          fill: def.top,
        },
        // the two points of a shirt's collar, turned down over the neckline
        { kind: 'path', d: 'M39.4 76.4 L43.6 85.4 L50 81.9 Q44 81 39.4 76.4 Z', fill: light },
        { kind: 'path', d: 'M60.6 76.4 L56.4 85.4 L50 81.9 Q56 81 60.6 76.4 Z', fill: light },
        { kind: 'path', d: 'M50 82.4 L50 101', stroke: shade, strokeWidth: 1.2, opacity: 0.6 },
      ];
    case 'stripes':
      return [
        {
          kind: 'path',
          d: `M13 101 C13 86 26 77.6 ${COLLAR} C74 77.6 87 86 87 101 Z`,
          fill: def.top,
        },
        { kind: 'path', d: 'M17 90.6 Q50 88.2 83 90.6', stroke: light, strokeWidth: 2.4 },
        { kind: 'path', d: 'M14.5 97 Q50 94.6 85.5 97', stroke: light, strokeWidth: 2.4 },
        { kind: 'path', d: `M${COLLAR}`, stroke: shade, strokeWidth: 1.6 },
      ];
    case 'crew':
      return [
        {
          kind: 'path',
          d: `M13 101 C13 86 26 77.6 ${COLLAR} C74 77.6 87 86 87 101 Z`,
          fill: def.top,
        },
        { kind: 'path', d: `M${COLLAR}`, stroke: shade, strokeWidth: 1.6 },
      ];
  }
}

function earringShapes(def: AdultAvatarDef): ArtShape[] {
  switch (def.face.earrings) {
    case 'hoops':
      return [28.8, 71.2].map(x => ({
        kind: 'path' as const,
        d: ring(x, 53.8, 2.2),
        stroke: GOLD,
        strokeWidth: 1.2,
      }));
    case 'studs':
      return [28.9, 71.1].map(x => ({
        kind: 'circle' as const,
        cx: x,
        cy: 51.2,
        r: 1.25,
        fill: PEARL,
      }));
    case null:
      return [];
  }
}

/**
 * A BEARD, in the hair's own color, over the jaw this person has: a full one up the cheeks, or a
 * short, trimmed one along the jaw and over the lip that leaves the cheeks clear. Both are solid:
 * a see-through beard darkened the whole lower face into a mask on a dark skin. The mouth is left
 * clear, with a patch of skin round it, so the lips read on any beard.
 */
function beardShapes(def: AdultAvatarDef): ArtShape[] {
  if (def.face.beard === null) return [];
  const dy = LOWER[def.face.head];
  const full = def.face.beard === 'full';
  return [
    {
      kind: 'path',
      d: beardOutline(JAWS[def.face.head], full, dy),
      // a trimmed beard is a shade lighter than the hair it grows with
      fill: full ? def.hairColor : mix(def.hairColor, def.skin, 0.2),
    },
    // the lips, clear of the beard
    {
      kind: 'ellipse',
      cx: 50,
      cy: 60.4 + dy,
      rx: full ? 6.2 : 5.6,
      ry: full ? 2.8 : 2.6,
      fill: def.skin,
    },
  ];
}

/** The beard's shape: down the right sideburn, round the jaw, up the left, and back along the cheeks. */
function beardOutline(j: Jaw, full: boolean, dy: number): string {
  const drop = full ? 1.6 : 0.8;
  const s = 1.025;
  const sx = (x: number) => 50 + (x - 50) * s;
  const sy = (y: number) => 44 + (y - 44) * s;
  const [c1x, c1y] = j.c1;
  const [c2x, c2y] = j.c2;
  const chin = sy(j.chin) + drop;
  const right =
    j.side === null
      ? `M${sx(71.5)} 45.5 C${sx(c1x)} ${sy(c1y)} ${sx(c2x)} ${sy(c2y) + drop} 50 ${chin}`
      : `M${sx(71.4)} 45.5 L${sx(71.4)} ${sy(j.side)} C${sx(c1x)} ${sy(c1y)} ${sx(c2x)} ${sy(c2y) + drop} 50 ${chin}`;
  const left =
    j.side === null
      ? ` C${sx(mirror(c2x))} ${sy(c2y) + drop} ${sx(mirror(c1x))} ${sy(c1y)} ${sx(28.5)} 45.5`
      : ` C${sx(mirror(c2x))} ${sy(c2y) + drop} ${sx(mirror(c1x))} ${sy(c1y)} ${sx(28.6)} ${sy(j.side)}L${sx(28.6)} 45.5`;
  // back across the cheeks and over the upper lip, left to right: high on the cheeks for a full
  // beard, low along the jaw for a trimmed one
  const across = full
    ? ` L31.6 45.5 C32 ${52.4 + dy} 35.6 ${56.2 + dy} 40.4 ${57.1 + dy}` +
      ` Q45 ${56.1 + dy} 50 ${56.5 + dy} Q55 ${56.1 + dy} 59.6 ${57.1 + dy}` +
      ` C64.4 ${56.2 + dy} 68 ${52.4 + dy} 68.4 45.5 Z`
    : ` L31 45.5 C31.6 ${54 + dy} 35.4 ${59.2 + dy} 41.2 ${58.6 + dy}` +
      ` Q45 ${55.8 + dy} 50 ${56.2 + dy} Q55 ${55.8 + dy} 58.8 ${58.6 + dy}` +
      ` C64.6 ${59.2 + dy} 68.4 ${54 + dy} 69 45.5 Z`;
  return right + left + across;
}

/* ------------------------------------------------------------------------------ the face */

function faceShapes(def: AdultAvatarDef, skinShade: string, dark: boolean): ArtShape[] {
  const f = def.face;
  const dy = LOWER[f.head];
  const ink = dark ? '#140E0B' : mix(def.skin, INK, 0.8);
  const brow = luminance(def.hairColor) > 0.2 ? mix(def.hairColor, INK, 0.45) : def.hairColor;
  const blush = dark ? mix(def.skin, '#D9566A', 0.3) : mix(def.skin, '#EE7C86', 0.38);
  const lip = dark ? mix(def.skin, '#3A1418', 0.62) : mix(def.skin, '#8E3440', 0.6);
  const mouthInside = dark ? '#3A1418' : '#6E2530';
  const out: ArtShape[] = [];

  out.push(...cheekShapes(f.cheeks, def.skin, blush, skinShade, dark, dy));
  out.push(...eyeShapes(f.eyes, ink));
  out.push(...browShapes(f.brows, brow));
  out.push(...noseShapes(f.nose, skinShade, dy));
  out.push(...mouthShapes(f.mouth, lip, mouthInside, dy));
  return out;
}

function cheekShapes(
  cheeks: AdultCheeks,
  skin: string,
  blush: string,
  skinShade: string,
  dark: boolean,
  dy: number,
): ArtShape[] {
  const soft = dark ? 0.5 : 0.38;
  switch (cheeks) {
    case 'blush':
      return [37.6, 62.4].map(cx => ({
        kind: 'circle' as const,
        cx,
        cy: 55 + dy * 0.5,
        r: 3.8,
        fill: blush,
        opacity: soft,
      }));
    case 'dimples':
      return [
        ...[37.6, 62.4].map(cx => ({
          kind: 'circle' as const,
          cx,
          cy: 55 + dy * 0.5,
          r: 3.4,
          fill: blush,
          opacity: soft * 0.8,
        })),
        {
          kind: 'path',
          d: `M43.2 ${59.2 + dy} Q42.6 ${60.6 + dy} 43.4 ${61.8 + dy}`,
          stroke: skinShade,
          strokeWidth: 1.1,
        },
        {
          kind: 'path',
          d: `M56.8 ${59.2 + dy} Q57.4 ${60.6 + dy} 56.6 ${61.8 + dy}`,
          stroke: skinShade,
          strokeWidth: 1.1,
        },
      ];
    case 'freckles': {
      const dot = mix(skin, '#6B3A22', dark ? 0.55 : 0.42);
      const spots: [number, number][] = [
        [36.4, 52.2],
        [38.6, 53.4],
        [37.6, 50.9],
        [40.1, 51.8],
        [35.8, 54.1],
      ];
      return spots.flatMap(([x, y]) => [
        { kind: 'circle' as const, cx: x, cy: y, r: 0.55, fill: dot, opacity: 0.85 },
        { kind: 'circle' as const, cx: mirror(x), cy: y, r: 0.55, fill: dot, opacity: 0.85 },
      ]);
    }
    case 'none':
      return [];
  }
}

function eyeShapes(eyes: AdultEyes, ink: string): ArtShape[] {
  const out: ArtShape[] = [];
  for (const x of [42, 58]) {
    const outward = x < 50 ? -1 : 1;
    switch (eyes) {
      case 'dot':
        out.push({ kind: 'ellipse', cx: x, cy: 46.8, rx: 2.2, ry: 2.6, fill: ink });
        out.push({ kind: 'circle', cx: x + 0.8, cy: 45.9, r: 0.8, fill: WHITE });
        break;
      case 'big':
        out.push({ kind: 'ellipse', cx: x, cy: 46.9, rx: 2.8, ry: 3.2, fill: ink });
        out.push({ kind: 'circle', cx: x + 1, cy: 45.7, r: 1.05, fill: WHITE });
        out.push({ kind: 'circle', cx: x - 0.9, cy: 48.1, r: 0.45, fill: WHITE, opacity: 0.85 });
        break;
      case 'smile':
        // closed and smiling: the eye is a happy curve
        out.push({
          kind: 'path',
          d: `M${x - 2.7} 47.6 Q${x} 44.3 ${x + 2.7} 47.6`,
          stroke: ink,
          strokeWidth: 1.8,
        });
        break;
      case 'lash':
        out.push({ kind: 'ellipse', cx: x, cy: 46.8, rx: 2.2, ry: 2.6, fill: ink });
        out.push({ kind: 'circle', cx: x + 0.8, cy: 45.9, r: 0.8, fill: WHITE });
        out.push({
          kind: 'path',
          d: `M${x + outward * 1.6} 44.8 L${x + outward * 3.3} 43.6`,
          stroke: ink,
          strokeWidth: 1.1,
        });
        out.push({
          kind: 'path',
          d: `M${x + outward * 2.2} 46 L${x + outward * 3.9} 45.3`,
          stroke: ink,
          strokeWidth: 1,
        });
        break;
      case 'open':
        // the white of the eye, an almond as tall as the dot and lash eyes (5.2), the iris in it,
        // and the upper lid along its top edge (a lid drawn inside the white left a sliver of white
        // showing above it). The iris fills most of the almond: with a wide band of white either
        // side of a small one the eyes stared (the owner, 2026-10-01, of the face that wore them
        // under glasses: *"very ugly"*)
        out.push({
          kind: 'path',
          d: `M${x - 2.9} 47.2 Q${x} 41.9 ${x + 2.9} 47.2 Q${x} 52.1 ${x - 2.9} 47.2 Z`,
          fill: WHITE,
        });
        out.push({ kind: 'circle', cx: x, cy: 47.1, r: 2.1, fill: ink });
        out.push({ kind: 'circle', cx: x + 0.7, cy: 46.3, r: 0.7, fill: WHITE });
        out.push({
          kind: 'path',
          d: `M${x - 3.2} 47.3 Q${x} 41.8 ${x + 3.2} 47.3`,
          stroke: ink,
          strokeWidth: 1.25,
        });
        break;
    }
  }
  return out;
}

function browShapes(brows: AdultBrows, color: string): ArtShape[] {
  const both = (d: (s: number) => string, strokeWidth: number, opacity?: number): ArtShape[] =>
    [1, -1].map(s => ({
      kind: 'path' as const,
      d: d(s),
      stroke: color,
      strokeWidth,
      ...(opacity === undefined ? {} : { opacity }),
    }));
  // `s` is 1 for the left brow and -1 for the right: x = 50 - s × distance from the middle
  const x = (s: number, fromMiddle: number) => 50 - s * fromMiddle;
  switch (brows) {
    case 'arch':
      return both(s => `M${x(s, 11.8)} 41.2 Q${x(s, 8)} 39.2 ${x(s, 4.4)} 40.8`, 1.8);
    case 'flat':
      return both(s => `M${x(s, 11.6)} 40.8 Q${x(s, 8)} 40.2 ${x(s, 4.6)} 40.4`, 2.1);
    case 'bold':
      return both(s => `M${x(s, 12)} 41.4 Q${x(s, 8.2)} 38.6 ${x(s, 4.2)} 40.2`, 2.8);
    case 'high':
      return both(s => `M${x(s, 11.4)} 40 Q${x(s, 8)} 36.8 ${x(s, 4.7)} 39.2`, 1.7);
    case 'soft':
      return both(s => `M${x(s, 10.8)} 41 Q${x(s, 8)} 39.9 ${x(s, 5.2)} 40.7`, 1.3, 0.85);
  }
}

function noseShapes(nose: AdultNose, shade: string, dy: number): ArtShape[] {
  switch (nose) {
    case 'curve':
      return [
        {
          kind: 'path',
          d: `M50.4 ${49.4 + dy} Q48.4 ${54 + dy} 51 ${55 + dy}`,
          stroke: shade,
          strokeWidth: 1.5,
        },
      ];
    case 'button':
      return [
        { kind: 'ellipse', cx: 50, cy: 53.8 + dy, rx: 1.9, ry: 1.3, fill: shade, opacity: 0.9 },
      ];
    case 'line':
      return [
        {
          kind: 'path',
          d: `M50 ${49.6 + dy} L50 ${53.4 + dy} Q50 ${54.9 + dy} 51.6 ${54.7 + dy}`,
          stroke: shade,
          strokeWidth: 1.4,
        },
      ];
    case 'round':
      return [
        {
          kind: 'path',
          d: `M47.9 ${53.2 + dy} Q50 ${56 + dy} 52.1 ${53.2 + dy}`,
          stroke: shade,
          strokeWidth: 1.5,
        },
      ];
    case 'tip':
      return [
        { kind: 'circle', cx: 48.8, cy: 54.3 + dy, r: 0.7, fill: shade },
        { kind: 'circle', cx: 51.2, cy: 54.3 + dy, r: 0.7, fill: shade },
      ];
  }
}

function mouthShapes(mouth: AdultMouth, lip: string, inside: string, dy: number): ArtShape[] {
  const y = (v: number) => v + dy;
  switch (mouth) {
    case 'smile':
      return [
        {
          kind: 'path',
          d: `M44.6 ${y(59.4)} Q50 ${y(63.8)} 55.4 ${y(59.4)}`,
          stroke: lip,
          strokeWidth: 1.9,
        },
      ];
    case 'soft':
      return [
        {
          kind: 'path',
          d: `M46.4 ${y(60)} Q50 ${y(62.2)} 53.6 ${y(60)}`,
          stroke: lip,
          strokeWidth: 1.7,
        },
      ];
    case 'smirk':
      return [
        {
          kind: 'path',
          d: `M45 ${y(60.6)} Q50 ${y(62.6)} 55.2 ${y(59.2)}`,
          stroke: lip,
          strokeWidth: 1.8,
        },
        { kind: 'path', d: `M55.2 ${y(59.2)} L56.2 ${y(58.4)}`, stroke: lip, strokeWidth: 1.4 },
      ];
    case 'grin':
      // an open smile with the top teeth showing
      return [
        { kind: 'path', d: `M44.4 ${y(59.2)} Q50 ${y(66)} 55.6 ${y(59.2)} Z`, fill: inside },
        {
          kind: 'path',
          d: `M45.3 ${y(59.5)} L54.7 ${y(59.5)} Q54.2 ${y(61.2)} 50 ${y(61.3)} Q45.8 ${y(61.2)} 45.3 ${y(59.5)} Z`,
          fill: WHITE,
        },
      ];
    case 'laugh':
      // wide open, the tongue showing
      return [
        {
          kind: 'path',
          d: `M44.6 ${y(59)} L55.4 ${y(59)} Q55 ${y(65.8)} 50 ${y(65.8)} Q45 ${y(65.8)} 44.6 ${y(59)} Z`,
          fill: inside,
        },
        { kind: 'ellipse', cx: 50, cy: y(64.1), rx: 3, ry: 1.5, fill: '#E98A93' },
        {
          kind: 'path',
          d: `M45.6 ${y(59)} L54.4 ${y(59)} L54.1 ${y(60.2)} L45.9 ${y(60.2)} Z`,
          fill: WHITE,
        },
      ];
  }
}

/* ------------------------------------------------------------------------------ the hair */

/** Round bumps along an arc: the outline of curls. */
function bumps(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  from: number,
  to: number,
  step: number,
  r: number,
  fill: string,
): ArtShape[] {
  const out: ArtShape[] = [];
  for (let deg = from; deg <= to + 0.001; deg += step) {
    const a = (deg * Math.PI) / 180;
    out.push({ kind: 'circle', cx: cx + rx * Math.cos(a), cy: cy + ry * Math.sin(a), r, fill });
  }
  return out;
}

/** Two decimals: plenty in a 100-unit box, and short markup. */
const r2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * One plait of a braid: an ellipse leaning by `deg`, written as a path (a shape here has no rotation
 * of its own), and the short highlight that tells one plait from the next on hair of any color.
 */
function plait(cx: number, cy: number, deg: number, fill: string, sheen: string): ArtShape[] {
  const a = (deg * Math.PI) / 180;
  const at = (x: number, y: number): string =>
    `${r2(cx + x * Math.cos(a) - y * Math.sin(a))} ${r2(cy + x * Math.sin(a) + y * Math.cos(a))}`;
  const [rx, ry, k] = [3.3, 2.3, 0.5523];
  return [
    {
      kind: 'path',
      d:
        `M${at(rx, 0)} C${at(rx, k * ry)} ${at(k * rx, ry)} ${at(0, ry)} ` +
        `C${at(-k * rx, ry)} ${at(-rx, k * ry)} ${at(-rx, 0)} ` +
        `C${at(-rx, -k * ry)} ${at(-k * rx, -ry)} ${at(0, -ry)} ` +
        `C${at(k * rx, -ry)} ${at(rx, -k * ry)} ${at(rx, 0)} Z`,
      fill,
    },
    {
      kind: 'path',
      d: `M${at(-1.7, -0.6)} Q${at(0, -1.5)} ${at(1.7, -0.6)}`,
      stroke: sheen,
      strokeWidth: 0.9,
      opacity: 0.7,
    },
  ];
}

/**
 * THE BRAID, over the shoulder on the right of the picture: plaits leaning one way and then the
 * other, from behind the jaw down over the top. The first two are drawn behind the head, so the braid
 * comes from behind it; the rest lie over the top.
 */
const BRAID: readonly (readonly [number, number])[] = [
  [66.2, 64.2],
  [66.9, 67.9],
  [67.6, 71.6],
  [68.2, 75.3],
  [68.7, 79],
  [69.1, 82.7],
  [69.4, 86.4],
];
const BRAID_BEHIND = 2;

function braidShapes(def: AdultAvatarDef, front: boolean): ArtShape[] {
  const c = def.hairColor;
  const sheen = mix(c, WHITE, 0.3);
  const out = BRAID.flatMap(([x, y], i) =>
    i < BRAID_BEHIND === front ? [] : plait(x, y, i % 2 === 0 ? 28 : -28, c, sheen),
  );
  if (!front) return out;
  // the tie, and the ends below it
  return [
    ...out,
    { kind: 'ellipse', cx: 69.5, cy: 89.3, rx: 2.1, ry: 1.1, fill: mix(def.top, INK, 0.3) },
    { kind: 'path', d: 'M68 90.1 Q69.6 95.2 71.2 90.1 Z', fill: c },
  ];
}

/** What falls behind the head and the shoulders: long hair only. */
function hairBehind(def: AdultAvatarDef): ArtShape[] {
  const c = def.hairColor;
  switch (def.hair) {
    case 'straight-long':
      return [
        {
          kind: 'path',
          d: 'M24.5 46 C24 25.5 35.5 14.5 50 14.5 C64.5 14.5 76 25.5 75.5 46 L77.5 82 C69 85.5 31 85.5 22.5 82 Z',
          fill: c,
        },
      ];
    case 'waves-long':
      return [
        {
          kind: 'path',
          d:
            'M24 46 C23 25 35 14 50 14 C65 14 77 25 76 46 C78.5 52 74.5 57 77.5 63 ' +
            'C80.5 69 75.5 74 78.5 81 C70 85.5 30 85.5 21.5 81 C24.5 74 19.5 69 22.5 63 ' +
            'C25.5 57 21.5 52 24 46 Z',
          fill: c,
        },
      ];
    case 'shoulder':
      // to the shoulders, the ends turned out
      return [
        {
          kind: 'path',
          d:
            'M25 45 C24.5 26 36 15.5 50 15.5 C64 15.5 75.5 26 75 45 C75.5 55 76.5 63 79.5 68.5 ' +
            'C74 71.5 66.5 71 62 68 L38 68 C33.5 71 26 71.5 20.5 68.5 C23.5 63 24.5 55 25 45 Z',
          fill: c,
        },
      ];
    case 'curls-long':
      return [
        {
          kind: 'path',
          d: 'M23.5 46 C22.5 25 35 13.5 50 13.5 C65 13.5 77.5 25 76.5 46 L78 79 C70 84 30 84 22 79 Z',
          fill: c,
        },
        ...[30, 38, 46, 54, 62, 70, 78].flatMap(y => [
          { kind: 'circle' as const, cx: 22.5 - (y > 60 ? 0.8 : 0), cy: y, r: 4.6, fill: c },
          { kind: 'circle' as const, cx: 77.5 + (y > 60 ? 0.8 : 0), cy: y, r: 4.6, fill: c },
        ]),
      ];
    case 'braid':
      // drawn back from the face and gathered low on the right, behind the ear, where the braid starts
      return [
        {
          kind: 'path',
          d:
            'M25.8 44 C25.3 26 36.5 15.8 50 15.8 C63.5 15.8 74.7 26 74.2 44 C74.2 51.5 72.4 58 68.6 63.2 ' +
            'L63.2 61.6 C66.4 57 68 51 68 44 Z',
          fill: c,
        },
        ...braidShapes(def, false),
      ];
    case 'bun':
    case 'crop':
    case 'straight-short':
    case 'side-part':
    case 'waves-short':
    case 'curls-short':
    case 'swept-back':
      return [];
  }
}

/** The hair over the head: the crown, the hairline, and the sheen or texture on it. */
function hairInFront(def: AdultAvatarDef): ArtShape[] {
  const c = def.hairColor;
  const sheen = mix(c, WHITE, 0.24);
  switch (def.hair) {
    case 'bun':
      // drawn back smooth from the face into a bun on the crown, a sheen on the crown and one turn
      // of the twist on the bun: hair gathered up, and nothing else
      return [
        { kind: 'ellipse', cx: 50, cy: 14.2, rx: 9.6, ry: 7.4, fill: c },
        {
          kind: 'path',
          d:
            'M28.8 45 C28 27.5 38 18.4 50 18.4 C62 18.4 72 27.5 71.2 45 C70.2 38.5 67.4 33.6 62.8 31 ' +
            'C58.8 29.2 54.6 28.6 50 28.6 C45.4 28.6 41.2 29.2 37.2 31 C32.6 33.6 29.8 38.5 28.8 45 Z',
          fill: c,
        },
        {
          kind: 'path',
          d: 'M43.5 13.4 Q50 9.6 56.5 13.4',
          stroke: sheen,
          strokeWidth: 1.4,
          opacity: 0.75,
        },
        {
          kind: 'path',
          d: 'M37 25 Q42.5 21.6 48 21.2',
          stroke: sheen,
          strokeWidth: 1.5,
          opacity: 0.75,
        },
      ];
    case 'crop':
      // cut close all over: the head's own round, a clean line at the forehead and the temples
      return [
        {
          kind: 'path',
          d:
            'M29.2 41 C28.6 26.5 38.2 18.9 50 18.9 C61.8 18.9 71.4 26.5 70.8 41 C70.2 37.4 69 34.6 67.2 32.6 ' +
            'C62.2 31.2 56.2 30.6 50 30.6 C43.8 30.6 37.8 31.2 32.8 32.6 C31 34.6 29.8 37.4 29.2 41 Z',
          fill: c,
        },
        {
          kind: 'path',
          d: 'M37.5 25 Q43.5 22 49.5 21.8',
          stroke: sheen,
          strokeWidth: 1.4,
          opacity: 0.7,
        },
      ];
    case 'straight-long':
      // a middle part, the hair falling away from it to either side of the face
      return [
        {
          kind: 'path',
          d:
            'M28.5 47 C28 28 37.5 18.4 50 18.4 C62.5 18.4 72 28 71.5 47 C70.5 39 67.5 33 62.5 29 ' +
            'C58.5 26.4 54 25.6 50 26.6 C46 25.6 41.5 26.4 37.5 29 C32.5 33 29.5 39 28.5 47 Z',
          fill: c,
        },
        {
          kind: 'path',
          d: 'M36 24.5 Q42 21.4 48 21.8',
          stroke: sheen,
          strokeWidth: 1.5,
          opacity: 0.75,
        },
      ];
    case 'straight-short':
      return [
        {
          kind: 'path',
          d:
            'M28.5 43 C27.5 26 38 17.5 50 17.5 C62 17.5 72.5 26 71.5 43 C70 36.5 66.5 32 61.5 30.5 ' +
            'C55.5 33.2 46.5 33.8 39.5 31 C34.5 32.5 30.5 36.8 28.5 43 Z',
          fill: c,
        },
        {
          kind: 'path',
          d: 'M35.5 24.8 Q42 21 49.5 20.8',
          stroke: sheen,
          strokeWidth: 1.5,
          opacity: 0.75,
        },
      ];
    case 'waves-long':
      // swept to one side, a soft wave over the forehead
      return [
        {
          kind: 'path',
          d:
            'M28.5 46 C28 28 38 18.4 50.5 18.4 C63 18.4 72.5 28 71.5 46 C70 38 66 31.5 59 28.6 ' +
            'C51 30 42.5 34 35.5 39.5 C32.5 41.8 30.2 43.8 28.5 46 Z',
          fill: c,
        },
        {
          kind: 'path',
          d: 'M40 25.5 Q47 21.8 54 22.8',
          stroke: sheen,
          strokeWidth: 1.5,
          opacity: 0.75,
        },
      ];
    case 'side-part':
      return [
        {
          kind: 'path',
          d:
            'M28.5 43 C27 27 37 16 51.5 16 C64 16 73 25 71.5 42.5 C70 36 66.5 31.5 61 29.8 ' +
            'C54 30.2 45 32.2 38.5 35.5 C34 37.6 30.6 40 28.5 43 Z',
          fill: c,
        },
        {
          kind: 'path',
          d: 'M39.5 19.5 Q43.5 24.5 44.5 31.5',
          stroke: sheen,
          strokeWidth: 1.3,
          opacity: 0.7,
        },
        {
          kind: 'path',
          d: 'M49 20 Q57 18.8 63.5 23.5',
          stroke: sheen,
          strokeWidth: 1.5,
          opacity: 0.7,
        },
      ];
    case 'shoulder':
      // a side fringe over the forehead
      return [
        {
          kind: 'path',
          d:
            'M28.5 45 C28 27.5 38 18.4 50 18.4 C62 18.4 72 27.5 71.5 45 C70.5 37.5 67 32 61.5 29 ' +
            'C55.5 31.5 47 33 39 32.2 C34.5 35 31 39.5 28.5 45 Z',
          fill: c,
        },
        {
          kind: 'path',
          d: 'M37 25.5 Q44 22 51 22.6',
          stroke: sheen,
          strokeWidth: 1.5,
          opacity: 0.75,
        },
      ];
    case 'waves-short':
      return [
        {
          kind: 'path',
          d:
            'M28.5 43 C27.5 26.5 37.5 17 50 17 C62.5 17 72.5 26.5 71.5 43 C70 37 67 33.2 62.5 31.4 ' +
            'C60 33.4 56.4 33.6 54 31.6 C51.2 33.6 47.6 33.6 45 31.6 C42.4 33.4 38.8 33.2 36.6 31.4 ' +
            'C32.8 33.5 30.2 37.6 28.5 43 Z',
          fill: c,
        },
        {
          kind: 'path',
          d: 'M36 24 Q40 20.8 44 22.8 Q48 24.8 52 21.8',
          stroke: sheen,
          strokeWidth: 1.5,
          opacity: 0.75,
        },
      ];
    case 'braid':
      // a middle part, the hair drawn back smooth to either side and into the braid
      return [
        {
          kind: 'path',
          d:
            'M28.6 43.5 C28 27.5 37.8 18.2 50 18.2 C62.2 18.2 72 27.5 71.4 43.5 C70.4 37 67.6 32 63 29.2 ' +
            'C58.8 26.8 54.2 26 50 27.2 C45.8 26 41.2 26.8 37 29.2 C32.4 32 29.6 37 28.6 43.5 Z',
          fill: c,
        },
        {
          kind: 'path',
          d: 'M36 25.5 Q42 21.8 48 21.8',
          stroke: sheen,
          strokeWidth: 1.5,
          opacity: 0.75,
        },
        {
          kind: 'path',
          d: 'M53 22 Q59.5 22.4 65 26.6',
          stroke: sheen,
          strokeWidth: 1.4,
          opacity: 0.6,
        },
        ...braidShapes(def, true),
      ];
    case 'swept-back':
      // short at the sides and combed up and back from the forehead: a soft rise at the front, and the
      // comb's lines running back from the hairline
      return [
        {
          kind: 'path',
          d:
            'M28.5 42 C27.4 25.6 36.4 14.4 50.4 14.4 C64.4 14.4 73 24.4 71.5 42 C70.6 36.6 68.8 32.6 65.6 30 ' +
            'C61 27.8 55.4 27.2 49.6 27.6 C43.6 28 38.2 29.8 34.4 32.6 C31.6 35.2 29.6 38.4 28.5 42 Z',
          fill: c,
        },
        ...[
          'M42 26.6 Q43 21 48.6 17.6',
          'M50 26.2 Q51.2 20.8 57.4 17.8',
          'M57.8 27 Q60.2 22.8 65.4 21.4',
        ].map(d => ({
          kind: 'path' as const,
          d,
          stroke: sheen,
          strokeWidth: 1.2,
          opacity: 0.7,
        })),
      ];
    case 'curls-long':
      return [
        {
          kind: 'path',
          d: 'M29 45 C28.5 28 38 18.4 50 18.4 C62 18.4 71.5 28 71 45 C68 36.5 61 32.5 50 32.5 C39 32.5 32 36.5 29 45 Z',
          fill: c,
        },
        ...bumps(50, 33, 17.5, 7, 195, 345, 30, 4.2, c),
        { kind: 'path', d: 'M34 26 q3 -3.5 6 0', stroke: sheen, strokeWidth: 1.4, opacity: 0.8 },
        { kind: 'path', d: 'M47 22 q3 -3.5 6 0', stroke: sheen, strokeWidth: 1.4, opacity: 0.8 },
        { kind: 'path', d: 'M60 26 q3 -3.5 6 0', stroke: sheen, strokeWidth: 1.4, opacity: 0.8 },
      ];
    case 'curls-short':
      return [
        {
          kind: 'path',
          d: 'M29 42 C28.5 27 38 19.5 50 19.5 C62 19.5 71.5 27 71 42 C68.5 35.5 62.5 32 50 32 C37.5 32 31.5 35.5 29 42 Z',
          fill: c,
        },
        ...bumps(50, 31, 18.5, 11, 190, 350, 20, 4.8, c),
        ...bumps(50, 33.5, 14, 2.6, 200, 340, 35, 3.1, c),
        {
          kind: 'path',
          d: 'M37 24.5 q2.6 -3 5.2 0',
          stroke: sheen,
          strokeWidth: 1.3,
          opacity: 0.8,
        },
        {
          kind: 'path',
          d: 'M47.4 21.5 q2.6 -3 5.2 0',
          stroke: sheen,
          strokeWidth: 1.3,
          opacity: 0.8,
        },
        {
          kind: 'path',
          d: 'M57.8 24.5 q2.6 -3 5.2 0',
          stroke: sheen,
          strokeWidth: 1.3,
          opacity: 0.8,
        },
      ];
  }
}
