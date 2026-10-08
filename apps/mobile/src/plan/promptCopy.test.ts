import { IN_APP_STRINGS } from '@nibblecue/brand';
import { limitFor, PROMPT_TIMING } from '@nibblecue/core';
import { TOAST_DURATION_MS, TOAST_DURATION_TWO_ACTIONS_MS } from '@nibblecue/ui/toast';
import { SKINS } from '@nibblecue/ui/skins';
import { describe, expect, it } from 'vitest';
import { BILLING } from '../billing/copy';
import { PLUS_USES, type PlusUsage } from './plusUsage';
import {
  endsOnLabel,
  LOGGED_FLOOR,
  previewRecap,
  promptCopy,
  RECAP_MAX,
  RECAP_WORDS,
  type PromptCopyInput,
} from './promptCopy';

/** `n` distinct days in September, as the counter stores them. */
const days = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `2026-09-${String(i + 10).padStart(2, '0')}`);

const USED: PlusUsage = {
  napOutlook: days(6),
  night: days(4),
  reports: days(3),
  stashOrder: days(1),
};

const base: PromptCopyInput = {
  prompt: 'seven_days_left',
  daysLeft: 7,
  endsOn: 'Sunday, Oct 4',
  logged: 86,
  freeHistoryDays: limitFor('history', 'FREE') ?? 7,
  usage: USED,
};

describe('what the trial-end sheets say (promptCopy.ts)', () => {
  it('seven days left: the real date, and that keeping Plus changes nothing', () => {
    const c = promptCopy(base);
    expect(c.headingDays).toBe(7);
    // the sheet's title is the tier's name, so the heading under it does not say it again
    expect(`${c.headingDays}${c.heading}`).toBe('7 days left');
    expect(c.heading).not.toContain(IN_APP_STRINGS.paywallTitle);
    expect(c.lead).toBe('Your preview runs until Sunday, Oct 4. Keep Plus and nothing changes.');
    expect(c.logged).toBe('Your family has logged 86 entries so far.');
    expect(c.used).toBe(
      'In your preview: the nap outlook on 6 days, Night on 4 nights, Reports on 3 days.',
    );
  });

  it('three days left: what changes on that day, from the matrix, and that nothing is deleted', () => {
    const c = promptCopy({ ...base, prompt: 'three_days_left', daysLeft: 3 });
    expect(`${c.headingDays}${c.heading}`).toBe('3 days left');
    // NIBBLECUE KEEPS EVERY MEAL FREE (`history` is a free row of its matrix), so the matrix names
    // no cap; the sheet is handed the caller's figure, and NibbleCue never asks for this sheet
    // (it grants no preview: `planPrompt.scan.test.ts`). CuddleCue's sentence is kept as it is.
    expect(limitFor('history', 'FREE')).toBeNull();
    expect(c.lead).toBe(
      'On Sunday, Oct 4 your household moves to the free plan. Reports and the Log will then ' +
        `show the last ${base.freeHistoryDays} days, and nothing is deleted.`,
    );
    // one day left says "day"
    expect(promptCopy({ ...base, prompt: 'three_days_left', daysLeft: 1 }).heading).toBe(
      ' day left',
    );
  });

  it('says the count only once there is something to be proud of, and never while counting', () => {
    expect(promptCopy({ ...base, logged: LOGGED_FLOOR - 1 }).logged).toBeNull();
    expect(promptCopy({ ...base, logged: null }).logged).toBeNull();
    expect(promptCopy({ ...base, logged: 1234 }).logged).toBe(
      'Your family has logged 1,234 entries so far.',
    );
  });

  it('never counts down, never threatens, never prices, never dashes', () => {
    for (const prompt of ['seven_days_left', 'three_days_left'] as const) {
      const c = promptCopy({ ...base, prompt });
      const all = [c.heading, c.lead, c.logged ?? '', c.used ?? '', BILLING.household].join(' ');
      expect(all).not.toMatch(/[—–]|\$|hurry|last chance|don.t lose|only \d|expires? in|offer/i);
      // nothing about the baby or how they are doing
      expect(all).not.toMatch(/baby|feeding|sleep|growth|health/i);
    }
  });

  it('names the day the preview ends on the phone’s own calendar', () => {
    expect(endsOnLabel('2026-10-04T15:23:00Z', 'America/Chicago')).toBe('Sunday, Oct 4');
    // late in the evening in New York is already the next day in UTC
    expect(endsOnLabel('2026-10-05T02:00:00Z', 'America/New_York')).toBe('Sunday, Oct 4');
  });

  it('waits past the longest save toast, so a prompt never covers an Undo', () => {
    expect(PROMPT_TIMING.afterSaveMs).toBeGreaterThan(TOAST_DURATION_MS);
    expect(PROMPT_TIMING.afterSaveMs).toBeGreaterThan(TOAST_DURATION_TWO_ACTIONS_MS);
  });
});

describe('what the household used, in plain counts (previewRecap, 2026-09-28)', () => {
  it('names the three used most, highest first, each with its own unit', () => {
    expect(previewRecap(USED)).toBe(
      'In your preview: the nap outlook on 6 days, Night on 4 nights, Reports on 3 days.',
    );
    expect(RECAP_MAX).toBe(3);
  });

  it('says one day and one night in the singular', () => {
    expect(previewRecap({ reports: days(1), night: days(1) })).toBe(
      'In your preview: Reports on 1 day, Night on 1 night.',
    );
  });

  it('breaks a tie in a fixed order, so the line never shuffles between two looks', () => {
    const tie = { glass: days(2), history: days(2), napOutlook: days(2) };
    expect(previewRecap(tie)).toBe(
      'In your preview: the nap outlook on 2 days, your whole history on 2 days, ' +
        `${SKINS.glass.label} on 2 days.`,
    );
  });

  it('says nothing at all when nothing was used, or while the count loads', () => {
    expect(previewRecap({})).toBeNull();
    expect(previewRecap({ reports: [] })).toBeNull();
    expect(previewRecap(null)).toBeNull();
    expect(promptCopy({ ...base, usage: null }).used).toBeNull();
    expect(promptCopy({ ...base, usage: {} }).used).toBeNull();
  });

  it('has words for every surface the counter counts, and every one is plain', () => {
    for (const use of PLUS_USES) {
      const words = RECAP_WORDS[use];
      expect(words.length, use).toBeGreaterThan(0);
      expect(words, use).not.toMatch(/[—–]|\$|lose|miss|only|hurry|offer/i);
    }
    // the skin's name is the skin table's, so a rename there is a rename here
    expect(RECAP_WORDS.glass).toBe(SKINS.glass.label);
  });

  it('never guilts, hurries, prices or dashes, whatever it is handed', () => {
    const everything = Object.fromEntries(PLUS_USES.map((use, i) => [use, days(i + 1)]));
    const line = previewRecap(everything) ?? '';
    expect(line.startsWith('In your preview: ')).toBe(true);
    expect(line).not.toMatch(/[—–]|\$|hurry|last chance|don.t lose|lose|expire|offer|only \d/i);
    // nothing about the baby or how they are doing, only what the app was used for
    expect(line).not.toMatch(/baby|feeding|healthy|should/i);
  });
});

describe('one subscription covers the household, said wherever Plus is sold (2026-09-28)', () => {
  it('keeps the trial sheets’ own words, now in one place', () => {
    expect(BILLING.household).toBe(
      'One subscription covers everyone in your household, on every phone.',
    );
  });
});
