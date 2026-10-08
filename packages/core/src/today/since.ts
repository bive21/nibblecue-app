/**
 * Elapsed labels (docs/plans/WP5.md D5, D6; PRODUCT_SPEC.md §3.3, §3.4, Addendum C.2).
 *
 * One function, used by the QUICK tiles, the LAST grid and the Care strip, so those three
 * can never disagree about how long ago something was. Labels are computed at render, never
 * stored: a stored "2h 42m" is wrong one minute later, and a parent reading a stale number
 * at 3 a.m. is exactly the failure this app exists to avoid.
 *
 * Bath reads in days and everything else in elapsed time, which is a real distinction and
 * not a formatting preference — "yesterday" is how people talk about baths, and "31h 12m"
 * is how nobody talks about them. They are two functions rather than one with a flag,
 * because the flag would get passed wrong exactly once and nobody would notice.
 */
const MIN = 60_000;
const HOUR = 3_600_000;

/** Nothing has been logged for this module yet. */
export const NOT_LOGGED = 'not logged';
/** A timer for this module is running right now; elapsed is shown on the NOW card instead. */
export const RUNNING = 'running';
/** Under a minute ago. One word, because a tile's line is about ten characters wide. */
export const JUST_NOW = 'Now';

/**
 * `Now` · `14m` · `2h 42m` · `31h` · `3d`.
 *
 * Minutes are dropped past a day because "31h 12m ago" reads as precision nobody asked for,
 * and days are used past 48 hours for the same reason. A negative interval — a clock that
 * moved backwards, or an entry backdated into the future by a second — reads `Now` rather
 * than a negative number. `Now` and not `just now` because the Quick tiles read
 * `Now · 4 oz` in a column that fits about ten characters (the owner, 2026-09-15).
 */
export function sinceLabel(fromMs: number | null | undefined, nowMs: number): string {
  if (fromMs == null) return NOT_LOGGED;
  const ms = nowMs - fromMs;
  if (ms < MIN) return JUST_NOW;
  if (ms < HOUR) return `${Math.floor(ms / MIN)}m`;
  if (ms < 24 * HOUR) {
    const h = Math.floor(ms / HOUR);
    const m = Math.floor((ms % HOUR) / MIN);
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  if (ms < 48 * HOUR) return `${Math.floor(ms / HOUR)}h`;
  return `${Math.floor(ms / (24 * HOUR))}d`;
}

/**
 * `12m` · `5h 12m` · `1d 4h` · `3d` — how long since something, down to the minute inside a day
 * and to the hour past one: the lone Bath card's "since the last bath" (the owner, 2026-09-28:
 * "show the math it's been xx day/hours/minute since Chiara's last bath").
 *
 * NOT `sinceLabel`, which says `31h` and `3d`: that one fits a tile's ten characters, and this one
 * has a card's width to say `1d 7h`. Never `Now` and never under `1m`: the line reads "1m since the
 * last bath", and a bath saved this minute is the card's other line ("Today at 8:49 AM").
 */
export function sinceSpan(fromMs: number, nowMs: number): string {
  const ms = Math.max(MIN, nowMs - fromMs);
  const DAY = 24 * HOUR;
  const days = Math.floor(ms / DAY);
  if (days > 0) {
    const h = Math.floor((ms % DAY) / HOUR);
    return h === 0 ? `${days}d` : `${days}d ${h}h`;
  }
  const h = Math.floor(ms / HOUR);
  const m = Math.floor((ms % HOUR) / MIN);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * `13h 14m` → `13h`, wherever it appears: `nothing in 13h 14m` → `nothing in 13h`. What a Quick
 * tile gives up first when its line will not fit (packages/ui quickLine.ts).
 *
 * TWO-DIGIT HOURS ONLY (the owner, 2026-09-15: "1h is too broad"). Under ten hours the minutes
 * are the whole point — `3h 56m` since the last feed is not `3h` — so a tile that cannot hold
 * the line gives up its detail instead. Past ten the minutes are precision nobody acts on,
 * which is why `sinceLabel` already drops them past a day.
 */
export const compactSince = (text: string): string => text.replace(/(\d{2,}h) \d+m\b/g, '$1');

/**
 * `running` → `Running`. The first character of a line a parent reads, wherever that line stands
 * ON ITS OWN (the owner, 2026-09-19, of a Quick tile's status: "when it is running it says
 * 'running' in lowercase, this does not feel professional").
 *
 * IT IS A DISPLAY HELPER AND NOT A REWRITE OF THE WORDS. Most of these words are also joined
 * INTO a line — a tile reads `9h · missed` and `Now · 4 oz`, where the elapsed starts the line
 * and the state word is mid-sentence — so the constants stay lowercase, and the case is decided
 * at the point the line is drawn. Capitalizing the constants instead would put a capital in the
 * middle of every joined line, which is the same defect the other way round.
 *
 * SENTENCE CASE, NEVER TITLE CASE (CLAUDE.md §6): the first character and nothing else. It is a
 * no-op on a line that already begins with a digit (`14h 27m · due now`), a capital (`Vitamin D ·
 * missed`) or nothing at all, so a caller never has to ask whether its line qualifies.
 *
 * `Array.from` rather than `charAt(0)`, because a string that begins with an astral character
 * has a two-unit first character and `s[0].toUpperCase() + s.slice(1)` would split it in half.
 */
export function firstUpper(s: string): string {
  const [first, ...rest] = Array.from(s);
  return first === undefined ? s : first.toUpperCase() + rest.join('');
}

/**
 * A duration, for a thing that has already finished: `45m`, `1h 35m`.
 * Distinct from `sinceLabel` because a zero-length nap is `0m`, not `just now`.
 */
export function durationLabel(ms: number): string {
  const safe = Math.max(0, ms);
  const h = Math.floor(safe / HOUR);
  const m = Math.round((safe % HOUR) / MIN);
  // rounding can carry: 59m30s is 1h, not "0h 60m"
  if (m === 60) return `${h + 1}h`;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * `4h 00m` — hours and two-digit minutes, always both: the Schedule's countdown past the hour
 * (`durationShort` in the app's `screens/schedule/rows.ts`). It came from the nudge module, which
 * is gone (2026-09-18; its code went 2026-09-26).
 */
export function hoursMinutes(ms: number): string {
  const total = Math.max(0, Math.round(ms / MIN));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * A two-sided feed in whole minutes that ADD UP: `15 min · L 8 / R 7`, never `15 min · L 8 / R 8`
 * (the feeding sweep, 2026-09-24). Rounding each side and the total on its own disagreed in about
 * one two-sided feed in four — 7m 30s a side read "L 8 / R 8" under a total of 15, and 7m 24s a
 * side read "L 7 / R 7". So the total is the rounded sum, each side keeps its whole minutes, and a
 * minute left over goes to the side with the larger remainder (a tie to the side with more time,
 * then the left). The seconds stay exact in the record; only the words round.
 */
export function sideMinutes(
  leftSeconds: number,
  rightSeconds: number,
): { total: number; left: number; right: number } {
  const l = Math.max(0, leftSeconds);
  const r = Math.max(0, rightSeconds);
  const total = Math.round((l + r) / 60);
  let left = Math.floor(l / 60);
  let right = Math.floor(r / 60);
  // floor(a) + floor(b) ≤ round(a + b) ≤ floor(a) + floor(b) + 2, so 0, 1 or 2 minutes to place
  let spare = total - left - right;
  const leftFirst = l % 60 > r % 60 || (l % 60 === r % 60 && l >= r);
  for (const side of leftFirst ? (['left', 'right'] as const) : (['right', 'left'] as const)) {
    if (spare <= 0) break;
    if (side === 'left') left += 1;
    else right += 1;
    spare -= 1;
  }
  return { total, left, right };
}

/** A running timer, counting up: `1:04:12`, or `4:09` under an hour. */
export function clockLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p2 = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p2(m)}:${p2(s)}` : `${m}:${p2(s)}`;
}

/**
 * `sinceLabel` with its suffix: `Now` · `14m ago` · `2h 42m ago`. One place, because
 * "Now ago" is exactly the sentence a template of `${since} ago` produces at 08:00:30,
 * and the acceptance test for the first bottle of the day is what found it.
 */
export function agoLabel(fromMs: number | null | undefined, nowMs: number): string {
  const since = sinceLabel(fromMs, nowMs);
  return since === JUST_NOW || since === NOT_LOGGED ? since : `${since} ago`;
}
