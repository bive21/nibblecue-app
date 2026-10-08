/**
 * THE PRE-MADE BABIES (the owner, 2026-09-24: *"a few pregenerated baby pictures, of all race"*;
 * then, the same day: *"add more options, and bring equality: same number of black race, chinese
 * asian, asian, white, and hispanic. Each race should have at least 1 boy and girl"*).
 *
 * Twenty illustrated babies a parent can choose instead of a photo — for the household that would
 * rather not put a picture of their baby on a server at all, and for the one that simply has not
 * taken the right photo yet. FOUR FOR EACH OF FIVE BACKGROUNDS, TWO GIRLS AND TWO BOYS IN EACH:
 * Black, East Asian (the owner's "Chinese Asian"), South Asian (their "Asian"), white and
 * Hispanic. `avatars.test.ts` holds the count, so the set cannot drift out of balance.
 *
 * TWENTY BABIES, TWENTY FACES (the owner, 2026-09-30: *"making just different color skin tone with
 * same face is kind of useless, if not offensive. Fix this"*). Until that day every baby was one
 * drawing under a different skin, with four expressions dealt round, so that no feature could ever
 * stand for a background. It kept that promise by drawing nobody in particular. Each baby now has a
 * face of its own from a small kit (`BabyFace`): the shape of the cheeks and chin, the eyes, the
 * nose, the mouth and the cheeks. No two babies have both the same eyes and the same mouth, so no two
 * wear the same expression.
 *
 * AND STILL NO FEATURE STANDS FOR A BACKGROUND, OR FOR GIRL OR BOY, which is now a rule about how
 * the kit is dealt rather than a rule that nothing differs. Every style is worn by babies of at least
 * two backgrounds and by girls and boys alike, every background wears every nose, and the four
 * babies of a background have four different mouths. A style is the same size on everyone who wears
 * it. No baby of East Asian background is drawn with its eyes closed, winking or asleep; each of the
 * other four backgrounds has two such babies. A skin still changes only colors: a background shows in
 * a skin tone from its own range, and the ranges overlap, as they do in life. `avatars.test.ts` holds
 * all of it.
 *
 * NO AFRO ON A DARK SKIN (the owner, 2026-09-30: *"dont draw afro on the black skin, this is
 * racist."*). Three babies with darker skins wore puffs, coils or a mass of curls: a hair given to
 * a skin as its sign. They wear what babies of every background wear, pigtails with ties, a few
 * wisps, a fringe and a bow, and `avatars.test.ts` holds that no darker skin is drawn with curls or
 * coils again. A baby's id never reaches the server (a pick is drawn into the photo it becomes), so
 * the three took new ids that name the new picture; a picture already chosen stays as it was drawn
 * until the parent chooses again.
 *
 * GIRL OR BOY IS SAID THE WAY BABY PICTURES SAY IT: a bow, pigtails with ties. The boys wear
 * everything else. Clothes are dealt out without regard to either, so a girl is not always in pink.
 *
 * A SCREEN READER HEARS THE TONE, NOT THE BACKGROUND. The tone is said in the words the Unicode
 * skin-tone modifiers use, then girl or boy and the hair; `group` is here to keep the set honest,
 * not to label a baby.
 *
 * WHY THE COLORS ARE LITERALS HERE, AND NOWHERE ELSE. The no-hex rule (eslint.config.mjs) exists
 * so a theme change repaints the app; a baby's skin is the one color that must NOT move with the
 * theme — a scheme that re-tinted a face would be the bug. So this file is the illustration's
 * palette, exempted by name like `cardArt.generated.ts`, and nothing outside it may borrow a color
 * from it for UI.
 *
 * PURE, so node draws exactly what the phone draws: `BabyAvatarArt.tsx` maps these shapes onto
 * react-native-svg one to one, and `avatarSvgMarkup` writes the same shapes as an SVG string for
 * the tests (and for anyone who wants to look at the set in a browser).
 */

/** One drawing instruction, in a 100 × 100 box. */
export type ArtShape =
  | { kind: 'rect'; x: number; y: number; width: number; height: number; rx?: number; fill: string }
  | {
      kind: 'circle';
      cx: number;
      cy: number;
      r: number;
      fill: string;
      opacity?: number;
    }
  | {
      kind: 'ellipse';
      cx: number;
      cy: number;
      rx: number;
      ry: number;
      fill: string;
      opacity?: number;
    }
  | {
      kind: 'path';
      d: string;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      opacity?: number;
    };

/** The five tones the Unicode skin-tone modifiers name — the words screen readers already use. */
export type SkinTone = 'light' | 'medium-light' | 'medium' | 'medium-dark' | 'dark';

/** The five backgrounds the set is balanced across (the owner's list, 2026-09-24). */
export type AvatarGroup = 'black' | 'eastAsian' | 'southAsian' | 'white' | 'hispanic';
export const AVATAR_GROUPS: readonly AvatarGroup[] = [
  'black',
  'eastAsian',
  'southAsian',
  'white',
  'hispanic',
];

export type AvatarGender = 'girl' | 'boy';

type Hair =
  | 'curl'
  | 'wisps'
  | 'short'
  | 'spiky'
  | 'curly'
  | 'topknot'
  | 'pigtails'
  | 'bangs'
  | 'waves'
  | 'none';
type Cover = 'beanie' | 'bearHood' | null;

/** The shape of the face below the eyes: round, fuller low in the cheeks, or a little longer. */
export type BabyHead = 'round' | 'chubby' | 'oval';
/** Open (`big`, `dot`, `lash`), or closed: smiling, asleep, or one of each (`wink`). */
export type BabyEyes = 'big' | 'dot' | 'lash' | 'happy' | 'sleepy' | 'wink';
export type BabyNose = 'button' | 'curve' | 'tiny';
export type BabyMouth = 'smile' | 'soft' | 'giggle' | 'o' | 'tooth' | 'tongue' | 'pacifier';
export type BabyCheeks = 'blush' | 'rosy' | 'freckles' | 'none';

/** One baby's face, dealt from the kit (see the head of this file). */
export interface BabyFace {
  head: BabyHead;
  eyes: BabyEyes;
  nose: BabyNose;
  mouth: BabyMouth;
  cheeks: BabyCheeks;
}

export interface BabyAvatarDef {
  /** Stable: a test and an E2E flow address it by this. */
  id: string;
  group: AvatarGroup;
  gender: AvatarGender;
  tone: SkinTone;
  /**
   * What a screen reader says after the tone and girl or boy: the hair, the hat, the bow, and freckles
   * or a pacifier where they are drawn.
   */
  look: string;
  skin: string;
  hair: Hair;
  hairColor: string;
  cover: Cover;
  coverColor: string;
  /** A bow on the side of the head. */
  bow: boolean;
  /** The bow's color, the ties on pigtails, and a pacifier's. */
  accent: string;
  face: BabyFace;
  outfit: string;
  background: string;
}

const NO_COVER = { cover: null, coverColor: '#000000' } as const;

/**
 * THE SET, IN THE ORDER THE GRID DRAWS IT: the backgrounds and girl-then-boy dealt round, so no
 * row is one background and the grid never reads as a light-to-dark ramp. Every tone word sits on
 * a skin inside its own band (the test checks the order), and the darker half of the range is as
 * well represented as the lighter half.
 */
export const BABY_AVATARS: readonly BabyAvatarDef[] = [
  {
    id: 'pigtails-yellow',
    group: 'black',
    gender: 'girl',
    tone: 'dark',
    look: 'black pigtails with yellow ties',
    skin: '#6B4128',
    hair: 'pigtails',
    hairColor: '#1B1512',
    ...NO_COVER,
    bow: false,
    accent: '#F2CF6B',
    face: { head: 'round', eyes: 'happy', nose: 'button', mouth: 'giggle', cheeks: 'blush' },
    outfit: '#F29C8C',
    background: '#EDE7FA',
  },
  {
    id: 'short',
    group: 'hispanic',
    gender: 'boy',
    tone: 'medium',
    look: 'short black hair',
    skin: '#E0AA7C',
    hair: 'short',
    hairColor: '#2B2421',
    ...NO_COVER,
    bow: false,
    accent: '#000000',
    face: { head: 'oval', eyes: 'big', nose: 'curve', mouth: 'o', cheeks: 'rosy' },
    outfit: '#9CC9A8',
    background: '#E6F3E3',
  },
  {
    id: 'bangs',
    group: 'eastAsian',
    gender: 'girl',
    tone: 'medium-light',
    look: 'black hair with a fringe, a pink bow and freckles',
    skin: '#EFCDAA',
    hair: 'bangs',
    hairColor: '#1E1916',
    ...NO_COVER,
    bow: true,
    accent: '#E86F88',
    face: { head: 'oval', eyes: 'lash', nose: 'button', mouth: 'o', cheeks: 'freckles' },
    outfit: '#B7A6E0',
    background: '#FFF0D9',
  },
  {
    id: 'curl-black',
    group: 'southAsian',
    gender: 'boy',
    tone: 'medium-dark',
    look: 'a black curl',
    skin: '#B47A4E',
    hair: 'curl',
    hairColor: '#1E1916',
    ...NO_COVER,
    bow: false,
    accent: '#000000',
    face: { head: 'chubby', eyes: 'sleepy', nose: 'curve', mouth: 'soft', cheeks: 'blush' },
    outfit: '#F2CF6B',
    background: '#E3F0FA',
  },
  {
    id: 'pigtails',
    group: 'white',
    gender: 'girl',
    tone: 'light',
    look: 'blond pigtails with blue ties, and freckles',
    skin: '#FBE3D2',
    hair: 'pigtails',
    hairColor: '#D9A94E',
    ...NO_COVER,
    bow: false,
    accent: '#8FB8DE',
    face: { head: 'chubby', eyes: 'big', nose: 'tiny', mouth: 'tooth', cheeks: 'freckles' },
    outfit: '#F29C8C',
    background: '#E9F5EC',
  },
  {
    id: 'wisps-black',
    group: 'black',
    gender: 'boy',
    tone: 'medium-dark',
    look: 'black wisps',
    skin: '#A86B42',
    hair: 'wisps',
    hairColor: '#1E1916',
    ...NO_COVER,
    bow: false,
    accent: '#000000',
    face: { head: 'oval', eyes: 'wink', nose: 'tiny', mouth: 'tongue', cheeks: 'none' },
    outfit: '#8FB8DE',
    background: '#FFF3C9',
  },
  {
    id: 'waves',
    group: 'hispanic',
    gender: 'girl',
    tone: 'medium',
    look: 'wavy brown hair and a yellow bow',
    skin: '#D59C6E',
    hair: 'waves',
    hairColor: '#3A281E',
    ...NO_COVER,
    bow: true,
    accent: '#F2CF6B',
    face: { head: 'round', eyes: 'happy', nose: 'tiny', mouth: 'smile', cheeks: 'blush' },
    outfit: '#6FB7B0',
    background: '#FBE3EA',
  },
  {
    id: 'beanie',
    group: 'eastAsian',
    gender: 'boy',
    tone: 'light',
    look: 'a knit hat',
    skin: '#F3D5B8',
    hair: 'none',
    hairColor: '#000000',
    cover: 'beanie',
    coverColor: '#F29C8C',
    bow: false,
    accent: '#000000',
    face: { head: 'round', eyes: 'dot', nose: 'tiny', mouth: 'giggle', cheeks: 'rosy' },
    outfit: '#9CC9A8',
    background: '#E4F1F8',
  },
  {
    id: 'waves-black',
    group: 'southAsian',
    gender: 'girl',
    tone: 'medium-dark',
    look: 'wavy black hair and a lilac bow',
    skin: '#9B6340',
    hair: 'waves',
    hairColor: '#171210',
    ...NO_COVER,
    bow: true,
    accent: '#B7A6E0',
    face: { head: 'oval', eyes: 'dot', nose: 'button', mouth: 'o', cheeks: 'none' },
    outfit: '#F2A38A',
    background: '#E6F3E3',
  },
  {
    id: 'curl',
    group: 'white',
    gender: 'boy',
    tone: 'light',
    look: 'a blond curl',
    skin: '#F9DCC7',
    hair: 'curl',
    hairColor: '#D9A94E',
    ...NO_COVER,
    bow: false,
    accent: '#000000',
    face: { head: 'oval', eyes: 'happy', nose: 'curve', mouth: 'o', cheeks: 'blush' },
    outfit: '#8FB8DE',
    background: '#FFF0D9',
  },
  {
    id: 'topknot',
    group: 'black',
    gender: 'girl',
    tone: 'dark',
    look: 'a top knot and a yellow bow',
    skin: '#7A4A2C',
    hair: 'topknot',
    hairColor: '#171210',
    ...NO_COVER,
    bow: true,
    accent: '#F2CF6B',
    face: { head: 'round', eyes: 'big', nose: 'curve', mouth: 'soft', cheeks: 'rosy' },
    outfit: '#6FB7B0',
    background: '#FBE3EA',
  },
  {
    id: 'wisps-brown',
    group: 'hispanic',
    gender: 'boy',
    tone: 'medium',
    look: 'brown wisps and freckles',
    skin: '#C98B5C',
    hair: 'wisps',
    hairColor: '#3A281E',
    ...NO_COVER,
    bow: false,
    accent: '#000000',
    face: { head: 'round', eyes: 'lash', nose: 'button', mouth: 'soft', cheeks: 'freckles' },
    outfit: '#B7A6E0',
    background: '#E3F0FA',
  },
  {
    id: 'pigtails-black',
    group: 'eastAsian',
    gender: 'girl',
    tone: 'medium-light',
    look: 'black pigtails with pink ties',
    skin: '#EAC39D',
    hair: 'pigtails',
    hairColor: '#1E1916',
    ...NO_COVER,
    bow: false,
    accent: '#E86F88',
    face: { head: 'oval', eyes: 'big', nose: 'curve', mouth: 'tongue', cheeks: 'blush' },
    outfit: '#8FB8DE',
    background: '#FFF3C9',
  },
  {
    id: 'spiky',
    group: 'southAsian',
    gender: 'boy',
    tone: 'medium-dark',
    look: 'black hair standing up, freckles and a pacifier',
    skin: '#A96D45',
    hair: 'spiky',
    hairColor: '#1B1512',
    ...NO_COVER,
    bow: false,
    accent: '#8FB8DE',
    face: { head: 'oval', eyes: 'big', nose: 'tiny', mouth: 'pacifier', cheeks: 'freckles' },
    outfit: '#F2A38A',
    background: '#E9F5EC',
  },
  {
    id: 'wisps',
    group: 'white',
    gender: 'girl',
    tone: 'medium-light',
    look: 'red wisps and a blue bow',
    skin: '#F1C6A4',
    hair: 'wisps',
    hairColor: '#B5522B',
    ...NO_COVER,
    bow: true,
    accent: '#8FB8DE',
    face: { head: 'chubby', eyes: 'dot', nose: 'button', mouth: 'soft', cheeks: 'rosy' },
    outfit: '#9CC9A8',
    background: '#E4F1F8',
  },
  {
    id: 'bear',
    group: 'black',
    gender: 'boy',
    tone: 'dark',
    look: 'a bear hood',
    skin: '#5E3822',
    hair: 'none',
    hairColor: '#000000',
    cover: 'bearHood',
    coverColor: '#D8B48A',
    bow: false,
    accent: '#000000',
    face: { head: 'chubby', eyes: 'lash', nose: 'button', mouth: 'tooth', cheeks: 'blush' },
    outfit: '#D8B48A',
    background: '#E3F0FA',
  },
  {
    id: 'curls',
    group: 'hispanic',
    gender: 'girl',
    tone: 'medium',
    look: 'brown curls, a pink bow and a pacifier',
    skin: '#DBA475',
    hair: 'curly',
    hairColor: '#3A281E',
    ...NO_COVER,
    bow: true,
    accent: '#E86F88',
    face: { head: 'chubby', eyes: 'sleepy', nose: 'curve', mouth: 'pacifier', cheeks: 'none' },
    outfit: '#F2CF6B',
    background: '#E6F3E3',
  },
  {
    id: 'short-black',
    group: 'eastAsian',
    gender: 'boy',
    tone: 'medium-light',
    look: 'short black hair',
    skin: '#E5BC94',
    hair: 'short',
    hairColor: '#1E1916',
    ...NO_COVER,
    bow: false,
    accent: '#000000',
    face: { head: 'chubby', eyes: 'big', nose: 'curve', mouth: 'smile', cheeks: 'blush' },
    outfit: '#F2A38A',
    background: '#FBE3EA',
  },
  {
    id: 'bangs-yellow',
    group: 'southAsian',
    gender: 'girl',
    tone: 'dark',
    look: 'black hair with a fringe and a yellow bow',
    skin: '#8C5A3A',
    hair: 'bangs',
    hairColor: '#171210',
    ...NO_COVER,
    bow: true,
    accent: '#F2CF6B',
    face: { head: 'round', eyes: 'wink', nose: 'tiny', mouth: 'tooth', cheeks: 'blush' },
    outfit: '#B7A6E0',
    background: '#FFF0D9',
  },
  {
    id: 'short-brown',
    group: 'white',
    gender: 'boy',
    tone: 'light',
    look: 'short brown hair',
    skin: '#F6D5BF',
    hair: 'short',
    hairColor: '#8A5A36',
    ...NO_COVER,
    bow: false,
    accent: '#000000',
    face: { head: 'round', eyes: 'sleepy', nose: 'button', mouth: 'smile', cheeks: 'none' },
    outfit: '#6FB7B0',
    background: '#EDE7FA',
  },
];

/* ------------------------------------------------------------------------------ color math */

const hex2 = (n: number): string =>
  Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, '0');

function rgbOf(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/**
 * `hex` moved `amount` of the way to `toward` — how a shade or a highlight is made from a tone.
 * Exported for the grown-ups' set (`adults.ts`), which shades its tones the same way.
 */
export function mix(hex: string, toward: string, amount: number): string {
  const a = rgbOf(hex);
  const b = rgbOf(toward);
  return `#${a.map((v, i) => hex2(v + ((b[i] ?? 0) - v) * amount)).join('')}`.toUpperCase();
}

/** WCAG relative luminance — the tests use it to prove the set spans the range it claims. */
export function luminance(hex: string): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgbOf(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const INK = '#1C1411';
const WHITE = '#FFFFFF';

/* ------------------------------------------------------------------------------ the drawing */

/**
 * One baby, back to front: the ground, the onesie, the ears, the head, the hair or the hood, then
 * the face. Coordinates are in a 100-unit box; the frame that shows it is a circle, so nothing
 * that matters sits in the corners.
 */
export function babyShapes(def: BabyAvatarDef): ArtShape[] {
  const dark = luminance(def.skin) < 0.2;
  const skinShade = mix(def.skin, INK, dark ? 0.28 : 0.16);
  const featureInk = dark ? '#120C0A' : mix(def.skin, INK, 0.78);
  const blush = dark ? mix(def.skin, '#E2566B', 0.35) : mix(def.skin, '#F07C86', 0.45);
  const outfitShade = mix(def.outfit, INK, 0.18);
  const out: ArtShape[] = [];

  out.push({ kind: 'rect', x: 0, y: 0, width: 100, height: 100, fill: def.background });

  // the onesie, with the chest showing at the neck and two snaps
  out.push({
    kind: 'path',
    d: 'M13 101 C13 86 28 78.5 50 78.5 C72 78.5 87 86 87 101 Z',
    fill: def.outfit,
  });
  out.push({ kind: 'path', d: 'M41 79.5 Q50 89 59 79.5 Z', fill: def.skin });
  out.push({ kind: 'circle', cx: 50, cy: 92.5, r: 1.5, fill: outfitShade });
  out.push({ kind: 'circle', cx: 50, cy: 98, r: 1.5, fill: outfitShade });

  if (def.cover === 'bearHood') {
    const inner = mix(def.coverColor, '#F4A6A0', 0.45);
    out.push({ kind: 'circle', cx: 25.5, cy: 26.5, r: 9.5, fill: def.coverColor });
    out.push({ kind: 'circle', cx: 74.5, cy: 26.5, r: 9.5, fill: def.coverColor });
    out.push({ kind: 'circle', cx: 25.5, cy: 26.5, r: 5, fill: inner });
    out.push({ kind: 'circle', cx: 74.5, cy: 26.5, r: 5, fill: inner });
    out.push({ kind: 'circle', cx: 50, cy: 53, r: 34.5, fill: def.coverColor });
  } else {
    // ears, half behind the head
    for (const x of [22, 78]) {
      out.push({ kind: 'circle', cx: x, cy: 56, r: 6.2, fill: def.skin });
      out.push({
        kind: 'circle',
        cx: x + (x < 50 ? 0.6 : -0.6),
        cy: 56,
        r: 3.1,
        fill: skinShade,
        opacity: 0.7,
      });
    }
  }

  out.push({ kind: 'path', d: headPath(def.face.head), fill: def.skin });

  out.push(...hairShapes(def));
  if (def.cover === 'beanie') out.push(...beanieShapes(def.coverColor));
  if (def.bow) out.push(...bowShapes(def.accent));

  out.push(...faceShapes(def, featureInk, blush, skinShade, dark));
  return out;
}

/**
 * THE TOP OF THE HEAD IS ONE SHAPE FOR EVERY BABY, so every hair, hat and hood sits on every head:
 * the upper half of the circle the set was first drawn on (center 50,53; 28.5 across, 28 down).
 * What differs is below the eyes, the cheeks and the chin.
 */
const CROWN = 'M21.5 53 C21.5 37.54 34.26 25 50 25 C65.74 25 78.5 37.54 78.5 53';

/** The right side of the lower face, from its widest point to the chin: two handles and the chin. */
const LOWER_FACE: Record<
  BabyHead,
  { c1: readonly [number, number]; c2: readonly [number, number]; chin: number }
> = {
  round: { c1: [78.5, 68.46], c2: [65.74, 81], chin: 81 },
  // fuller low in the cheeks, the chin a touch higher
  chubby: { c1: [80.5, 64], c2: [70, 80.6], chin: 80.6 },
  // narrower at the jaw, the chin a little lower
  oval: { c1: [78.3, 70], c2: [63.5, 82.4], chin: 82.4 },
};

function headPath(head: BabyHead): string {
  const {
    c1: [ax, ay],
    c2: [bx, by],
    chin,
  } = LOWER_FACE[head];
  return `${CROWN} C${ax} ${ay} ${bx} ${by} 50 ${chin} C${100 - bx} ${by} ${100 - ax} ${ay} 21.5 53 Z`;
}

/**
 * HOW FAR THE NOSE, THE MOUTH AND THE CHEEKS SIT FROM WHERE THE ROUND FACE HAS THEM, so the chin
 * below the mouth stays in proportion to the face.
 */
const DROP: Record<BabyHead, number> = { round: 0, chubby: -0.3, oval: 0.9 };

/** A circle as a path, so it can be drawn as an outline (the kit's `circle` is a filled disc). */
export function ring(cx: number, cy: number, r: number): string {
  const k = 0.5523 * r;
  return (
    `M${cx - r} ${cy} C${cx - r} ${cy - k} ${cx - k} ${cy - r} ${cx} ${cy - r} ` +
    `C${cx + k} ${cy - r} ${cx + r} ${cy - k} ${cx + r} ${cy} ` +
    `C${cx + r} ${cy + k} ${cx + k} ${cy + r} ${cx} ${cy + r} ` +
    `C${cx - k} ${cy + r} ${cx - r} ${cy + k} ${cx - r} ${cy} Z`
  );
}

function hairShapes(def: BabyAvatarDef): ArtShape[] {
  const c = def.hairColor;
  const sheen = mix(c, WHITE, 0.22);
  switch (def.hair) {
    case 'curl':
      return [
        {
          kind: 'path',
          d: 'M49 26.5 C46.5 20.5 49.5 14.5 55 15.5 C59.5 16.4 59.6 21.6 55.6 22.1 C52.9 22.4 52.1 19.9 53.9 18.9',
          stroke: c,
          strokeWidth: 3.2,
        },
      ];
    case 'wisps':
      return [
        { kind: 'path', d: 'M42.5 28 Q43.3 21.5 46.8 18.8', stroke: c, strokeWidth: 2.7 },
        { kind: 'path', d: 'M49.6 26 Q50.4 18.4 55.2 15.8', stroke: c, strokeWidth: 2.7 },
        { kind: 'path', d: 'M56.8 27.4 Q59.6 21.8 63.8 20.8', stroke: c, strokeWidth: 2.7 },
      ];
    case 'short':
      return [
        {
          kind: 'path',
          d:
            'M21 50 C20 34 33 23.5 50 23.5 C67 23.5 80 34 79 50 C76.5 43 71 38.5 64 37.6 ' +
            'C60 40.6 55 41 50.5 38.6 C46 41.1 40 41 36 38.1 C29 39.6 23.5 44 21 50 Z',
          fill: c,
        },
        {
          kind: 'path',
          d: 'M34 30.5 Q42 26.5 50 26.6',
          stroke: sheen,
          strokeWidth: 1.6,
          opacity: 0.8,
        },
      ];
    case 'curly': {
      const bumps: ArtShape[] = [];
      for (let deg = 196; deg <= 344; deg += 18.5) {
        const a = (deg * Math.PI) / 180;
        bumps.push({
          kind: 'circle',
          cx: 50 + 27 * Math.cos(a),
          cy: 50 + 26 * Math.sin(a),
          r: 7.2,
          fill: c,
        });
      }
      return [
        {
          kind: 'path',
          d: 'M22 49 C21 33 34 23.5 50 23.5 C66 23.5 79 33 78 49 C74 42 68 38.5 50 38.5 C32 38.5 26 42 22 49 Z',
          fill: c,
        },
        ...bumps,
        { kind: 'circle', cx: 37.5, cy: 38.6, r: 5.2, fill: c },
        { kind: 'circle', cx: 45.5, cy: 37.2, r: 5.6, fill: c },
        { kind: 'circle', cx: 54, cy: 37.2, r: 5.6, fill: c },
        { kind: 'circle', cx: 62.3, cy: 38.6, r: 5.2, fill: c },
        { kind: 'path', d: 'M33 30 q3 -3.5 6 0', stroke: sheen, strokeWidth: 1.5, opacity: 0.85 },
        { kind: 'path', d: 'M47 25.5 q3 -3.5 6 0', stroke: sheen, strokeWidth: 1.5, opacity: 0.85 },
        { kind: 'path', d: 'M61 30 q3 -3.5 6 0', stroke: sheen, strokeWidth: 1.5, opacity: 0.85 },
      ];
    }
    case 'topknot':
      return [
        {
          kind: 'path',
          d: 'M21.5 50 C21 34 34 24.5 50 24.5 C66 24.5 79 34 78.5 50 C74 40 64 35 50 35 C36 35 26 40 21.5 50 Z',
          fill: c,
        },
        { kind: 'circle', cx: 50, cy: 17.5, r: 7.8, fill: c },
        {
          kind: 'path',
          d: 'M45.5 15.5 Q50 12 54.5 15.5',
          stroke: sheen,
          strokeWidth: 1.5,
          opacity: 0.8,
        },
        { kind: 'rect', x: 44.5, y: 22.4, width: 11, height: 3.6, rx: 1.8, fill: def.outfit },
        {
          kind: 'path',
          d: 'M33 31.5 Q41 27.5 49.5 27.6',
          stroke: sheen,
          strokeWidth: 1.5,
          opacity: 0.75,
        },
      ];
    case 'spiky':
      // a short cap of straight hair with a tuft standing up — the way a baby's hair stands after
      // a bath, not a style
      return [
        {
          kind: 'path',
          d:
            'M22 49 C21 35 33 26.5 50 26.5 C67 26.5 79 35 78 49 C74.5 43.5 69 40.5 62 40 ' +
            'C58.5 42 54.5 42.4 50.5 40.6 C46.5 42.4 42 42 38.5 40 C31 40.5 25.5 43.5 22 49 Z',
          fill: c,
        },
        {
          kind: 'path',
          d: 'M40 28.5 L42.5 19.5 L46 27 L49.5 17 L53 27 L57 19.5 L59.5 28.5 Z',
          fill: c,
        },
        {
          kind: 'path',
          d: 'M35 32 Q42 29 49 29.4',
          stroke: sheen,
          strokeWidth: 1.5,
          opacity: 0.75,
        },
      ];
    case 'pigtails':
      // a light cap of hair and two short tufts out at the sides, each with its tie
      return [
        {
          kind: 'path',
          d: 'M23 47 C22.5 33.5 34.5 25.5 50 25.5 C65.5 25.5 77.5 33.5 77 47 C73 41.5 66 39 50 39 C34 39 27 41.5 23 47 Z',
          fill: c,
        },
        {
          kind: 'path',
          d: 'M25 40.5 C18.5 36.5 12 38 12.5 44.5 C16.5 47 21 45.8 25 44.2 Z',
          fill: c,
        },
        {
          kind: 'path',
          d: 'M75 40.5 C81.5 36.5 88 38 87.5 44.5 C83.5 47 79 45.8 75 44.2 Z',
          fill: c,
        },
        { kind: 'circle', cx: 24.8, cy: 42.4, r: 2.3, fill: def.accent },
        { kind: 'circle', cx: 75.2, cy: 42.4, r: 2.3, fill: def.accent },
        {
          kind: 'path',
          d: 'M36 30.5 Q43 27.5 50 27.8',
          stroke: sheen,
          strokeWidth: 1.5,
          opacity: 0.75,
        },
      ];
    case 'bangs':
      // straight hair with a soft fringe that stops well above the eyes
      return [
        {
          kind: 'path',
          d:
            'M21 51 C20 33.5 33 22.5 50 22.5 C67 22.5 80 33.5 79 51 C77.5 47 76 43.5 74 41.2 ' +
            'Q68 43.4 62 41.2 Q56 43.4 50 41.2 Q44 43.4 38 41.2 Q32 43.4 26 41.2 C24 43.5 22.5 47 21 51 Z',
          fill: c,
        },
        {
          kind: 'path',
          d: 'M36 28.5 Q43 25.5 50 25.6',
          stroke: sheen,
          strokeWidth: 1.6,
          opacity: 0.8,
        },
      ];
    case 'waves':
      // loose waves, the lower edge rising and falling across the forehead
      return [
        {
          kind: 'path',
          d:
            'M21.5 51 C20.5 33.5 33.5 23 50 23 C66.5 23 79.5 33.5 78.5 51 C76.5 45.5 72.5 42 67.5 41.5 ' +
            'C64.5 43.8 60.5 44.2 57.5 42 C54.5 44.2 50.5 44.4 47.5 42 C44.5 44.2 40.5 44 37.5 41.6 ' +
            'C31.5 42 25.5 45.5 21.5 51 Z',
          fill: c,
        },
        {
          kind: 'path',
          d: 'M35 30 Q41.5 26.5 48 27',
          stroke: sheen,
          strokeWidth: 1.5,
          opacity: 0.8,
        },
        {
          kind: 'path',
          d: 'M53 27 Q59 26.5 64 29.5',
          stroke: sheen,
          strokeWidth: 1.5,
          opacity: 0.8,
        },
      ];
    case 'none':
      return [];
  }
}

/** A bow on the side of the head: two loops and a knot, in the baby's accent color. */
function bowShapes(color: string): ArtShape[] {
  const knot = mix(color, INK, 0.22);
  return [
    {
      kind: 'path',
      d: 'M69 30.5 C63.5 25 58.8 26 59.4 30.5 C58.8 35 63.5 36 69 30.5 Z',
      fill: color,
    },
    {
      kind: 'path',
      d: 'M69 30.5 C74.5 25 79.2 26 78.6 30.5 C79.2 35 74.5 36 69 30.5 Z',
      fill: color,
    },
    { kind: 'circle', cx: 69, cy: 30.5, r: 2.7, fill: knot },
  ];
}

function beanieShapes(color: string): ArtShape[] {
  const band = mix(color, INK, 0.16);
  const rib = mix(color, INK, 0.1);
  return [
    {
      kind: 'path',
      d: 'M19.5 51 C19.5 31 33 19.5 50 19.5 C67 19.5 80.5 31 80.5 51 Z',
      fill: color,
    },
    { kind: 'path', d: 'M36 24.5 L35 45', stroke: rib, strokeWidth: 1.4, opacity: 0.7 },
    { kind: 'path', d: 'M50 21 L50 44', stroke: rib, strokeWidth: 1.4, opacity: 0.7 },
    { kind: 'path', d: 'M64 24.5 L65 45', stroke: rib, strokeWidth: 1.4, opacity: 0.7 },
    {
      kind: 'path',
      d: 'M17.5 44.5 Q50 35.5 82.5 44.5 L82.5 52.5 Q50 43.5 17.5 52.5 Z',
      fill: band,
    },
    { kind: 'circle', cx: 50, cy: 16.5, r: 6.8, fill: band },
    { kind: 'circle', cx: 48, cy: 14.6, r: 2, fill: mix(color, WHITE, 0.45), opacity: 0.7 },
  ];
}

function faceShapes(
  def: BabyAvatarDef,
  ink: string,
  blush: string,
  skinShade: string,
  dark: boolean,
): ArtShape[] {
  const f = def.face;
  const dy = DROP[f.head];
  return [
    ...cheekShapes(f.cheeks, def.skin, blush, dark, dy),
    ...eyeShapes(f.eyes, ink),
    ...noseShapes(f.nose, skinShade, dy),
    ...mouthShapes(f.mouth, ink, dark, def.accent, dy),
  ];
}

function cheekShapes(
  cheeks: BabyCheeks,
  skin: string,
  blush: string,
  dark: boolean,
  dy: number,
): ArtShape[] {
  switch (cheeks) {
    case 'blush':
      return [33.5, 66.5].map(cx => ({
        kind: 'circle' as const,
        cx,
        cy: 63 + dy,
        r: 5.2,
        fill: blush,
        opacity: dark ? 0.6 : 0.5,
      }));
    case 'rosy':
      // rounder and deeper than a blush
      return [33, 67].map(cx => ({
        kind: 'circle' as const,
        cx,
        cy: 63.4 + dy,
        r: 6.4,
        fill: blush,
        opacity: dark ? 0.64 : 0.62,
      }));
    case 'freckles': {
      const dot = mix(skin, '#6B3A22', dark ? 0.55 : 0.42);
      const spots: readonly (readonly [number, number])[] = [
        [33.2, 61.4],
        [36.4, 62.6],
        [34.4, 64.6],
        [37.6, 60.8],
      ];
      return spots.flatMap(([x, y]) => [
        { kind: 'circle' as const, cx: x, cy: y + dy, r: 0.75, fill: dot, opacity: 0.85 },
        { kind: 'circle' as const, cx: 100 - x, cy: y + dy, r: 0.75, fill: dot, opacity: 0.85 },
      ]);
    }
    case 'none':
      return [];
  }
}

function eyeShapes(eyes: BabyEyes, ink: string): ArtShape[] {
  // an open eye: the dark of it, and the light caught in it, up and to the right
  const open = (x: number, rx: number, ry: number, glint: number): ArtShape[] => [
    { kind: 'ellipse', cx: x, cy: 55, rx, ry, fill: ink },
    { kind: 'circle', cx: x + rx * 0.36, cy: 55 - ry * 0.38, r: glint, fill: WHITE },
  ];
  // closed and smiling, and closed in sleep
  const happy = (x: number): ArtShape => ({
    kind: 'path',
    d: `M${x - 3.4} 56.2 Q${x} 52.2 ${x + 3.4} 56.2`,
    stroke: ink,
    strokeWidth: 2.3,
  });
  const asleep = (x: number): ArtShape => ({
    kind: 'path',
    d: `M${x - 3.4} 55 Q${x} 58.4 ${x + 3.4} 55`,
    stroke: ink,
    strokeWidth: 2.3,
  });
  switch (eyes) {
    case 'big':
      return [40, 60].flatMap(x => [
        ...open(x, 3.7, 4.4, 1.4),
        { kind: 'circle' as const, cx: x - 1.2, cy: 57.1, r: 0.65, fill: WHITE, opacity: 0.85 },
      ]);
    case 'dot':
      return [40, 60].flatMap(x => open(x, 2.6, 3, 0.95));
    case 'lash':
      return [40, 60].flatMap(x => {
        const out = x < 50 ? -1 : 1;
        return [
          ...open(x, 3.1, 3.7, 1.15),
          {
            kind: 'path' as const,
            d: `M${x + out * 2.2} 52.5 L${x + out * 4.1} 50.9`,
            stroke: ink,
            strokeWidth: 1.3,
          },
          {
            kind: 'path' as const,
            d: `M${x + out * 3} 54 L${x + out * 5} 53.1`,
            stroke: ink,
            strokeWidth: 1.3,
          },
        ];
      });
    case 'happy':
      return [happy(40), happy(60)];
    case 'sleepy':
      return [asleep(40), asleep(60)];
    case 'wink':
      return [...open(40, 3.3, 3.9, 1.25), happy(60)];
  }
}

function noseShapes(nose: BabyNose, shade: string, dy: number): ArtShape[] {
  switch (nose) {
    case 'curve':
      return [
        {
          kind: 'path',
          d: `M47.6 ${60.2 + dy} Q50 ${62.2 + dy} 52.4 ${60.2 + dy}`,
          stroke: shade,
          strokeWidth: 1.8,
        },
      ];
    case 'button':
      return [
        { kind: 'ellipse', cx: 50, cy: 61 + dy, rx: 2.2, ry: 1.5, fill: shade, opacity: 0.9 },
      ];
    case 'tiny':
      return [48.7, 51.3].map(cx => ({
        kind: 'circle' as const,
        cx,
        cy: 61.2 + dy,
        r: 0.8,
        fill: shade,
      }));
  }
}

function mouthShapes(
  mouth: BabyMouth,
  ink: string,
  dark: boolean,
  accent: string,
  dy: number,
): ArtShape[] {
  const inside = dark ? '#A8434F' : '#B2515B';
  const tongue = '#EE8E98';
  const y = (v: number) => v + dy;
  switch (mouth) {
    case 'smile':
      return [
        {
          kind: 'path',
          d: `M44.8 ${y(66.4)} Q50 ${y(71.2)} 55.2 ${y(66.4)}`,
          stroke: ink,
          strokeWidth: 2.1,
        },
      ];
    case 'soft':
      return [
        {
          kind: 'path',
          d: `M46.8 ${y(67)} Q50 ${y(69.4)} 53.2 ${y(67)}`,
          stroke: ink,
          strokeWidth: 1.9,
        },
      ];
    case 'giggle':
      return [
        { kind: 'path', d: `M44.2 ${y(65.4)} Q50 ${y(74.6)} 55.8 ${y(65.4)} Z`, fill: inside },
        { kind: 'ellipse', cx: 50, cy: y(69.6), rx: 2.8, ry: 1.5, fill: tongue },
      ];
    case 'o':
      return [{ kind: 'ellipse', cx: 50, cy: y(67.4), rx: 2.5, ry: 2.9, fill: inside }];
    case 'tooth':
      // an open smile with the first tooth showing
      return [
        { kind: 'path', d: `M45 ${y(65.8)} Q50 ${y(73)} 55 ${y(65.8)} Z`, fill: inside },
        {
          kind: 'path',
          d: `M48.7 ${y(65.9)} L51.3 ${y(65.9)} L51.1 ${y(67.9)} Q50 ${y(68.5)} 48.9 ${y(67.9)} Z`,
          fill: WHITE,
        },
      ];
    case 'tongue':
      // a smile with the tip of the tongue out below it, a little to one side
      return [
        {
          kind: 'path',
          d: `M48.6 ${y(68.24)} C48.6 ${y(72)} 53.4 ${y(72)} 53.4 ${y(67.48)} Z`,
          fill: tongue,
        },
        {
          kind: 'path',
          d: `M45 ${y(66.4)} Q50 ${y(70.4)} 55 ${y(66.4)}`,
          stroke: ink,
          strokeWidth: 2,
        },
      ];
    case 'pacifier': {
      // a shield wider than the mouth, a light knob in its middle and a ring hanging below, in a
      // color of its own (`accent`), edged so it holds on any skin; a dark middle read as a nose
      const edge = mix(accent, INK, 0.3);
      return [
        { kind: 'path', d: ring(50, y(74.6), 3.1), stroke: edge, strokeWidth: 1.7 },
        { kind: 'ellipse', cx: 50, cy: y(68.6), rx: 8, ry: 4.3, fill: edge },
        { kind: 'ellipse', cx: 50, cy: y(68.6), rx: 7.1, ry: 3.4, fill: accent },
        { kind: 'circle', cx: 50, cy: y(68.6), r: 2.3, fill: mix(accent, WHITE, 0.55) },
        { kind: 'circle', cx: 49.2, cy: y(67.8), r: 0.8, fill: WHITE, opacity: 0.8 },
      ];
    }
  }
}

/* ----------------------------------------------------------------------- the same, as text */

const n = (v: number): string => String(Math.round(v * 100) / 100);

/** The shapes as an SVG document — what the tests parse, and what a browser shows. */
export function avatarSvgMarkup(def: BabyAvatarDef, size = 100): string {
  return shapesSvgMarkup(babyShapes(def), size);
}

/** Any drawing's shapes as an SVG document: the babies' and the grown-ups' (`adults.ts`) alike. */
export function shapesSvgMarkup(shapes: readonly ArtShape[], size = 100): string {
  const body = shapes
    .map(s => {
      const op = 'opacity' in s && s.opacity !== undefined ? ` opacity="${n(s.opacity)}"` : '';
      switch (s.kind) {
        case 'rect':
          return `<rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.width)}" height="${n(s.height)}"${s.rx === undefined ? '' : ` rx="${n(s.rx)}"`} fill="${s.fill}"/>`;
        case 'circle':
          return `<circle cx="${n(s.cx)}" cy="${n(s.cy)}" r="${n(s.r)}" fill="${s.fill}"${op}/>`;
        case 'ellipse':
          return `<ellipse cx="${n(s.cx)}" cy="${n(s.cy)}" rx="${n(s.rx)}" ry="${n(s.ry)}" fill="${s.fill}"${op}/>`;
        case 'path':
          return `<path d="${s.d}" fill="${s.fill ?? 'none'}"${s.stroke === undefined ? '' : ` stroke="${s.stroke}" stroke-width="${n(s.strokeWidth ?? 1)}" stroke-linecap="round" stroke-linejoin="round"`}${op}/>`;
      }
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">${body}</svg>`;
}
