/**
 * A PHONE UPGRADED FROM ANY RELEASED VERSION HOLDS THE SAME DATABASE AS A FRESH INSTALL (the owner,
 * 2026-09-24: "make sure the local database match to all these changes on the app and that
 * everything is functional").
 *
 * `mirror-parity.test.ts` holds a FRESH database against the server's migrations. What it cannot
 * see is the owner's own phone: installed weeks ago at some early version and upgraded through
 * every one since. The failure that path invites is an old version's statements edited after
 * phones had applied them — a fresh install gets the change, an upgraded phone never does, and a
 * query that reads the new column fails only on the phones that matter. So: build a database at
 * every version a phone could be sitting at, upgrade it, and require the result to be identical —
 * every table, every column with its type, default and nullability, every index — to one built
 * from nothing. And then run the app's own reads and writes on the upgraded file.
 */
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  LOCAL_SCHEMA_V1,
  LOCAL_SCHEMA_V2,
  LOCAL_SCHEMA_V3,
  LOCAL_SCHEMA_V4,
  LOCAL_SCHEMA_V5,
  LOCAL_SCHEMA_V6,
  LOCAL_SCHEMA_V7,
  LOCAL_SCHEMA_V8,
  LOCAL_SCHEMA_V9,
  LOCAL_SCHEMA_V10,
  LOCAL_SCHEMA_V11,
  LOCAL_SCHEMA_V12,
  LOCAL_SCHEMA_V13,
  LOCAL_SCHEMA_V14,
  LOCAL_SCHEMA_V15,
  LOCAL_SCHEMA_V16,
  LOCAL_SCHEMA_V17,
  LOCAL_SCHEMA_V18,
  LOCAL_SCHEMA_V19,
  LOCAL_SCHEMA_V20,
  LOCAL_SCHEMA_V21,
  LOCAL_SCHEMA_V22,
  LOCAL_SCHEMA_VERSION,
  migrateLocalDb,
  relaxNotNull,
  type SqlRunner,
  type TableColumn,
} from './schema';

/** Every version's statements, in the order the runner applies them. */
const LADDER: readonly (readonly string[])[] = [
  LOCAL_SCHEMA_V1,
  LOCAL_SCHEMA_V2,
  LOCAL_SCHEMA_V3,
  LOCAL_SCHEMA_V4,
  LOCAL_SCHEMA_V5,
  LOCAL_SCHEMA_V6,
  LOCAL_SCHEMA_V7,
  LOCAL_SCHEMA_V8,
  LOCAL_SCHEMA_V9,
  LOCAL_SCHEMA_V10,
  LOCAL_SCHEMA_V11,
  LOCAL_SCHEMA_V12,
  LOCAL_SCHEMA_V13,
  LOCAL_SCHEMA_V14,
  LOCAL_SCHEMA_V15,
  LOCAL_SCHEMA_V16,
  LOCAL_SCHEMA_V17,
  LOCAL_SCHEMA_V18,
  LOCAL_SCHEMA_V19,
  LOCAL_SCHEMA_V20,
  LOCAL_SCHEMA_V21,
  LOCAL_SCHEMA_V22,
];

function open(): { db: DatabaseSync; runner: SqlRunner } {
  const db = new DatabaseSync(':memory:');
  const runner: SqlRunner = {
    exec: sql => db.exec(sql),
    userVersion: () =>
      (db.prepare('pragma user_version').get() as { user_version: number }).user_version,
    setUserVersion: v => db.exec(`pragma user_version = ${v}`),
    tableInfo: t => db.prepare(`pragma table_info(${t})`).all() as unknown as TableColumn[],
  };
  return { db, runner };
}

/** A phone as it was at `version`: exactly the statements it had applied, and the stamp. */
function phoneAt(version: number) {
  const phone = open();
  for (let v = 1; v <= version; v++) for (const stmt of LADDER[v - 1] ?? []) phone.db.exec(stmt);
  phone.db.exec(`pragma user_version = ${version}`);
  return phone;
}

/** The whole shape of a database, in a form two databases can be compared by. */
function shape(db: DatabaseSync) {
  const tables = (
    db
      .prepare(
        "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name",
      )
      .all() as { name: string }[]
  ).map(t => t.name);
  const columns = Object.fromEntries(
    tables.map(t => [
      t,
      (
        db.prepare(`pragma table_info(${t})`).all() as {
          name: string;
          type: string;
          notnull: number;
          dflt_value: string | null;
          pk: number;
        }[]
      )
        .map(
          c =>
            `${c.name} ${c.type} ${c.notnull ? 'not null' : 'null'} ${c.dflt_value ?? '-'} pk${c.pk}`,
        )
        .sort(),
    ]),
  );
  const indexes = (
    db
      .prepare(
        "select name, tbl_name as t from sqlite_master where type = 'index' and name not like 'sqlite_%' order by name",
      )
      .all() as { name: string; t: string }[]
  ).map(i => `${i.t}.${i.name}`);
  return { tables, columns, indexes };
}

describe('the ladder', () => {
  it('names every version the runner applies, and no more', () => {
    expect(LADDER).toHaveLength(LOCAL_SCHEMA_VERSION);
  });

  it('upgrades a phone from EVERY released version to exactly what a fresh install holds', async () => {
    const fresh = open();
    await migrateLocalDb(fresh.runner);
    const want = shape(fresh.db);
    expect(want.tables.length).toBeGreaterThan(30);

    for (let from = 1; from < LOCAL_SCHEMA_VERSION; from++) {
      const phone = phoneAt(from);
      expect(await migrateLocalDb(phone.runner), `from v${from}`).toEqual({
        from,
        to: LOCAL_SCHEMA_VERSION,
      });
      expect(shape(phone.db), `upgraded from v${from}`).toEqual(want);
    }
  });

  it('opens a phone whose v18 upgrade was killed between two of its columns', async () => {
    const phone = phoneAt(17);
    // the first `add column` landed, then the app was killed before the version was stamped
    phone.db.exec(LOCAL_SCHEMA_V18[0] as string);
    expect(await migrateLocalDb(phone.runner)).toEqual({ from: 17, to: LOCAL_SCHEMA_VERSION });
    const fresh = open();
    await migrateLocalDb(fresh.runner);
    expect(shape(phone.db)).toEqual(shape(fresh.db));
  });

  /**
   * THE HOUSEHOLD'S MILK UNIT (v21, migration 0128): a household that set its waking window has a
   * `household_settings` row on the phone already, and the upgrade must keep its times — and read
   * ounces, the server's own default for it, until the next pull brings the household's choice.
   */
  it('keeps the household settings row through v21, reading ounces until the pull says otherwise', async () => {
    const phone = phoneAt(20);
    phone.db.exec(
      `insert into household_settings (household_id, wake_time, bed_time, updated_at)
       values ('h1', '06:30', '20:15', '2026-09-26T00:00:00Z')`,
    );
    expect(await migrateLocalDb(phone.runner)).toEqual({ from: 20, to: LOCAL_SCHEMA_VERSION });
    expect(
      phone.db.prepare('select wake_time, bed_time, volume_unit from household_settings').all(),
    ).toEqual([{ wake_time: '06:30', bed_time: '20:15', volume_unit: 'oz' }]);
    // and the column takes what a pull or a local write puts there
    phone.db.exec(`update household_settings set volume_unit = 'ml' where household_id = 'h1'`);
    expect(phone.db.prepare('select volume_unit from household_settings').all()).toEqual([
      { volume_unit: 'ml' },
    ]);
  });

  /**
   * A BABY ON THE WAY (migration 0150): `children.birth_date` was NOT NULL from v1, and the first
   * pull of a child set up before the birth would have stopped on it. Every phone, fresh or
   * upgraded, rebuilds the table once; the children it held are kept exactly, the shape is the same
   * as a fresh install's, and a second open has nothing left to do.
   */
  it('lets a child have no birth date, keeping every child a phone already holds', async () => {
    const phone = phoneAt(LOCAL_SCHEMA_VERSION);
    phone.db.exec(
      `insert into children (id, household_id, name, birth_date, due_date, sort_order, created_at, updated_at, photo_path)
       values ('c1', 'h1', 'Ada', '2026-06-01', '2026-06-10', 0, '2026-06-02T00:00:00Z', '2026-06-02T00:00:00Z', 'h1/c1.jpg'),
              ('c2', 'h1', 'Ben', '2026-06-01', null, 1, '2026-06-02T00:00:01Z', '2026-06-02T00:00:01Z', null)`,
    );
    const notNull = () =>
      (phone.db.prepare('pragma table_info(children)').all() as unknown as TableColumn[]).find(
        c => c.name === 'birth_date',
      )?.notnull;
    expect(notNull()).toBe(1);
    await migrateLocalDb(phone.runner);
    expect(notNull()).toBe(0);
    expect(
      phone.db
        .prepare(
          'select id, name, birth_date, due_date, sort_order, created_at, updated_at, photo_path from children order by id',
        )
        .all(),
    ).toEqual([
      {
        id: 'c1',
        name: 'Ada',
        birth_date: '2026-06-01',
        due_date: '2026-06-10',
        sort_order: 0,
        created_at: '2026-06-02T00:00:00Z',
        updated_at: '2026-06-02T00:00:00Z',
        photo_path: 'h1/c1.jpg',
      },
      {
        id: 'c2',
        name: 'Ben',
        birth_date: '2026-06-01',
        due_date: null,
        sort_order: 1,
        created_at: '2026-06-02T00:00:01Z',
        updated_at: '2026-06-02T00:00:01Z',
        photo_path: null,
      },
    ]);
    // the baby on the way, as a pull brings it
    phone.db.exec(
      `insert into children (id, household_id, name, birth_date, due_date, updated_at) values ('c3', 'h1', 'Baby', null, '2026-12-01', '2026-10-01T00:00:00Z')`,
    );
    // the key is still the key, and every other NOT NULL still holds
    expect(() =>
      phone.db.exec(
        `insert into children (id, household_id, name, birth_date, updated_at) values ('c3', 'h1', 'X', null, '2026-10-01T00:00:00Z')`,
      ),
    ).toThrow();
    expect(() =>
      phone.db.exec(
        `insert into children (id, household_id, name, updated_at) values ('c4', 'h1', null, '2026-10-01T00:00:00Z')`,
      ),
    ).toThrow();
    // the default is still the default
    expect(phone.db.prepare(`select sort_order from children where id = 'c3'`).get()).toEqual({
      sort_order: 0,
    });
    // and a second open finds nothing to do and leaves the shape alone
    const before = shape(phone.db);
    await migrateLocalDb(phone.runner);
    expect(shape(phone.db)).toEqual(before);
    expect(phone.db.prepare('select count(*) as n from children').get()).toEqual({ n: 3 });
  });

  it('rebuilds a table from its own columns, key and defaults, dropping only the one NOT NULL', () => {
    const cols: TableColumn[] = [
      { name: 'id', type: 'text', notnull: 0, dflt_value: null, pk: 1 },
      { name: 'name', type: 'text', notnull: 1, dflt_value: null, pk: 0 },
      { name: 'birth_date', type: 'text', notnull: 1, dflt_value: null, pk: 0 },
      { name: 'sort_order', type: 'integer', notnull: 1, dflt_value: '0', pk: 0 },
    ];
    expect(relaxNotNull('children', 'birth_date', cols)).toEqual([
      'drop table if exists children_relaxed',
      'create table children_relaxed (id text, name text not null, birth_date text, sort_order integer not null default (0), primary key (id))',
      'insert into children_relaxed (id, name, birth_date, sort_order) select id, name, birth_date, sort_order from children',
      'drop table children',
      'alter table children_relaxed rename to children',
    ]);
  });

  it('keeps every row an upgrade finds, and re-reads the profiles once for their units', async () => {
    const phone = phoneAt(17);
    phone.db.exec(
      `insert into profiles (id, display_name, updated_at) values ('u1', 'Dana', '2026-09-20T00:00:00Z')`,
    );
    phone.db.exec(
      `insert into sync_state (household_id, table_name, cursor_updated_at, cursor_id, last_full_sync_at)
       values ('h1', 'profiles', '2026-09-20T00:00:00Z', 'u1', '2026-09-20T00:00:00Z'),
              ('h1', 'activities', '2026-09-20T00:00:00Z', 'a1', '2026-09-20T00:00:00Z')`,
    );
    await migrateLocalDb(phone.runner);
    expect(phone.db.prepare('select display_name, weight_unit from profiles').all()).toEqual([
      { display_name: 'Dana', weight_unit: null },
    ]);
    const cursors = phone.db
      .prepare('select table_name, cursor_updated_at from sync_state order by table_name')
      .all();
    // the profiles cursor goes back to the start so the next pull brings the units; no other
    // table is touched
    expect(cursors).toEqual([
      { table_name: 'activities', cursor_updated_at: '2026-09-20T00:00:00Z' },
      { table_name: 'profiles', cursor_updated_at: null },
    ]);
  });
});

/**
 * AND THE APP WORKS ON THE UPGRADED FILE — its own writes and its own reads, not a schema diff.
 * A phone upgraded from the very first version logs one entry of every module that has a detail
 * row, and every screen's query reads them back.
 */
describe('the app on an upgraded phone', () => {
  it('logs every kind of entry and reads each one back, from a phone that started at v1', async () => {
    const { createNodeDb } = await import('../testing/local-db');
    const { logActivity } = await import('../data/activities');
    const { timelineRows, todayActivities, lastActivities } = await import('./queries/today');
    const { mealHistory } = await import('./queries/solids');
    const { FakeClock } = await import('../testing/clock');
    const phone = phoneAt(1);
    await migrateLocalDb(phone.runner);
    const db = createNodeDb(phone.db);
    const H = 'aaaaaaaa-0000-4000-8000-000000000001';
    const U = 'bbbbbbbb-0000-4000-8000-000000000001';
    const C = 'cccccccc-0000-4000-8000-0000000000e1';
    const AT = '2026-09-14T08:00:00.000Z';
    await db.run(
      'insert into profiles (id, display_name, weight_unit, created_at, updated_at) values (?, ?, ?, ?, ?)',
      [U, 'Dana', 'kg', AT, AT],
    );
    await db.run(
      'insert into households (id, name, owner_id, created_at, updated_at) values (?, ?, ?, ?, ?)',
      [H, 'Home', U, AT, AT],
    );
    await db.run(
      'insert into children (id, household_id, name, birth_date, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
      [C, H, 'Emma', '2026-06-01', AT, AT],
    );
    const clock = new FakeClock(AT);
    const base = { householdId: H, createdBy: U, deviceId: null, source: 'sheet' as const };
    const entries = [
      {
        type: 'bottle',
        childId: C,
        detail: {
          kind: 'FORMULA',
          consumed_ml: 120,
          offered_ml: 120,
          from_stash: false,
          container_id: null,
        },
      },
      {
        type: 'breastfeed',
        childId: C,
        endAt: AT,
        detail: { first_side: 'LEFT', left_seconds: 300, right_seconds: 0 },
      },
      {
        type: 'pump',
        childId: null,
        detail: { total_ml: 118, left_ml: null, right_ml: null, sides: 'BOTH' },
      },
      {
        type: 'diaper',
        childId: C,
        detail: { kind: 'BOTH', color: null, consistency: null, rash: true },
      },
      {
        type: 'sleep',
        childId: C,
        endAt: AT,
        detail: { kind: 'NAP', wake_count: null, location: null },
      },
      {
        type: 'solids',
        childId: C,
        detail: {
          meal: 'LUNCH',
          food: 'Pear',
          items: [{ name: 'Pear', amount: 2, unit: 'TBSP', response: 'LIKED' }],
          observation: null,
        },
      },
      {
        type: 'med',
        childId: C,
        detail: { name: 'Vitamin D', amount_text: '1 drop', route: 'ORAL', care_item_id: null },
      },
      { type: 'temp', childId: C, detail: { temp_c_hundredths: 3710, temp_method: 'AXILLARY' } },
      {
        type: 'growth',
        childId: C,
        detail: { weight_g: 6200, length_mm: 610, head_mm: null, standard: null },
      },
      { type: 'tummy', childId: C, endAt: AT },
      { type: 'bath', childId: C },
    ] as const;
    let minute = 0;
    for (const e of entries) {
      minute += 1;
      const startAt = new Date(Date.parse(AT) - minute * 60_000).toISOString();
      const out = await logActivity(db, clock, {
        ...base,
        ...e,
        startAt,
        ...('endAt' in e ? { endAt: AT } : {}),
      } as never);
      expect(out.committed, e.type).toBe(true);
    }
    const all = await timelineRows(db, { householdId: H, childId: C, filter: 'all', limit: 60 });
    expect(all.map(r => r.type).sort()).toEqual(
      entries
        .map(e => e.type)
        .slice()
        .sort(),
    );
    const byType = new Map(all.map(r => [r.type, r]));
    expect(byType.get('bottle')?.consumedMl).toBe(120);
    expect(byType.get('pump')?.totalMl).toBe(118);
    expect(byType.get('diaper')?.diaperRash).toBe(true);
    expect(byType.get('solids')?.solidsItems?.[0]?.name).toBe('Pear');
    expect(byType.get('temp')?.tempCHundredths).toBe(3710);
    expect(byType.get('growth')?.weightG).toBe(6200);
    expect(byType.get('med')?.medName).toBe('Vitamin D');
    expect(await todayActivities(db, H, C, Date.parse(AT) - 86_400_000)).toHaveLength(
      entries.length,
    );
    expect((await lastActivities(db, H, C)).length).toBe(entries.length);
    expect((await mealHistory(db, H))[0]?.items[0]?.unit).toBe('TBSP');
    // and the column v18 added reads back
    expect(await db.get('select weight_unit from profiles where id = ?', [U])).toEqual({
      weight_unit: 'kg',
    });
    // and the two v19 added are there to take what a pull brings
    for (const table of ['milk_containers', 'vaccine_records'])
      expect(
        (await db.all<{ name: string }>(`pragma table_info(${table})`, [])).map(c => c.name),
        table,
      ).toContain('client_edited_at');
    // and the kept goal v20 added (0127): tummy time's, while the household calls it Playtime
    expect(
      (await db.all<{ name: string }>('pragma table_info(module_settings)', [])).map(c => c.name),
    ).toContain('base_goal_minutes');
  });
});
