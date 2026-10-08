/**
 * WHICH TIP A MOMENT EARNS, if any — the one rule behind the contextual tips, pure so it is
 * answered in node rather than by eye on a phone (docs/TOUR_SCRIPT.md §D).
 *
 * A tip speaks when ALL of these hold, and it is the conjunction that keeps tips from being the
 * interruption they replace:
 *
 *   1. the tour comes first, and it is over: finished, skipped or declined. Day one is the tour and
 *      nothing else, and a household that never had a tour (an update, not a first run) is never
 *      ambushed: `mainDone` is false until the tour has ended once or the parent asks for tips in
 *      Help. And `mainDone` is only as good as the read behind it (the owner, 2026-10-01, on a
 *      brand new account: *"right after onboarding, the tip for my profile showed up before the
 *      show me the tour. tour takes precedent as first thing to do"*): `tour` says whether the
 *      tour's own state has been read for the account signed in now, and whether the tour is about
 *      to be put up (`TipTour`, `tipTourOf`). Before that read no tip speaks, whatever the app still
 *      holds from the account before; while the ask, the card that asks whether to continue or the
 *      tour itself is due, none does either;
 *   2. nothing else is up — no guide running, no ask card, no sheet over the page;
 *   3. the quiet after the last guide has passed, so a tip does not land on the confetti;
 *   4. this tip has not been seen, and its module is on — and where one moment answers two tips,
 *      the first of them not yet seen, so each visit teaches one thing (the guides audit,
 *      2026-09-26). Arriving on More answered two — Family, then your account — until Family's
 *      tip went to Today on 2026-09-27 with the row behind your initial, and the account tip went
 *      altogether later that day (one tip about your initial, not two); no moment answers two
 *      today, and the rule stays for the next one that does (`decision.test.ts` walks a pair);
 *   5. it is the daytime on the phone's clock, 8 a.m. to 9 p.m. (`isDaytimeHour`, the trial
 *      sheets' hours; 2026-09-28). A parent opening the app at 3 a.m. came to log a bottle, not to
 *      be taught where the name at the top leads, and a tip is one more thing between them and the
 *      tile.
 *
 * The event is the app's own report — a tab arrival or a live fact about Today — and each guide
 * names the one it answers to. The clock only ever HOLDS a tip, never starts one: nothing here
 * speaks because of the time. A tip whose moment comes at night is not marked seen, so it speaks the
 * next time that moment comes in the daytime.
 *
 * THREE TIPS ARE LEFT SINCE 2026-09-28, when the owner decided every tip, and two of them answer an
 * event: your initial the first arrival on Today once the tour is over, the babies a second baby on
 * Today. The third, the last real one, follows a finished tour and answers none. A page pushed over
 * the tabs (`page:<Name>`) answers nothing any more: the two tips that stood on one, the Activity
 * log's and the day wheel's, went that day (*"this is already is onboard initial tour"*,
 * *"unnecessary"*), and so did every tab tip but Today's.
 */
import type { ModuleId } from '../modules/module-registry';
import { isDaytimeHour } from '../today/daytime';
import type { TourArmed } from './opening';
import { GUIDES, type TipGuideId, type TourGuide } from './steps';

/** How long after any guide ends before a tip may speak. Long enough for the confetti to fall. */
export const TIP_QUIET_MS = 6_000;

/**
 * WHERE THE TOUR STANDS, AS A TIP SEES IT (rule 1; the owner, 2026-10-01).
 *
 *   `unread`  the tour's written-down state has not been read for the account signed in now: the
 *             app has just opened, the account's household has just been set up, or another
 *             account was signed in a moment ago and what the app holds of tips is still theirs;
 *   `owed`    it has been read, and the tour is about to be put up: the ask after setup, the card
 *             that asks whether to continue, or the tour Help just asked for (`tourArmed`'s
 *             `offer`, `ask` and `run`). It comes first, and it holds every tip until it has ended
 *             and been read again;
 *   `clear`   it has been read, and nothing about the tour is due: it ended, it waits in Help, or
 *             this household never had one. A tip goes by its own rules.
 *
 * WHY A READ AND NOT A FLAG. The provider is mounted once for the life of the app and reads the
 * tour's state from storage, several round trips before the ask goes up, while Today reports its
 * arrival the moment it mounts. A switch that only says "the tour has ended" cannot tell "not yet
 * read" from "read, and never ended", and on the owner's phone it was not even this account's.
 */
export type TipTour = 'unread' | 'owed' | 'clear';

/** What the provider last read of the tour: for which account, and what `tourArmed` made of it. */
export interface TourRead {
  uid: string;
  armed: TourArmed;
}

/** `tourArmed`'s answers that put the tour on the screen now. */
const PUTS_UP: ReadonlySet<TourArmed> = new Set<TourArmed>(['offer', 'ask', 'run']);

/**
 * The tips' view of the last read (`TipTour`). No read, a read for another account, or nobody
 * signed in is `unread`: what was read for somebody else says nothing about this account's tour.
 */
export function tipTourOf(read: TourRead | null, uid: string | null): TipTour {
  if (read === null || uid === null || read.uid !== uid) return 'unread';
  return PUTS_UP.has(read.armed) ? 'owed' : 'clear';
}

export interface TipContext {
  /** Where the tour stands for the account signed in now: only `clear` lets a tip speak (rule 1). */
  tour: TipTour;
  /** The tour has ended at least once (or tips were asked for in Help). */
  mainDone: boolean;
  /** A guide, the ask card or a sheet is up. */
  busy: boolean;
  seen: ReadonlySet<string> | readonly string[];
  enabled: ReadonlySet<ModuleId> | readonly ModuleId[];
  nowMs: number;
  /** The instant the quiet after the last guide ends; `0` when there was none. */
  quietUntilMs: number;
  /** The phone's local hour, 0 to 23: a tip waits for the daytime (rule 5). */
  hour: number;
}

const has = <T>(set: ReadonlySet<T> | readonly T[], v: T): boolean =>
  set instanceof Set ? set.has(v) : (set as readonly T[]).includes(v);

/**
 * The guides whose trigger this event is, in Help's order: `tab:Today` → your initial;
 * `children:many` → the babies. `tab:More` answers none since 2026-09-27, when the second tip about
 * your initial went; `care:visible` none since 2026-09-28, when the Baby care tip went; and since
 * later that day, when the owner decided every tip, no other tab, no page and no other fact about
 * Today answers one either (`tab:Stash`, `page:Routine`, `alert:tile`, `log:more` among them).
 * `guides` is the app's own list; a test hands in another to walk a moment that answers two.
 */
export function guidesForEvent(event: string, guides: readonly TourGuide[] = GUIDES): TourGuide[] {
  if (event.startsWith('tab:')) {
    const tab = event.slice('tab:'.length);
    return guides.filter(g => g.trigger.kind === 'tab' && g.trigger.tab === tab);
  }
  // an `after` guide answers to no event: the provider starts it itself when the tour ends
  return guides.filter(g => g.trigger.kind === 'event' && g.trigger.event === event);
}

/** The tip to start on this event, or null when the moment does not earn one. */
export function tipFor(
  event: string,
  ctx: TipContext,
  guides: readonly TourGuide[] = GUIDES,
): TipGuideId | null {
  if (ctx.tour !== 'clear' || !ctx.mainDone || ctx.busy) return null;
  if (ctx.nowMs < ctx.quietUntilMs) return null;
  if (!isDaytimeHour(ctx.hour)) return null;
  // the first this household has not seen, of the ones this event answers
  const guide = guidesForEvent(event, guides).find(
    g => !has(ctx.seen, g.id) && (g.needs === undefined || has(ctx.enabled, g.needs)),
  );
  return guide?.id ?? null;
}

/** The seen set with one more guide in it. */
export function markSeen(seen: readonly string[], ...more: readonly string[]): string[] {
  const out = new Set(seen);
  for (const id of more) out.add(id);
  return [...out];
}

/** The seen set, read back from what was written down. Anything unreadable is nothing seen. */
export function parseSeen(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
