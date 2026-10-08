/**
 * THE PRE-MADE BABIES (the owner, 2026-09-24: *"a few pregenerated baby pictures, of all race"*).
 * The set is held to what it claims: every skin tone, a face of its own for every baby (the owner,
 * 2026-09-30: *"making just different color skin tone with same face is kind of useless, if not
 * offensive"*) dealt so that no feature stands for a background or for girl or boy, a ground a JPEG
 * can carry, and the chooser to the road a photo takes. The drawing itself is pure (`art.ts`), so
 * node checks the shapes the phone draws.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHILD_PHOTO_COPY } from '../../sheets/household/childPhotoCopy';
import {
  AVATAR_GROUPS,
  avatarSvgMarkup,
  BABY_AVATARS,
  babyShapes,
  luminance,
  type ArtShape,
  type BabyAvatarDef,
  type BabyEyes,
  type SkinTone,
} from './art';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');
const flat = (s: string) => s.replace(/\s+/g, ' ');

const TONES: readonly SkinTone[] = ['light', 'medium-light', 'medium', 'medium-dark', 'dark'];

describe('the set', () => {
  it('is a handful of babies, each addressable', () => {
    expect(BABY_AVATARS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(BABY_AVATARS.map(a => a.id)).size).toBe(BABY_AVATARS.length);
  });

  /**
   * EQUAL ACROSS THE FIVE BACKGROUNDS, WITH A GIRL AND A BOY IN EACH (the owner, 2026-09-24:
   * "same number of black race, chinese asian, asian, white, and hispanic. Each race should have at
   * least 1 boy and girl"). Held here so an avatar added to one background alone fails the build.
   */
  it('has the same number of babies from every background, girls and boys in each', () => {
    const per = AVATAR_GROUPS.map(g => BABY_AVATARS.filter(a => a.group === g));
    const size = per[0]?.length ?? 0;
    expect(size).toBeGreaterThanOrEqual(2);
    for (const [i, babies] of per.entries()) {
      const group = AVATAR_GROUPS[i];
      expect(babies.length, group).toBe(size);
      const girls = babies.filter(a => a.gender === 'girl').length;
      const boys = babies.filter(a => a.gender === 'boy').length;
      expect(girls, group).toBeGreaterThanOrEqual(1);
      expect(boys, group).toBeGreaterThanOrEqual(1);
      expect(girls, group).toBe(boys);
    }
    // every baby belongs to one of the five, so the count above is the whole set
    expect(per.flat().length).toBe(BABY_AVATARS.length);
  });

  it('never deals a background out in a row: no two neighbors share one', () => {
    for (let i = 1; i < BABY_AVATARS.length; i += 1) {
      expect(BABY_AVATARS[i]?.group, BABY_AVATARS[i]?.id).not.toBe(BABY_AVATARS[i - 1]?.group);
    }
  });

  it('spans every skin tone the Unicode modifiers name, with no tone left out or alone at one end', () => {
    const tones = new Set(BABY_AVATARS.map(a => a.tone));
    for (const tone of TONES) expect(tones.has(tone), tone).toBe(true);
    // the ends of the range really are the ends: a fair tone and a deep one, not five beiges
    const l = BABY_AVATARS.map(a => luminance(a.skin));
    expect(Math.max(...l)).toBeGreaterThan(0.6);
    expect(Math.min(...l)).toBeLessThan(0.08);
    // and the darker half is as well represented as the lighter half
    const dark = BABY_AVATARS.filter(a => a.tone === 'medium-dark' || a.tone === 'dark').length;
    const light = BABY_AVATARS.filter(a => a.tone === 'light' || a.tone === 'medium-light').length;
    expect(dark).toBeGreaterThanOrEqual(light);
  });

  it('names each tone in the order of its skin — a tone word never sits on the wrong skin', () => {
    const rank = (a: BabyAvatarDef) => TONES.indexOf(a.tone);
    for (const a of BABY_AVATARS) {
      for (const b of BABY_AVATARS) {
        if (rank(a) < rank(b))
          expect(luminance(a.skin), `${a.id} vs ${b.id}`).toBeGreaterThan(luminance(b.skin));
      }
    }
  });

  /**
   * NO AFRO ON A DARK SKIN (the owner, 2026-09-30: *"dont draw afro on the black skin, this is
   * racist."*). The darker half of the set wears hair babies of every background wear: nothing
   * drawn as a mass of round curls, coils or puffs, and no such word in an id or in what a screen
   * reader hears. One curl on top, drawn as a line, is any baby's.
   */
  it('draws no afro on a darker skin: no coils, puffs or curls, drawn or said', () => {
    const darker = BABY_AVATARS.filter(a => a.tone === 'dark' || a.tone === 'medium-dark');
    expect(darker.length).toBeGreaterThan(0);
    for (const a of darker) {
      expect(`${a.id} ${a.hair} ${a.look}`, a.id).not.toMatch(
        /\b(coils?|coily|puffs?|curls|curly|afro)\b/i,
      );
      // curls, coils and puffs are drawn as rounds of the hair's own color; a top knot is one
      const rounds = babyShapes(a).filter(
        s => (s.kind === 'circle' || s.kind === 'ellipse') && s.fill === a.hairColor,
      );
      expect(rounds.length, a.id).toBeLessThanOrEqual(1);
    }
  });

  it('mixes hair and hats across tones, rather than one look per skin', () => {
    expect(new Set(BABY_AVATARS.map(a => a.cover ?? a.hair)).size).toBeGreaterThanOrEqual(6);
  });
});

describe('the drawing', () => {
  /** The shapes with their colors removed: the geometry a baby is drawn with. */
  const geometry = (shapes: readonly ArtShape[]) =>
    shapes.map(s => {
      const shape: Record<string, unknown> = { ...s };
      delete shape.fill;
      delete shape.stroke;
      delete shape.opacity;
      return JSON.stringify(shape);
    });

  it('changes only colors with the skin: a tone never chooses a feature', () => {
    for (const base of BABY_AVATARS) {
      const drawings = TONES.map(tone =>
        geometry(
          babyShapes({ ...base, tone, skin: BABY_AVATARS.find(a => a.tone === tone)!.skin }),
        ),
      );
      for (const d of drawings) expect(d, base.id).toEqual(drawings[0]);
    }
  });

  it('paints an opaque square ground first, because the picture leaves as a JPEG', () => {
    for (const def of BABY_AVATARS) {
      const first = babyShapes(def)[0];
      expect(first, def.id).toMatchObject({ kind: 'rect', x: 0, y: 0, width: 100, height: 100 });
      expect(first && 'fill' in first ? first.fill : '', def.id).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('keeps everything inside the frame and writes well-formed SVG', () => {
    for (const def of BABY_AVATARS) {
      const svg = avatarSvgMarkup(def);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect((svg.match(/<(rect|circle|ellipse|path)\b/g) ?? []).length).toBe(
        babyShapes(def).length,
      );
      for (const s of babyShapes(def)) {
        if (s.kind === 'circle') {
          expect(s.cx - s.r).toBeGreaterThanOrEqual(-2);
          expect(s.cx + s.r).toBeLessThanOrEqual(102);
          expect(s.cy - s.r).toBeGreaterThanOrEqual(-2);
        }
      }
    }
  });

  it('lends its palette to nothing else: no other file in the app paints with a skin tone', () => {
    const palette = new Set(
      BABY_AVATARS.flatMap(a => [a.skin, a.hairColor]).map(h => h.toUpperCase()),
    );
    const src = join(here, '..', '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (
          /\.(ts|tsx)$/.test(name) &&
          !path.endsWith(join('avatars', 'art.ts')) &&
          !name.endsWith('.test.ts')
        ) {
          const text = readFileSync(path, 'utf8').toUpperCase();
          for (const hex of palette)
            if (hex !== '#000000' && text.includes(hex)) offenders.push(`${path}: ${hex}`);
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});

describe('the faces', () => {
  const FEATURES = ['head', 'eyes', 'nose', 'mouth', 'cheeks'] as const;
  /** Eyes closed smiling, asleep, or one of them in a wink. */
  const CLOSED: readonly BabyEyes[] = ['happy', 'sleepy', 'wink'];

  /**
   * TWENTY BABIES, TWENTY FACES (the owner, 2026-09-30). No two wear the same expression, and any two
   * differ in at least two features of the face, not in their hair and skin alone.
   */
  it('gives every baby a face of its own: no two share both eyes and mouth', () => {
    const expressions = new Set(BABY_AVATARS.map(a => `${a.face.eyes} ${a.face.mouth}`));
    expect(expressions.size).toBe(BABY_AVATARS.length);
    for (const [i, a] of BABY_AVATARS.entries())
      for (const b of BABY_AVATARS.slice(i + 1)) {
        const differ = FEATURES.filter(k => a.face[k] !== b.face[k]).length;
        expect(differ, `${a.id} and ${b.id}`).toBeGreaterThanOrEqual(2);
      }
  });

  /** AND NO FEATURE STANDS FOR A BACKGROUND, OR FOR GIRL OR BOY. */
  it('deals every style to two backgrounds at least, and to girls and boys alike', () => {
    for (const k of FEATURES) {
      const styles = new Set(BABY_AVATARS.map(a => a.face[k]));
      expect(styles.size, k).toBeGreaterThanOrEqual(3);
      for (const style of styles) {
        const wearers = BABY_AVATARS.filter(a => a.face[k] === style);
        expect(new Set(wearers.map(a => a.group)).size, `${k} ${style}`).toBeGreaterThanOrEqual(2);
        expect(new Set(wearers.map(a => a.gender)).size, `${k} ${style}`).toBe(2);
      }
    }
  });

  it('gives every background every nose, and four babies four different mouths', () => {
    const noses = new Set(BABY_AVATARS.map(a => a.face.nose));
    for (const group of AVATAR_GROUPS) {
      const babies = BABY_AVATARS.filter(a => a.group === group);
      expect(new Set(babies.map(a => a.face.nose)), group).toEqual(noses);
      expect(new Set(babies.map(a => a.face.mouth)).size, group).toBe(babies.length);
    }
  });

  it('never closes the eyes of a baby of East Asian background, and closes as many in every other', () => {
    const closed = (group: string) =>
      BABY_AVATARS.filter(a => a.group === group && CLOSED.includes(a.face.eyes)).length;
    expect(closed('eastAsian')).toBe(0);
    const others = AVATAR_GROUPS.filter(g => g !== 'eastAsian').map(closed);
    expect(new Set(others).size).toBe(1);
    expect(others[0]).toBeGreaterThan(0);
  });

  it('says what is drawn on a face: freckles and a pacifier are in the words', () => {
    for (const a of BABY_AVATARS) {
      expect(a.look.includes('freckles'), a.id).toBe(a.face.cheeks === 'freckles');
      expect(a.look.includes('pacifier'), a.id).toBe(a.face.mouth === 'pacifier');
    }
  });
});

describe('choosing one', () => {
  it('says girl or boy, the tone and the look to a screen reader', () => {
    for (const def of BABY_AVATARS) {
      const label = CHILD_PHOTO_COPY.illustration(def.gender, def.tone, def.look);
      expect(label).toContain(`baby ${def.gender}`);
      expect(label).toContain(`${def.tone} skin tone`);
      expect(label).toContain(def.look);
    }
    // what a sighted parent sees on a girl, a screen reader hears: every bow is in the words
    for (const def of BABY_AVATARS.filter(a => a.bow)) expect(def.look, def.id).toContain('bow');
    expect(read('AvatarGrid.tsx')).toContain(
      'CHILD_PHOTO_COPY.illustration(def.gender, def.tone, def.look)',
    );
  });

  it('is a target well over the 44 pt minimum', () => {
    const size = Number(
      /export const AVATAR_CHOICE_SIZE = (\d+) as const/.exec(read('AvatarGrid.tsx'))?.[1],
    );
    expect(size).toBeGreaterThanOrEqual(44);
  });

  it('turns the drawing into the pipeline’s own JPEG, at the pipeline’s own size', () => {
    // drawn from its shapes at CHILD_PHOTO_SIDE (`picture.ts`; `raster.test.ts` holds the pixels),
    // never read back off the chooser's face: on an iPhone that read was an empty circle
    const picture = flat(read('picture.ts'));
    expect(picture).toContain('rasterize(babyShapes(def), CHILD_PHOTO_SIDE)');
    const render = flat(read('render.ts'));
    expect(render).toContain('const png = avatarPng(def);');
    expect(render).toContain('const jpeg = await prepareChildPhoto(file.uri);');
    // the scratch file goes, and it lives where sign-out sweeps
    expect(render).toContain("new Directory(Paths.cache, 'cuddlecue', 'avatar-render')");
    expect(render).toContain('file.delete();');
  });

  it('uploads through the very call a photo uses, and only for someone who may change the photo', () => {
    const sheet = flat(read('../../sheets/household/ChildPhotoSheet.tsx'));
    // one upload for both roads
    expect(sheet.match(/api\.setChildPhoto\(/g)?.length).toBe(1);
    expect(sheet).toContain('await upload(bytes);');
    // the grid sits inside the editor-only branch, beside the photo buttons
    const editor = sheet.slice(
      sheet.indexOf('{canEdit ? ('),
      sheet.indexOf('testID="childphoto.read_only"'),
    );
    expect(editor).toContain('<AvatarGrid');
  });

  // (NibbleCue's one-page setup asks for no picture, so no avatar is offered or parked there)
});
