import { describe, expect, it } from 'vitest';
import {
  billOfRights,
  FEATURES,
  freeFeatures,
  limitFor,
  plusFeatures,
  type FeatureKey,
  type PlanStatus,
} from './entitlements';
import type { PlanRowInput } from './plan-status';
import {
  cachedPlan,
  daysLeft,
  planSnapshot,
  previewLimit,
  previewOnly,
  PROMPT_TIMING,
  promptMayShow,
  WELCOME_DAYS,
  WELCOME_PROMPT_DAYS_LEFT,
  WELCOME_WARNING_DAYS_LEFT,
  joinedDuringPreview,
  welcomeCard,
  welcomePrompt,
} from './welcome';

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-14T12:00:00Z');
const at = (days: number) => new Date(NOW + days * DAY).toISOString();
const welcome = (endsInDays: number): PlanRowInput => ({
  status: 'ACTIVE',
  source: 'welcome',
  current_period_end: at(endsInDays),
});

describe('the 14-day preview as the app sees it (AUTH_AND_TRIAL.md §3–4)', () => {
  it('is 14 days, from pricing.config.json, and warns with three days left', () => {
    expect(WELCOME_DAYS).toBe(14);
    expect(WELCOME_WARNING_DAYS_LEFT).toBe(3);
  });

  it('counts whole days left, rounded up, never below zero', () => {
    expect(daysLeft(at(14), NOW)).toBe(14);
    expect(daysLeft(at(13.5), NOW)).toBe(14);
    expect(daysLeft(at(0.01), NOW)).toBe(1);
    expect(daysLeft(at(-2), NOW)).toBe(0);
    expect(daysLeft(null, NOW)).toBeNull();
    expect(daysLeft(undefined, NOW)).toBeNull();
  });

  it('snapshots WELCOME with its day count at server time, FREE with none', () => {
    const w = planSnapshot(welcome(14), NOW);
    expect(w).toEqual({
      status: 'WELCOME',
      tier: 'PLUS',
      daysLeft: 14,
      expiresAt: at(14),
      computedAt: NOW,
    });
    const ended = planSnapshot(welcome(-1), NOW);
    expect(ended.status).toBe('FREE');
    expect(ended.tier).toBe('FREE');
    expect(ended.daysLeft).toBeNull();
    expect(planSnapshot(null, NOW)).toMatchObject({
      status: 'FREE',
      tier: 'FREE',
      daysLeft: null,
      expiresAt: null,
    });
  });

  it('counts days for a store trial and a cancellation, not for an open-ended subscription', () => {
    expect(
      planSnapshot({ status: 'TRIAL', source: 'store', current_period_end: at(7) }, NOW).daysLeft,
    ).toBe(7);
    expect(
      planSnapshot(
        { status: 'CANCELLED_AT_PERIOD_END', source: 'store', current_period_end: at(20) },
        NOW,
      ).daysLeft,
    ).toBe(20);
    expect(
      planSnapshot({ status: 'ACTIVE', source: 'store', current_period_end: at(20) }, NOW).daysLeft,
    ).toBeNull();
  });

  it("never ends the preview on the device: the status is the server's word, only the count moves", () => {
    const deviceThen = 1_000_000; // a device clock has nothing to do with server time
    const snap = planSnapshot(welcome(2), NOW);
    expect(cachedPlan(snap, deviceThen, deviceThen).daysLeft).toBe(2);
    expect(cachedPlan(snap, deviceThen + 1 * DAY, deviceThen).daysLeft).toBe(1);
    // the preview date passes while offline: still WELCOME, the count stops at zero
    const stale = cachedPlan(snap, deviceThen + 30 * DAY, deviceThen);
    expect(stale.status).toBe('WELCOME');
    expect(stale.tier).toBe('PLUS');
    expect(stale.daysLeft).toBe(0);
    // a clock moved backwards does not add days either
    expect(cachedPlan(snap, deviceThen - 10 * DAY, deviceThen).daysLeft).toBe(2);
    // a FREE snapshot is returned as-is
    const free = planSnapshot(null, NOW);
    expect(cachedPlan(free, deviceThen + DAY, deviceThen)).toBe(free);
  });

  it('shows the day-11 card once, and the "ended" card once, never for an account that had no preview', () => {
    const notDismissed = { threeDaysLeft: false };
    const granted = { granted: true, summarySeen: false, decides: true, joinedDuring: true };
    expect(welcomeCard(planSnapshot(welcome(14), NOW), granted, notDismissed)).toBeNull();
    expect(welcomeCard(planSnapshot(welcome(4), NOW), granted, notDismissed)).toBeNull();
    expect(welcomeCard(planSnapshot(welcome(3), NOW), granted, notDismissed)).toBe(
      'three_days_left',
    );
    expect(welcomeCard(planSnapshot(welcome(0.5), NOW), granted, notDismissed)).toBe(
      'three_days_left',
    );
    expect(welcomeCard(planSnapshot(welcome(3), NOW), granted, { threeDaysLeft: true })).toBeNull();
    expect(welcomeCard(planSnapshot(welcome(-1), NOW), granted, notDismissed)).toBe('ended');
    expect(
      welcomeCard(planSnapshot(welcome(-1), NOW), { ...granted, summarySeen: true }, notDismissed),
    ).toBeNull();
    // an invited caregiver never had the preview, so never sees either card
    expect(
      welcomeCard(planSnapshot(null, NOW), { ...granted, granted: false }, notDismissed),
    ).toBeNull();
    // a paying household is not told anything ended
    expect(
      welcomeCard(
        planSnapshot({ status: 'ACTIVE', source: 'store', current_period_end: at(20) }, NOW),
        granted,
        notDismissed,
      ),
    ).toBeNull();
  });

  it('shows its cards to the people who decide, and "ended" only to someone who had the preview', () => {
    const notDismissed = { threeDaysLeft: false };
    const parent = { granted: true, summarySeen: false, decides: true, joinedDuring: true };
    // a caregiver on a timed seat is never sold to, on day 11 or after
    const caregiver = { ...parent, decides: false };
    expect(welcomeCard(planSnapshot(welcome(3), NOW), caregiver, notDismissed)).toBeNull();
    expect(welcomeCard(planSnapshot(welcome(-1), NOW), caregiver, notDismissed)).toBeNull();
    // a partner who joined after the preview ended is not told on their first day that it ended
    const late = { ...parent, joinedDuring: false };
    expect(welcomeCard(planSnapshot(welcome(-1), NOW), late, notDismissed)).toBeNull();
    expect(welcomeCard(planSnapshot(welcome(-1), NOW), parent, notDismissed)).toBe('ended');
  });

  it('knows who joined during the preview, and counts an unknown as yes', () => {
    const ends = at(-6);
    expect(joinedDuringPreview(at(-10), ends)).toBe(true);
    expect(joinedDuringPreview(at(-2), ends)).toBe(false);
    expect(joinedDuringPreview(null, ends)).toBe(true);
    expect(joinedDuringPreview(at(-2), null)).toBe(true);
    expect(joinedDuringPreview('not a time', ends)).toBe(true);
  });

  it('asks with seven days left and with three, once each, only a parent who decides', () => {
    expect(WELCOME_PROMPT_DAYS_LEFT).toEqual({ seven_days_left: 7, three_days_left: 3 });
    const parent = { granted: true, decides: true };
    const none = { sevenDaysLeft: false, threeDaysLeft: false };
    const at_ = (d: number) => planSnapshot(welcome(d), NOW);
    // days 1–6 of the preview: nothing yet
    expect(welcomePrompt(at_(14), parent, none)).toBeNull();
    expect(welcomePrompt(at_(8), parent, none)).toBeNull();
    // seven days left, and on until the three-day one takes over
    expect(welcomePrompt(at_(7), parent, none)).toBe('seven_days_left');
    expect(welcomePrompt(at_(4), parent, none)).toBe('seven_days_left');
    expect(welcomePrompt(at_(7), parent, { ...none, sevenDaysLeft: true })).toBeNull();
    // three days left: the three-day one, whether or not the seven-day one was ever shown
    expect(welcomePrompt(at_(3), parent, none)).toBe('three_days_left');
    expect(welcomePrompt(at_(0.5), parent, { ...none, sevenDaysLeft: true })).toBe(
      'three_days_left',
    );
    expect(welcomePrompt(at_(3), parent, { sevenDaysLeft: true, threeDaysLeft: true })).toBeNull();
    // over, or never granted, or not someone who decides: nothing
    expect(welcomePrompt(at_(-1), parent, none)).toBeNull();
    expect(welcomePrompt(at_(3), { granted: false, decides: true }, none)).toBeNull();
    expect(welcomePrompt(at_(3), { granted: true, decides: false }, none)).toBeNull();
    // a paying household is never asked
    expect(
      welcomePrompt(
        planSnapshot({ status: 'ACTIVE', source: 'store', current_period_end: at(5) }, NOW),
        parent,
        none,
      ),
    ).toBeNull();
  });

  it('rises only after a save, past its Undo, in the daytime, with nothing else going on', () => {
    const calm = { msSinceSave: PROMPT_TIMING.afterSaveMs, busy: false, hour: 10, night: false };
    expect(promptMayShow(calm)).toBe(true);
    // never on the way in: no save this session, or the save's Undo still on screen
    expect(promptMayShow({ ...calm, msSinceSave: null })).toBe(false);
    expect(promptMayShow({ ...calm, msSinceSave: PROMPT_TIMING.afterSaveMs - 1 })).toBe(false);
    // nor long after it, when the parent may be starting the next thing
    expect(promptMayShow({ ...calm, msSinceSave: PROMPT_TIMING.withinMs })).toBe(true);
    expect(promptMayShow({ ...calm, msSinceSave: PROMPT_TIMING.withinMs + 1 })).toBe(false);
    // a timer, a sheet or the tour vetoes; so does Night
    expect(promptMayShow({ ...calm, busy: true })).toBe(false);
    expect(promptMayShow({ ...calm, night: true })).toBe(false);
    // 8 a.m. to 9 p.m. on the phone's clock, and never the baby's night
    expect(promptMayShow({ ...calm, hour: 7 })).toBe(false);
    expect(promptMayShow({ ...calm, hour: 8 })).toBe(true);
    expect(promptMayShow({ ...calm, hour: 20 })).toBe(true);
    expect(promptMayShow({ ...calm, hour: 21 })).toBe(false);
    expect(promptMayShow({ ...calm, hour: 3 })).toBe(false);
  });
});

describe('the quiet "Plus" tag: on only because of the preview (2026-09-28)', () => {
  const ALL = Object.keys(FEATURES) as FeatureKey[];
  const EVERY_STATUS: PlanStatus[] = [
    'WELCOME',
    'TRIAL',
    'ACTIVE',
    'CANCELLED_AT_PERIOD_END',
    'GRACE',
    'ON_HOLD',
    'EXPIRED',
    'FREE',
  ];

  it('tags every Plus feature during the preview, and nothing the free plan keeps', () => {
    const preview = planSnapshot(welcome(9), NOW);
    expect(preview.status).toBe('WELCOME');
    for (const key of plusFeatures()) expect(previewOnly(key, preview), key).toBe(true);
    for (const key of freeFeatures()) expect(previewOnly(key, preview), key).toBe(false);
    // the bill of rights is never tagged: nothing in it was ever lent by the preview
    for (const key of billOfRights()) expect(previewOnly(key, preview), key).toBe(false);
  });

  it('never tags on a paid plan, a store trial, a billing retry or the free plan', () => {
    for (const status of EVERY_STATUS.filter(s => s !== 'WELCOME')) {
      for (const key of ALL) expect(previewOnly(key, { status }), `${status} ${key}`).toBe(false);
    }
    // and the day the preview ends it is the free plan, whose locks say it instead
    expect(previewOnly('fullPlan', planSnapshot(welcome(-1), NOW))).toBe(false);
  });

  it('draws no free window during the preview: NibbleCue counts nothing on the free plan', () => {
    const preview = planSnapshot(welcome(9), NOW);
    // the whole history is free in NibbleCue (FEATURES.history), so there is no window to draw
    expect(previewLimit('history', preview)).toBeNull();
    expect(limitFor('history', 'FREE')).toBeNull();
    expect(FEATURES.history.limit).toBeUndefined();
    expect(previewLimit('fullPlan', preview)).toBeNull();
    expect(previewLimit('history', { status: 'ACTIVE' })).toBeNull();
  });
});
