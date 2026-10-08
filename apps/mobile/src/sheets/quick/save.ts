/**
 * What one Save writes, decided before anything touches the database (docs/plans/WP5.md
 * WP5.3, WP5.6; docs/MULTIPLES.md §1–§3).
 *
 * Pure, so the rule "which children does this entry go to" is a table test and not a thing
 * read off a phone. The sheet hands in the child selection and gets back a plan: one child,
 * every child, or the household (pump and the mom modules, which have no child at all).
 *
 *   * a selected child       → that child
 *   * "Both" / "All n"       → every child, one entry each (MULTIPLES §1: never one merged row)
 *   * a household-scoped module → `null`, whatever the chip says
 *   * a single-child module (growth, temperature — MULTIPLES §2, D15) → never a fan-out:
 *     writing the same number for two would record a reading nobody took
 *   * no children at all     → nothing can be written; the sheet says so instead of inventing a row
 */
import { MODULE_BY_ID, type ModuleId } from '@nibblecue/core';

export type SavePlan =
  | { kind: 'one'; childId: string | null }
  | { kind: 'each'; childIds: string[] }
  | { kind: 'nobody' };

export interface Selection {
  /** Every child of the household, in server order. */
  children: readonly { id: string }[];
  /** The chip's selection: a child, or all of them. */
  selectedId: string | null;
  isAll: boolean;
}

/**
 * The modules a Both / All-n selection fans out (MULTIPLES §2's table). Both lists name what a
 * sheet can save TODAY, so the retired ids (note, milestone — module-registry.ts) are in
 * neither: nothing can open a sheet for one, and a list that still carried them would read as
 * if something could.
 */
const MULTI_OK: ReadonlySet<ModuleId> = new Set<ModuleId>([
  'bottle',
  'breastfeed',
  'diaper',
  'sleep',
  'solids',
  'water',
  'tummy',
  'bath',
  'med',
]);

/**
 * Measures one child: no multi option, ever (D15). And the Health note (2026-10-08): it is what one
 * parent noticed about one baby, and its look back is that baby's log — a note for "both" would be
 * two notes about two babies nobody looked at, so it offers the children and no Both, and no "+ Liam".
 */
const SINGLE_ONLY: ReadonlySet<ModuleId> = new Set<ModuleId>(['growth', 'temp', 'wellbeing']);

export function savePlan(moduleId: ModuleId, sel: Selection): SavePlan {
  if (MODULE_BY_ID[moduleId].householdScoped) return { kind: 'one', childId: null };
  if (sel.children.length === 0) return { kind: 'nobody' };
  if (sel.isAll && !SINGLE_ONLY.has(moduleId)) {
    const ids = sel.children.map(c => c.id);
    return ids.length === 1 ? { kind: 'one', childId: ids[0]! } : { kind: 'each', childIds: ids };
  }
  const chosen = sel.children.find(c => c.id === sel.selectedId) ?? sel.children[0]!;
  return { kind: 'one', childId: chosen.id };
}

/** The stash can only feed ONE baby per save: two twins from one container is WP5.6's sheet. */
export const stashAllowed = (plan: SavePlan): boolean => plan.kind === 'one';

/**
 * The chips a STASH FEED offers, and the reason there is no Both among them.
 *
 * One container feeds one baby — that is `stashAllowed` above, and it is a fact about a bottle
 * rather than a policy — so pouring a pump session is the one feeding path that can never fan
 * out. `bottle` is in `MULTI_OK` because the QUICK sheet's bottle can be two bottles; this one
 * cannot be, so it takes the shape a single-child module takes: the children, and nothing else.
 *
 * Empty for a household with one child, which has nothing to choose. For two or more there is
 * no answer to GUESS: the bar's Both selection is not an answer, and the first child is a wrong
 * entry with a right-looking toast (2026-09-22 — `StashSaveSheet` attributed every Both-view
 * pour to `children[0]` and named them in the confirmation).
 */
export function stashFeedOptions(
  children: readonly { id: string; name: string }[],
): LoggingForOption[] {
  return children.length < 2 ? [] : children.map(c => ({ value: c.id, label: c.name }));
}

/**
 * THE "+ LIAM" COPY'S TIMES (MULTIPLES §3; the audits of 2026-09-24, care C1 and feeding C6).
 *
 *   * An entry WITH AN END — a manual sleep, tummy time, a breastfeed — is an event that began
 *     and ended at its own times, and the copy is the same event for the other twin: it keeps
 *     both. It used to take `now` as its start and keep the original end, so Liam's 90-minute nap
 *     was saved ending four seconds before it began: Today read it as 0 minutes, and the server
 *     refused the row for good (`activity_time_sane`), leaving it on one phone.
 *   * A POINT ENTRY — a bottle, a diaper — keeps the shortcut's promise: the same entry for the
 *     other child at the current time, which is when the parent is tapping it.
 *
 * A copy is never the stop of a timer, so a `timer_id` in the metadata is not carried over: the
 * server reads a second entry with the same timer id as a duplicate stop (D26) and drops it.
 */
export function plusChildFields<
  T extends { startAt: string; endAt?: string | null; metadata?: Record<string, unknown> },
>(fields: T, nowMs: number): T {
  const metadata =
    fields.metadata === undefined
      ? undefined
      : Object.fromEntries(Object.entries(fields.metadata).filter(([k]) => k !== 'timer_id'));
  const copy: T = metadata === undefined ? { ...fields } : { ...fields, metadata };
  if (fields.endAt != null) return copy;
  return { ...copy, startAt: new Date(nowMs).toISOString() };
}

/**
 * The "+ Liam" shortcut (MULTIPLES §3): only where a fan-out makes sense, only after a
 * single-child save, and only when EXACTLY one other child exists — with three there is no
 * one obvious other.
 */
export function otherChild<T extends { id: string }>(
  moduleId: ModuleId,
  children: readonly T[],
  childId: string | null,
): T | null {
  if (childId === null || !MULTI_OK.has(moduleId)) return null;
  const others = children.filter(c => c.id !== childId);
  return others.length === 1 ? others[0]! : null;
}

export interface LoggingForOption {
  /** A child id, or `all`. */
  value: string;
  label: string;
}

export const ALL = 'all';

/**
 * The Logging-for row's chips (MULTIPLES §2): one per child plus Both / All n where the
 * module fans out. Nothing at all for a household with one child or a household-scoped
 * module — the row exists to choose, and with nothing to choose it is noise.
 */
export function loggingForOptions(
  moduleId: ModuleId,
  children: readonly { id: string; name: string }[],
  allLabel: string,
): LoggingForOption[] {
  if (children.length < 2 || MODULE_BY_ID[moduleId].householdScoped) return [];
  const chips = children.map(c => ({ value: c.id, label: c.name }));
  return SINGLE_ONLY.has(moduleId) ? chips : [...chips, { value: ALL, label: allLabel }];
}

/** The row's value → the selection the plan reads. */
export function selectionFor(value: string): Pick<Selection, 'selectedId' | 'isAll'> {
  return value === ALL ? { selectedId: null, isAll: true } : { selectedId: value, isAll: false };
}
