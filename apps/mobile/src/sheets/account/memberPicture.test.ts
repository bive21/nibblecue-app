/**
 * EVERY MEMBER'S PICTURE, WHERE A MEMBER IS DRAWN (the owner, 2026-09-30; migration 0148): the
 * sheet that changes it, the promises it makes, and each surface that used to draw only the
 * initial. The sheet and the surfaces are React Native, so this reads them as source, as the
 * babies' photo tests do; the rules behind them run in node (`pictureWaiting.test.ts`,
 * `picturePeople.test.ts`, `adults.test.ts`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MEMBER_PICTURE_COPY, memberPictureFailure } from './pictureCopy';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..');
/** A file's code with its comments out and its whitespace folded, so a layout change is no failure. */
const code = (rel: string): string =>
  readFileSync(join(src, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

describe('what the sheet promises', () => {
  it('says who sees the picture, where it never goes, and what the initial does to a photo', () => {
    expect(MEMBER_PICTURE_COPY.lede).toContain('Everyone in your household');
    expect(MEMBER_PICTURE_COPY.privacy).toContain('for your household only');
    expect(MEMBER_PICTURE_COPY.privacy).toContain('never shown outside it');
    expect(MEMBER_PICTURE_COPY.privacy).toContain('deletes a photo');
    // offline is said as what it is: kept here, sent by itself
    expect(MEMBER_PICTURE_COPY.savedHere).toContain('Saved on this phone');
    expect(MEMBER_PICTURE_COPY.savedHere).toContain('back online');
  });

  it('is short, sentence case and plain: no dash in any line a person reads', () => {
    for (const [k, v] of Object.entries(MEMBER_PICTURE_COPY)) {
      const line = typeof v === 'function' ? v('woman', 'medium', 'short black hair') : v;
      expect(line, k).not.toMatch(/[—–]| - /);
      expect(line[0], k).toBe(line[0]?.toUpperCase());
    }
    expect(memberPictureFailure(413)).toBe(MEMBER_PICTURE_COPY.tooLarge);
    expect(memberPictureFailure(422)).toBe(MEMBER_PICTURE_COPY.failed);
  });
});

describe('the sheet', () => {
  const sheet = code('sheets/account/MemberPictureSheet.tsx');

  it('takes a photo through the baby’s own picker and re-encode: one crop, 512 px, EXIF gone', () => {
    expect(sheet).toContain('const picked = await pickChildPhoto(source);');
    expect(sheet).toContain('jpeg = await prepareChildPhoto(picked.uri);');
    expect(sheet).toContain("await apply({ kind: 'photo', jpeg });");
  });

  it('offers the three answers, and every one goes the one road: kept here, drawn, sent', () => {
    expect(sheet.match(/pictures\.choose\(/g)).toHaveLength(1);
    expect(sheet).toContain("void apply({ kind: 'initial' })");
    expect(sheet).toContain("void apply({ kind: 'drawing', id: def.id });");
    for (const id of ['picture.frame', 'picture.choose', 'picture.camera', 'picture.initial'])
      expect(sheet).toContain(`testID="${id}"`);
    expect(sheet).toContain('<AdultAvatarGrid');
  });

  it('says a refusal where the sheet says its errors, and a waiting change out loud', () => {
    expect(sheet).toContain('accessibilityRole="alert" testID="picture.error"');
    expect(sheet).toContain("r.outcome === 'retry' ? MEMBER_PICTURE_COPY.savedHere");
    expect(sheet).toContain('testID="picture.waiting"');
  });
});

describe('where a member is drawn', () => {
  it('is mounted once, for every surface, beside the mirror it reads', () => {
    const app = readFileSync(join(src, '..', 'App.tsx'), 'utf8').replace(/\s+/g, ' ');
    expect(app.indexOf('<SyncProvider>')).toBeLessThan(app.indexOf('<MemberPicturesProvider>'));
    expect(app.indexOf('<MemberPicturesProvider>')).toBeLessThan(app.indexOf('<Navigation />'));
  });

  it('the top bar’s profile button, on every page and in the appearance preview', () => {
    expect(code('app/Screen.tsx')).toContain(
      '...(myPicture !== null ? { photoUri: myPicture } : {}),',
    );
    expect(code('appearance/AppearancePreview.tsx')).toContain(
      '...(myPicture !== null ? { photoUri: myPicture } : {}),',
    );
  });

  it('Account & privacy: the picture leads the page and opens the sheet', () => {
    const account = code('screens/account/AccountScreen.tsx');
    const rows = account.slice(account.indexOf('<Rows>'));
    expect(rows.indexOf('testID="account.picture"')).toBeLessThan(
      rows.indexOf('testID="account.email"'),
    );
    expect(account).toContain('onPress={() => setPictureOpen(true)}');
    expect(account).toContain(
      '<MemberPictureSheet visible={pictureOpen} onClose={() => setPictureOpen(false)} />',
    );
  });

  it('Family’s member rows, from the roster the page reads', () => {
    const family = code('screens/more/FamilyScreen.tsx');
    expect(family).toContain('learn(roster);');
    expect(family).toContain('const picture = pictureOf(m.user_id);');
    expect(family).toContain('...(picture !== null ? { photoUri: picture } : {}),');
  });

  // (no who's-on card or sheet in NibbleCue: it has no reminders to hand off)

  /*
   * WHERE THE INITIAL WAS, AND NOWHERE NEW (2026-09-30). The owner asked for a picture because it
   * "look[s] better than the letter initial it shows": it replaces the initial. A byline on the
   * log, the catch-up and the look-back is words and never drew an initial, and a face on only the
   * rows of whoever has set a picture would make two kinds of row in one list.
   */
  it('not beside a byline: the Health note’s look-back and NibbleCue’s pages stay words', () => {
    // (CuddleCue's Log, catch-up and duty look-back are not in NibbleCue; its bylines are here)
    const rels = [
      'sheets/quick/modules/wellbeing/LookBackView.tsx',
      ...readdirSync(join(src, 'screens', 'nibble'))
        .filter(n => /\.tsx?$/.test(n) && !/\.test\./.test(n))
        .map(n => `screens/nibble/${n}`),
    ];
    for (const rel of rels) expect(code(rel), rel).not.toMatch(/useMemberPictures|pictureOf/);
  });

  // (no community in NibbleCue, so no post to keep a picture out of)
});
