/**
 * The schedule's writes (docs/SCHEDULE_AND_LOCATIONS.md §1–§2; SCHEDULE_LOGIC.md §9): phases —
 * create, rename, activate, duplicate, delete with its guards and its undo — and rules — create
 * (one per child for "Both", a SERIES as several under one intent), an edit that names the
 * version it saw, the two-tap interval, delete and restore, a caregiver's skip, a viewer's
 * notification preferences.
 *
 * Every write is one intent: local rows the mirror applies at once, and the ops the server
 * applies with the same rules (0014). The activation and the delete compute their local side
 * effects HERE (the outgoing phase closes, the rules retire) exactly as the server does from
 * the op, so the screen never waits on a round trip to show what it did.
 */
import {
  dayWindowChain,
  deriveOpId,
  isGoalMinutes,
  variantsOf,
  type ModuleVariant,
  moduleSettingChain,
  instanceSkipChain,
  notificationPreferenceChain,
  phaseCreateChain,
  phaseUpdateChain,
  ruleCreateChain,
  ruleDeleteChain,
  ruleShapeError,
  ruleUpdateChain,
  seriesTimes,
  volumeUnitChain,
  type Chain,
  type Clock,
  type LocalRow,
  type NotificationPreferencePatch,
  type RuleFields,
  type RulePatch,
  type VolumeUnit,
} from '@nibblecue/core';
import type { Db } from '../db/driver';
import {
  instanceFor,
  instanceStateFor,
  liveRules,
  phaseById,
  phaseList,
  ruleById,
  rulesOfPhase,
  type PhaseRow,
  type RuleRow,
} from '../db/queries/schedule';
import { ruleFromFields } from '../schedule/model';
import type { WriteContext } from './activities';
import { newEntityId, newIntentId } from './ids';
import { commitWrite, type RepositoryDeps, type WriteOutcome } from './repository';
import { keys } from './store';

export class RuleShapeError extends Error {}
export class PhaseNameError extends Error {}
export class LastPhaseError extends Error {
  constructor() {
    super('Keep at least one routine. Create the next one first, then delete this.');
  }
}
export class CurrentPhaseError extends Error {
  constructor() {
    super('Activate another routine first, then delete this one.');
  }
}

const baseOf = (input: WriteContext, intentId: string, clientEditedAt: string) => ({
  intentId,
  householdId: input.householdId,
  createdBy: input.createdBy,
  deviceId: input.deviceId,
  clientEditedAt,
});

const scheduleKeys = (h: string) => [keys.rules(h), keys.phases(h), keys.nextEvent(null)];

/**
 * ONE ACTION, SEVERAL WRITES, AND AN OP ID FOR EACH (the review of 2026-09-23).
 *
 * A single-op write takes its op's `client_op_id` from its intent: the intent itself, for an
 * untagged rule create, patch, delete or restore and for the day window
 * (`packages/core/src/sync/chains.ts`). The Rule sheet's swap from an interval to set times,
 * Routine's night windows following the day, and Schedule from your log each threaded ONE intent
 * through several such writes — so every write after the first carried an op id already in the
 * queue, `enqueue`'s `insert or ignore` kept the first, and the rest were written on this phone and
 * never sent. The change was real here and nowhere else: not on the server, not on the other
 * parent's phone, not in the reminders the server pushes.
 *
 * So an intent a caller passes in is the ACTION's, and each write under it takes its own, derived
 * from the action's, from what that write touches AND from what it writes there: deterministic, so
 * the same write replayed keeps its op id and stays one op; distinct, so two writes in one action
 * share one only when they are the same write — two different patches to one rule, or the day moved
 * twice, are two ops. A write called with no intent mints its own, exactly as before. `commitWrite`
 * refuses an op id already queued for a different entity, op or row, so the next caller that finds
 * another way to collide fails loudly instead of silently.
 */
const writeIntent = (action: string | undefined, key: string): string =>
  action === undefined ? newIntentId() : deriveOpId(action, key);

/* ---------------------------------------------------------------- phases */

export interface SavePhaseInput extends WriteContext {
  /** Absent for a new phase; the id for a rename. */
  phaseId?: string;
  name: string;
  childId: string | null;
  /** `yyyy-mm-dd` in the home zone; today when absent. */
  effectiveFrom?: string;
  /** New phase: make it the active routine at once (the §1.3 transaction in the same op). */
  makeCurrent?: boolean;
  intentId?: string;
}

export interface SavePhaseResult extends WriteOutcome {
  phaseId: string;
}

function validatePhaseName(name: string, others: readonly PhaseRow[]): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean.length < 2 || clean.length > 40)
    throw new PhaseNameError('A routine needs a name of 2 to 40 characters.');
  if (others.some(p => p.name.trim().toLowerCase() === clean.toLowerCase())) {
    throw new PhaseNameError('A routine with this name already exists.');
  }
  return clean;
}

/** The local side of §1.3: the outgoing phase closes the day the incoming one opens. */
function activationRows(
  phases: readonly PhaseRow[],
  incomingId: string,
  childId: string | null,
  date: string,
  at: string,
): LocalRow[] {
  const rows: LocalRow[] = [];
  for (const p of phases) {
    if (p.id === incomingId || p.is_current !== 1 || (p.child_id ?? null) !== (childId ?? null))
      continue;
    rows.push({
      table: 'schedule_phases',
      row: { id: p.id, is_current: false, effective_to: date, updated_at: at },
    });
  }
  rows.push({
    table: 'schedule_phases',
    row: {
      id: incomingId,
      is_current: true,
      effective_from: date,
      effective_to: null,
      updated_at: at,
    },
  });
  return rows;
}

export async function savePhase(
  db: Db,
  clock: Clock,
  input: SavePhaseInput,
  deps: RepositoryDeps = {},
): Promise<SavePhaseResult> {
  const intentId = input.intentId ?? newIntentId();
  const at = clock.iso();
  const base = baseOf(input, intentId, at);
  const phases = await phaseList(db, input.householdId);
  const sameScope = phases.filter(p => (p.child_id ?? null) === (input.childId ?? null));
  if (input.phaseId === undefined) {
    const name = validatePhaseName(input.name, sameScope);
    const phaseId = newEntityId();
    const date = input.effectiveFrom ?? at.slice(0, 10);
    const chain = phaseCreateChain({
      ...base,
      phaseId,
      phase: {
        name,
        childId: input.childId,
        effectiveFrom: date,
        isCurrent: input.makeCurrent === true,
      },
    });
    if (input.makeCurrent)
      chain.rows.push(...activationRows(phases, phaseId, input.childId, date, at));
    const outcome = await commitWrite(
      db,
      clock,
      { intentId, chain, source: input.source, invalidates: scheduleKeys(input.householdId) },
      deps,
    );
    return { ...outcome, phaseId };
  }
  const existing = await phaseById(db, input.phaseId);
  if (existing === undefined || existing.deleted_at !== null)
    throw new RangeError(`no routine ${input.phaseId}`);
  const name = validatePhaseName(
    input.name,
    sameScope.filter(p => p.id !== existing.id),
  );
  const chain = phaseUpdateChain({ ...base, phaseId: existing.id, patch: { name } });
  const outcome = await commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: scheduleKeys(input.householdId) },
    deps,
  );
  return { ...outcome, phaseId: existing.id };
}

/**
 * The phase a new rule hangs from, made if there is none (the offer cards on the Schedule tab;
 * the sheet's first item). A household that has never opened a routine has no phase, and the
 * server's rule branch inserts under the phase id the client names and mints nothing — so
 * without this the first chip tap on a fresh household wrote nothing, silently, which is the
 * one answer a tap must never get. "Routine" is the name care.ts mints for the same reason,
 * so the two never make two.
 *
 * In scope: the current phase for the child, else the household's; failing that the newest
 * live phase in scope is made current rather than a second one created beside it; failing
 * that one is created and made current. Returns the id, or null when nothing could be
 * written (a caregiver, an offline refusal), which the caller treats as "not now".
 */
export async function ensureCurrentPhase(
  db: Db,
  clock: Clock,
  input: WriteContext & { childId: string | null },
  deps: RepositoryDeps = {},
): Promise<string | null> {
  const phases = (await phaseList(db, input.householdId)).filter(p => p.deleted_at === null);
  const inScope = (p: PhaseRow) => (p.child_id ?? null) === input.childId || p.child_id === null;
  const current =
    (input.childId === null
      ? undefined
      : phases.find(p => p.is_current === 1 && p.child_id === input.childId)) ??
    phases.find(p => p.is_current === 1 && p.child_id === null) ??
    phases.find(p => p.is_current === 1 && inScope(p));
  if (current !== undefined) return current.id;
  const newest = phases.filter(inScope).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  if (newest !== undefined) {
    const r = await activatePhase(db, clock, { ...input, phaseId: newest.id }, deps);
    return r.committed ? newest.id : null;
  }
  const r = await savePhase(
    db,
    clock,
    { ...input, name: 'Routine', childId: null, makeCurrent: true },
    deps,
  );
  return r.committed ? r.phaseId : null;
}

export interface ActivatePhaseInput extends WriteContext {
  phaseId: string;
  /** `yyyy-mm-dd`; today when absent. Never before the outgoing phase's own start. */
  activationDate?: string;
  intentId?: string;
}

export async function activatePhase(
  db: Db,
  clock: Clock,
  input: ActivatePhaseInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const intentId = input.intentId ?? newIntentId();
  const at = clock.iso();
  const target = await phaseById(db, input.phaseId);
  if (target === undefined || target.deleted_at !== null)
    throw new RangeError(`no routine ${input.phaseId}`);
  const date = input.activationDate ?? at.slice(0, 10);
  const phases = await phaseList(db, input.householdId);
  const outgoing = phases.find(
    p =>
      p.id !== target.id &&
      p.is_current === 1 &&
      (p.child_id ?? null) === (target.child_id ?? null),
  );
  if (outgoing !== undefined && date < outgoing.effective_from) {
    throw new RangeError('The new routine cannot start before the current one did.');
  }
  const chain = phaseUpdateChain({
    ...baseOf(input, intentId, at),
    phaseId: target.id,
    patch: { activate: true, activation_date: date },
    rows: activationRows(phases, target.id, target.child_id, date, at),
  });
  return commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: scheduleKeys(input.householdId) },
    deps,
  );
}

export interface DuplicatePhaseInput extends WriteContext {
  phaseId: string;
  intentId?: string;
}

export interface DuplicatePhaseResult extends WriteOutcome {
  phaseId: string;
  ruleIds: string[];
}

/** §1.4: the phase and every live rule, fresh ids, `(copy)`, inert until activated. */
/**
 * A stored rule as the fields a new one is created from. The three columns a copy never keeps
 * — which routine, whose, and from when — are the caller's to say; everything else travels.
 * Shared by `duplicatePhase` (same child, new routine) and `copyRulesToChild` (same routine,
 * new child), so the two copies cannot drift on which columns count.
 */
function fieldsOfRow(
  r: RuleRow,
  own: Pick<RuleFields, 'phase_id' | 'child_id' | 'effective_from'>,
): RuleFields {
  return {
    ...own,
    activity: r.activity as RuleFields['activity'],
    care_item_id: r.care_item_id,
    rule_type: r.rule_type as RuleFields['rule_type'],
    at_local_time: r.at_local_time === null ? null : r.at_local_time.slice(0, 5),
    every_minutes: r.every_minutes,
    relative_to: r.relative_to as RuleFields['relative_to'],
    offset_minutes: r.offset_minutes,
    every_days: r.every_days,
    target_quantity: r.target_quantity,
    repeat: r.repeat as RuleFields['repeat'],
    repeat_days: r.repeat_days === null ? null : (JSON.parse(r.repeat_days) as number[]),
    reminder_enabled: r.reminder_enabled === 1,
    remind_user_ids: JSON.parse(r.remind_user_ids) as string[],
    match_window_minutes: r.match_window_minutes,
    match_scope: r.match_scope as RuleFields['match_scope'],
    miss_after_minutes: r.miss_after_minutes,
    late_window_minutes: r.late_window_minutes,
    night_mode: r.night_mode as RuleFields['night_mode'],
    night_from: r.night_from === null ? null : r.night_from.slice(0, 5),
    night_to: r.night_to === null ? null : r.night_to.slice(0, 5),
    night_every_minutes: r.night_every_minutes,
    night_at: r.night_at === null ? null : r.night_at.slice(0, 5),
    target_per_day: r.target_per_day,
    name: r.name,
    is_active: r.is_active === 1,
  };
}

export interface CopyRulesInput extends WriteContext {
  /** Whose rhythms to copy. */
  fromChildId: string;
  /** The child who has none yet. */
  toChildId: string;
  intentId?: string;
}

export interface CopyRulesResult extends WriteOutcome {
  /** Exactly the rules written — what an undo would retire. */
  ruleIds: string[];
}

/**
 * A second child starts with the first child's rhythms (docs/MULTIPLES.md §8).
 *
 * ONE RULE PER SOURCE RULE, in the same routine, for the new child only. A household-scoped
 * rule (pumping) has no child and is not touched: it already covers the household. A medicine
 * rule keeps its `care_item_id`, because the care item is the household's and the rule is the
 * child's — Liam gets Emma's vitamin at Emma's times, on Emma's item, which is what a twin
 * parent means by "the same".
 *
 * NOTHING IS WRITTEN TWICE. A rule the new child already has for that activity and care item
 * is skipped, so a retry — or a parent who taps the toggle, backs out, and taps it again —
 * adds nothing. Idempotent by content rather than by intent id, because the two attempts are
 * two intents.
 */
export async function copyRulesToChild(
  db: Db,
  clock: Clock,
  input: CopyRulesInput,
  deps: RepositoryDeps = {},
): Promise<CopyRulesResult> {
  const intentId = input.intentId ?? newIntentId();
  const at = clock.iso();
  const base = baseOf(input, intentId, at);
  const live = await liveRules(db, input.householdId);
  const has = new Set(
    live
      .filter(r => r.child_id === input.toChildId)
      .map(r => `${r.activity}:${r.care_item_id ?? ''}:${r.rule_type}:${r.at_local_time ?? ''}`),
  );
  const chain: Chain = { rows: [], ops: [] };
  const ruleIds: string[] = [];
  for (const r of live.filter(r => r.child_id === input.fromChildId)) {
    const key = `${r.activity}:${r.care_item_id ?? ''}:${r.rule_type}:${r.at_local_time ?? ''}`;
    if (has.has(key)) continue;
    has.add(key);
    const ruleId = newEntityId();
    ruleIds.push(ruleId);
    const fields = fieldsOfRow(r, {
      phase_id: r.phase_id,
      child_id: input.toChildId,
      effective_from: at,
    });
    const problem = ruleShapeError(ruleFromFields(ruleId, fields));
    if (problem !== null) throw new RuleShapeError(problem);
    const one = ruleCreateChain({ ...base, ruleId, rule: fields, tag: `child:${r.id}` });
    chain.rows.push(...one.rows);
    chain.ops.push(...one.ops);
  }
  // nothing to copy is a quiet no-op, not a failure: the same shape a duplicate write returns
  if (ruleIds.length === 0)
    return { committed: false, suppressed: true, opIds: [], entityIds: [], intentId, ruleIds };
  const outcome = await commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: scheduleKeys(input.householdId) },
    deps,
  );
  return { ...outcome, ruleIds };
}

export async function duplicatePhase(
  db: Db,
  clock: Clock,
  input: DuplicatePhaseInput,
  deps: RepositoryDeps = {},
): Promise<DuplicatePhaseResult> {
  const intentId = input.intentId ?? newIntentId();
  const at = clock.iso();
  const base = baseOf(input, intentId, at);
  const source = await phaseById(db, input.phaseId);
  if (source === undefined || source.deleted_at !== null)
    throw new RangeError(`no routine ${input.phaseId}`);
  const phaseId = newEntityId();
  const chain = phaseCreateChain({
    ...base,
    phaseId,
    phase: {
      name: `${source.name} (copy)`.slice(0, 40),
      childId: source.child_id,
      effectiveFrom: at.slice(0, 10),
      isCurrent: false,
    },
  });
  const ruleIds: string[] = [];
  for (const r of await rulesOfPhase(db, source.id)) {
    const ruleId = newEntityId();
    ruleIds.push(ruleId);
    const fields = fieldsOfRow(r, { phase_id: phaseId, child_id: r.child_id, effective_from: at });
    const copy = ruleCreateChain({ ...base, ruleId, rule: fields, tag: `dup:${r.id}` });
    chain.rows.push(...copy.rows);
    chain.ops.push(...copy.ops.map(op => ({ ...op, depends_on: intentId })));
  }
  const outcome = await commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: scheduleKeys(input.householdId) },
    deps,
  );
  return { ...outcome, phaseId, ruleIds };
}

export interface DeletePhaseInput extends WriteContext {
  phaseId: string;
  intentId?: string;
}

export interface DeletePhaseResult extends WriteOutcome {
  /** Exactly the rules the delete retired — what the undo brings back. */
  ruleIds: string[];
}

/** §1.5, with the two guards said in the sheet's words before anything is written. */
export async function deletePhase(
  db: Db,
  clock: Clock,
  input: DeletePhaseInput,
  deps: RepositoryDeps = {},
): Promise<DeletePhaseResult> {
  const intentId = input.intentId ?? newIntentId();
  const at = clock.iso();
  const target = await phaseById(db, input.phaseId);
  if (target === undefined || target.deleted_at !== null)
    throw new RangeError(`no routine ${input.phaseId}`);
  if (target.is_current === 1) throw new CurrentPhaseError();
  const phases = await phaseList(db, input.householdId);
  if (!phases.some(p => p.id !== target.id && (p.child_id ?? null) === (target.child_id ?? null)))
    throw new LastPhaseError();
  const rules = await rulesOfPhase(db, target.id);
  const ruleIds = rules.map(r => r.id);
  const chain = phaseUpdateChain({
    ...baseOf(input, intentId, at),
    phaseId: target.id,
    patch: { deleted_at: at, rule_ids: ruleIds },
    rows: ruleIds.map(id => ({
      table: 'schedule_rules',
      row: { id, deleted_at: at, is_active: false, updated_at: at },
    })),
  });
  const outcome = await commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: scheduleKeys(input.householdId) },
    deps,
  );
  return { ...outcome, ruleIds };
}

// A deleted phase comes back through the write's own Undo (`undoWrite`, which the Plans sheet's
// toast calls); the hand-built `restorePhase` went on 2026-09-26 with nothing calling it.

/* ---------------------------------------------------------------- rules */

export interface SaveRuleInput extends WriteContext {
  /** Absent for a new rule. */
  ruleId?: string;
  /** New rule: one per entry — `[null]` for a household rule, `[emma, liam]` for "Both" (§2.1). */
  childIds?: readonly (string | null)[];
  fields: Omit<RuleFields, 'child_id'> & { child_id?: string | null };
  /** Edit: the `updated_at` the sheet loaded (§2.5). */
  expectedUpdatedAt?: string | null;
  intentId?: string;
}

export interface SaveRuleResult extends WriteOutcome {
  ruleIds: string[];
}

export async function saveRule(
  db: Db,
  clock: Clock,
  input: SaveRuleInput,
  deps: RepositoryDeps = {},
): Promise<SaveRuleResult> {
  const at = clock.iso();
  if (input.ruleId === undefined) {
    // an intent of its own is minted before the rule ids, in the order it always was
    const minted = input.intentId === undefined ? newIntentId() : undefined;
    const children = input.childIds ?? [input.fields.child_id ?? null];
    const newIds = children.map(() => newEntityId());
    // under an action's intent, a create is keyed on the rule it makes — nothing else is new
    const intentId = minted ?? deriveOpId(input.intentId ?? '', `create:${newIds.join(',')}`);
    const base = baseOf(input, intentId, at);
    const chain: Chain = { rows: [], ops: [] };
    const ruleIds: string[] = [];
    for (const [i, childId] of children.entries()) {
      const ruleId = newIds[i] ?? newEntityId();
      const fields: RuleFields = {
        ...input.fields,
        child_id: childId,
        effective_from: input.fields.effective_from || at,
      };
      const problem = ruleShapeError(ruleFromFields(ruleId, fields));
      if (problem !== null) throw new RuleShapeError(problem);
      const one = ruleCreateChain({
        ...base,
        ruleId,
        rule: fields,
        ...(children.length > 1 ? { tag: `child:${childId ?? 'household'}` } : {}),
      });
      chain.rows.push(...one.rows);
      chain.ops.push(...one.ops);
      ruleIds.push(ruleId);
    }
    const outcome = await commitWrite(
      db,
      clock,
      { intentId, chain, source: input.source, invalidates: scheduleKeys(input.householdId) },
      deps,
    );
    return { ...outcome, ruleIds };
  }
  const intentId = writeIntent(
    input.intentId,
    `edit:${input.ruleId}:${JSON.stringify(input.fields)}`,
  );
  const base = baseOf(input, intentId, at);
  const existing = await ruleById(db, input.ruleId);
  if (existing === undefined || existing.deleted_at !== null)
    throw new RangeError(`no scheduled item ${input.ruleId}`);
  const fields: RuleFields = {
    ...input.fields,
    child_id: input.fields.child_id ?? existing.child_id,
  };
  const problem = ruleShapeError(ruleFromFields(existing.id, fields));
  if (problem !== null) throw new RuleShapeError(problem);
  // the immutable columns never travel: the activity and the care item are what history hangs off
  const { activity: _a, care_item_id: _c, ...patch } = fields;
  void _a;
  void _c;
  const chain = ruleUpdateChain({
    ...base,
    ruleId: existing.id,
    patch,
    expectedUpdatedAt: await editBase(
      db,
      existing.id,
      input.expectedUpdatedAt ?? existing.updated_at,
    ),
  });
  chain.rows[0] = { table: 'schedule_rules', row: { ...chain.rows[0]?.row, updated_at: at } };
  const outcome = await commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: scheduleKeys(input.householdId) },
    deps,
  );
  return { ...outcome, ruleIds: [existing.id] };
}

/**
 * THE VERSION AN EDIT IS CHECKED AGAINST (the sync sweep of 2026-09-24, P2).
 *
 * An edit names the version it was made on, and the server refuses it when the row has moved
 * since (`rule_stale`, SCHEDULE_LOGIC §2.5): that is how one parent's change is never silently
 * written over by the other's. But every local write stamps the row's `updated_at` with the
 * PHONE's clock, and the server stamps its own — so a second edit made before the first was sent,
 * or while it was in flight, or before the pull after it came back, named a version the server
 * never had, and was refused as "changed elsewhere": marked FAILED ("Not synced"), and undone on
 * the next pull. Tapping two interval chips, editing a rule setup had just made, an offline
 * evening of changes and the Undo of "Schedule from your log" all did it.
 *
 * So the version is sent only when it IS the server's — when the row on the phone came from a
 * pull. When the phone stamped it (one of this rule's own ops carries that `client_edited_at`,
 * or one is still unsent), this edit continues the phone's own sequence, whose first op already
 * carried the server's version and was checked against it; it is sent with no version (null),
 * which the server and the fake both read as "apply".
 *
 * A MEDICINE'S REMINDERS ARE STAMPED BY THE MEDICINE (the investigation of 2026-09-24). Their rows
 * are written by the care item's save (`data/care.ts`), never by a rule op of their own, and the
 * server builds its copies from the care item's op with its own clock. So the care item's ops are
 * the phone's stamps on those rules too; counting only rule ops, the first edit of a medicine's
 * reminder named the phone's stamp as the server's version and was refused as "changed
 * elsewhere", for good.
 */
async function editBase(db: Db, ruleId: string, local: string | null): Promise<string | null> {
  if (local === null) return null;
  const rule = await db.get<{ care_item_id: string | null }>(
    'select care_item_id from schedule_rules where id = ?',
    [ruleId],
  );
  const own = await db.get<{ n: number }>(
    `select count(*) as n from outbox
      where ((entity = 'schedule_rule' and entity_id = ?)
             or (entity = 'care_item' and entity_id = ?))
        and (state in ('PENDING', 'SENDING', 'FAILED')
             or json_extract(payload, '$.client_edited_at') = ?)`,
    [ruleId, rule?.care_item_id ?? null, local],
  );
  return (own?.n ?? 0) > 0 ? null : local;
}

export interface PatchRuleInput extends WriteContext {
  ruleId: string;
  patch: RulePatch;
  intentId?: string;
}

/**
 * A partial edit — the two-tap interval chip, the night sheet, the custom interval, a pause,
 * a restore — checked against the row's own `updated_at`, which is what the mirror holds.
 */
export async function patchRule(
  db: Db,
  clock: Clock,
  input: PatchRuleInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const intentId = writeIntent(
    input.intentId,
    `patch:${input.ruleId}:${JSON.stringify(input.patch)}`,
  );
  const at = clock.iso();
  const existing = await ruleById(db, input.ruleId);
  if (existing === undefined) throw new RangeError(`no scheduled item ${input.ruleId}`);
  const chain = ruleUpdateChain({
    ...baseOf(input, intentId, at),
    ruleId: existing.id,
    patch: input.patch,
    expectedUpdatedAt: await editBase(db, existing.id, existing.updated_at),
  });
  chain.rows[0] = { table: 'schedule_rules', row: { ...chain.rows[0]?.row, updated_at: at } };
  return commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: scheduleKeys(input.householdId) },
    deps,
  );
}

export interface DeleteRulesInput extends WriteContext {
  ruleIds: readonly string[];
  intentId?: string;
}

/** Soft, one intent however many (the undo of a SERIES removes them all at once). */
export async function deleteRules(
  db: Db,
  clock: Clock,
  input: DeleteRulesInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const intentId = writeIntent(input.intentId, `delete:${input.ruleIds.join(',')}`);
  const at = clock.iso();
  const base = baseOf(input, intentId, at);
  const chain: Chain = { rows: [], ops: [] };
  for (const ruleId of input.ruleIds) {
    const one = ruleDeleteChain({
      ...base,
      ruleId,
      ...(input.ruleIds.length > 1 ? { tag: `del:${ruleId}` } : {}),
    });
    chain.rows.push(...one.rows);
    chain.ops.push(...one.ops);
  }
  return commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: scheduleKeys(input.householdId) },
    deps,
  );
}

/** The Undo of `deleteRules`: `deleted_at` cleared, active again, no version check (§2.3). */
export async function restoreRules(
  db: Db,
  clock: Clock,
  input: DeleteRulesInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const intentId = writeIntent(input.intentId, `restore:${input.ruleIds.join(',')}`);
  const at = clock.iso();
  const base = baseOf(input, intentId, at);
  const chain: Chain = { rows: [], ops: [] };
  for (const ruleId of input.ruleIds) {
    const one = ruleUpdateChain({
      ...base,
      ruleId,
      patch: { deleted_at: null, is_active: true },
      expectedUpdatedAt: null,
      ...(input.ruleIds.length > 1 ? { tag: `undel:${ruleId}` } : {}),
    });
    chain.rows.push(...one.rows);
    chain.ops.push(...one.ops);
  }
  return commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: scheduleKeys(input.householdId) },
    deps,
  );
}

export interface AddSeriesInput extends WriteContext {
  phaseId: string;
  childIds: readonly (string | null)[];
  activity: RuleFields['activity'];
  from: string;
  everyMinutes: number;
  to: string;
  reminderEnabled: boolean;
  remindUserIds: readonly string[];
  targetQuantity?: number | null;
  intentId?: string;
  /**
   * The times, given rather than walked from `from`/`everyMinutes`/`to`.
   *
   * A SERIES is normally a grid — first, every, last — which is what "a bottle every 3h from 7
   * to 9" means. A COUNT PER DAY is not a grid: three times a day is three moments spread across
   * the hours the household is awake, and the spacing between them is a consequence rather than
   * the setting (`sheets/care/careTimes.ts` computes it, and does so for the medicines already).
   * When these are given they are used verbatim and the three grid fields are ignored.
   */
  times?: readonly string[];
  /**
   * `DAY` for a count per day: doing the thing at any hour answers that slot, so a tummy time at
   * eleven satisfies the mid-morning one rather than missing it by ninety minutes. `MINUTES` —
   * the default, and every grid series — keeps the window (`packages/core/.../types.ts` `scopeOf`
   * says why the scope is derived for care items and stored for everything else).
   */
  matchScope?: RuleFields['match_scope'];
}

export interface AddSeriesResult extends WriteOutcome {
  ruleIds: string[];
  times: string[];
}

/** §9 "A set of times": several FIXED rules from first + every + last, one intent, one undo. */
export async function addSeries(
  db: Db,
  clock: Clock,
  input: AddSeriesInput,
  deps: RepositoryDeps = {},
): Promise<AddSeriesResult> {
  const intentId = input.intentId ?? newIntentId();
  const at = clock.iso();
  const base = baseOf(input, intentId, at);
  const times = input.times ?? seriesTimes(input.from, input.everyMinutes, input.to);
  if (times.length === 0) throw new RuleShapeError('The last time is before the first.');
  const chain: Chain = { rows: [], ops: [] };
  const ruleIds: string[] = [];
  for (const childId of input.childIds) {
    for (const t of times) {
      const ruleId = newEntityId();
      const fields: RuleFields = {
        phase_id: input.phaseId,
        child_id: childId,
        activity: input.activity,
        care_item_id: null,
        effective_from: at,
        rule_type: 'FIXED',
        at_local_time: t,
        every_minutes: null,
        relative_to: null,
        offset_minutes: null,
        every_days: null,
        target_quantity: input.targetQuantity ?? null,
        repeat: 'DAILY',
        repeat_days: null,
        reminder_enabled: input.reminderEnabled,
        remind_user_ids: input.remindUserIds,
        match_window_minutes: 25,
        match_scope: input.matchScope ?? 'MINUTES',
        miss_after_minutes: 60,
        late_window_minutes: 90,
        night_mode: 'NONE',
        night_from: null,
        night_to: null,
        night_every_minutes: null,
        night_at: null,
        target_per_day: null,
        name: null,
        is_active: true,
      };
      const one = ruleCreateChain({
        ...base,
        ruleId,
        rule: fields,
        tag: `series:${childId ?? 'household'}:${t}`,
      });
      chain.rows.push(...one.rows);
      chain.ops.push(...one.ops);
      ruleIds.push(ruleId);
    }
  }
  const outcome = await commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: scheduleKeys(input.householdId) },
    deps,
  );
  return { ...outcome, ruleIds, times: [...times] };
}

export interface TimesADayInput extends WriteContext {
  phaseId: string;
  childIds: readonly (string | null)[];
  activity: RuleFields['activity'];
  /** The times the count spreads to, already computed from the household's waking hours. */
  times: readonly string[];
  /** Every FIXED rule this activity already carries; they are replaced, not added to. */
  replacing: readonly string[];
  reminderEnabled: boolean;
  remindUserIds: readonly string[];
  intentId?: string;
}

/**
 * A COUNT PER DAY, as several DAY-scoped FIXED rules under one intent.
 *
 * Tummy time is the shape this exists for (the owner, 2026-09-16: "tummy time should not be set
 * every x hours, but rather how many times done in a day. just like 3 times a day medication
 * cream"). An interval was the wrong instrument for it twice over: "every 4h from the last"
 * turns one late afternoon into a chain that walks into the night, and a household does not
 * think about tummy time as a gap — they think about it as three goes before bedtime.
 *
 * REPLACES RATHER THAN ADDS. Changing three to two is not "add two more"; the old set goes in
 * the same intent, so one Undo puts the household exactly back. The times come from the caller
 * because they come from the caller's own waking window, which is a preference this layer has
 * no business reading.
 *
 * NOTHING HERE IS A RECOMMENDATION. The count is the caregiver's, the spread is arithmetic on
 * their own quiet hours, and no part of it varies by the baby's age (CLAUDE.md §2).
 */
export async function setTimesADay(
  db: Db,
  clock: Clock,
  input: TimesADayInput,
  deps: RepositoryDeps = {},
): Promise<AddSeriesResult> {
  const intentId = input.intentId ?? newIntentId();
  if (input.replacing.length > 0) {
    await deleteRules(db, clock, { ...input, ruleIds: input.replacing, intentId }, deps);
  }
  return addSeries(
    db,
    clock,
    {
      ...input,
      intentId,
      from: input.times[0] ?? '09:00',
      everyMinutes: 0,
      to: input.times[input.times.length - 1] ?? '09:00',
      matchScope: 'DAY',
    },
    deps,
  );
}

/* ---------------------------------------------------------------- a skip */

export interface SkipSlotInput extends WriteContext {
  ruleId: string;
  scheduledForMs: number;
  reason: string | null;
  intentId?: string;
}

/**
 * A caregiver's skip. The server's instance is the row that carries it; when this device has
 * not pulled one (the mock arm never materialises), a local-only SKIPPED row keeps the slot
 * skipped here, and the pull's row for the same slot joins it later — the engine reads both by
 * `(rule, time)`.
 */
export async function skipSlot(
  db: Db,
  clock: Clock,
  input: SkipSlotInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const intentId = input.intentId ?? newIntentId();
  const at = clock.iso();
  const scheduledFor = new Date(input.scheduledForMs).toISOString();
  const inst = await instanceFor(db, input.ruleId, scheduledFor);
  const invalidates = [keys.rules(input.householdId), keys.nextEvent(null)];
  /*
    ALREADY SKIPPED: the reason changes on the phone and nothing is sent (the sync sweep of
    2026-09-24, P6). A first skip of a slot the server had not made yet is a row on this phone
    only; sending the second as an UPDATE named an id the server never had, and it retried for
    minutes as "N queued" and then failed as "Not synced". The skip itself is already recorded
    wherever it was going to be.
  */
  if (inst !== undefined && inst.status === 'SKIPPED') {
    const row: LocalRow = {
      table: 'schedule_instances',
      row: { id: inst.id, skipped_reason: input.reason, updated_at: at },
    };
    return commitWrite(
      db,
      clock,
      { intentId, chain: { rows: [row], ops: [] }, source: input.source, invalidates },
      deps,
    );
  }
  if (inst !== undefined) {
    const chain = instanceSkipChain({
      ...baseOf(input, intentId, at),
      instanceId: inst.id,
      reason: input.reason,
    });
    return commitWrite(db, clock, { intentId, chain, source: input.source, invalidates }, deps);
  }
  const row = await localSkipRow(db, input, newEntityId(), scheduledFor, at);
  return commitWrite(
    db,
    clock,
    { intentId, chain: { rows: [row], ops: [] }, source: input.source, invalidates },
    deps,
  );
}

/** A SKIPPED row this phone makes for a slot the server has not made yet. */
async function localSkipRow(
  db: Db,
  input: SkipSlotInput,
  id: string,
  scheduledFor: string,
  at: string,
): Promise<LocalRow> {
  const rule = await ruleById(db, input.ruleId);
  return {
    table: 'schedule_instances',
    row: {
      id,
      household_id: input.householdId,
      rule_id: input.ruleId,
      child_id: rule?.child_id ?? null,
      scheduled_for: scheduledFor,
      local_date: scheduledFor.slice(0, 10),
      status: 'SKIPPED',
      skipped_reason: input.reason,
      expected_count: 1,
      created_at: at,
      updated_at: at,
    },
  };
}

/**
 * WHAT A SKIP MADE DURING THE FIRST-RUN TOUR CHANGED, so the tour can put exactly that back.
 *
 * `before` is the row as this phone had it, or null when the skip made the row. `at` is the
 * stamp the skip left on it: the take-back touches a row only while it still carries that stamp.
 */
export interface TrialSkip {
  instanceId: string;
  before: { status: string; skipped_reason: string | null; updated_at: string | null } | null;
  at: string;
}

/**
 * A SKIP DURING THE TOUR, ON THIS PHONE ONLY (the owner, 2026-09-24: Up next showed the feed at
 * 2:02 PM after the tour, because the 11:02 slot skipped on card 3 was still skipped).
 *
 * The tour clears every entry it caused, but a skip is not an entry. `skipSlot` either made a
 * local-only row, which no claim can see, or sent an UPDATE the server keeps: the server can set
 * a slot SKIPPED and has no way to un-skip one. So a trial skip sends nothing. It changes this
 * phone's row, reports what the row was, and `takeBackTrialSkip` restores it when the tour ends.
 * The other parent's phone never sees a trial skip.
 */
export async function skipSlotForTrial(
  db: Db,
  clock: Clock,
  input: SkipSlotInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome & { trial: TrialSkip }> {
  const intentId = input.intentId ?? newIntentId();
  const at = clock.iso();
  const scheduledFor = new Date(input.scheduledForMs).toISOString();
  const inst = await instanceStateFor(db, input.ruleId, scheduledFor);
  const row: LocalRow =
    inst === undefined
      ? await localSkipRow(db, input, newEntityId(), scheduledFor, at)
      : {
          table: 'schedule_instances',
          row: { id: inst.id, status: 'SKIPPED', skipped_reason: input.reason, updated_at: at },
        };
  const outcome = await commitWrite(
    db,
    clock,
    {
      intentId,
      chain: { rows: [row], ops: [] },
      source: input.source,
      invalidates: [keys.rules(input.householdId), keys.nextEvent(null)],
    },
    deps,
  );
  const before =
    inst === undefined
      ? null
      : { status: inst.status, skipped_reason: inst.skipped_reason, updated_at: inst.updated_at };
  return { ...outcome, trial: { instanceId: String(row.row.id), before, at } };
}

/**
 * Put a trial skip back: delete the row it made, or restore the row it changed.
 *
 * ONLY A ROW STILL AS THE SKIP LEFT IT. If the row has changed since (a pull brought the
 * server's version, or a parent answered the slot for real), the change is the household's and
 * it stays. The check and the write share one transaction, so a pull cannot land between them.
 * Resolves true when the row was put back.
 */
export async function takeBackTrialSkip(
  db: Db,
  clock: Clock,
  skip: TrialSkip,
  input: WriteContext,
  deps: RepositoryDeps = {},
): Promise<boolean> {
  let restored = false;
  await commitWrite(
    db,
    clock,
    {
      intentId: newIntentId(),
      chain: { rows: [], ops: [] },
      source: input.source,
      invalidates: [keys.rules(input.householdId), keys.nextEvent(null)],
      inTransaction: async t => {
        const now = await t.get<{ status: string; updated_at: string | null }>(
          'select status, updated_at from schedule_instances where id = ?',
          [skip.instanceId],
        );
        if (now === undefined || now.status !== 'SKIPPED' || now.updated_at !== skip.at) return;
        if (skip.before === null) {
          await t.run('delete from schedule_instances where id = ?', [skip.instanceId]);
        } else {
          await t.run(
            'update schedule_instances set status = ?, skipped_reason = ?, updated_at = ? where id = ?',
            [
              skip.before.status,
              skip.before.skipped_reason,
              skip.before.updated_at,
              skip.instanceId,
            ],
          );
        }
        restored = true;
      },
    },
    deps,
  );
  return restored;
}

/* ---------------------------------------------------------------- settings */

// `setNudge` went with the nudge module (2026-09-18): no writer, so the kept column can only ever
// hold what a household set before then (`db/queries/schedule.ts` says why it stays).
export interface SaveDayWindowInput extends WriteContext {
  /** Both halves, `HH:MM`, always — the row is upserted whole. */
  wake: string;
  bed: string;
  intentId?: string;
}

/**
 * The household's waking window (migration 0095): the two times that decide whether a sleep
 * logged now is written down as a nap or as night sleep.
 *
 * BOTH HALVES GO EVERY TIME even though the picker only ever changes one. The row is one
 * setting, the op is an upsert keyed on the household, and sending the pair means a phone that
 * had never pulled the row still writes a complete, correct one rather than half a window on
 * top of a server default it has not seen.
 *
 * Nothing here is undoable and that is deliberate: a setting is changed by changing it back,
 * and an Undo toast on a time picker would be one more thing to dismiss at 3 a.m.
 */
export async function saveDayWindow(
  db: Db,
  clock: Clock,
  input: SaveDayWindowInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const intentId = writeIntent(input.intentId, `day_window:${input.wake}-${input.bed}`);
  const at = clock.iso();
  const chain = dayWindowChain({
    ...baseOf(input, intentId, at),
    wake: input.wake,
    bed: input.bed,
  });
  chain.rows[0] = {
    table: 'household_settings',
    row: { ...chain.rows[0]?.row, updated_at: at },
  };
  return commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: [keys.dayWindow(input.householdId)] },
    deps,
  );
}

export interface SaveVolumeUnitInput extends WriteContext {
  unit: VolumeUnit;
  intentId?: string;
}

/**
 * THE HOUSEHOLD'S MILK UNIT (migration 0128; the owner, 2026-09-26: *"make the oz/mL setting
 * household-wide, not per person"*): ounces or milliliters, for every amount on every phone in the
 * household. A column of the waking window's row, written through the outbox like the window, so
 * it applies on this phone at once — offline included — and reaches every other phone on the next
 * sync. OWNER/PARENT only on the server (`can_admin`), which is who What you track lets change it.
 *
 * NOT UNDOABLE, for the window's reason: a unit is changed by choosing the other one, one tap away,
 * and nothing stored moves either way — every amount stays in ml.
 */
export async function saveVolumeUnit(
  db: Db,
  clock: Clock,
  input: SaveVolumeUnitInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const intentId = writeIntent(input.intentId, `volume_unit:${input.unit}`);
  const at = clock.iso();
  const chain = volumeUnitChain({ ...baseOf(input, intentId, at), unit: input.unit });
  return commitWrite(
    db,
    clock,
    {
      intentId,
      chain,
      source: input.source,
      invalidates: [keys.volumeUnit(input.householdId)],
    },
    deps,
  );
}

export interface SaveModuleGoalInput extends WriteContext {
  /** The module the goal belongs to — `tummy` today (`today/goal.ts`). */
  activity: string;
  /** Whole minutes a day, or null for no goal. Never proposed by the app past onboarding's chip. */
  minutes: number | null;
  intentId?: string;
}

/**
 * The household's daily goal for a module (migration 0097): one column on the module's own
 * settings row, so it syncs the way "which modules are on" does and both parents see the same
 * number under the same bar.
 *
 * NOT UNDOABLE, like the day window and for the same reason: a setting is changed by changing
 * it back, and the chip row that writes it is one tap from any other value. The rules a goal
 * REPLACES are a different matter — the Schedule tab deletes a household's old tummy-time
 * reminder rules in the same gesture, through `deleteRules`, which keeps its own Undo.
 *
 * The bound is checked here, before a row is written, so a bad value fails on the phone rather
 * than as a rejected op two syncs later: the column's own check is the same one.
 */
export async function saveModuleGoal(
  db: Db,
  clock: Clock,
  input: SaveModuleGoalInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  if (input.minutes !== null && !isGoalMinutes(input.minutes))
    throw new RangeError(`a daily goal is a whole number of minutes, not ${input.minutes}`);
  const intentId = writeIntent(input.intentId, `goal:${input.activity}:${input.minutes ?? 'none'}`);
  const at = clock.iso();
  const chain = moduleSettingChain({
    ...baseOf(input, intentId, at),
    moduleId: input.activity,
    patch: { goal_minutes: input.minutes },
  });
  chain.rows[0] = {
    table: 'module_settings',
    row: { ...chain.rows[0]?.row, updated_at: at },
  };
  return commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: [keys.modules(input.householdId)] },
    deps,
  );
}

export interface SaveModuleVariantInput extends WriteContext {
  /** The module — `tummy`, the one with a second life (`modules/variants.ts`). */
  activity: string;
  /** `playtime`, or null for the module's own word. */
  variant: ModuleVariant | null;
  /**
   * THE GOAL THE WORD BRINGS WITH IT, in the same op (the owner, 2026-09-26): three hours going on
   * to Playtime, the kept tummy-time goal coming back (`graduationSettings` in core). Absent
   * leaves the goal as it is — a write of the word alone, as the switch made before.
   */
  goalMinutes?: number | null;
  /**
   * The goal the module's own word had, kept while the variant is on (migration 0127) — written
   * into this phone's mirror at once so a switch back offline finds it. The server keeps its own
   * copy by a trigger, from its own row, and the next pull settles any difference.
   */
  baseGoalMinutes?: number | null;
  intentId?: string;
}

/**
 * The module's second life (migration 0098): one column on the module's own settings row, the
 * same row and the same chain as the daily goal, so both parents' phones say the same word — and
 * since 2026-09-26 the goal that goes with the word, in the SAME op, so the word and its goal can
 * never land apart (a word on one phone and its goal lost to a failed second write).
 *
 * NOT UNDOABLE THROUGH THE OUTBOX, for the day window's reason: a setting is changed by changing
 * it back. The Playtime switch offers an Undo all the same, and it is exactly that — the row as it
 * was, written back whole through here (`WhatYouTrackScreen`). Checked before a row is written, so
 * a variant the module cannot take, or a goal the column refuses, fails on the phone rather than
 * as a rejected op later.
 */
export async function saveModuleVariant(
  db: Db,
  clock: Clock,
  input: SaveModuleVariantInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  if (input.variant !== null && !variantsOf(input.activity).includes(input.variant))
    throw new RangeError(`${input.activity} has no ${input.variant} variant`);
  for (const n of [input.goalMinutes, input.baseGoalMinutes])
    if (n !== undefined && n !== null && !isGoalMinutes(n))
      throw new RangeError(`a daily goal is a whole number of minutes, not ${n}`);
  const intentId = input.intentId ?? newIntentId();
  const at = clock.iso();
  const chain = moduleSettingChain({
    ...baseOf(input, intentId, at),
    moduleId: input.activity,
    patch: {
      variant: input.variant,
      ...(input.goalMinutes === undefined ? {} : { goal_minutes: input.goalMinutes }),
      ...(input.baseGoalMinutes === undefined ? {} : { base_goal_minutes: input.baseGoalMinutes }),
    },
  });
  chain.rows[0] = {
    table: 'module_settings',
    row: { ...chain.rows[0]?.row, updated_at: at },
  };
  return commitWrite(
    db,
    clock,
    { intentId, chain, source: input.source, invalidates: [keys.modules(input.householdId)] },
    deps,
  );
}

export interface SavePreferenceInput extends WriteContext {
  userId: string;
  channel: string;
  patch: NotificationPreferencePatch;
  intentId?: string;
}

/** The viewer's own row for a channel (NOTIFICATIONS §6, §9). */
export async function savePreference(
  db: Db,
  clock: Clock,
  input: SavePreferenceInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const intentId = input.intentId ?? newIntentId();
  const at = clock.iso();
  const chain = notificationPreferenceChain({
    ...baseOf(input, intentId, at),
    userId: input.userId,
    channel: input.channel,
    patch: input.patch,
  });
  chain.rows[0] = {
    table: 'notification_preferences',
    row: { ...chain.rows[0]?.row, updated_at: at },
  };
  return commitWrite(
    db,
    clock,
    {
      intentId,
      chain,
      source: input.source,
      invalidates: [keys.prefs(input.householdId, input.userId)],
    },
    deps,
  );
}

export interface SavePreferencesInput extends WriteContext {
  userId: string;
  /** Every channel the one patch is written to. Duplicates are written once. */
  channels: readonly string[];
  patch: NotificationPreferencePatch;
  intentId?: string;
}

/**
 * THE SAME PATCH ON MANY CHANNELS, IN ONE WRITE (the owner, 2026-09-26: *"in reminders menu,
 * there is a delay when adjusting quiet hours, sometimes there is a delay when turning off or
 * on"*).
 *
 * Quiet hours, and "All reminders", are one setting to a parent and one row per module channel in
 * the table (NOTIFICATIONS §6). The Reminders page used to write them with `savePreference` in a
 * loop: a transaction, a commit and an invalidation per channel, awaited one after another. Every
 * commit bumps the prefs key and the outbox key, and each bump re-reads the preferences, re-plans
 * and reconciles the phone's scheduled notifications, re-reads Today's and the duty queries and
 * wakes the sync engine — so one tap was that whole round once per channel, and the switch, which
 * showed what the database said, waited for the last of them. Turning quiet hours OFF waited
 * longest, because the page reads "on" while any channel still has a window.
 *
 * Here it is one transaction, one commit and one invalidation, whatever the count: the rows land
 * together and everything that listens hears once. Each channel is still its own op — the server
 * upserts a row per channel — with an id derived from the one intent and the channel, so a retry
 * of the same tap is the same ops and never a second set.
 */
export async function savePreferences(
  db: Db,
  clock: Clock,
  input: SavePreferencesInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const channels = [...new Set(input.channels)];
  const intentId = input.intentId ?? newIntentId();
  if (channels.length === 0) {
    return { committed: false, suppressed: false, intentId, opIds: [], entityIds: [] };
  }
  const at = clock.iso();
  const chains: Chain[] = channels.map(channel => {
    const one = notificationPreferenceChain({
      ...baseOf(input, deriveOpId(intentId, `pref:${channel}`), at),
      userId: input.userId,
      channel,
      patch: input.patch,
    });
    return {
      rows: one.rows.map(r => ({ table: r.table, row: { ...r.row, updated_at: at } })),
      ops: one.ops,
    };
  });
  return commitWrite(
    db,
    clock,
    {
      intentId,
      chain: { rows: chains.flatMap(c => c.rows), ops: chains.flatMap(c => c.ops) },
      source: input.source,
      invalidates: [keys.prefs(input.householdId, input.userId)],
    },
    deps,
  );
}
