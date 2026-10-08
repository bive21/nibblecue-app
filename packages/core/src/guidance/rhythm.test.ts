import { describe, expect, it } from 'vitest';
import { GOAL_MINUTES_MAX, PLAYTIME_GOAL_CHOICES } from '../today/goal';
import {
  ageInDays,
  bandFor,
  bathSuggestion,
  diaperSuggestion,
  feedingSuggestion,
  guidanceSourceLine,
  playtimeGoalMinutes,
  pumpSuggestion,
  RHYTHM_GUIDANCE,
  RhythmGuidance,
  sourceOf,
  supplementsFor,
  tummyGoalMinutes,
  tummyGoalSuggestion,
} from './rhythm';

const EVERY = [90, 120, 150, 180, 210, 240];
const DAYS = [1, 2, 3, 7];
const DAY = 86_400_000;

/**
 * THE FILE IS THE GUIDANCE. These hold the properties that make a preselected number a quote
 * rather than an opinion: it carries the sentence it came from, it names the publisher that
 * said it, and the app suggests nothing where the source says nothing (CLAUDE.md §2 rule 5).
 */
describe('every published rhythm is quoted, and names its own publisher', () => {
  const rhythms = ['feeding', 'pump', 'diaper', 'bath', 'tummy', 'playtime'] as const;

  it('resolves every sourceId to a real publication with a URL', () => {
    for (const r of rhythms) {
      const src = sourceOf(RHYTHM_GUIDANCE[r].sourceId);
      expect(src, r).not.toBeNull();
      expect(src?.url, r).toMatch(/^https:\/\//);
    }
    for (const s of RHYTHM_GUIDANCE.supplements.items) {
      expect(sourceOf(s.sourceId), s.id).not.toBeNull();
    }
  });

  /**
   * TWO PUBLISHERS, ON PURPOSE. Feeding, pumping and vitamin D are the CDC's; bathing, tummy time
   * and diapers are the AAP's. A screen showing both has to name both, so the source is per
   * rhythm and never per file.
   */
  it('draws on the CDC and the AAP, and keeps them apart', () => {
    expect(sourceOf(RHYTHM_GUIDANCE.feeding.sourceId)?.name).toContain('CDC');
    expect(sourceOf(RHYTHM_GUIDANCE.pump.sourceId)?.name).toContain('CDC');
    expect(sourceOf(RHYTHM_GUIDANCE.bath.sourceId)?.name).toContain('AAP');
    expect(sourceOf(RHYTHM_GUIDANCE.tummy.sourceId)?.name).toContain('AAP');
    expect(sourceOf(RHYTHM_GUIDANCE.diaper.sourceId)?.name).toContain('AAP');
  });

  it('keeps each suggestion inside the range its own quote states', () => {
    for (const b of RHYTHM_GUIDANCE.feeding.bands) {
      expect(b.suggestEveryMinutes / 60, b.id).toBeGreaterThanOrEqual(b.everyHoursLow);
      expect(b.suggestEveryMinutes / 60, b.id).toBeLessThanOrEqual(b.everyHoursHigh);
    }
    const d = RHYTHM_GUIDANCE.diaper;
    expect(d.suggestEveryMinutes / 60).toBeGreaterThanOrEqual(d.everyHoursLow);
    expect(d.suggestEveryMinutes / 60).toBeLessThanOrEqual(d.everyHoursHigh);
    const t = RHYTHM_GUIDANCE.tummy;
    expect(t.suggestTimesADay).toBeGreaterThanOrEqual(t.timesLow);
    expect(t.suggestTimesADay).toBeLessThanOrEqual(t.timesHigh);
    // the daily goal is DERIVED, and the derivation is re-done here: low goes × low minutes,
    // from the same sentence — never a number typed from memory of another page
    expect(t.goal.suggestMinutes).toBe(t.timesLow * t.goal.minutesLowPerGo);
    expect(t.quote).toContain(`${t.goal.minutesLowPerGo}-${t.goal.minutesHighPerGo} minutes`);
    // bathing is published per WEEK and the app's unit is whole days: 2 days is 3.5 a week,
    // 3 days is 2.3, so 2 is the chip nearest the published three
    expect(7 / RHYTHM_GUIDANCE.bath.suggestEveryDays).toBeCloseTo(3.5, 1);
  });

  it('names every source it used in the line the screen shows', () => {
    const line = guidanceSourceLine(['cdc_breastfeeding', 'aap_bathing', 'cdc_breastfeeding']);
    expect(line).toContain('CDC');
    expect(line).toContain('AAP');
    expect(line).toContain(RHYTHM_GUIDANCE.retrievedOn);
    // a duplicate publisher is named once
    expect(line.match(/CDC/g)).toHaveLength(1);
    expect(guidanceSourceLine([])).toBe('');
  });

  it('dates a source read on another day by its own day, and a shared day once', () => {
    const who = RHYTHM_GUIDANCE.sources[RHYTHM_GUIDANCE.playtime.sourceId];
    expect(who?.retrievedOn).toBe('2026-09-26');
    expect(guidanceSourceLine(['who_activity_under_5'])).toBe(
      `${who?.name} · retrieved 2026-09-26`,
    );
    const mixed = guidanceSourceLine(['aap_tummy', 'who_activity_under_5']);
    expect(mixed).toContain(`retrieved ${RHYTHM_GUIDANCE.retrievedOn}`);
    expect(mixed).toContain('retrieved 2026-09-26');
  });
});

/**
 * PLAYTIME'S GOAL IS THE WHO'S MINIMUM (the owner, 2026-09-26: "understood, then goals need to be
 * increased if anything to 3 hours a day (user still can change) based on the WHO report"). Held
 * the way the tummy-time goal is: the source resolves, the sentence carries the number, and the
 * arithmetic is re-done so the value cannot drift from the quote beside it.
 */
describe('playtime’s daily goal', () => {
  const p = RHYTHM_GUIDANCE.playtime;

  it('names the WHO’s 2019 guidelines for children under five, with its URL', () => {
    const src = sourceOf(p.sourceId);
    expect(src?.name).toContain('WHO');
    expect(src?.name).toContain('physical activity');
    expect(src?.url).toBe('https://www.who.int/publications/i/item/9789241550536');
  });

  it('is the published daily minimum, whole, and the quote says so', () => {
    expect(p.goal.suggestMinutes).toBe(p.goal.minutesLow);
    expect(p.quote).toContain(`at least ${p.goal.minutesLow} minutes`);
    // a minimum and no maximum: "more is better" is in the sentence, and the app sets no cap of
    // its own below the setting's bound
    expect(p.quote).toContain('more is better');
    expect(playtimeGoalMinutes()).toBe(180);
    expect(playtimeGoalMinutes()).toBeLessThanOrEqual(GOAL_MINUTES_MAX);
    // and it lands on a chip of playtime's own ladder, so the seeded goal is one a parent can see
    expect(PLAYTIME_GOAL_CHOICES).toContain(playtimeGoalMinutes());
  });

  it('belongs to tummy time’s second life, never to tummy time itself', () => {
    expect(p.modules).toEqual(['tummy']);
    expect(p.variant).toBe('playtime');
    // tummy time's own goal is untouched by it
    expect(tummyGoalMinutes()).toBe(RHYTHM_GUIDANCE.tummy.goal.suggestMinutes);
  });

  it('refuses a file whose playtime goal is not the published minimum', () => {
    const broken = structuredClone(RHYTHM_GUIDANCE) as unknown as {
      playtime: { goal: { suggestMinutes: number } };
    };
    broken.playtime.goal.suggestMinutes = 120;
    expect(() => RhythmGuidance.parse(broken)).toThrow();
  });
});

describe('feeding, by the band the baby is in', () => {
  it('puts a newborn in the first band and a seven-month-old in the second', () => {
    expect(bandFor(0)?.id).toBe('newborn');
    expect(bandFor(182)?.id).toBe('newborn');
    expect(bandFor(183)?.id).toBe('older_infant');
    expect(bandFor(365)?.id).toBe('older_infant');
  });

  it('opens on the published interval where the app has that chip', () => {
    expect(feedingSuggestion(14, EVERY)).toBe(180);
    expect(feedingSuggestion(200, EVERY)).toBe(240);
  });

  /**
   * PAST THE LAST BAND THE ANSWER IS NOTHING. Neither CDC page states a feeding frequency for a
   * toddler, so the app states none — a two-year-old is not "the 6-to-12-month rhythm, stretched".
   */
  it('has no band past twelve months, and therefore no suggestion', () => {
    expect(bandFor(366)).toBeNull();
    expect(feedingSuggestion(366, EVERY)).toBeNull();
    expect(feedingSuggestion(900, EVERY)).toBeNull();
  });

  it('clamps to a chip at or below the published value, never above it', () => {
    expect(feedingSuggestion(14, [90, 120])).toBe(120);
    expect(feedingSuggestion(200, [90, 120])).toBe(120);
    expect(feedingSuggestion(14, [])).toBeNull();
  });

  it('counts age in whole days, and never negative', () => {
    const born = Date.parse('2026-06-01T00:00:00.000Z');
    expect(ageInDays(born, born)).toBe(0);
    expect(ageInDays(born, born + 10 * DAY + 3_600_000)).toBe(10);
    expect(ageInDays(born, born - DAY)).toBe(0);
  });
});

/**
 * PUMPING FOLLOWS FEEDING because that is what the CDC publishes — a rule, not an interval:
 * "try to pump as often as your baby is drinking breast milk". Copying the rule is quoting it.
 */
describe('pumping follows feeding, including into silence', () => {
  it('matches the feeding suggestion at every age', () => {
    for (const days of [0, 14, 182, 183, 300, 365]) {
      expect(pumpSuggestion(days, EVERY), `${days}`).toBe(feedingSuggestion(days, EVERY));
    }
  });

  it('offers nothing where feeding offers nothing', () => {
    expect(pumpSuggestion(366, EVERY)).toBeNull();
  });

  it('is published as a rule rather than a number', () => {
    expect(RHYTHM_GUIDANCE.pump.followsFeeding).toBe(true);
    expect(RHYTHM_GUIDANCE.pump.quote).toContain('as often as your baby');
    expect(Object.keys(RHYTHM_GUIDANCE.pump)).not.toContain('suggestEveryMinutes');
  });
});

describe('the rhythms that do not vary by age', () => {
  it('opens diapers on the low end of the published three-to-four hours', () => {
    expect(diaperSuggestion(EVERY)).toBe(180);
    expect(diaperSuggestion([90, 120])).toBe(120);
  });

  it('opens bath on every other day, the chip nearest three a week', () => {
    expect(bathSuggestion(DAYS)).toBe(2);
    expect(bathSuggestion([3, 7])).toBe(3);
  });

  it('quotes tummy time as two to three goes a day, which the daily goal below is built from', () => {
    // the row opened on a count per day until 2026-09-19; it is a daily goal in minutes now, and
    // the count-per-day opener (`tummySuggestion`) went on 2026-09-27
    expect(RHYTHM_GUIDANCE.tummy.quote).toContain('2 to 3 times each day');
  });

  it('opens the tummy-time GOAL on the chip at or below two goes of three minutes', () => {
    // 2 × 3 = 6 minutes a day; the chips are round numbers, and the one at or below is 5
    expect(tummyGoalSuggestion([5, 10, 15, 20, 30, 45, 60])).toBe(5);
    expect(tummyGoalSuggestion([6, 10])).toBe(6);
    // with every chip above it, the SMALLEST chip — the same landing every other rhythm makes,
    // so a row whose source has a number never opens blank; the chip is still the least claim
    // the row can make, and the badge beside it names where the number came from
    expect(tummyGoalSuggestion([10, 15])).toBe(10);
  });
});

describe('the supplement offer follows the source, not the app', () => {
  it('offers the CDC vitamin D line to a household that named breast milk', () => {
    const got = supplementsFor(['breast']);
    expect(got.map(s => s.id)).toEqual(['vitamin_d']);
    expect(got[0]?.timesADay).toBe(1);
    expect(got[0]?.quote).toContain('400 IU');
  });

  it('offers it to a pumping household too: the source is about the milk, not the method', () => {
    expect(supplementsFor(['pumping']).map(s => s.id)).toEqual(['vitamin_d']);
    expect(supplementsFor(['breast', 'bottles']).map(s => s.id)).toEqual(['vitamin_d']);
  });

  /**
   * SILENCE IS NOT CONSENT TO AN OFFER. A household that answered bottles only, or nothing at
   * all, is offered nothing: the CDC sentence is about babies fed breast milk, and an empty list
   * is the right answer to a question nobody asked.
   */
  it('offers nothing to a formula-only household, or to one that said nothing', () => {
    expect(supplementsFor(['bottles'])).toEqual([]);
    expect(supplementsFor(['solids'])).toEqual([]);
    expect(supplementsFor([])).toEqual([]);
  });

  /**
   * THE FREQUENCY IS PUBLISHED; THE AMOUNT NEVER LEAVES THE FILE.
   *
   * `quote` is the record — the CDC's sentence verbatim, "400 IU" and all, so the file can be
   * checked against the source. `note` is what a screen may render, and it carries the cadence
   * only. CLAUDE.md §2 rule 4 admits no disclaimer, and a dose figure beside an Add button reads
   * as an instruction however carefully it is attributed.
   */
  it('carries no amount field for the app to prefill', () => {
    for (const s of RHYTHM_GUIDANCE.supplements.items) {
      expect(Object.keys(s)).not.toContain('amount');
      expect(Object.keys(s)).not.toContain('usualAmount');
      expect(s.quote).not.toMatch(/\bgive your baby\b/i);
    }
  });

  it('keeps every amount out of the renderable note, quote or not', () => {
    for (const s of RHYTHM_GUIDANCE.supplements.items) {
      expect(s.note, s.id).not.toMatch(/\d+\s?(iu|mg|mcg|ml|g)\b/i);
      expect(s.note.length).toBeGreaterThan(0);
    }
  });

  /**
   * THE GUARD IS IN THE SCHEMA, NOT ONLY IN THIS TEST. A later edit to the guidance file that
   * put "400 IU" into a note would fail to parse — the file is read through Zod at import, so
   * the failure is at build, on every surface, not on a phone.
   */
  it('refuses to parse a guidance file whose note carries an amount', () => {
    const broken = structuredClone(RHYTHM_GUIDANCE) as unknown as {
      supplements: { items: { note: string }[] };
    };
    const first = broken.supplements.items[0];
    expect(first).toBeDefined();
    first!.note = 'Give 400 IU of vitamin D every day.';
    expect(() => RhythmGuidance.parse(broken)).toThrow();
  });
});
