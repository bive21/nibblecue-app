/**
 * Best use by, and the storage guidance limit (docs/MILK_STASH.md §5; TESTING.md §2.7).
 *
 * The profile is an ARGUMENT, never an import of a particular version: a new guidance file
 * changes no code here. Two dates always come back as two separate values — a freezer's
 * best use (~6 months) and its guidance limit (~12 months) are different numbers, and the
 * brief (00-BRIEF.md rule 2) says both are always visible. The anchor is the profile's own
 * `anchors` map: fridge and room milk age from when it was pumped, frozen milk from when it
 * FIRST froze (write-once, so a freezer-to-freezer move never re-ages it), thawed milk from
 * when it thawed — wherever in a fridge it now sits (`milkCondition`). A frozen container with
 * no freeze date gets `null` and a reason code, never a date guessed from `pumped_at`.
 *
 * Nothing here decides anything about milk: it adds published minutes to a timestamp the
 * household recorded, and names which timestamp. The vocabulary test in guidance.test.ts
 * holds every string in this folder to `display.neverSay`.
 */
import type { MilkGuidanceProfile } from '../guidance';
import { localDayBounds, shiftDay } from '../today/day';
import {
  BEST_USE_CRIT_DAYS,
  BEST_USE_WARN_DAYS,
  isFrozenKind,
  type MilkStorageKind,
} from './constants';

export type AnchorField = 'pumped_at' | 'first_frozen_at' | 'thawed_at';
export type MissingAnchor = 'MISSING_FREEZE_DATE' | 'MISSING_THAW_DATE';

/** The three timestamps a container carries that a window can hang from. */
export interface ContainerAnchors {
  pumped_at: string;
  first_frozen_at: string | null;
  thawed_at: string | null;
}

export interface GuidanceDates {
  /** The condition the dates were read under: the location's, or THAWED (`milkCondition`). */
  kind: MilkStorageKind;
  anchorField: AnchorField;
  /** UTC ms, or null when the anchor the profile names is not on the container. */
  anchorAt: number | null;
  bestUseAt: number | null;
  limitAt: number | null;
  missing: MissingAnchor | null;
  bestUseMinutes: number;
  limitMinutes: number;
  /** Echoed for attribution: every date is shown beside the profile it came from. */
  profile: string;
  version: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const ANCHOR_FIELDS: readonly AnchorField[] = ['pumped_at', 'first_frozen_at', 'thawed_at'];

/** The profile's anchor for a condition, validated rather than trusted (a JSON file is data). */
function anchorFieldFor(profile: MilkGuidanceProfile, kind: MilkStorageKind): AnchorField {
  const field = (profile.anchors as Record<string, string>)[kind];
  if (!ANCHOR_FIELDS.includes(field as AnchorField)) {
    throw new RangeError(
      `guidance ${profile.profile} ${profile.version} names no anchor for ${kind}`,
    );
  }
  return field as AnchorField;
}

export interface ConditionWindows {
  label: string;
  detail: string;
  bestUseMinutes: number;
  limitMinutes: number;
}

/** A condition's label, detail and two windows, straight from the profile. */
export function conditionWindows(
  profile: MilkGuidanceProfile,
  kind: MilkStorageKind,
): ConditionWindows {
  const c = (profile.conditions as Record<string, ConditionJson | undefined>)[kind];
  if (c === undefined) {
    throw new RangeError(`guidance ${profile.profile} ${profile.version} has no condition ${kind}`);
  }
  return {
    label: c.label,
    detail: c.detail,
    bestUseMinutes: c.bestUseMinutes,
    limitMinutes: c.guidanceLimitMinutes,
  };
}

interface ConditionJson {
  label: string;
  detail: string;
  bestUseMinutes: number;
  guidanceLimitMinutes: number;
}

const parseIso = (iso: string | null): number | null => {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
};

/**
 * THE CONDITION A CONTAINER IS DATED BY: its location's, with one exception (the stash sweep of
 * 2026-09-24, finding 7). Milk that has been thawed and sits in a plain fridge is in the file's
 * own THAWED condition — "Thawed, in refrigerator", anchored on `thawed_at` — and not in FRIDGE,
 * whose anchor is `pumped_at`.
 *
 * A thawing bag moved on to the plain fridge keeps `thawed_at` and becomes STORED (MILK_STASH.md
 * §2, acceptance test 12.5) — and since 2026-09-25 a frozen bag moved straight to the fridge gets
 * `thawed_at` from the move itself (12.7), so both paths arrive here. It used to be dated as
 * FRIDGE. So a bag pumped in August and
 * thawed this morning read "Past window" and was no longer offered, and a bag pumped on Monday,
 * frozen, and thawed on Tuesday read four days from Monday where the published file gives thawed
 * milk 24 hours. Wrong in both directions, because it was the place's clock on milk that no
 * longer keeps it.
 *
 * Only the fridge. The file has no condition for thawed milk at room temperature and this is not
 * where one gets invented (CLAUDE.md rule 5): a thawed bag on the counter stays ROOM, dated from
 * the pump, which for milk that was ever frozen is already past — the cautious reading. A freezer
 * keeps its freeze date: the clock belongs to the milk (`moveContainer`'s refreeze).
 */
export function milkCondition(
  locationKind: MilkStorageKind,
  thawedAt: string | null,
): MilkStorageKind {
  return locationKind === 'FRIDGE' && thawedAt !== null ? 'THAWED' : locationKind;
}

/** A container's two dates where it sits, under the condition `milkCondition` gives it. */
export function guidanceDates(
  profile: MilkGuidanceProfile,
  locationKind: MilkStorageKind,
  container: ContainerAnchors,
): GuidanceDates {
  const kind = milkCondition(locationKind, container.thawed_at);
  const anchorField = anchorFieldFor(profile, kind);
  const windows = conditionWindows(profile, kind);
  const anchorAt = parseIso(container[anchorField]);
  const missing: MissingAnchor | null =
    anchorAt !== null
      ? null
      : anchorField === 'first_frozen_at'
        ? 'MISSING_FREEZE_DATE'
        : anchorField === 'thawed_at'
          ? 'MISSING_THAW_DATE'
          : null;
  return {
    kind,
    anchorField,
    anchorAt,
    bestUseAt: anchorAt === null ? null : anchorAt + windows.bestUseMinutes * MINUTE,
    limitAt: anchorAt === null ? null : anchorAt + windows.limitMinutes * MINUTE,
    missing,
    bestUseMinutes: windows.bestUseMinutes,
    limitMinutes: windows.limitMinutes,
    profile: profile.profile,
    version: profile.version,
  };
}

/**
 * `best_use_at::date - today::date` in the household's zone (MILK_STASH.md §11c): a date on
 * the far side of midnight is "1 day", however few hours away it is, because that is how a
 * parent reads a calendar.
 */
export function calendarDaysUntil(atMs: number, nowMs: number, timeZone: string): number {
  const today = localDayBounds(timeZone, nowMs).startMs;
  const target = localDayBounds(timeZone, atMs).startMs;
  // count local day starts rather than dividing by 24h: a DST day is 23 or 25 hours long
  let days = Math.round((target - today) / (24 * HOUR));
  // re-anchor through the zone in case the rounding crossed a DST edge
  const check = shiftDay(timeZone, nowMs, days).startMs;
  if (check !== target) days += Math.sign(target - check);
  return days;
}

export type BadgeTone = 'crit' | 'warn';

export interface BestUseBadge {
  label: string;
  tone: BadgeTone;
}

/**
 * The row badge (§6g): `past best use`, hours when under a day, then `3d` / `24d` with a tone.
 * The row's right column carries the date itself either way. Neutral by construction: the words
 * come from §13's "always" column.
 *
 * ── THE BANDS ARE A SHARE OF THE CONDITION'S OWN WINDOW, and that is a fix ───────────────────
 *
 * They used to be two absolute numbers — seven days critical, thirty days warn — which are the
 * FREEZER's proportions wearing no label. A refrigerator's whole window is four days. Every
 * fridge container was therefore inside "seven days of its best use" from the second it was
 * stored, so it was painted critical, in the same red as milk that is genuinely past its date,
 * on the day it was pumped. The owner, 2026-09-18: *"why is it showing as past best use? is
 * this a bug or miscalculation?"* — it was a miscalculation, and this is it.
 *
 * `windowMinutes` is the kind's own best-use window, from the profile. With it, the bands are
 * the LATER of the absolute number and the share, which leaves the freezer exactly as it was
 * (a quarter of six months is 46 days, so seven still wins) and gives the fridge and the thawed
 * bag proportions that mean something (a quarter of four days is one).
 *
 * It is OPTIONAL so that a caller without a profile still gets the old behavior rather than no
 * badge at all — a container whose guidance file is missing is a different problem, and the
 * badge is not where it should be reported.
 */
const CRIT_SHARE = 0.25;
const WARN_SHARE = 0.5;

export function bestUseBadge(
  bestUseAt: number | null,
  nowMs: number,
  timeZone: string,
  windowMinutes?: number,
): BestUseBadge | null {
  if (bestUseAt === null) return null;
  const ms = bestUseAt - nowMs;
  if (ms < 0) return { label: 'past best use', tone: 'crit' };
  if (ms < 24 * HOUR) return { label: `${Math.max(1, Math.ceil(ms / HOUR))}h`, tone: 'crit' };
  const window =
    windowMinutes !== undefined && windowMinutes > 0 ? windowMinutes / (60 * 24) : null;
  const crit =
    window === null ? BEST_USE_CRIT_DAYS : Math.min(BEST_USE_CRIT_DAYS, window * CRIT_SHARE);
  const warn =
    window === null ? BEST_USE_WARN_DAYS : Math.min(BEST_USE_WARN_DAYS, window * WARN_SHARE);
  const days = calendarDaysUntil(bestUseAt, nowMs, timeZone);
  if (days <= crit) return { label: `${days}d`, tone: 'crit' };
  if (days <= warn) return { label: `${days}d`, tone: 'warn' };
  return null;
}

/** Which of the two list bands a container falls in: frozen milk is read in days, the rest in hours. */
export function useSoonHorizonMs(
  kind: MilkStorageKind,
  frozenDays: number,
  freshHours: number,
): number {
  return isFrozenKind(kind) ? frozenDays * 24 * HOUR : freshHours * HOUR;
}
