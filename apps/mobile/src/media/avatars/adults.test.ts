/**
 * THE PRE-MADE GROWN-UPS (the owner, 2026-09-30: *"keep the avatara pregenerated options minimum
 * but universal to all, keep women and men avatar for each race"*). The set is held to what it
 * claims: twelve, so the grid is full three or four across (the owner, 2026-10-01), a woman and a
 * man from each of six backgrounds, every skin tone, a face of their own for each (the owner,
 * 2026-09-30: *"making just different color skin tone with same face is kind of useless, if not
 * offensive"*) dealt so that no feature stands for a background, no glasses (the owner,
 * 2026-10-01), nothing said beyond woman or man and what is drawn on them, and a label that says
 * the tone the way the babies' does. `adults.ts` is pure, so node checks the shapes the phone draws, and the
 * picture a phone keeps of one (`adultPicture.ts`).
 */
import { isMemberAvatarId } from '@nibblecue/core';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MEMBER_PICTURE_COPY } from '../../sheets/account/pictureCopy';
import { ADULT_PICTURE_SIDE, adultDrawingKey, adultPicture, adultPng } from './adultPicture';
import {
  ADULT_AVATARS,
  ADULT_GROUPS,
  adultAvatarById,
  adultShapes,
  type AdultAvatarDef,
} from './adults';
import {
  AVATAR_GROUPS,
  BABY_AVATARS,
  luminance,
  shapesSvgMarkup,
  type ArtShape,
  type SkinTone,
} from './art';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');

const TONES: readonly SkinTone[] = ['light', 'medium-light', 'medium', 'medium-dark', 'dark'];

/** The five main features of a face, each dealt in five styles (`adults.ts`). */
const MAIN = ['head', 'eyes', 'brows', 'nose', 'mouth'] as const;

/** The shapes with their colors removed: the geometry a person is drawn with. */
const geometry = (shapes: readonly ArtShape[]) =>
  shapes.map(s => {
    const shape: Record<string, unknown> = { ...s };
    delete shape.fill;
    delete shape.stroke;
    delete shape.opacity;
    return JSON.stringify(shape);
  });

describe('the set', () => {
  /**
   * TWELVE, SO THE GRID IS FULL (the owner, 2026-10-01: *"add 2 more avatar to make it full on a
   * 3x4 options"*): the sheet fits three across on a narrow phone and four on a wider one, and
   * twelve fill every row of either (`AdultAvatarGrid` never lets five fit).
   */
  it('is twelve people, a full grid three or four across, each addressable by an id the server takes', () => {
    expect(ADULT_AVATARS).toHaveLength(12);
    for (const across of [3, 4]) expect(ADULT_AVATARS.length % across).toBe(0);
    expect(new Set(ADULT_AVATARS.map(a => a.id)).size).toBe(12);
    // the shape `profiles_avatar_preset_shape` holds (migration 0148)
    for (const a of ADULT_AVATARS) expect(isMemberAvatarId(a.id), a.id).toBe(true);
    for (const a of ADULT_AVATARS) expect(adultAvatarById(a.id)).toBe(a);
    expect(adultAvatarById('no-such-drawing')).toBeUndefined();
    expect(adultAvatarById(null)).toBeUndefined();
  });

  /**
   * ONE WOMAN AND ONE MAN FOR EACH BACKGROUND (the owner's words): the babies' five and a sixth, the
   * same count in each, held here so a drawing added to one background alone fails the build.
   */
  it('has exactly one woman and one man from every background', () => {
    for (const group of ADULT_GROUPS) {
      const people = ADULT_AVATARS.filter(a => a.group === group);
      expect(people.map(a => a.gender).sort(), group).toEqual(['man', 'woman']);
    }
    expect(ADULT_AVATARS.filter(a => ADULT_GROUPS.includes(a.group))).toHaveLength(12);
    // the babies' five are all among them
    for (const group of AVATAR_GROUPS) expect(ADULT_GROUPS, group).toContain(group);
  });

  it('never deals a background out in a row, and alternates woman and man', () => {
    for (let i = 1; i < ADULT_AVATARS.length; i += 1) {
      expect(ADULT_AVATARS[i]?.group, ADULT_AVATARS[i]?.id).not.toBe(ADULT_AVATARS[i - 1]?.group);
      expect(ADULT_AVATARS[i]?.gender, ADULT_AVATARS[i]?.id).not.toBe(ADULT_AVATARS[i - 1]?.gender);
    }
  });

  it('spans every skin tone the Unicode modifiers name, the darker half as well as the lighter', () => {
    const tones = new Set(ADULT_AVATARS.map(a => a.tone));
    for (const tone of TONES) expect(tones.has(tone), tone).toBe(true);
    const l = ADULT_AVATARS.map(a => luminance(a.skin));
    expect(Math.max(...l)).toBeGreaterThan(0.6);
    expect(Math.min(...l)).toBeLessThan(0.08);
    const dark = ADULT_AVATARS.filter(a => a.tone === 'medium-dark' || a.tone === 'dark').length;
    const light = ADULT_AVATARS.filter(a => a.tone === 'light' || a.tone === 'medium-light').length;
    expect(dark).toBeGreaterThanOrEqual(light);
  });

  it('names each tone in the order of its skin: a tone word never sits on the wrong skin', () => {
    const rank = (a: AdultAvatarDef) => TONES.indexOf(a.tone);
    for (const a of ADULT_AVATARS)
      for (const b of ADULT_AVATARS)
        if (rank(a) < rank(b))
          expect(luminance(a.skin), `${a.id} vs ${b.id}`).toBeGreaterThan(luminance(b.skin));
  });

  it('gives every person hair of their own, so no two drawings are the same picture', () => {
    expect(new Set(ADULT_AVATARS.map(a => a.hair)).size).toBe(12);
  });

  /**
   * NO AFRO ON A DARK SKIN (the owner, 2026-09-30: *"dont draw afro on the black skin, this is
   * racist."*). The darker half of the set wears hair people of every background wear: nothing
   * drawn as a mass of round curls or coils, and no such word in an id or in what a screen reader
   * hears.
   */
  it('draws no afro on a darker skin: no coils, puffs or curls, drawn or said', () => {
    const darker = ADULT_AVATARS.filter(a => a.tone === 'dark' || a.tone === 'medium-dark');
    expect(darker.length).toBeGreaterThan(0);
    for (const a of darker) {
      expect(`${a.id} ${a.hair} ${a.look}`, a.id).not.toMatch(
        /\b(coils?|coily|puffs?|curls|curly|afro)\b/i,
      );
      // curls and coils are drawn as rounds of the hair's own color; a bun is one
      const rounds = adultShapes(a).filter(
        s => (s.kind === 'circle' || s.kind === 'ellipse') && s.fill === a.hairColor,
      );
      expect(rounds.length, a.id).toBeLessThanOrEqual(1);
    }
  });

  /**
   * MINIMAL AND UNIVERSAL: woman or man and what is drawn on them, and nothing more. No age, no
   * role, nothing religious or national, and the ids name the picture, never who somebody is, since
   * an id is stored on a person's profile.
   */
  it('says nothing more than woman or man and what is drawn: no age, no role, no background in an id', () => {
    const beyond =
      /\b(old|older|young|gr[ae]y|aged?|mom|mum|dad|father|mother|grand\w*|nanny|nurse|doctor|jewel\w*|hijab|turban|scarf|hat|cap|veil|bindi)\b/i;
    for (const a of ADULT_AVATARS) {
      expect(a.look, a.id).not.toMatch(beyond);
      expect(a.id, a.id).not.toMatch(/woman|man|girl|boy|black|white|asian|hispanic|latin/i);
    }
  });

  it('says what is drawn on a face, so a screen reader hears what a sighted person sees', () => {
    for (const a of ADULT_AVATARS) {
      expect(a.look.includes('beard'), a.id).toBe(a.face.beard !== null);
      expect(a.look.includes('earrings'), a.id).toBe(a.face.earrings !== null);
      expect(a.look.includes('freckles'), a.id).toBe(a.face.cheeks === 'freckles');
    }
  });
});

/**
 * NO GLASSES (the owner, 2026-10-01: *"the guy with glasses look very ugly, remove the glasses;
 * remove all with glasses"*): not in the kit, not drawn, not said.
 */
describe('no glasses', () => {
  it('has no glasses in the kit, on a face or in what a screen reader hears', () => {
    for (const a of ADULT_AVATARS) {
      expect(Object.keys(a.face), a.id).not.toContain('glasses');
      expect(a.look, a.id).not.toMatch(/glasses|spectacles/i);
    }
    expect(read('adults.ts')).not.toMatch(/glassesShapes|glasses: (null|')/);
  });
});

describe('the faces', () => {
  /**
   * A FACE OF THEIR OWN FOR EVERYONE (the owner, 2026-09-30). Any two people differ in at least four
   * of the five main features, and so in the drawing of their faces, not in their hair and skin alone.
   */
  it('gives every person a face of their own: any two differ in at least four main features', () => {
    const sameHair = (d: AdultAvatarDef) => geometry(adultShapes({ ...d, hair: 'straight-short' }));
    for (const [i, a] of ADULT_AVATARS.entries())
      for (const b of ADULT_AVATARS.slice(i + 1)) {
        const differ = MAIN.filter(k => a.face[k] !== b.face[k]).length;
        expect(differ, `${a.id} and ${b.id}`).toBeGreaterThanOrEqual(4);
        expect(sameHair(a), `${a.id} and ${b.id}`).not.toEqual(sameHair(b));
      }
  });

  /**
   * AND NO FEATURE STANDS FOR A BACKGROUND: every style of a main feature is worn by two or three
   * people, and never by two of one background, so no style is any background's own.
   */
  it('deals every style of every main feature to two or three people, all of different backgrounds', () => {
    for (const k of MAIN) {
      const wearers = new Map<string, AdultAvatarDef[]>();
      for (const a of ADULT_AVATARS) wearers.set(a.face[k], [...(wearers.get(a.face[k]) ?? []), a]);
      expect(wearers.size, k).toBe(5);
      for (const [style, people] of wearers) {
        expect(people.length, `${k} ${style}`).toBeGreaterThanOrEqual(2);
        expect(people.length, `${k} ${style}`).toBeLessThanOrEqual(3);
        expect(new Set(people.map(p => p.group)).size, `${k} ${style}`).toBe(people.length);
      }
    }
  });

  /**
   * NO CARICATURE: the two Middle Eastern faces wear the kit's finer brows and its smaller noses, so
   * the drawings that are new to the set never lean on the heavy brow or the large nose a cartoon of
   * a background reaches for.
   */
  it('gives the Middle Eastern faces the finer brows and the smaller noses', () => {
    const them = ADULT_AVATARS.filter(a => a.group === 'middleEastern');
    expect(them).toHaveLength(2);
    for (const a of them) {
      expect(a.face.brows, a.id).not.toBe('bold');
      expect(['button', 'tip', 'round'], a.id).toContain(a.face.nose);
    }
  });

  it('never draws a person of East Asian background with closed eyes', () => {
    const eastAsian = ADULT_AVATARS.filter(a => a.group === 'eastAsian');
    expect(eastAsian).toHaveLength(2);
    for (const a of eastAsian) expect(a.face.eyes, a.id).not.toBe('smile');
  });
});

describe('the drawing', () => {
  it('changes only colors with the skin: a tone never chooses a feature', () => {
    for (const base of ADULT_AVATARS) {
      const drawings = TONES.map(tone =>
        geometry(
          adultShapes({
            ...base,
            tone,
            skin: ADULT_AVATARS.find(a => a.tone === tone)!.skin,
          }),
        ),
      );
      for (const d of drawings) expect(d, base.id).toEqual(drawings[0]);
    }
  });

  it('paints an opaque square ground first, and keeps everything inside the frame', () => {
    for (const def of ADULT_AVATARS) {
      const shapes = adultShapes(def);
      expect(shapes[0], def.id).toMatchObject({
        kind: 'rect',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
      for (const s of shapes) {
        if (s.kind === 'circle') {
          expect(s.cx - s.r, def.id).toBeGreaterThanOrEqual(-2);
          expect(s.cx + s.r, def.id).toBeLessThanOrEqual(102);
          expect(s.cy - s.r, def.id).toBeGreaterThanOrEqual(-2);
        }
      }
      const svg = shapesSvgMarkup(shapes);
      expect(svg.startsWith('<svg')).toBe(true);
      expect((svg.match(/<(rect|circle|ellipse|path)\b/g) ?? []).length).toBe(shapes.length);
    }
  });

  it('shares no tone with the babies, and lends its palette to no other file in the app', () => {
    const palette = new Set(
      ADULT_AVATARS.flatMap(a => [a.skin, a.hairColor]).map(h => h.toUpperCase()),
    );
    // the babies' art is a palette of its own, and the two never borrow from each other
    for (const b of BABY_AVATARS)
      for (const hex of [b.skin, b.hairColor])
        if (hex !== '#000000') expect(palette.has(hex.toUpperCase()), hex).toBe(false);
    const src = join(here, '..', '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (
          /\.(ts|tsx)$/.test(name) &&
          !path.endsWith(join('avatars', 'adults.ts')) &&
          !name.endsWith('.test.ts')
        ) {
          const text = readFileSync(path, 'utf8').toUpperCase();
          for (const hex of palette) if (text.includes(hex)) offenders.push(`${path}: ${hex}`);
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });

  it('keeps a drawing as a picture of its own size, named for the drawing and not the id alone', () => {
    const def = ADULT_AVATARS[0]!;
    const picture = adultPicture(def);
    expect(picture.width).toBe(ADULT_PICTURE_SIDE);
    expect(picture.height).toBe(ADULT_PICTURE_SIDE);
    const png = adultPng(def);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // the middle of the face is skin, not the ground: the drawing is drawn, not an empty square
    const mid =
      (Math.round(ADULT_PICTURE_SIDE * 0.44) * ADULT_PICTURE_SIDE + ADULT_PICTURE_SIDE / 2 - 8) * 3;
    const [r, g, b] = [picture.rgb[mid], picture.rgb[mid + 1], picture.rgb[mid + 2]];
    expect(
      `#${[r, g, b].map(v => (v ?? 0).toString(16).padStart(2, '0')).join('')}`.toUpperCase(),
    ).not.toBe(def.background.toUpperCase());
    expect(adultDrawingKey(def)).toMatch(new RegExp(`^adult-${def.id}-[0-9a-z]+$`));
    const redrawn = { ...def, top: '#123456' };
    expect(adultDrawingKey(redrawn)).not.toBe(adultDrawingKey(def));
  });
});

describe('choosing one', () => {
  it('says woman or man, the tone the way the babies’ set says it, and the hair', () => {
    for (const def of ADULT_AVATARS) {
      const label = MEMBER_PICTURE_COPY.drawing(def.gender, def.tone, def.look);
      expect(label).toBe(`Illustrated ${def.gender}, ${def.tone} skin tone, ${def.look}`);
    }
    expect(read('AdultAvatarGrid.tsx')).toContain(
      'MEMBER_PICTURE_COPY.drawing(def.gender, def.tone, def.look)',
    );
  });

  it('is a target well over the 44 pt minimum, and says which one is chosen in its state', () => {
    const grid = read('AdultAvatarGrid.tsx');
    const size = Number(/export const ADULT_CHOICE_SIZE = (\d+) as const/.exec(grid)?.[1]);
    expect(size).toBeGreaterThanOrEqual(44);
    expect(grid).toContain('accessibilityState={{ disabled, selected }}');
  });

  it('lays the twelve out in full rows: never more than four across', () => {
    const grid = read('AdultAvatarGrid.tsx');
    const most = Number(/export const ADULT_MOST_ACROSS = (\d+) as const/.exec(grid)?.[1]);
    expect(most).toBe(4);
    expect(grid).toContain(
      'maxWidth: ADULT_MOST_ACROSS * CELL + (ADULT_MOST_ACROSS - 1) * t.space.md',
    );
    // three across fit a 320 pt phone's sheet (18 pt gutters, 8 pt gaps, 76 pt a face), four from 364
    const cell = 64 + 4 * 3;
    const fits = (phone: number) => Math.floor((phone - 36 + 8) / (cell + 8));
    expect(fits(320)).toBe(3);
    expect(fits(364)).toBe(4);
    for (const across of [3, most]) expect(ADULT_AVATARS.length % across).toBe(0);
  });

  it('keeps only the id: nothing is drawn into a file or uploaded when one is chosen', () => {
    const grid = read('AdultAvatarGrid.tsx');
    expect(grid).not.toMatch(/drawnAdultFile|avatarJpeg|setMemberPhoto|prepareChildPhoto/);
    const sheet = read('../../sheets/account/MemberPictureSheet.tsx');
    expect(sheet.replace(/\s+/g, ' ')).toContain("void apply({ kind: 'drawing', id: def.id });");
  });
});
