/**
 * The typed, PII-free analytics emitter (docs/ACCOUNTS.md §8, docs/MOBILE.md §12). Props are
 * an allow-list per event; unknown keys are stripped at runtime and a key that names a
 * person — email, name, child, birth date, an invite code or token — is never emitted even if
 * a caller passes it. First-party and aggregate only: there is no analytics SDK, and NOTHING
 * fires on the auth screens (CLAUDE.md §7; Privacy §2) — `auth/measured.ts` has the rules,
 * `AuthContext` the gate, and `screens/auth/noAnalytics.scan.test.ts` holds both.
 */

export const EVENT_PROPS = {
  /*
    THE SIGN-UP, COUNTED AFTER THE AUTH SCREENS (2026-09-27). It was two events fired on AUTH —
    `signup_started` on the tap, `signup_completed` with how long it took — and both measured the
    sign-in screen, which the app never does. `signup_started` is gone: it can only be measured
    there. `signup_completed` is emitted by the first page after them for a new account (setup's
    first page, or the join page for an invite code), once per account on a phone
    (`OnboardingScreen`), and says only which page that was: `setup` or `invite`.
  */
  signup_completed: ['entry'],
  onboarding_step_completed: ['step', 'role_choice', 'back_count', 'ms_bucket'],
  // `heard_from` is a key from core's closed HEARD_FROM_OPTIONS list, absent when unanswered —
  // an acquisition source for the funnel in aggregate, never a name, a clinic or a URL
  household_created: [
    'module_count',
    'child_count',
    'has_due_date',
    'tz_offset_bucket',
    'heard_from',
  ],
  child_added: ['source', 'child_count_after', 'has_due_date'],
  invite_accepted: ['role', 'channel', 'attempts'],
  signed_out: ['scope', 'queued_ops_bucket'],
  app_open: ['cold', 'theme', 'locale'],
  error_shown: ['screen', 'error_class', 'retryable'],
  // WP4: the capture path and the queue. Every one of these is an enum, a count bucket or a
  // boolean — `docs/MOBILE.md` §12's rule is that props may never carry a note, a food, a
  // medicine, an amount, a volume or a child's name, and the allow-list is how that is kept.
  activity_logged: ['module', 'source', 'taps', 'backdated', 'backdate_bucket'],
  activity_edited: ['module', 'age_bucket', 'undo'],
  activity_deleted: ['module', 'age_bucket', 'undo'],
  timer_started: ['type', 'source', 'duration_bucket'],
  timer_stopped: ['type', 'source', 'duration_bucket'],
  duplicate_suppressed: ['module', 'layer', 'source'],
  offline_write_queued: ['entity', 'queue_depth_bucket'],
  widget_tap: ['widget', 'action'],
  // The pull's one event. It fires when an applied server row overwrote a row this device had
  // changed and had nothing queued to restore — last-writer-wins resolving against this phone.
  // Both props are enums of table and strategy names, so the event says WHICH RULE resolved a
  // conflict and never what the entry was.
  sync_conflict_resolved: ['table', 'strategy'],
  // The queue, as three events that carry no queue. `docs/MOBILE.md` §12 lists `sync_flush`
  // with a raw `ops`; it is a BUCKET here and the doc is corrected in the change report, because
  // a queue depth is a household's behavior — "47 ops at 03:14" says a night, and a run of them
  // says a routine. `error_class` is the worker's own `stoppedBecause`, an enum of five words,
  // never a server message. `sync_health` is the periodic version of the same three numbers,
  // emitted once per foreground so a rising queue is visible in aggregate without ever being
  // visible per household.
  sync_flush: ['ops_bucket', 'duration_ms_bucket', 'result', 'error_class'],
  sync_health: ['queue_depth_bucket', 'oldest_pending_bucket', 'failed_bucket'],
  // THE FIRST-RUN TOUR AND ITS TIPS (docs/TOUR_SCRIPT.md §C). Every prop is an id from a closed
  // list in core (`guide`, `step`), a small card index, or one of a handful of words (`source`:
  // setup | help | resume | tip; `via`: action | next | missing; `outcome`: finished | skipped |
  // closed | declined | dismissed). Nothing about what was logged during the tour travels here.
  tour_started: ['guide', 'source'],
  tour_step_shown: ['guide', 'step', 'index'],
  tour_step_done: ['guide', 'step', 'via'],
  tour_ended: ['guide', 'outcome', 'step'],
  tips_reset: [],
  /*
    NOTHING ABOUT BUYING (the owner, 2026-09-28: "server count"). Five events said which gate a
    parent opened, how a trial-end sheet was answered and where a purchase started; they reached no
    sink and are gone. Who bought, and after which preview, is counted on the server from the
    store's own records (RevenueCat's webhooks, `subscription_events`; docs/PRICING.md §7), so
    nothing about it is collected from a phone. `index.test.ts` keeps them out.
  */
} as const;

export type AnalyticsEvent = keyof typeof EVENT_PROPS;

/** A key that could carry a person: stripped whatever the event (SECURITY.md §5 lint list). */
export const BANNED_KEY =
  /(email|name|child_name|birth|dob|code|token|password|phone|address|note)/i;

export interface AnalyticsRecord {
  event: AnalyticsEvent;
  props: Record<string, string | number | boolean>;
  at: string;
}

export type AnalyticsSink = (record: AnalyticsRecord) => void;

const isScalar = (v: unknown): v is string | number | boolean =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

/** Keep only the allowed, scalar, non-identifying keys; coerce the booleans the docs insist on. */
export function sanitize(
  event: AnalyticsEvent,
  props: Record<string, unknown>,
): AnalyticsRecord['props'] {
  const allowed = EVENT_PROPS[event] as readonly string[];
  const out: AnalyticsRecord['props'] = {};
  for (const key of allowed) {
    if (BANNED_KEY.test(key) && key !== 'child_count' && key !== 'child_count_after') continue;
    const v = props[key];
    if (v === undefined || v === null) continue;
    if (
      key === 'has_due_date' ||
      key === 'cold' ||
      key === 'retryable' ||
      key === 'backdated' ||
      key === 'undo'
    ) {
      out[key] = Boolean(v);
      continue;
    }
    if (isScalar(v)) out[key] = v;
  }
  return out;
}

export function createAnalytics(sink: AnalyticsSink, now: () => number = Date.now) {
  return {
    emit<E extends AnalyticsEvent>(event: E, props: Record<string, unknown> = {}): AnalyticsRecord {
      const record: AnalyticsRecord = {
        event,
        props: sanitize(event, props),
        at: new Date(now()).toISOString(),
      };
      sink(record);
      return record;
    },
  };
}
export type Analytics = ReturnType<typeof createAnalytics>;

/**
 * A SINK THAT PASSES A RECORD ON ONLY WHILE `open()` SAYS SO — the gate `AuthContext` keeps on the
 * app's one emitter, shut while a sign-in screen is in front (`auth/measured.ts` `analyticsOpen`).
 * Asked at the moment of each record, so a phase that changes between two events is honored.
 */
export function gatedSink(sink: AnalyticsSink, open: () => boolean): AnalyticsSink {
  return record => {
    if (open()) sink(record);
  };
}

/** An emitter that sends nothing: what a sign-out started on a sign-in screen is handed. */
export const quietAnalytics = (): Analytics => createAnalytics(() => undefined);

/* ---- the buckets: never a raw duration, count or offset ---- */
export const msBucket = (ms: number): string =>
  ms < 5_000
    ? '<5s'
    : ms < 30_000
      ? '5-30s'
      : ms < 120_000
        ? '30s-2m'
        : ms < 600_000
          ? '2-10m'
          : '>10m';
export const countBucket = (n: number): string =>
  n === 0 ? '0' : n <= 3 ? '1-3' : n <= 10 ? '4-10' : '>10';
/**
 * How far back an entry was backdated. Buckets, never the offset: "3h 12m earlier" plus a
 * timestamp is a schedule, and a schedule is a household's routine.
 */
export const backdateBucket = (ms: number): string =>
  ms <= 0
    ? '0'
    : ms <= 900_000
      ? '15m'
      : ms <= 1_800_000
        ? '30m'
        : ms <= 3_600_000
          ? '1h'
          : 'custom';
/** A timer's length, in the five bands `docs/MOBILE.md` §12 names. */
export const durationBucket = (ms: number): string =>
  ms < 300_000
    ? '<5m'
    : ms < 1_200_000
      ? '5-20m'
      : ms < 3_600_000
        ? '20-60m'
        : ms < 10_800_000
          ? '1-3h'
          : '>3h';
/** How old the entry being edited or deleted is. */
export const ageBucket = (ms: number): string =>
  ms < 3_600_000 ? '<1h' : ms < 86_400_000 ? '<1d' : 'older';
/** Whole hours from UTC; a bucket of time, never a place. */
export const tzOffsetBucket = (offsetMinutes: number): string =>
  `${Math.round(offsetMinutes / 60)}h`;
