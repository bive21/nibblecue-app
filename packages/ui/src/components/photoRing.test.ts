/**
 * A PICTURE IN A CIRCLE SITS ON THE LIGHT GROUND, INSIDE THE BELL'S HAIRLINE (the owner,
 * 2026-09-30, of the top bar: *"The round border for top right looks shaded"*). A circle's edge
 * pixels are half picture and half whatever is under it, and under the picture was the accent, the
 * brand's dark blue: a dark, broken fringe round every picture. These hold the three circles a
 * person's or a baby's picture is drawn in: the design system's `Avatar`, the top bar's account
 * button around it, and the child chip's one baby.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const flat = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\s+/g, ' ');

describe('a picture in a circle', () => {
  it('sits on the solid surface; the accent is the initial’s ground alone', () => {
    const avatar = flat(read('Avatar.tsx'));
    expect(avatar).toContain(
      'backgroundColor: tone ? tone.soft : photo !== undefined ? t.color.surfaceSolid : t.color.accent,',
    );
    const chip = flat(read('ChildChip.tsx'));
    expect(chip).toContain(
      'backgroundColor: singlePhoto === undefined ? t.color.accent : t.color.surfaceSolid,',
    );
    // the account button under the Avatar lends it no ground of its own when there is a picture
    const bar = flat(read('TopBar.tsx'));
    expect(bar).toContain(
      "backgroundColor: avatar.photoUri !== undefined ? 'transparent' : t.color.accent,",
    );
  });

  it('wears the bell’s own hairline over its edge, drawn after the picture', () => {
    // a component file cannot be imported under node; its constant is read as written
    expect(flat(read('Avatar.tsx'))).toContain('export const PHOTO_RING = 1;');
    const bell = flat(read('IconButton.tsx'));
    expect(bell).toContain('borderColor: t.color.line,');
    expect(bell).toContain(
      "circle: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },",
    );
    for (const file of ['Avatar.tsx', 'ChildChip.tsx']) {
      const src = flat(read(file));
      const picture = src.indexOf('<Image');
      const ring = src.indexOf('borderWidth: PHOTO_RING', picture);
      expect(picture, file).toBeGreaterThan(-1);
      expect(
        ring,
        `${file}: the ring comes after the picture, so it is drawn over its edge`,
      ).toBeGreaterThan(picture);
      expect(src.slice(ring, ring + 80), file).toContain('borderColor: t.color.line');
    }
  });
});
