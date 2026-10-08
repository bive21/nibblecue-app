/**
 * EVERY PAID ROW IS EITHER ENFORCED OR ON THE UNBUILT LIST. Nothing may be sold silently.
 *
 * WHY THIS EXISTS. On 2026-09-22 a sweep of the matrix against the app found `weeklySummary`
 * advertised as Plus — on the compare screen, in the gate sheet's Plus column, in
 * `pricing.config.json` — with `can('weeklySummary')` called nowhere. Every household got the
 * full card. Nothing was broken, no test failed, and no screen looked wrong; the only symptom
 * was a promise the code did not keep.
 *
 * That failure is invisible by construction, which is why it needs an instrument rather than a
 * review. A paid feature that is UNBUILT is a different thing and is visible — a parent who pays
 * finds nothing there and says so — so those are listed here by name, with what is missing. The
 * list is a statement of intent with a date on it, not a silence.
 *
 * WHAT IS NOT CHECKED HERE: the free rows. A bill-of-rights row (`logging`, `timers`,
 * `exportData`, `noAds`…) is `fixed: true` and free for everyone, so an app that never calls
 * `can()` for it is behaving correctly. `entitlements.test.ts` guards that half.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FEATURES, type FeatureKey } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';

/**
 * Sold, and not built yet. Each entry says what is missing, so this is a to-do list rather than
 * a suppression. Moving a key OUT of here without enforcing it puts the test back to red.
 *
 * EMPTY SINCE 2026-09-23, and that is the state to keep. The last entry was `healthSync`. It was
 * never built: the owner took it out of Plus instead ("the apple health connection is not a
 * must").
 */
const UNBUILT: Partial<Record<FeatureKey, string>> = {};

/**
 * The app's own source, from git rather than a walk — AND INCLUDING WHAT IS NOT COMMITTED YET,
 * which is a correction. This read the index alone, on the reasoning that an untracked scratch
 * file should not be able to satisfy a gate. The effect was the opposite of the intent: when
 * import was built, `pnpm verify` ran green over a new screen calling `can('importData')` while
 * that key was still on the list below saying it did not exist, and said so only after the commit.
 * An uncommitted file cannot falsely satisfy a gate for long — it is about to be committed or
 * deleted — but an unscanned one hides a stale list for as long as nobody commits. Two gates were
 * blind to the same file for the same reason (packages/brand's placement scan was the other).
 */
const root = join(__dirname, '..', '..', '..', '..');
const sources = execFileSync(
  'git',
  [
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
    'apps/mobile/src',
    'packages/ui/src',
  ],
  { cwd: root, encoding: 'utf8' },
)
  .split('\0')
  .filter(f => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

const app = sources.map(f => readFileSync(join(root, f), 'utf8')).join('\n');

/*
  A SWITCHED-OFF ROW IS NOT SOLD (`off`: on no plan and on no list, `plusFeatures()`). NibbleCue keeps
  CuddleCue's keys it does not offer (entry photos, import, the weekly summary…) switched off so the
  shared screens compile, and a key nobody can buy needs no gate.
*/
const paid = (Object.keys(FEATURES) as FeatureKey[]).filter(
  k => FEATURES[k].free === false && FEATURES[k].off === undefined,
);

describe('every paid feature is enforced somewhere, or named as unbuilt', () => {
  it('finds paid rows at all, so a passing run means something', () => {
    // NibbleCue Plus's rows and the household's CuddleCue seats (2026-10-08)
    expect(paid.length).toBeGreaterThan(5);
  });

  it('calls can() or limitFor() for every paid row that is built', () => {
    const unenforced = paid.filter(k => !app.includes(`'${k}'`) && !(k in UNBUILT));
    expect(
      unenforced,
      'sold on the compare screen, never checked in the app, and not on the unbuilt list',
    ).toEqual([]);
  });

  it('keeps the unbuilt list honest: nothing on it is secretly enforced', () => {
    const actually = (Object.keys(UNBUILT) as FeatureKey[]).filter(k => app.includes(`'${k}'`));
    expect(actually, 'built after all — take it off UNBUILT so the gate is checked').toEqual([]);
  });

  it('keeps the unbuilt list to paid rows, and gives each one a reason', () => {
    for (const k of Object.keys(UNBUILT) as FeatureKey[]) {
      expect(FEATURES[k], `UNBUILT names ${k}, which is not in the matrix`).toBeDefined();
      expect(FEATURES[k]?.free, `${k} is free; it does not belong on a paid-gate list`).toBe(false);
      expect((UNBUILT[k] ?? '').length, `${k} needs a reason`).toBeGreaterThan(20);
    }
  });
});
