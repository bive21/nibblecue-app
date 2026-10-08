/**
 * A PICTURE, CHOSEN, POPS INTO ITS FRAME (the owner, 2026-09-26, of setup's first page). The pop,
 * the rays' room and their ink are PURE (`picturePop.ts`, and the checklist's rays in `tickDraw.ts`)
 * and measured here; that it plays once per picture it SAW, never for a picture it opened with or
 * a removal, rests under reduce motion and in the amber Night, and is invisible to touch and to a
 * screen reader is held by tripwires over `PicturePop.tsx` (no renderer here — `interaction.test.ts`
 * says why that is the honest instrument).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  PLUS_APPEARANCE,
  resolveAppearance,
  SCHEME_NAMES,
} from '../theme/appearance';
import { AA_GRAPHIC, composite, contrastRatio } from '../theme/contrast';
import { patternComposites } from '../theme/ground';
import { materialBase, SKIN_NAMES } from '../theme/skins';
import { space, themeNames } from '../theme/theme';
import { sampleFrame } from './keyframes';
import {
  POP_BURST_AT,
  POP_KEYS,
  POP_MS,
  POP_TOTAL_MS,
  popFrames,
  popReach,
  popRing,
  pops,
  SHEET_MS,
} from './picturePop';
import { RAY_GAP, rayReach } from './tickDraw';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const STEPS = Array.from({ length: 401 }, (_, i) => i / 400);
/** Setup's plate: the minimum target, the size the top bar draws the same avatar at. */
const PLATE = 44;

describe('when it pops', () => {
  it('for a new picture, and for a different one over it', () => {
    expect(pops(null, 'file:///a.jpg', false)).toBe(true);
    expect(pops('file:///a.jpg', 'file:///b.jpg', false)).toBe(true);
  });

  it('never for the picture it opened with, and never for one taken away', () => {
    expect(pops('file:///a.jpg', 'file:///a.jpg', false)).toBe(false);
    expect(pops('file:///a.jpg', null, false)).toBe(false);
    expect(pops(null, null, false)).toBe(false);
  });

  it('never under reduce motion or in the amber Night', () => {
    expect(pops(null, 'file:///a.jpg', true)).toBe(false);
  });
});

describe('the pop', () => {
  const scale = popFrames().scale;
  const values = STEPS.map(t => sampleFrame(scale, t));

  it('starts and ends at exactly the picture’s size — never drawn small before, or large after', () => {
    expect(POP_KEYS[0]).toEqual([0, 1]);
    expect(POP_KEYS[POP_KEYS.length - 1]).toEqual([1, 1]);
    expect(values[0]).toBe(1);
    expect(values[values.length - 1]).toBe(1);
  });

  it('dips, then swells a little past its size, and settles: a pop, not a bounce', () => {
    const lowest = Math.min(...values);
    const highest = Math.max(...values);
    expect(lowest).toBeGreaterThanOrEqual(0.88);
    expect(lowest).toBeLessThan(0.95);
    expect(highest).toBeGreaterThan(1.03);
    expect(highest).toBeLessThanOrEqual(1.08);
    // the dip comes first
    expect(values.indexOf(lowest)).toBeLessThan(values.indexOf(highest));
  });

  it('is short, waits for the chooser to slide away, and sparkles as it passes its own size', () => {
    expect(POP_TOTAL_MS).toBeLessThanOrEqual(600);
    expect(POP_MS).toBeLessThanOrEqual(POP_TOTAL_MS);
    // the dip is over by the time the rays start, so they start from a picture growing past 1
    const at = sampleFrame(scale, POP_BURST_AT);
    expect(at).toBeGreaterThanOrEqual(0.95);
    expect(sampleFrame(scale, POP_BURST_AT + 0.05)).toBeGreaterThan(at);
  });

  it('waits exactly as long as the sheet takes to slide away (BottomSheet’s own number)', () => {
    const sheet = read('BottomSheet.tsx');
    expect(sheet).toContain(`export const SHEET_DURATION_MS = ${SHEET_MS};`);
  });
});

describe('the rays have room', () => {
  it('start from a ring a point inside the plate, and never touch the picture at its biggest', () => {
    expect(popRing(PLATE)).toBe(PLATE / 2 - 1);
    const biggest = Math.max(...STEPS.map(t => sampleFrame(popFrames().scale, t)));
    // the inner end of every ray is RAY_GAP past the ring; the picture's edge at its swell is inside it
    expect((PLATE / 2) * biggest).toBeLessThan(popRing(PLATE) + RAY_GAP);
  });

  it('reach no further than a `space.sm` gap, so beside a name no ray lands on a letter of it', () => {
    // setup's plate row puts `space.sm` between the plate and the name column, and a card's
    // `space.xl` padding on the other sides — the gap is the tight side (the app's own test holds
    // that its row still gives this room: `setupMotion.test.ts`)
    expect(popReach(PLATE)).toBeLessThanOrEqual(space.sm);
    expect(popReach(PLATE)).toBeGreaterThan(0);
    expect(rayReach(popRing(PLATE))).toBe(popReach(PLATE) + PLATE / 2);
  });
});

/**
 * THE RAYS' INK, MEASURED: the accent, as a graphic (3:1), on every ground the plate's card can put
 * under them — the card's own surface over the page, the pattern and the lit ground in every skin,
 * scheme and theme. The amber Night draws no ray at all, so it is not a ground the rays meet.
 */
describe('the rays’ ink', () => {
  it('is 3:1 or better on the card round the plate, in every skin, scheme and day theme', () => {
    const failures: string[] = [];
    for (const skin of SKIN_NAMES)
      for (const scheme of SCHEME_NAMES)
        for (const theme of themeNames.filter(n => n !== 'night')) {
          const r = resolveAppearance(
            { ...DEFAULT_APPEARANCE, theme, scheme, skin },
            'light',
            PLUS_APPEARANCE,
          );
          const c = r.palette;
          const s = r.skinTokens;
          const card = (under: string) =>
            composite(under, materialBase(c, s.surface), s.surface.alpha);
          const grounds: Record<string, string> = {
            surfaceSolid: c.surfaceSolid,
            cardOnPaper: card(c.paper),
            cardOnApp: card(c.app),
          };
          for (const [name, g] of Object.entries(patternComposites(c, s, theme) ?? {}))
            grounds[`cardOn${name}`] = card(g);
          for (const [name, g] of Object.entries(grounds)) {
            const v = contrastRatio(c.accent, g);
            if (v < AA_GRAPHIC)
              failures.push(`${skin}/${scheme}/${theme}: accent on ${name} = ${v.toFixed(2)}`);
          }
        }
    expect(failures).toEqual([]);
  });
});

describe('the component (tripwires over PicturePop.tsx)', () => {
  const src = withoutComments(read('PicturePop.tsx'));
  const flat = src.replace(/\s+/g, ' ');

  it('plays only a change it saw', () => {
    expect(flat).toContain('const was = useRef(picture);');
    expect(flat).toContain('const play = pops(was.current, picture, still);');
  });

  it('rests under reduce motion and in the amber Night, and mounts no ray there', () => {
    expect(flat).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    expect(flat).toContain('{bursting && !still ? (');
    expect(flat).toContain('run.stop(); grow.setValue(1); burst.setValue(0);');
  });

  it('is decoration: the rays take no touch and nothing of it reaches a screen reader', () => {
    expect(flat).toMatch(
      /pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden/,
    );
    expect(src).not.toContain('<Pressable');
    expect(src).not.toMatch(/accessibilityLabel|accessibilityRole/);
  });

  it('scales a box of the frame’s own fixed size, never one sized by the picture inside it', () => {
    // iOS hands a resized view the transform React last rendered while a native one runs
    expect(flat).toContain(
      '<Animated.View style={[styles.fill, { width: size, height: size }, scale]}>',
    );
  });

  it('moves by transforms and opacity on the native driver', () => {
    expect(flat.match(/useNativeDriver: true/g) ?? []).toHaveLength(2);
    expect(flat).not.toContain('useNativeDriver: false');
    // held at rest through the sheet's slide, then the pop
    expect(flat).toContain('delay: SHEET_MS,');
    expect(flat).toContain('delay: SHEET_MS + POP_BURST_DELAY_MS,');
  });

  it('writes no color of its own', () => {
    for (const s of [src, withoutComments(read('picturePop.ts'))]) {
      expect(s).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
      expect(s).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
    }
  });
});
