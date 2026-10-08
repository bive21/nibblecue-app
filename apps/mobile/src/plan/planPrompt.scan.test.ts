/**
 * THE TRIAL-END SHEET'S PROMISES, held where a renderer cannot hold them (the mobile suite runs in
 * node and mounts nothing). Which prompt is due and when it may rise are core's, tested there
 * (`plan/welcome.test.ts`); what this file pins is that the app hands core the truth and does what
 * core answers, in the one order that can never show a prompt twice.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = join(dirname(fileURLToPath(import.meta.url)), '..');
const flat = (...p: string[]): string =>
  readFileSync(join(src, ...p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

describe('the trial-end sheet rises only when core allows, and only once', () => {
  const hook = flat('plan', 'usePlanPrompt.ts');

  /*
    NIBBLECUE GRANTS NO PREVIEW (pricing.config.json `welcome_preview`: "NibbleCue grants no
    preview of its own until the owner decides on one"), and its Today is its own page, so the
    watch CuddleCue mounts on Today is mounted nowhere. The sheet and the hook stay, held below,
    for the day the owner decides on one.
  */
  it('is asked for nowhere in NibbleCue, by an element of its own when it is', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap(e =>
        e.isDirectory()
          ? walk(join(dir, e.name))
          : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)
            ? [join(dir, e.name)]
            : [],
      );
    const mounts = walk(src).filter(f => readFileSync(f, 'utf8').includes('<PlanPromptWatch'));
    expect(mounts).toEqual([]);
    expect(hook).toContain(
      'export function PlanPromptWatch(): null { usePlanPrompt(); return null; }',
    );
  });

  it('asks core, with every veto a parent in the middle of something deserves', () => {
    expect(hook).toContain('promptMayShow({');
    // a page not in front or an app not open, any sheet, any running timer, the tour
    expect(hook).toMatch(
      /busy: !awake \|\| openKind !== null \|\| timers\.length > 0 \|\| \(tour !== null/,
    );
    expect(hook).toContain("night: resolved.theme === 'night'");
    expect(hook).toContain('hour: new Date(now).getHours()');
  });

  it('marks the prompt seen before it opens the sheet, so a kill can lose one but never repeat it', () => {
    const seen = hook.indexOf('plan.markPromptSeen(due);');
    const open = hook.indexOf('shell.openPlanPrompt(due);');
    expect(seen).toBeGreaterThan(-1);
    expect(open).toBeGreaterThan(seen);
  });

  it('counts only this parent’s own entries as a save, and the first read as none', () => {
    expect(hook).toContain('where household_id = ? and created_by = ? and deleted_at is null');
    expect(hook).toContain('if (baseline.current !== null && mine > baseline.current)');
  });
});

describe('the sheet sells exactly what the paywall sells', () => {
  const sheet = flat('plan', 'PlanPromptSheet.tsx');

  it('draws the Plan page’s lists and the one subscribe panel, and closes on "Not now"', () => {
    expect(sheet).toContain('<PlanLists');
    expect(sheet).toContain('<SubscribePanel testID="planPrompt.billing" />');
    expect(sheet).toContain('label="Not now"');
    // a purchase anywhere in the household ends the preview, and the sheet with it
    const ends = sheet.slice(sheet.indexOf('if (!open || stillPreview) return;'));
    expect(sheet).toContain('if (!open || stillPreview) return;');
    expect(ends.slice(0, 200)).toContain('onClose();');
  });

  it('says what the household used, from this phone’s own count, under the entries (2026-09-28)', () => {
    expect(sheet).toContain('const usage = usePlusUsage(open);');
    expect(sheet).toContain('usage, })');
    expect(sheet).toContain(
      '{copy.used ? <Body testID="planPrompt.used">{copy.used}</Body> : null}',
    );
    expect(sheet.indexOf('planPrompt.used')).toBeGreaterThan(sheet.indexOf('planPrompt.logged'));
  });

  it('leaves the household line to the panel, so it is said once (2026-09-28)', () => {
    expect(sheet).not.toContain('planPrompt.household');
    expect(flat('billing', 'SubscribePanel.tsx')).toContain('{BILLING.household}');
  });

  it('tells no analytics that it rose or how it was answered (the owner, 2026-09-28: server count)', () => {
    expect(sheet).not.toMatch(/analytics\.emit|useAnalytics/);
    // "Not now", the scrim, the handle and Back all simply close it
    expect(sheet).toContain('onPress={onClose}');
    expect(sheet).toContain('onClose={onClose}');
  });

  it('types no price and no countdown of its own', () => {
    for (const file of [sheet, flat('plan', 'promptCopy.ts')]) {
      expect(file).not.toMatch(/\$\d|€\d|£\d/);
      expect(file).not.toMatch(/setInterval|countdown/i);
    }
  });
});
