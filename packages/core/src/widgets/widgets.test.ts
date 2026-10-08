import { describe, expect, it } from 'vitest';
import { BANNED } from '../schedule/foresight.banned';
import { countLabel, shortAge, WIDGET_COPY } from './copy';
import { applyPrivacy } from './privacy';
import {
  emptySnapshot,
  blankSnapshot,
  WIDGET_SYMBOL,
  WITHHELD,
  WITHHELD_CLOCK,
  type WidgetSnapshot,
} from './snapshot';
import { MODULE_BY_ID, type ModuleId } from '../modules/module-registry';
import { WIDGET_TIMELINE_MAX, widgetTimeline } from './timeline';

const NOW = Date.UTC(2026, 8, 21, 17, 0); // 1:00 PM in New York

const LINKS = {
  today: 'cuddlecue://today',
  schedule: 'cuddlecue://schedule',
  pump: 'cuddlecue://pump',
  stash: 'cuddlecue://stash',
  plan: 'cuddlecue://subscription',
};

function full(): WidgetSnapshot {
  return {
    ...emptySnapshot(NOW),
    blank: false,
    links: LINKS,
    child: { id: 'c1', name: 'Ada', ageLabel: '4 mo 12 d' },
    sleep: { asleep: false, sinceMs: NOW - 48 * 60_000, sinceClock: '12:12 PM' },
    lastFeed: { atMs: NOW - 162 * 60_000, clock: '10:18 AM', detail: '4.2 oz', amount: true },
    lastDiaper: { atMs: NOW - 30 * 60_000, clock: '12:30 PM', detail: 'Wet', amount: false },
    next: [
      {
        title: 'Bottle',
        clock: '1:28 PM',
        day: null,
        atMs: NOW + 28 * 60_000,
        module: 'bottle',
        childId: 'c1',
        due: false,
      },
      {
        title: 'Diaper',
        clock: '2:30 PM',
        day: null,
        atMs: NOW + 90 * 60_000,
        module: 'diaper',
        childId: 'c1',
        due: false,
      },
      {
        title: 'Vitamin D',
        clock: '6:00 PM',
        day: null,
        atMs: NOW + 300 * 60_000,
        module: 'med',
        childId: 'c1',
        due: false,
      },
    ],
    timer: {
      id: 't2',
      kind: 'breastfeed',
      startedAtMs: NOW - 6 * 60_000,
      label: 'Breastfeeding · Ada',
      word: 'Breastfeeding',
      paused: false,
      sideClock: null,
      stopLabel: 'Finish',
      childId: 'c1',
      sides: 'L 6:12 · R 0:00 · on left',
      stopUrl: 'cuddlecue://timer/breastfeed?action=stop&child=c1&op=x',
      startedClock: '12:54 PM',
    },
    totals: { feeds: 4, milkDisplay: '12.5 oz', diapers: 5, sleepDisplay: '3 h 40 m', solids: 1 },
    pump: {
      lastClock: '11:00 AM',
      lastAmount: '6.5 oz',
      nextClock: '2:00 PM',
      todayDisplay: '18.5 oz',
      sessions: 3,
      running: false,
    },
    stash: { totalDisplay: '92 oz', useFirst: '12 oz', containers: 9 },
    quick: [
      {
        module: 'diaper',
        label: 'Diaper',
        symbol: WIDGET_SYMBOL.diaper,
        url: 'cuddlecue://quick?module=diaper',
      },
    ],
    queued: 1,
  };
}

const amounts = /\d+(\.\d+)?\s?(oz|ml)/;

describe('privacy is applied to the data, not the view', () => {
  it('FULL changes nothing', () => {
    expect(applyPrivacy(full(), 'FULL')).toEqual(full());
  });

  it('LIMITED keeps every time and kind and withholds every amount', () => {
    const s = applyPrivacy(full(), 'LIMITED');
    expect(s.lastFeed?.clock).toBe('10:18 AM');
    expect(s.lastFeed?.detail).toBe(WITHHELD);
    expect(s.lastDiaper?.detail).toBe('Wet');
    expect(s.totals?.milkDisplay).toBe(WITHHELD);
    expect(s.totals?.diapers).toBe(5);
    expect(s.pump?.lastAmount).toBe(WITHHELD);
    expect(s.pump?.lastClock).toBe('11:00 AM');
    expect(s.stash?.totalDisplay).toBe(WITHHELD);
    expect(s.timer?.startedAtMs).toBe(full().timer?.startedAtMs);
    expect(JSON.stringify(s)).not.toMatch(amounts);
  });

  it('HIDDEN keeps the name, the counts, the next time and whether a timer runs — and nothing else', () => {
    const s = applyPrivacy(full(), 'HIDDEN');
    expect(s.child?.name).toBe('Ada');
    expect(s.totals?.diapers).toBe(5);
    expect(s.totals?.feeds).toBe(4);
    expect(s.totals?.milkDisplay).toBeNull();
    expect(s.totals?.sleepDisplay).toBeNull();
    expect(s.next[0]?.clock).toBe('1:28 PM');
    expect(s.lastFeed?.clock).toBe(WITHHELD_CLOCK);
    expect(s.lastFeed?.detail).toBeNull();
    expect(s.sleep?.sinceMs).toBeNull();
    // the same moments written as clocks, for Android's widgets, go with them
    expect(s.sleep?.sinceClock).toBeNull();
    // "Just the basics": only that a timer runs — no name, no clock, no Stop (the live timer handoff)
    expect(s.timer?.label).toBe(WIDGET_COPY.timerRunning);
    expect(s.timer?.word).toBe(WIDGET_COPY.timerRunning);
    expect(s.timer?.stopUrl).toBe('');
    expect(JSON.stringify(s.timer)).not.toContain('Ada');
    expect(s.timer?.startedAtMs).toBe(0);
    expect(s.timer?.startedClock).toBe(WITHHELD_CLOCK);
    expect(s.timer?.sides).toBeNull();
    expect(s.pump).toBeNull();
    expect(s.stash).toBeNull();
    const text = JSON.stringify(s);
    expect(text).not.toMatch(amounts);
    expect(text).not.toContain('10:18 AM');
    expect(text).not.toContain('12:12 PM');
    expect(text).not.toContain('12:54 PM');
  });
});

describe('without Plus, a widget is blank (the owner, 2026-10-07)', () => {
  it('carries no name, entry, time, amount, link or button', () => {
    const s = blankSnapshot(full());
    expect(s.blank).toBe(true);
    expect(s.child).toBeNull();
    expect(s.sleep).toBeNull();
    expect(s.lastFeed).toBeNull();
    expect(s.lastDiaper).toBeNull();
    expect(s.next).toEqual([]);
    expect(s.timer).toBeNull();
    expect(s.totals).toBeNull();
    expect(s.pump).toBeNull();
    expect(s.stash).toBeNull();
    expect(s.quick).toEqual([]);
    expect(Object.values(s.links).every(l => l === '')).toBe(true);
    const json = JSON.stringify(s);
    expect(json).not.toMatch(amounts);
    expect(json).not.toContain('Ada');
    expect(json).not.toContain('cuddlecue://');
  });

  it('stays blank under every privacy choice', () => {
    for (const mode of ['FULL', 'LIMITED', 'HIDDEN'] as const)
      expect(applyPrivacy(blankSnapshot(full()), mode)).toEqual(blankSnapshot(full()));
  });

  it('a blank snapshot is a timeline of one blank entry', () => {
    const t = widgetTimeline(blankSnapshot(full()), NOW);
    expect(t).toHaveLength(1);
    expect(t[0]?.props.blank).toBe(true);
  });
});

describe('a known end of Plus is written ahead as a blank entry', () => {
  const HOUR = 60 * 60_000;
  it('before the end: the ordinary entries, then a blank one at the end and nothing after', () => {
    const end = NOW + 90 * 60_000;
    const t = widgetTimeline(full(), NOW, end);
    const last = t[t.length - 1]!;
    expect(last.atMs).toBe(end);
    expect(last.props.blank).toBe(true);
    expect(t.slice(0, -1).every(e => !e.props.blank && e.atMs < end)).toBe(true);
    // the stale mark (two hours) is past the end: it is not written
    expect(t.some(e => e.props.stale)).toBe(false);
  });

  it('an end past the stale mark keeps the stale entry, then blanks', () => {
    const t = widgetTimeline(full(), NOW, NOW + 5 * HOUR);
    expect(t[t.length - 2]?.props.stale).toBe(true);
    expect(t[t.length - 1]?.props.blank).toBe(true);
    expect(t.length).toBeLessThanOrEqual(WIDGET_TIMELINE_MAX);
  });

  it('now == the end is past it: one blank entry; a moment before, the widget still shows', () => {
    expect(widgetTimeline(full(), NOW, NOW).map(e => e.props.blank)).toEqual([true]);
    expect(widgetTimeline(full(), NOW, NOW - 1).map(e => e.props.blank)).toEqual([true]);
    expect(widgetTimeline(full(), NOW, NOW + 1)[0]?.props.blank).toBe(false);
  });
});

describe('the timeline writes ahead what changes at a known moment', () => {
  it('starts now, flips each row to due at its time, and ends stale', () => {
    const t = widgetTimeline(full(), NOW);
    expect(t[0]?.atMs).toBe(NOW);
    expect(t[0]?.props.next.every(r => !r.due)).toBe(true);
    expect(t[1]?.atMs).toBe(NOW + 28 * 60_000);
    expect(t[1]?.props.next.map(r => r.due)).toEqual([true, false, false]);
    expect(t[2]?.props.next.map(r => r.due)).toEqual([true, true, false]);
    const last = t[t.length - 1];
    expect(last?.atMs).toBe(NOW + 2 * 60 * 60_000);
    expect(last?.props.stale).toBe(true);
    // 6 PM is past the stale mark: no entry for it, the stale entry carries its state
    expect(t).toHaveLength(4);
    expect(t.every((e, i) => i === 0 || e.atMs > (t[i - 1]?.atMs ?? 0))).toBe(true);
  });

  it('never exceeds the cap, and a row already past is due from the first entry', () => {
    const s = full();
    s.next = Array.from({ length: 20 }, (_, i) => ({
      ...s.next[0]!,
      atMs: NOW + (i - 1) * 5 * 60_000,
    }));
    const t = widgetTimeline(s, NOW);
    expect(t.length).toBeLessThanOrEqual(WIDGET_TIMELINE_MAX);
    expect(t[0]?.props.next[0]?.due).toBe(true);
    expect(t[0]?.props.next[1]?.due).toBe(true); // atMs === NOW
    expect(t[0]?.props.next[2]?.due).toBe(false);
  });

  it('is JSON: every entry survives a round trip unchanged', () => {
    for (const e of widgetTimeline(full(), NOW))
      expect(JSON.parse(JSON.stringify(e.props))).toEqual(e.props);
  });
});

describe('copy', () => {
  const strings: string[] = Object.values(WIDGET_COPY);

  it('never describes a problem or a state of the baby the app cannot see', () => {
    for (const s of strings) {
      const hit = BANNED.filter(w => s.toLowerCase().includes(w));
      expect(hit, `"${s}" says ${hit.join(', ')}`).toEqual([]);
    }
  });

  it('is sentence case and never names the product', () => {
    for (const s of strings) {
      expect(s).not.toMatch(/cuddle\s?cue/i);
      expect(s.slice(1)).toBe(s.slice(1).replace(/\b[A-Z][a-z]+ [A-Z]/g, m => m));
    }
  });

  it('short age reads as days, then months and days, then years', () => {
    expect(shortAge(0)).toBe('0 d');
    expect(shortAge(12)).toBe('12 d');
    expect(shortAge(134)).toBe('4 mo 12 d');
    expect(shortAge(365)).toBe('12 mo');
    expect(shortAge(800)).toBe('2 y 2 mo');
    expect(shortAge(-1)).toBe('');
  });

  it('count labels pluralise', () => {
    expect(countLabel(1, 'feeds')).toBe('1 feed');
    expect(countLabel(3, 'diapers')).toBe('3 diapers');
    expect(countLabel(0, 'solids')).toBe('0 solids');
  });

  it('every module, live or retired, has a symbol', () => {
    for (const id of Object.keys(MODULE_BY_ID) as ModuleId[])
      expect(WIDGET_SYMBOL[id]).toBeTruthy();
  });
});
