/**
 * NIBBLECUE, AS TWO PARENTS LIVE IT, against the in-app test sync server (`sync/providers/mock.ts`,
 * which follows CuddleCue's migrations 0161 and 0162 for NibbleCue's records). Every step is the
 * write a screen makes (`nibble/writes.ts`), the outbox flush the sync worker makes, and the pull
 * the other phone makes, with the plan derived on each phone from its own mirror.
 *
 *   A. the food profile and a first-allergen meal, written offline on one phone, reach the other
 *   B. both phones derive the same plan from the same log ("the plan is derived, never stored")
 *   C. something noticed after the egg: one Health note for CuddleCue, egg on hold on both phones
 *   D. who may change what: a caregiver logs and notes but never edits the profile; a view-only
 *      seat writes nothing; a record's kind cannot be renamed to dodge the rule
 *   E. a retried op is applied once
 */
import {
  allergenStates,
  buildPlan,
  exposuresFrom,
  FOOD_BY_ID,
  FOODS,
  NibbleProfile,
  noticedForPlan,
  profileFor,
  readRecords,
  type Food,
} from '@nibblecue/core/nibble';
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/driver';
import { healthNotes, nibbleRecords, solidsMeals } from '../db/queries/nibble';
import { logServed, saveNoticed, saveRecord } from '../nibble/writes';
import { addDevice, createSyncHarness, PARTNER, type SyncHarness } from '../sync/harness';
import { PullEngine } from '../sync/pull';
import { CHILD_A, HOUSEHOLD, USER } from '../testing/fixtures';

const CAREGIVER = 'bbbbbbbb-0000-4000-8000-000000000003';
const VIEWER = 'bbbbbbbb-0000-4000-8000-000000000004';
const PULLED = ['children', 'nibble_records', 'activities'];
const BIRTH = '2026-03-01';

let open: SyncHarness | null = null;
afterEach(() => {
  open?.dispose();
  open = null;
});

const ctx = (userId: string, deviceId: string) => ({
  householdId: HOUSEHOLD,
  createdBy: userId,
  deviceId,
  source: 'quicklog' as const,
});

const food = (id: string): Food => {
  const f = FOOD_BY_ID.get(id);
  if (!f) throw new Error(`no food ${id}`);
  return f;
};

/** What a phone's screens read: its mirror, through the same queries `useNibble` runs. */
async function view(db: Db, today: string) {
  const records = await nibbleRecords(db, HOUSEHOLD);
  const meals = await solidsMeals(db, HOUSEHOLD);
  const notes = await healthNotes(db, HOUSEHOLD);
  const profile = profileFor(records, CHILD_A);
  const exposures = exposuresFrom(
    meals
      .filter(m => m.child_id === CHILD_A)
      .map(m => ({
        id: m.id,
        childId: m.child_id,
        startAt: m.start_at,
        meal: m.meal,
        items: m.items,
        food: m.food,
      })),
    ({ id }) => (id !== null ? FOOD_BY_ID.get(id) : undefined),
  );
  const noticed = noticedForPlan(
    readRecords(records, 'noticed').map(r => r.body),
    notes.map(n => ({ id: n.id, childId: n.child_id, startAt: n.start_at })),
  );
  const effective = profile?.body ?? NibbleProfile.parse({ stage: 'started' });
  const allergens = allergenStates({
    profile: effective,
    exposures,
    noticed,
    foodById: id => FOOD_BY_ID.get(id),
    today,
  });
  const plan =
    profile === null
      ? []
      : buildPlan({
          childId: CHILD_A,
          birthDate: BIRTH,
          today,
          days: 7,
          profile: profile.body,
          foods: FOODS,
          exposures,
          noticed,
          marks: [],
        });
  return { records, meals, notes, profile, exposures, allergens, plan };
}

/** One sync pass, as the app runs it: the worker started, one flush, stopped again. */
async function flush(worker: {
  start(): void;
  stop(): void;
  flush(r: 'manual'): Promise<unknown>;
}) {
  worker.start();
  await worker.flush('manual');
  worker.stop();
}

async function pullInto(db: Db, h: SyncHarness, userId: string, api = h.ctx.otherDevice) {
  const engine = new PullEngine({ db, api, clock: h.clock, householdId: HOUSEHOLD, userId });
  await engine.pullTables(PULLED);
}

describe('NibbleCue across two phones', () => {
  it('A–C: a profile and a first egg reach the other phone, and a noticed sign holds egg on both', async () => {
    const h = await createSyncHarness({ scenario: 'nibble-a' });
    open = h;
    const today = h.clock.iso().slice(0, 10);

    // A. offline on the owner's phone: the profile, then breakfast with a first taste of egg
    const profile = await saveRecord(h.db, h.clock, ctx(USER, 'device-1'), {
      childId: CHILD_A,
      kind: 'profile',
      body: NibbleProfile.parse({ stage: 'started', startedOn: '2026-02-20' }),
    });
    expect(profile.committed).toBe(true);
    const meal = await logServed(h.db, h.clock, ctx(USER, 'device-1'), {
      childId: CHILD_A,
      meal: 'breakfast',
      atIso: h.clock.iso(),
      foods: [
        {
          food: food('egg'),
          form: 'mashed',
          response: 'LIKED',
          planItem: `${today}:breakfast:egg`,
        },
        { food: food('avocado'), form: 'mashed', response: 'LOVED', planItem: null },
      ],
    });
    expect(meal.committed).toBe(true);
    // the meal is CuddleCue's own solids entry, with NibbleCue's keys on each line
    const [mine] = await solidsMeals(h.db, HOUSEHOLD);
    expect(mine?.meal).toBe('BREAKFAST');
    expect(JSON.parse(mine?.items ?? '[]')).toMatchObject([
      { name: 'Egg', response: 'LIKED', food_id: 'egg', form: 'mashed' },
      { name: 'Avocado', response: 'LOVED', food_id: 'avocado' },
    ]);

    await flush(h.worker());
    expect(h.server.nibble_records).toHaveLength(1);

    // the partner's phone pulls both
    const partner = await addDevice(h, PARTNER);
    await pullInto(partner.db, h, PARTNER);
    const one = await view(h.db, today);
    const two = await view(partner.db, today);
    expect(two.profile?.body).toEqual(one.profile?.body);
    expect(two.exposures.map(e => e.foodId)).toEqual(['egg', 'avocado']);
    expect(two.allergens.egg.kind).toBe('introduced');

    // B. the same log gives the same plan on both phones
    expect(two.plan).toEqual(one.plan);
    expect(one.plan.length).toBe(7);

    // C. the partner notices hives after the egg: one Health note, one record naming the foods
    const noticed = await saveNoticed(partner.db, h.clock, ctx(PARTNER, 'device-2'), {
      childId: CHILD_A,
      atIso: h.clock.iso(),
      ongoing: false,
      signs: ['hives'],
      notes: 'A few spots on the cheeks',
      foodIds: ['egg'],
      mealId: mine?.id ?? null,
      onsetMinutes: 60,
    });
    expect(noticed.note.committed).toBe(true);
    expect(noticed.record?.committed).toBe(true);
    await flush(partner.worker());
    await pullInto(h.db, h, USER, h.api);

    const after = await view(h.db, today);
    expect(after.notes).toHaveLength(1);
    expect(after.notes[0]?.notes).toBe('A few spots on the cheeks');
    expect(after.allergens.egg.kind).toBe('held');
    expect(after.allergens.egg.hold).toBe('noticed');
    // nothing on the plan offers egg while it is held
    const planned = after.plan.flatMap(d => d.meals.flatMap(m => m.items));
    expect(planned.some(i => FOOD_BY_ID.get(i.foodId)?.allergens.includes('egg'))).toBe(false);
    const partnerAfter = await view(partner.db, today);
    expect(partnerAfter.plan).toEqual(after.plan);
  });

  it('D: a caregiver logs and notes but never edits the profile; a viewer writes nothing', async () => {
    const h = await createSyncHarness({ scenario: 'nibble-d' });
    open = h;
    h.server.addMember({ household_id: HOUSEHOLD, user_id: CAREGIVER, role: 'CAREGIVER' });
    h.server.addMember({ household_id: HOUSEHOLD, user_id: VIEWER, role: 'VIEW_ONLY' });

    const sitter = await addDevice(h, CAREGIVER);
    const changed = await saveRecord(sitter.db, h.clock, ctx(CAREGIVER, 'device-3'), {
      childId: CHILD_A,
      kind: 'profile',
      body: NibbleProfile.parse({ stage: 'started', allergenMode: 'none' }),
    });
    expect(changed.committed).toBe(true);
    const note = await saveRecord(sitter.db, h.clock, ctx(CAREGIVER, 'device-3'), {
      childId: CHILD_A,
      kind: 'noticed',
      body: {
        at: h.clock.iso(),
        activityId: null,
        noteId: null,
        foodIds: [],
        signs: ['rash'],
        onsetMinutes: null,
        notes: null,
      },
    });
    expect(note.committed).toBe(true);
    await flush(sitter.worker());
    // the noticed record landed; the profile was refused, never applied
    expect(h.server.nibble_records.map(r => r['kind'])).toEqual(['noticed']);

    // renaming the noticed record to a profile is refused: kind never changes
    const renamed = await saveRecord(sitter.db, h.clock, ctx(CAREGIVER, 'device-3'), {
      recordId: note.recordId,
      childId: CHILD_A,
      kind: 'profile',
      body: NibbleProfile.parse({ stage: 'started' }),
    });
    expect(renamed.committed).toBe(true);
    await flush(sitter.worker());
    expect(h.server.nibble_records.map(r => r['kind'])).toEqual(['noticed']);

    const viewer = await addDevice(h, VIEWER);
    await saveRecord(viewer.db, h.clock, ctx(VIEWER, 'device-4'), {
      childId: CHILD_A,
      kind: 'noticed',
      body: {
        at: h.clock.iso(),
        activityId: null,
        noteId: null,
        foodIds: [],
        signs: ['other'],
        onsetMinutes: null,
        notes: null,
      },
    });
    await flush(viewer.worker());
    expect(h.server.nibble_records).toHaveLength(1);
  });

  it('E: a retried op is answered duplicate and applied once', async () => {
    const h = await createSyncHarness({ scenario: 'nibble-e' });
    open = h;
    await saveRecord(h.db, h.clock, ctx(USER, 'device-1'), {
      childId: null,
      kind: 'custom_food',
      body: {
        name: 'Lentil soup',
        category: 'plant_protein',
        allergens: [],
        chokingRisk: 'low',
        notBeforeMonths: 6,
        ironRich: true,
      },
    });
    const [op] = await h.db.all<{
      client_op_id: string;
      payload: string;
      entity_id: string;
      op: string;
      entity: string;
    }>(`select client_op_id, payload, entity_id, op, entity from outbox`);
    await flush(h.worker());
    expect(h.server.nibble_records).toHaveLength(1);
    // the same op again, as a phone whose answer was lost would send it
    const again = await h.api.push([
      {
        client_op_id: op!.client_op_id,
        household_id: HOUSEHOLD,
        entity: 'nibble_record',
        entity_id: op!.entity_id,
        op: 'CREATE',
        payload: JSON.parse(op!.payload) as Record<string, unknown>,
        client_seq: 99,
      } as Parameters<typeof h.api.push>[0][number],
    ]);
    expect(again.results[0]?.status).toBe('duplicate');
    expect(h.server.nibble_records).toHaveLength(1);
  });
});
