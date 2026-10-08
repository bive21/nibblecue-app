import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND, IN_APP_STRINGS } from './index';
import { repoRoot } from './repo-root';

/**
 * Where the name appears. The rules are CuddleCue's (its docs/BRANDING.md §2, §2b, §3), carried to
 * NibbleCue unchanged with the studio's playbook (.claude/skills/bpnc-studio); the section numbers
 * below are that document's. Three checks over the app's source:
 *
 * 1. Nothing types a brand value. The product name, the monogram, the developer name, the
 *    store title and "Baby Tracker" may not be written into a screen, a string or a test
 *    fixture — they are read from brand.json through @nibblecue/brand, so a rename is one
 *    edit. Comments are stripped first: a comment may name the product.
 * 2. The name shows only where §2 allows. A file that renders a brand display value (the
 *    in-app strings, the tagline, the wordmark, the mark, the display name) must be one of
 *    the allow-listed surfaces: the door in, the paywall, the More footer, About, and the one
 *    exception in the chrome — the mark beside the child chip. The tab bar, the top bar's
 *    other controls and the logging loop never carry it.
 * 3. The loader — the mark travelling an ∞ — lands only where §2's "Waiting" row allows. The
 *    design system draws it from a mark the app installs once, so no screen that shows it names
 *    MARK_SOURCE and check 2 cannot see where it lands; its own checks are at the foot of the file.
 */
const APP_SRC = 'apps/mobile/src';

/**
 * Surfaces §2 names, as paths under apps/mobile/src. CuddleCue's widgets, import page, vaccine
 * cards, Community and tour were taken off with the features (NibbleCue has none of them), and so
 * were onboarding's and Today's trial cards: NibbleCue has no welcome trial (2026-10-08).
 */
const ALLOWED_SURFACES = [
  'screens/auth/AuthScreen.tsx', // sign in / create account: wordmark + tagline
  // the same foot on Choose a new password (the owner, 2026-10-03, for the studio): the mark, by
  // the developer, and the tagline. Sign in draws it too, so the two pages cannot say who made
  // the app differently
  'screens/auth/AuthSignature.tsx',
  'screens/more/MoreScreen.tsx', // the footer wordmark, opening About
  'sheets/AboutSheet.tsx', // wordmark, tagline, version, terms, privacy, contact
  'sheets/GateSheet.tsx', // the paywall: the tier name as the title
  'screens/account/PlanScreen.tsx', // the plan row's page: the tier name
  'screens/account/AccountScreen.tsx', // "Included with <tier>" beside a paid row
  'app/AccountPopover.tsx', // the Plan row's detail line names the tier
  'app/Screen.tsx', // §2b: the mark, dead center in the top bar, and nothing else
  'appearance/AppearancePreview.tsx', // the preview draws the real top bar, mark included
  'appearance/AppearanceSheet.tsx', // "Included with <tier>" on a locked look, with the live preview
  'plan/gate.ts', // the paywall copy: title and lists
  // the paywall's and the Plan page's two lists, drawn by one component for both: the Plus card's
  // title names the tier ("<tier> adds"), on those two surfaces and nowhere else
  'plan/PlanLists.tsx',
  // §2's "Paywall" row, a second time: the sheet that asks after a save is the paywall's own
  // shape, so it carries the paywall's title. It rises only after a save, never on the way in.
  'plan/PlanPromptSheet.tsx',
  'brand/assets.ts', // the artwork references themselves
  // §2's "Shared text" row: a list that left the app says where it came from (the shopping list
  // signs itself, the owner, 2026-09-17, for the studio)
  'lists/signature.ts',
  // the same row for an invite: the message a shared invite link goes out in says which app it
  // opens, because it arrives in somebody else's mail or chat
  'auth/inviteMessage.ts',
  // §2's "Asking for a rating / another app" row: commercial cards, unusable without a name
  'growth/GrowthCard.tsx',
  // §2's "A locked control, anywhere" row, NibbleCue's (2026-10-08). The Plus features are the
  // days of the plan after tomorrow, Milk and drinks, the caregiver sheet and the pediatrician
  // summary, and each lock says what unlocks it ("See <tier>", "<tier> lays out the next two
  // weeks") before it is tapped. Every NibbleCue screen reads its words from this one file, so
  // the tier is named here and the screens name nothing. Safety is never behind a lock: Today,
  // the serve flow, allergens, Something you noticed and the emergency card are free.
  'screens/nibble/copy.ts',
];

const DISPLAY_SYMBOLS = [
  /\bIN_APP_STRINGS\b/,
  /\bTAGLINE\b/,
  /\bWORDMARK_SOURCE\b/,
  /\bMARK_SOURCE\b/,
  /\bBRAND\.(appDisplayName|storeTitle|appStoreTitle|playStoreTitle|developerName|plusTierName|monogram|appleSubtitle|marketingHeadline|brand)\b/,
];

/**
 * Every app source file — INCLUDING THE ONES NOT YET COMMITTED, which is the whole of a lesson.
 *
 * This read `git ls-files` alone, which reports the index, so a screen written and not yet
 * committed was invisible to this gate. `pnpm verify` therefore ran green over a new page that
 * named the tier on a surface §2 did not list, and said so only after the commit — the same shape
 * as PREFLIGHT §6, §7 and §8: everything that ran said the work was fine, and the thing that would
 * have caught it was not looking at the file. `--others --exclude-standard` adds what is on disk
 * and not ignored, so a file is scanned the moment it is written.
 */
function appFiles(): string[] {
  const root = repoRoot();
  return (
    execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', APP_SRC], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(f => f && /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !/\.d\.ts$/.test(f))
      // `git ls-files` reports the INDEX: a tracked file deleted in the working tree is still
      // listed, which is an ordinary state mid-refactor. Reading it throws ENOENT and fails
      // this gate for a reason unrelated to brand placement. A file that is not on disk cannot
      // contain a brand value, so skipping it is correct as well as safe.
      .filter(f => existsSync(join(repoRoot(), f)))
  );
}

function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

describe('brand placement in the app', () => {
  const root = repoRoot();
  const files = appFiles();

  it('finds the app source', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('allows only surfaces that exist, so the list cannot keep a door open for a file to come', () => {
    for (const rel of ALLOWED_SURFACES)
      expect(existsSync(join(root, APP_SRC, rel)), rel).toBe(true);
  });

  it('types no brand value into the app (the name, the monogram, the developer, the store title, "Baby Tracker")', () => {
    const needles: [string, RegExp][] = [
      ['the product name', new RegExp(`['"\`>][^'"\`<]*${BRAND.appDisplayName}`)],
      ['the developer name', new RegExp(BRAND.developerName.replace(/[&]/g, '\\$&'))],
      ['the store title', new RegExp(BRAND.storeTitle.replace(/[-.]/g, '\\$&'))],
      ['"Baby Tracker"', /Baby Tracker/i],
      ['the monogram as a string', new RegExp(`(['"\`])${BRAND.monogram}\\1|>${BRAND.monogram}<`)],
    ];
    const hits: string[] = [];
    for (const file of files) {
      const text = withoutComments(readFileSync(join(root, file), 'utf8'));
      for (const [what, re] of needles) {
        const m = re.exec(text);
        if (m) hits.push(`${file}: ${what} (${m[0].trim().slice(0, 60)})`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('shows the name only on the surfaces BRANDING.md §2 allows', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = file.slice(APP_SRC.length + 1);
      if (ALLOWED_SURFACES.includes(rel)) continue;
      const text = withoutComments(readFileSync(join(root, file), 'utf8'));
      const used = DISPLAY_SYMBOLS.filter(re => re.test(text)).map(re => String(re));
      if (used.length) offenders.push(`${rel}: ${used.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the in-app strings to the short name: the full store title never appears inside the app', () => {
    for (const [key, value] of Object.entries(IN_APP_STRINGS)) {
      if (key.startsWith('$')) continue;
      expect(value, key).not.toContain(BRAND.storeTitle);
    }
  });
});

/**
 * THE LOADER (§2's "Waiting" row; the owner, 2026-09-26: the loading indicator is the mark
 * travelling an ∞). `packages/ui` draws it — in the boot wait, and in any Button that is
 * `loading` — from a registry the app's root fills once with the mark. So the mark reaches the
 * screen without a screen ever naming it, and these three hold the edges the scan above cannot:
 * who hands the mark over, who draws the loader directly, and that no button in the logging loop
 * (§3: Today, the entry sheets, the timers, Quick Log) ever waits with it. Nothing there should
 * wait at all — a save in the loop is written on the phone first — and a button that did would put
 * the brand in the one place §3 keeps it out of.
 */
const APP_ROOT = 'apps/mobile/App.tsx';

/** The only app file that draws the loader itself: the wait between the splash and the first screen. */
const DRAWS_THE_LOADER = ['app/BootWait.tsx'];

/**
 * §3's logging loop, as paths under apps/mobile/src: NibbleCue's Today, the serve flow (Served,
 * then how it went), Something you noticed and the emergency card, and the entry sheets and
 * quick entry it shares with CuddleCue. A parent there is feeding a baby with one hand.
 */
const LOGGING_LOOP = [
  'screens/nibble/TodayScreen.tsx',
  'screens/nibble/ServeSheet.tsx',
  'screens/nibble/ItemSheet.tsx',
  'screens/nibble/NoticedScreen.tsx',
  'screens/nibble/EmergencyScreen.tsx',
  'screens/today/',
  'sheets/quick/',
  'sheets/entry/',
  'app/QuickEntrySheet.tsx',
];

/**
 * Every `<name …>` opening tag in `text`, read to the `>` that closes it — braces counted, so an
 * arrow function in a prop (`onPress={() => …}`) does not end the tag early.
 */
function openingTags(text: string, name: string): string[] {
  const tags: string[] = [];
  for (const m of text.matchAll(new RegExp(`<${name}\\b`, 'g'))) {
    let depth = 0;
    let end = text.length;
    for (let i = m.index; i < text.length; i++) {
      const c = text[i];
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0) {
        end = i + 1;
        break;
      }
    }
    tags.push(text.slice(m.index, end));
  }
  return tags;
}

describe('the loader draws the mark only where §2 allows', () => {
  const root = repoRoot();
  const source = appFiles().map(file => ({
    rel: file.slice(APP_SRC.length + 1),
    text: withoutComments(readFileSync(join(root, file), 'utf8')),
  }));

  it('is handed the mark by the root alone, once — and the root shows no brand value itself', () => {
    const app = withoutComments(readFileSync(join(root, APP_ROOT), 'utf8'));
    expect(app.match(/\bsetLoaderMark\(/g)).toHaveLength(1);
    expect(app).toContain('setLoaderMark(MARK_SOURCE)');
    // imported, and handed over: the root is not a surface, and names nothing else of the brand's
    expect(app.match(/\bMARK_SOURCE\b/g)).toHaveLength(2);
    expect(DISPLAY_SYMBOLS.filter(re => re.test(app)).map(String)).toEqual([
      String(/\bMARK_SOURCE\b/),
    ]);
    expect(source.filter(f => /\bsetLoaderMark\(/.test(f.text)).map(f => f.rel)).toEqual([]);
  });

  it('is drawn directly only by the boot wait; every other loader is a waiting button', () => {
    expect(source.filter(f => /<LogoLoader\b/.test(f.text)).map(f => f.rel)).toEqual(
      DRAWS_THE_LOADER,
    );
  });

  it('is never asked for by a button on Today or anywhere else in the logging loop', () => {
    const loop = source.filter(f => LOGGING_LOOP.some(path => f.rel.startsWith(path)));
    // the loop is found — a folder renamed out from under this list must not pass it vacuously
    expect(loop.length).toBeGreaterThan(20);
    for (const path of LOGGING_LOOP)
      expect(
        loop.some(f => f.rel.startsWith(path)),
        path,
      ).toBe(true);
    const waiting = loop.flatMap(f =>
      openingTags(f.text, 'Button')
        .filter(tag => /\bloading\b/.test(tag))
        .map(tag => `${f.rel}: ${tag.replace(/\s+/g, ' ').slice(0, 80)}`),
    );
    expect(waiting).toEqual([]);
  });
});
