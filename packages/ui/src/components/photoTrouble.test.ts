/**
 * A PICTURE THAT WOULD NOT DRAW (2026-09-29): never a blank circle, never silent (`photoTrouble.ts`).
 * The owner reported an empty circle twice (2026-09-26, 2026-09-28) before anyone could name what
 * was behind it. The pure half is held here; the components' half — that every picture the design
 * system draws falls back to the initial and reports — is a tripwire over their source, because
 * this package's tests have no renderer.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  photoErrorText,
  photoPlace,
  reportPhotoTrouble,
  setPhotoTroubleReporter,
  shownPhoto,
  type PhotoTrouble,
} from './photoTrouble';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const flat = (s: string) => s.replace(/\s+/g, ' ');

// the shapes the app's pictures take, with made-up ids where a person's or a child's would be
const SETUP =
  'file:///var/mobile/Containers/Data/Application/0F1E/Library/Caches/ExponentExperienceData/%2540anonymous%252Fcuddlecue-1a2b/cuddlecue/setup-photo/7d3c9a1e-5b2f-4c8d-9e0a-1b2c3d4e5f60-mg4k2x1c.jpg';
const CACHED =
  'file:///data/user/0/host.exp.exponent/cache/ExperienceData/%2540anonymous%252Fcuddlecue-1a2b/cuddlecue/child-photos/0c1d2e3f-4a5b-6c7d-8e9f-a0b1c2d3e4f5-t1790000000000.jpg';
const SIGNED =
  'https://abcdefgh.supabase.co/storage/v1/object/sign/child-photos/h/c.jpg?token=eyJhbGciOiJIUzI1NiJ9.secret';

afterEach(() => setPhotoTroubleReporter(null));

describe('where a picture lives, without who it is', () => {
  it('names the scheme and the last two folders of a file, never the file', () => {
    expect(photoPlace(SETUP)).toBe('file: …/cuddlecue/setup-photo');
    expect(photoPlace(CACHED)).toBe('file: …/cuddlecue/child-photos');
    expect(photoPlace(SETUP)).not.toContain('7d3c9a1e');
    expect(photoPlace(CACHED)).not.toContain('0c1d2e3f');
  });

  it('names a web address by its host alone: no path, and never a signed link’s token', () => {
    expect(photoPlace(SIGNED)).toBe('https: abcdefgh.supabase.co');
    expect(photoPlace(SIGNED)).not.toContain('token');
    expect(photoPlace('https://user:pass@example.org/a.jpg')).toBe('https: example.org');
  });

  it('says what it is when there is nothing to name', () => {
    expect(photoPlace(undefined)).toBe('no address');
    expect(photoPlace('')).toBe('no address');
    expect(photoPlace('data:image/jpeg;base64,/9j/4AAQ')).toBe('data: (inline bytes)');
    expect(photoPlace('/tmp/a.jpg')).toBe('a bare path');
    expect(photoPlace('file:///a.jpg')).toBe('file: /');
  });
});

describe('what the phone said', () => {
  it('reads an Image error event’s own words, one line of them', () => {
    expect(photoErrorText({ nativeEvent: { error: 'Error decoding image data\nmore' } })).toBe(
      'Error decoding image data',
    );
    expect(photoErrorText(new Error('boom'))).toBe('boom');
    expect(photoErrorText('plain words')).toBe('plain words');
    expect(photoErrorText({ nativeEvent: {} })).toBe('no reason given');
    expect(photoErrorText(null)).toBe('no reason given');
  });
});

describe('the report', () => {
  it('reaches the app with where and why, once a reporter is installed', () => {
    const heard: PhotoTrouble[] = [];
    reportPhotoTrouble('Avatar', SETUP, { nativeEvent: { error: 'no such file' } });
    expect(heard).toEqual([]);
    setPhotoTroubleReporter(t => heard.push(t));
    reportPhotoTrouble('Avatar', SETUP, { nativeEvent: { error: 'no such file' } });
    expect(heard).toEqual([
      { where: 'Avatar', place: 'file: …/cuddlecue/setup-photo', error: 'no such file' },
    ]);
  });

  it('never throws, whatever the reporter does', () => {
    setPhotoTroubleReporter(() => {
      throw new Error('the log is gone');
    });
    expect(() => reportPhotoTrouble('ChildChip', CACHED, null)).not.toThrow();
  });
});

describe('the picture a circle draws', () => {
  it('is the one it was given, by day, until that very picture fails', () => {
    const none = new Set<string>();
    expect(shownPhoto(SETUP, false, none)).toBe(SETUP);
    expect(shownPhoto(SETUP, false, new Set([SETUP]))).toBeUndefined();
    // a NEW picture is tried afresh: a failure is the picture's, not the circle's
    expect(shownPhoto(CACHED, false, new Set([SETUP]))).toBe(CACHED);
  });

  it('is none at night, and none for no address: the initial stands in', () => {
    expect(shownPhoto(SETUP, true, new Set())).toBeUndefined();
    expect(shownPhoto(undefined, false, new Set())).toBeUndefined();
    expect(shownPhoto('', false, new Set())).toBeUndefined();
  });
});

describe('every picture the design system draws falls back and reports', () => {
  /** Each `<Image … />` element, whole. */
  const images = (src: string) =>
    [...withoutComments(src).matchAll(/<Image\b[\s\S]*?\/>/g)].map(m => flat(m[0]));

  it('Avatar: its one picture', () => {
    const src = read('Avatar.tsx');
    const code = flat(withoutComments(src));
    expect(code).toContain('const photo = shownPhoto(photoUri, t.isNight, failed);');
    const [image, ...more] = images(src);
    expect(more).toEqual([]);
    expect(image).toContain("reportPhotoTrouble('Avatar', photo, e);");
    expect(image).toContain('setFailed(prev => new Set(prev).add(photo));');
  });

  it('ChildChip: the one avatar and every disc of Both', () => {
    const src = read('ChildChip.tsx');
    const code = flat(withoutComments(src));
    expect(code).toContain(
      'const photo = isBoth ? undefined : shownPhoto(photoUri, t.isNight, failed);',
    );
    expect(code).toContain('const photo = shownPhoto(face?.photoUri, t.isNight, failed);');
    // the leaving face of a split is asked again, after its picture may have failed
    expect(code).toContain('!failed.has(single.photo) ? single.photo : undefined');
    const found = images(src);
    expect(found).toHaveLength(2);
    expect(found[0]).toContain("onError={e => fail('ChildChip', singlePhoto, e)}");
    expect(found[1]).toContain("onError={e => onFail('ChildChip.both', photo, e)}");
    expect(code).toContain('reportPhotoTrouble(where, uri, event);');
  });

  /**
   * WHAT STANDS IN FOR A PICTURE, and what it wears (2026-09-29). A stored picture whose circle is
   * empty is no longer handed to these circles at all (`apps/mobile` `media/photoMend.ts`): the app
   * hands over the drawn baby it came from, or nothing, and nothing is the initial. So the initial
   * has to read in every theme, and the month-day hat has to sit on it exactly as on a picture.
   */
  it('stands in as the initial in onGradient on the brand gradient, the pair the contrast gate holds', () => {
    // `theme/contrast.test.ts` holds `onGradient` on both brand stops at 4.5:1 in light, dark and
    // Night, for every skin and scheme (4.61, 4.62 and 13.70 at their lowest, 2026-09-29)
    const chip = flat(withoutComments(read('ChildChip.tsx')));
    expect(chip.match(/colors=\{\[\.\.\.t\.gradient\.brand\]\}/g)).toHaveLength(2);
    expect(chip.match(/color=\{t\.onGradient\}/g)).toHaveLength(2);
    const avatar = flat(withoutComments(read('Avatar.tsx')));
    expect(avatar).toContain('colors={[...t.gradient.brand]}');
    expect(avatar).toContain(
      'const ink = tone ? readableInk(tone.fg, tone.soft, t.color.text) : t.onGradient;',
    );
  });

  it('wears the month-day hat over the initial as over a picture: the hat never asks which', () => {
    const chip = flat(withoutComments(read('ChildChip.tsx')));
    // the one avatar: the hat's layer comes after the picture-or-initial, and asks only for a hat
    expect(chip.indexOf("onError={e => fail('ChildChip', singlePhoto, e)}")).toBeLessThan(
      chip.indexOf('{single.hat !== undefined ? ('),
    );
    // each disc of Both: likewise after its own picture-or-initial
    expect(chip.indexOf("onError={e => onFail('ChildChip.both', photo, e)}")).toBeLessThan(
      chip.indexOf('{face?.hat !== undefined ? ('),
    );
    for (const hat of ['{single.hat !== undefined ? (', '{face?.hat !== undefined ? (']) {
      const from = chip.indexOf(hat);
      const layer = chip.slice(from, chip.indexOf(': null}', from));
      expect(layer, hat).not.toMatch(/photo/i);
    }
  });

  it('no other component draws a picture it could leave blank', () => {
    // a new `<Image source={{ uri` in this package must come here and take the same fallback
    const drawers = readdirSync(here)
      .filter(f => f.endsWith('.tsx'))
      .filter(f => /<Image\b[\s\S]*?source=\{\{\s*uri:/.test(withoutComments(read(f))));
    expect(drawers.sort()).toEqual(['Avatar.tsx', 'ChildChip.tsx']);
  });
});
