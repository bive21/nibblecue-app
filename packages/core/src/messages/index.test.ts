/**
 * The restraint, not the rendering (docs/IN_APP_MESSAGES.md §7).
 *
 * Every acceptance criterion in §7 that a pure function can answer is here, and the ones that
 * matter most are the negatives: a draft that must never render, a dismissal that must never
 * come back, and a tip that must stay quiet in a parent's first session.
 */
import { describe, expect, it } from 'vitest';
import {
  archive,
  ctaTarget,
  isLive,
  KIND_RANK,
  MESSAGE_KINDS,
  MESSAGE_RULES,
  pick,
  unreadCount,
  type AppMessage,
  type MessageState,
} from './index';

const NOW = Date.UTC(2026, 8, 23, 12, 0);
const DAY = 86_400_000;

const message = (over: Partial<AppMessage> & { id: string }): AppMessage => ({
  kind: 'ANNOUNCEMENT',
  title: 'Something happened',
  body: 'One or two lines about it.',
  ctaLabel: null,
  ctaRoute: null,
  startsAtMs: NOW - DAY,
  endsAtMs: null,
  publishedAtMs: NOW - DAY,
  ...over,
});

const state = (over: Partial<MessageState> = {}): MessageState => ({
  dismissals: [],
  impressions: [],
  appVersion: '1.3.0',
  sessionCount: 12,
  done: [],
  shownThisSession: [],
  ...over,
});

describe('the ranks', () => {
  it('are §1 exactly, with an incident first and a tip last', () => {
    expect(MESSAGE_KINDS).toEqual(['INCIDENT', 'UPDATE', 'FEATURE', 'ANNOUNCEMENT', 'TIP']);
    expect(Object.values(KIND_RANK)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('what may be shown at all', () => {
  it('never shows a draft', () => {
    const draft = message({ id: 'a', publishedAtMs: null });
    expect(isLive(draft, NOW)).toBe(false);
    expect(pick([draft], state(), NOW)).toEqual({ message: null, quiet: 'none-live' });
  });

  it('never shows one that has not started, or one that has ended', () => {
    const early = message({ id: 'a', startsAtMs: NOW + DAY });
    const over = message({ id: 'b', endsAtMs: NOW - 1 });
    expect(pick([early, over], state(), NOW).message).toBeNull();
  });

  it('shows the highest-ranked live message', () => {
    const chosen = pick(
      [
        message({ id: 'tip', kind: 'TIP' }),
        message({ id: 'feature', kind: 'FEATURE' }),
        message({ id: 'update', kind: 'UPDATE' }),
      ],
      state(),
      NOW,
    );
    expect(chosen.message?.id).toBe('update');
  });

  it('breaks a tie inside a kind with the newer one', () => {
    const chosen = pick(
      [
        message({ id: 'older', startsAtMs: NOW - 5 * DAY }),
        message({ id: 'newer', startsAtMs: NOW - DAY }),
      ],
      state(),
      NOW,
    );
    expect(chosen.message?.id).toBe('newer');
  });
});

describe('a dismissal', () => {
  it('is final, and the card does not come back', () => {
    const m = message({ id: 'a' });
    const after = state({ dismissals: [{ messageId: 'a', action: 'DISMISSED', atMs: NOW - DAY }] });
    expect(pick([m], after, NOW)).toEqual({ message: null, quiet: 'all-settled' });
  });

  it('is final after the action too — a tapped card has been dealt with', () => {
    const m = message({ id: 'a', kind: 'FEATURE', ctaRoute: 'stash', ctaLabel: 'Open' });
    const after = state({ dismissals: [{ messageId: 'a', action: 'ACTED', atMs: NOW - DAY }] });
    expect(pick([m], after, NOW).message).toBeNull();
  });
});

describe('Later, on an update notice', () => {
  const update = message({ id: 'u', kind: 'UPDATE' });

  it('holds the card for seven days', () => {
    const later = state({
      dismissals: [{ messageId: 'u', action: 'LATER', atMs: NOW - DAY, appVersion: '1.3.0' }],
    });
    expect(pick([update], later, NOW).message).toBeNull();
  });

  it('brings it back once the seven days are up', () => {
    const at = NOW - (MESSAGE_RULES.laterDays * DAY + 1);
    const later = state({
      dismissals: [{ messageId: 'u', action: 'LATER', atMs: at, appVersion: '1.3.0' }],
    });
    expect(pick([update], later, NOW).message?.id).toBe('u');
  });

  it('brings it back sooner on a different build, which is the point of an update notice', () => {
    const later = state({
      appVersion: '1.4.0',
      dismissals: [{ messageId: 'u', action: 'LATER', atMs: NOW - DAY, appVersion: '1.3.0' }],
    });
    expect(pick([update], later, NOW).message?.id).toBe('u');
  });
});

describe('the caps', () => {
  const impression = (atMs: number) => ({ messageId: 'x', kind: 'FEATURE' as const, atMs });

  it('allow one message a day', () => {
    const today = state({ impressions: [impression(NOW - 3600_000)] });
    expect(pick([message({ id: 'a' })], today, NOW)).toEqual({
      message: null,
      quiet: 'daily-cap',
    });
  });

  it('allow three a week', () => {
    const week = state({
      impressions: [
        impression(NOW - 2 * DAY),
        impression(NOW - 4 * DAY),
        impression(NOW - 6 * DAY),
      ],
    });
    expect(pick([message({ id: 'a' })], week, NOW)).toEqual({ message: null, quiet: 'weekly-cap' });
  });

  it('let a message through once the week has rolled off', () => {
    const old = state({
      impressions: [
        impression(NOW - 8 * DAY),
        impression(NOW - 9 * DAY),
        impression(NOW - 10 * DAY),
      ],
    });
    expect(pick([message({ id: 'a' })], old, NOW).message?.id).toBe('a');
  });

  it('never hold back an incident — the day it is true is the day it matters', () => {
    const full = state({
      impressions: [
        impression(NOW - 3600_000),
        impression(NOW - 2 * DAY),
        impression(NOW - 3 * DAY),
      ],
    });
    const chosen = pick([message({ id: 'i', kind: 'INCIDENT' })], full, NOW);
    expect(chosen.message?.id).toBe('i');
  });

  it('do not count an incident against the next message either', () => {
    const afterIncident = state({
      impressions: [{ messageId: 'i', kind: 'INCIDENT', atMs: NOW - 3600_000 }],
    });
    expect(pick([message({ id: 'a' })], afterIncident, NOW).message?.id).toBe('a');
  });
});

describe('a tip', () => {
  const tip = message({ id: 't', kind: 'TIP', teaches: 'timer.started' });

  it('stays quiet in the first session — a new parent is learning by using it', () => {
    expect(pick([tip], state({ sessionCount: 1 }), NOW)).toEqual({
      message: null,
      quiet: 'tip-first-session',
    });
  });

  it('is at most one per session', () => {
    const shown = state({ shownThisSession: ['other'] });
    expect(pick([tip], shown, NOW).quiet).toBe('tip-this-session');
  });

  it('is suppressed once the parent has done the thing it teaches', () => {
    const done = state({ done: ['timer.started'] });
    expect(pick([tip], done, NOW).quiet).toBe('tip-already-done');
  });

  it('is capped at three a week of its own', () => {
    const many = state({
      impressions: [
        { messageId: 'a', kind: 'TIP', atMs: NOW - DAY },
        { messageId: 'b', kind: 'TIP', atMs: NOW - 2 * DAY },
        { messageId: 'c', kind: 'TIP', atMs: NOW - 3 * DAY },
      ],
    });
    // the weekly cap answers first, which is the stricter and therefore the right one
    expect(pick([tip], many, NOW).message).toBeNull();
  });

  it('is shown when every one of its rules is satisfied', () => {
    expect(pick([tip], state(), NOW).message?.id).toBe('t');
  });
});

describe('the call to action', () => {
  it('accepts the store and an in-app route', () => {
    expect(ctaTarget('store')).toBe('store');
    expect(ctaTarget('stash')).toBe('route');
    expect(ctaTarget('more/reminders')).toBe('route');
  });

  it('refuses anything that could leave the app', () => {
    for (const bad of [
      'https://example.com',
      'http://other.example',
      'javascript:alert(1)',
      'mailto:a@b.c',
      '//evil.example',
      'Store',
      'exam ple',
      '../../etc/passwd',
      '',
      null,
      undefined,
    ]) {
      expect(ctaTarget(bad), String(bad)).toBeNull();
    }
  });
});

describe('the What’s new archive', () => {
  const posted = [
    message({ id: 'a', startsAtMs: NOW - 3 * DAY }),
    message({ id: 'b', startsAtMs: NOW - DAY, endsAtMs: NOW - 1 }),
    message({ id: 'draft', publishedAtMs: null }),
  ];

  it('keeps a message whose window has closed, and drops a draft', () => {
    const entries = archive(posted, state(), NOW);
    expect(entries.map(e => e.message.id)).toEqual(['b', 'a']);
  });

  it('still carries one the parent dismissed — dismissal is not deletion', () => {
    const after = state({ dismissals: [{ messageId: 'a', action: 'DISMISSED', atMs: NOW }] });
    const entry = archive(posted, after, NOW).find(e => e.message.id === 'a');
    expect(entry).toMatchObject({ read: true, action: 'DISMISSED' });
  });

  it('counts what has neither been seen nor dealt with', () => {
    const seen = state({ impressions: [{ messageId: 'b', kind: 'ANNOUNCEMENT', atMs: NOW }] });
    expect(unreadCount(archive(posted, seen, NOW))).toBe(1);
  });
});
