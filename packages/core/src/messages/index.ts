/**
 * IN-APP MESSAGES — which one card, if any, a parent sees (docs/IN_APP_MESSAGES.md).
 *
 * > **The rule that governs all of it:** a parent who opens the app at 3 a.m. to log a bottle
 * > must never have to dismiss something first. No interstitials, no full-screen takeovers, no
 * > modal that blocks the FAB or the Quick row, ever — however important marketing thinks the
 * > message is.
 *
 * So the restraint is a pure function and not a component. `pick` takes every message the server
 * was willing to hand this user, plus what this device remembers, and returns AT MOST ONE — or
 * none, which is the answer most of the time and has to be as easy to reach as any other.
 *
 * WHY THE CAPS ARE COUNTED HERE AND NOT ON THE SERVER. The server decides who is ELIGIBLE (§4's
 * audience, evaluated where a client cannot see the other audiences); the device decides whether
 * this parent has already been spoken to today. That split is deliberate: the count has to work
 * with no network, because the card is drawn from the local mirror on a plane, and a cap that
 * only holds online is not a cap.
 *
 * `INCIDENT` is the one kind outside the caps — "sync is degraded, your log is on the phone and
 * safe" is the message a parent most needs on the day it is true, and a daily cap that swallowed
 * it would be the cap protecting the team rather than the parent.
 *
 * NOTHING HERE READS THE BABY. A tip is suppressed by whether the PARENT has done the thing the
 * tip teaches — started a timer, opened the stash — never by what the baby did. §4's line is the
 * boundary: tracking pumping at all is a legitimate audience; how much was pumped is not.
 */

export const MESSAGE_KINDS = ['INCIDENT', 'UPDATE', 'FEATURE', 'ANNOUNCEMENT', 'TIP'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

/** §1's table. Lower wins, and the highest-ranked eligible message is the only one drawn. */
export const KIND_RANK: Record<MessageKind, number> = {
  INCIDENT: 1,
  UPDATE: 2,
  FEATURE: 3,
  ANNOUNCEMENT: 4,
  TIP: 5,
};

export const DISMISSAL_ACTIONS = ['DISMISSED', 'ACTED', 'LATER'] as const;
export type DismissalAction = (typeof DISMISSAL_ACTIONS)[number];

/** One row of `app_messages`, as a device holds it. Timestamps are epoch ms, canonical. */
export interface AppMessage {
  id: string;
  kind: MessageKind;
  title: string;
  body: string;
  ctaLabel: string | null;
  /** An in-app route, or the literal `store`. Never a free URL — see `ctaTarget`. */
  ctaRoute: string | null;
  startsAtMs: number;
  endsAtMs: number | null;
  /** Null means a draft, which the server never serves and this function never shows. */
  publishedAtMs: number | null;
  /**
   * `TIP` only: the thing the tip teaches, as one of the app's own behavior keys. A tip whose
   * behavior has already happened is not a tip, it is a lecture.
   */
  teaches?: string | null;
}

/** What this device remembers about one message. `appVersion` is local-only; see `pick`. */
export interface MessageDismissal {
  messageId: string;
  action: DismissalAction;
  atMs: number;
  /** The version installed when a `LATER` was recorded, so "or the next version" can be read. */
  appVersion?: string | null;
}

/** An impression this device drew. Device-local: there is no server table, and §3 is per user. */
export interface MessageImpression {
  messageId: string;
  kind: MessageKind;
  atMs: number;
}

export interface MessageState {
  dismissals: readonly MessageDismissal[];
  impressions: readonly MessageImpression[];
  /** The build the parent is running, for an `UPDATE`'s "or on the next version". */
  appVersion: string;
  /** 1 on the very first run. §2: a tip never appears in the first session. */
  sessionCount: number;
  /** Behavior keys this household has already performed, for `teaches`. */
  done: readonly string[];
  /** Message ids already drawn in THIS session, so a tip is at most one per session. */
  shownThisSession: readonly string[];
}

const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** §3's numbers, exported so a test asserts the document rather than a literal. */
export const MESSAGE_RULES = {
  /** At most one message a day and three a week, per user. `INCIDENT` is outside both. */
  perDay: 1,
  perWeek: 3,
  /** A `TIP` on top of the above: one per session, three a week, never in the first session. */
  tipPerWeek: 3,
  tipFirstSession: 1,
  /** `Later` on an update notice re-shows after this long, or on a new version, whichever first. */
  laterDays: 7,
} as const;

/**
 * Is this a target the app is allowed to open?
 *
 * The client half of the database's own check constraint, and it is deliberately a SECOND
 * enforcement rather than a convenience: an arbitrary link inside a system-authored card is a
 * phishing surface, and a store that finds an external payment link rejects the build. Two
 * independent refusals mean a row that somehow got past the constraint still cannot be tapped.
 *
 * `store` is the platform's own listing, opened by the platform. Everything else must look like
 * one of the app's routes and is resolved by the app's own link table, which fails closed on a
 * name it does not know.
 */
export function ctaTarget(route: string | null | undefined): 'store' | 'route' | null {
  if (typeof route !== 'string') return null;
  const value = route.trim();
  if (value === 'store') return 'store';
  // the schema's own pattern: a lowercase route-looking name, no scheme, no host, no dots
  return /^[a-z][a-z0-9_/:-]{0,60}$/.test(value) ? 'route' : null;
}

/** Published, inside its window, and not a draft. Nothing else is a candidate. */
export function isLive(message: AppMessage, nowMs: number): boolean {
  if (message.publishedAtMs === null) return false;
  if (message.startsAtMs > nowMs) return false;
  return message.endsAtMs === null || message.endsAtMs > nowMs;
}

/**
 * Has this user finished with this message?
 *
 * `DISMISSED` and `ACTED` are final — §3: "a dismissed message never returns for that user, on
 * any device". `LATER` is the one deferral and only an `UPDATE` may offer it: it comes back after
 * seven days, or as soon as the parent is running a different build, whichever happens first,
 * because a "version 1.4 is available" card that a parent has already satisfied by updating is
 * worse than no card.
 */
function settled(message: AppMessage, state: MessageState, nowMs: number): boolean {
  const record = state.dismissals.find(d => d.messageId === message.id);
  if (record === undefined) return false;
  if (record.action !== 'LATER') return true;
  if (nowMs - record.atMs >= MESSAGE_RULES.laterDays * DAY) return false;
  const then = record.appVersion ?? null;
  return then === null || then === state.appVersion;
}

/** Impressions of capped kinds inside a window. `INCIDENT` is not counted and not capped. */
function capped(state: MessageState, sinceMs: number, nowMs: number): number {
  return state.impressions.filter(i => i.kind !== 'INCIDENT' && i.atMs > sinceMs && i.atMs <= nowMs)
    .length;
}

/** Why nothing is being shown — for the sync inspector, and for a test that has to say which rule. */
export type Quiet =
  | 'none-live'
  | 'all-settled'
  | 'daily-cap'
  | 'weekly-cap'
  | 'tip-first-session'
  | 'tip-this-session'
  | 'tip-weekly-cap'
  | 'tip-already-done';

export interface MessageChoice {
  message: AppMessage | null;
  /** Set when `message` is null: the rule that kept the slot empty. */
  quiet: Quiet | null;
}

/**
 * THE ONE CARD, or none.
 *
 * Order of business, and the order matters: live first (a stale card is worse than no card),
 * then this user's own history, then the caps, then rank. A tip that fails its own extra rules
 * does not block a lower-ranked... there is nothing lower than a tip, so it simply drops out.
 *
 * Ties inside a kind go to the message that started most recently: two announcements live at
 * once is the team's mistake, and the newer one is the one they meant.
 */
export function pick(
  messages: readonly AppMessage[],
  state: MessageState,
  nowMs: number,
): MessageChoice {
  const live = messages.filter(m => isLive(m, nowMs));
  if (live.length === 0) return { message: null, quiet: 'none-live' };

  const open = live.filter(m => !settled(m, state, nowMs));
  if (open.length === 0) return { message: null, quiet: 'all-settled' };

  const ordered = [...open].sort(
    (a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || b.startsAtMs - a.startsAtMs,
  );

  // An incident is outside every cap, so it is answered before any counting happens.
  const incident = ordered.find(m => m.kind === 'INCIDENT');
  if (incident !== undefined) return { message: incident, quiet: null };

  if (capped(state, nowMs - DAY, nowMs) >= MESSAGE_RULES.perDay) {
    return { message: null, quiet: 'daily-cap' };
  }
  if (capped(state, nowMs - WEEK, nowMs) >= MESSAGE_RULES.perWeek) {
    return { message: null, quiet: 'weekly-cap' };
  }

  let tipQuiet: Quiet | null = null;
  for (const message of ordered) {
    if (message.kind !== 'TIP') return { message, quiet: null };
    const why = tipBlocked(message, state, nowMs);
    if (why === null) return { message, quiet: null };
    // remember the FIRST reason a tip was refused: later tips usually fail the same way, and the
    // first one is the one the team would want explained
    tipQuiet ??= why;
  }
  return { message: null, quiet: tipQuiet ?? 'all-settled' };
}

/** §2's extra restraint on tips, or null when this tip may be drawn. */
function tipBlocked(message: AppMessage, state: MessageState, nowMs: number): Quiet | null {
  if (state.sessionCount <= MESSAGE_RULES.tipFirstSession) return 'tip-first-session';
  if (state.shownThisSession.length > 0) return 'tip-this-session';
  const teaches = message.teaches ?? null;
  if (teaches !== null && state.done.includes(teaches)) return 'tip-already-done';
  const tipsThisWeek = state.impressions.filter(
    i => i.kind === 'TIP' && i.atMs > nowMs - WEEK,
  ).length;
  return tipsThisWeek >= MESSAGE_RULES.tipPerWeek ? 'tip-weekly-cap' : null;
}

/**
 * Everything the team has posted to this user, newest first, with its read state — the
 * **What's new** archive (§2). Dismissal is not deletion: a parent who swiped a card away at
 * 3 a.m. and wondered afterwards what it said must be able to find out.
 *
 * A message whose window has closed STAYS here. It is gone from the slot because it is stale as
 * an announcement, not because it never happened.
 */
export interface ArchiveEntry {
  message: AppMessage;
  read: boolean;
  action: DismissalAction | null;
  atMs: number | null;
}

export function archive(
  messages: readonly AppMessage[],
  state: MessageState,
  nowMs: number,
): ArchiveEntry[] {
  const seen = new Set(state.impressions.map(i => i.messageId));
  return messages
    .filter(m => m.publishedAtMs !== null && m.startsAtMs <= nowMs)
    .sort((a, b) => b.startsAtMs - a.startsAtMs)
    .map(message => {
      const record = state.dismissals.find(d => d.messageId === message.id);
      return {
        message,
        read: seen.has(message.id) || record !== undefined,
        action: record?.action ?? null,
        atMs: record?.atMs ?? null,
      };
    });
}

/** How many unread entries the bell should carry. Zero shows no badge at all. */
export function unreadCount(entries: readonly ArchiveEntry[]): number {
  return entries.filter(e => !e.read).length;
}
