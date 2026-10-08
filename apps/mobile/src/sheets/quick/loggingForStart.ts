/**
 * WHERE THE LOGGING-FOR ROW STARTS (the owner, 2026-09-25; docs/MULTIPLES.md §2).
 *
 * Asked whether a breastfeed typed in on "Both" should start on one baby instead, the owner
 * answered: *"for module with multiple babies, I think so. Analyze in real life scenario what is
 * the better choice"*. The analysis, in short:
 *
 *   * A sheet that starts on Both invites a FALSE record — a feed, a diaper, a dose or a sleep
 *     written for a baby who did not have it. That is the worse mistake in a shared care log: the
 *     other parent reads "Liam was fed at 2:10" and may skip a feed that was due. For a breastfeed
 *     Both is sharper still: it means tandem, which splits the sides between the babies.
 *   * A sheet that starts on one baby invites a MISSING record, which the tiles show at once and
 *     one tap fixes. Twins on a shared routine often do things together, so the cost is one tap on
 *     Both for a simultaneous feed or change; nothing is ever written for a baby by default.
 *
 * So, in this order:
 *
 *   1. a sheet opened for a schedule slot starts on the SLOT's baby (`slotBinding.ts`) — the slot
 *      is Emma's feed whatever the top bar shows;
 *   2. a top bar on one baby starts on that baby, as it always has;
 *   3. a top bar on Both / All n starts ON BOTH wherever the module fans out (`startsOnAll`), and
 *      on the baby who is UP NEXT only for a medicine, a breastfeed and what cannot fan out.
 *
 * STEP 3 CHANGED ON 2026-09-30 (the owner, testing with twins on "Both at once": *"Logging for by
 * default should be for both if the both is on. Same if we want to start logging or timer for
 * sleeping"*). A parent who put the bar on Both said they are doing things for both; the analysis
 * above still holds for the one entry where a false record is dangerous rather than untidy — a
 * dose. A medicine written for the twin who did not have it can make the other parent skip that
 * twin's real one, so a medicine sheet still starts on the baby up next, with Both one tap away.
 *
 * AND SO DOES A BREASTFEED (the owner, the same day, having tried it: *"Breastfeed on single baby
 * still make more sense imo"*). On Both a breastfeed is a TANDEM, one baby on each breast, and a
 * tandem is the rarer feed: twins are mostly nursed one after the other. A sheet that opens on a
 * tandem nobody chose splits one baby's feed into two babies' sides, which is the false record
 * again, so the breastfeed sheet starts on the baby up next (the one fed longest ago, bottle or
 * breast) and the tandem is one tap on Both, where it always was.
 *
 * UP NEXT is the baby whose last entry of the module's group is the OLDEST: log Emma's feed, open
 * the sheet again, and it starts on Liam — the common sequential case in zero taps. The group is
 * the schedule's: a bottle and a breastfeed are one rhythm (`FEEDING`; either kind answers a
 * feeding slot, `feedEitherKind` in core), every other module is its own. A timer of the group
 * running now is the newest entry there is: Emma nursing makes Liam the one up next. (The Today
 * tiles do not read the group — each shows its own kind's last entry, on every line it draws (the
 * owner, 2026-09-25 and 2026-09-27) — but whose turn it is to be fed is a question about feeding,
 * not about bottles.)
 *
 * A BABY WITH NO ENTRY OF THE GROUP AT ALL IS NOT "UP NEXT". Among the babies that have one, the
 * oldest; ties, and a group nobody has logged, go to the first child in the household's order.
 * Counting "never" as the oldest reads well on a twin household's first day, and it is wrong
 * forever after in the households where a baby never has the thing at all: the toddler of a
 * newborn sibling who is never breastfed (MULTIPLES §8 — setup keeps a toddler beside a newborn),
 * or the twin who is not the one on reflux medicine, would be the one every sheet started on, and
 * a dose written for the wrong twin is precisely the false record this rule exists to prevent. The
 * price of reading it this way is one tap, once per module, on the day a second baby's first entry
 * of it is logged.
 *
 * Pure, so each case is a table test (`loggingForStart.test.ts`); `useLoggingFor` reads it once,
 * when the sheet mounts, from data read before the sheet was asked for (`recency.ts`).
 */
import { ActivityType, FEEDING, isFeeding, MODULE_BY_ID, type ModuleId } from '@nibblecue/core';
import { ALL } from './save';

/** A baby's last entry of one module's group: its start (ms), a timer running now, or none. */
export type GroupLast = number | 'running' | null;

/**
 * THE TYPES THE HOST READS AHEAD (`recency.ts`): every activity a baby can have. The pump is the
 * household's — it has no baby — so it is not among them.
 */
export const BABY_TYPES: readonly ActivityType[] = ActivityType.options.filter(
  t => MODULE_BY_ID[t].householdScoped !== true,
);

/**
 * What the sheet host keeps read ahead of any sheet (`recency.ts`): each baby's newest START per
 * activity type, and every timer running in the household.
 */
export interface Recency {
  /** child id → activity type → the newest entry's start (ms); absent where there is none. */
  lastAt: Readonly<Record<string, Partial<Record<ActivityType, number>>>>;
  running: readonly { type: string; childId: string | null }[];
}

/** Nothing read yet — or a household with nothing to choose between. */
export const NO_RECENCY: Recency = { lastAt: {}, running: [] };

/**
 * The activity types a module's "last" is read across: both feeds for either feed, as the feeding
 * rhythm reads them; the module's own type for everything else; nothing for a module that is not
 * an activity.
 */
export function groupOf(moduleId: ModuleId): readonly ActivityType[] {
  if (isFeeding(moduleId)) return FEEDING;
  const parsed = ActivityType.safeParse(moduleId);
  return parsed.success ? [parsed.data] : [];
}

/** One baby's last entry of the module's group, from the host's read. */
export function groupLast(recency: Recency, moduleId: ModuleId, childId: string): GroupLast {
  const types = groupOf(moduleId);
  const named: readonly string[] = types;
  // a timer of the group running now is the most recent entry there is
  if (recency.running.some(t => t.childId === childId && named.includes(t.type))) return 'running';
  const mine = recency.lastAt[childId];
  let newest: number | null = null;
  for (const type of types) {
    const at = mine?.[type];
    if (at !== undefined && (newest === null || at > newest)) newest = at;
  }
  return newest;
}

/**
 * THE BABY WHO IS UP NEXT: the oldest last entry among the babies that have one (a running timer
 * is the newest), the first in the household's order on a tie, and the first child when nobody has
 * logged the group at all. Null only for a household with no children.
 */
export function upNext(
  children: readonly { id: string }[],
  lastOf: (childId: string) => GroupLast,
): string | null {
  let pick: { id: string; at: number } | null = null;
  for (const c of children) {
    const last = lastOf(c.id);
    // never logged is not up next (see the header): the babies who do this come first
    if (last === null) continue;
    const at = last === 'running' ? Number.POSITIVE_INFINITY : last;
    // strictly older only, so a tie keeps the one earlier in the household's order
    if (pick === null || at < pick.at) pick = { id: c.id, at };
  }
  return pick?.id ?? children[0]?.id ?? null;
}

export interface StartInput {
  /** Every child of the household, in the household's order. */
  children: readonly { id: string }[];
  /** The top bar: on Both / All n, or on one child (`selectedId`). */
  isAll: boolean;
  selectedId: string | null;
  /** The slot's own baby, when the sheet was opened for one (`slotBinding.ts`); else null. */
  slotChildId: string | null;
  /** Each baby's last entry of this module's group (`groupLast`). */
  lastOf: (childId: string) => GroupLast;
  /**
   * A bar on Both starts this module on Both (`startsOnAll`). Absent or false: on the baby up
   * next, which is what a medicine and a one-baby measurement keep.
   */
  startOnAll?: boolean;
}

/**
 * The modules a bar on Both still starts on ONE baby, the one up next (see the header): a dose,
 * where the false record can cost a real one, and a breastfeed, where Both is a tandem.
 */
const ONE_BABY_FIRST: ReadonlySet<ModuleId> = new Set<ModuleId>(['med', 'breastfeed']);

/**
 * WHERE A BAR ON BOTH STARTS ON BOTH (the owner, 2026-09-30): every module whose row offers Both,
 * except a medicine and a breastfeed (`ONE_BABY_FIRST`). `offersAll` is the row's own answer
 * (`loggingForOptions`), so growth and temperature, which measure one child, never start on a
 * fan-out they cannot make.
 */
export const startsOnAll = (moduleId: ModuleId, offersAll: boolean): boolean =>
  offersAll && !ONE_BABY_FIRST.has(moduleId);

/** The Logging-for row's first value: a child id — or `ALL` only where there is nobody to pick. */
export function loggingForStart({
  children,
  isAll,
  selectedId,
  slotChildId,
  lastOf,
  startOnAll = false,
}: StartInput): string {
  if (slotChildId !== null && children.some(c => c.id === slotChildId)) return slotChildId;
  if (!isAll) return selectedId ?? children[0]?.id ?? ALL;
  // Both / All n: Both where the module fans out and is neither a dose nor a breastfeed; else the
  // baby who is up next
  if (startOnAll && children.length > 1) return ALL;
  return upNext(children, lastOf) ?? ALL;
}
