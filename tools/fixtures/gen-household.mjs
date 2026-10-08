/**
 * The 5,000-row household (WP4 D22): one generator, two consumers, no randomness.
 *
 * `docs/CODEX_TASKS.md` asks WP4 to stay "inside the stated budget" for a household with 5,000
 * rows, and no document states one. D22 states it — and a budget stated in prose is a budget
 * nobody measures, so this file builds the household the numbers are measured against:
 *
 *   * `packages/db/src/integration/fixtures/sync-fixture.sql`, loaded into Postgres, where
 *     `sync-budget.test.ts` measures what `public.sync_pull` actually puts on the wire;
 *   * `toPages()`, the same household as the pages a device receives, which
 *     `apps/mobile/src/sync/budget.test.ts` imports and applies to measure what it costs in
 *     SQLite.
 *
 * ONE HOUSEHOLD, TWO HALVES, because two budgets measured against two different fixtures cannot
 * be read together. Re-running this script must produce a byte-identical file: the ids are
 * uuidv5 over a fixed namespace, the only random source is a seeded PRNG, and every timestamp is
 * an absolute instant derived from `EPOCH` rather than from `now()`. A fixture that moved with
 * the wall clock would make a 24-hour delta mean something different on every run, which is the
 * one thing a tripwire may never do.
 *
 * The page set is a FUNCTION rather than a second checked-in artifact: it is the same 5,000 rows
 * as the SQL, and writing them out as JSON costs another 3.9 MB in the repository to say nothing
 * the SQL does not already say. The node budget test imports this module and builds them.
 *
 *   node tools/fixtures/gen-household.mjs           # write the SQL
 *   node tools/fixtures/gen-household.mjs --check   # fail if it is stale
 *
 * The household is deliberately its OWN household with its own owner, not an extension of the
 * dev seed's: five thousand activities inside household A would rewrite the expected counts of
 * every RLS test in the suite.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const SQL_PATH = resolve(ROOT, 'packages/db/src/integration/fixtures/sync-fixture.sql');

/* ------------------------------------------------------------------ ids and time */

/**
 * uuidv5 (RFC 4122 §4.3) over a namespace that belongs to this fixture and to nothing else.
 * It is NOT `packages/core`'s `OP_NAMESPACE`: that one is a released contract and a fixture
 * must never mint ids in it, or a test row and a real op could collide on an idempotency key.
 */
const FIXTURE_NS = 'b37f0c94-1d6a-4f2e-9c88-6e0f5a1b2c3d';

export function uuid5(namespace, name) {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(ns).update(Buffer.from(name, 'utf8')).digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const id = name => uuid5(FIXTURE_NS, name);

/** Where the fixture's history begins. Absolute, so the 24-hour window is always the same day. */
export const EPOCH = Date.parse('2026-07-01T00:00:00.000Z');
const DAY = 86_400_000;
export const DAYS = 60;
/** The last instant the fixture writes. The 24-hour delta is everything after END - 1 day. */
export const END = EPOCH + DAYS * DAY;

const iso = ms => new Date(ms).toISOString();

/** mulberry32: a seeded PRNG, so "arbitrary" and "stable across reruns" are both true. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ the shape (D22) */

export const COUNTS = {
  children: 2,
  activities: 5000,
  containers: 300,
  ledger: 1200,
  rules: 40,
  instances: 40,
};

export const IDS = {
  household: id('household'),
  owner: id('owner'),
  partner: id('partner'),
  location: id('location'),
  child: [id('child:0'), id('child:1')],
  phase: [id('phase:0'), id('phase:1')],
};

/**
 * The mix of a real household's log, as a weighted deck. It is not uniform on purpose: a
 * household logs far more diapers and feeds than milestones, and the wire size of a delta is
 * dominated by whichever detail table the common entries carry.
 */
const DECK = [
  ['diaper', 26],
  ['bottle', 20],
  ['breastfeed', 14],
  ['sleep', 12],
  ['pump', 8],
  ['solids', 6],
  ['water', 4],
  ['tummy', 3],
  ['med', 2],
  ['bath', 2],
  ['note', 1],
  ['growth', 1],
  ['temp', 1],
  ['milestone', 1],
];

const DECK_FLAT = DECK.flatMap(([type, weight]) => new Array(weight).fill(type));

const DETAIL_TABLE = {
  bottle: 'bottle_details',
  breastfeed: 'breastfeed_details',
  pump: 'pump_details',
  diaper: 'diaper_details',
  sleep: 'sleep_details',
  solids: 'solids_details',
  med: 'med_details',
  growth: 'measurement_details',
  temp: 'measurement_details',
  water: null,
  tummy: null,
  bath: null,
  milestone: null,
  note: null,
};

const pick = (r, list) => list[Math.floor(r() * list.length)];

/* ------------------------------------------------------------------ the household */

/**
 * Build the whole household in memory, as rows in server shape.
 *
 * Every row carries an explicit `created_at`/`updated_at`: the tables default them to `now()`,
 * and a fixture that let them default would have five thousand rows all modified at load time —
 * which makes "the last 24 hours" either everything or nothing, depending on when the test ran.
 */
export function buildHousehold() {
  const r = rng(0x5eed4);
  const activities = [];
  const details = {
    bottle_details: [],
    breastfeed_details: [],
    pump_details: [],
    diaper_details: [],
    sleep_details: [],
    solids_details: [],
    med_details: [],
    measurement_details: [],
  };

  // Entries are spread evenly across the window rather than clustered, so a 24-hour delta is
  // exactly one day's worth (5000 / 60 ≈ 83 entries) and the number in the report is readable.
  const step = (DAYS * DAY) / COUNTS.activities;
  for (let i = 0; i < COUNTS.activities; i++) {
    const type = pick(r, DECK_FLAT);
    const at = Math.round(EPOCH + i * step);
    const childId = IDS.child[i % 2];
    const author = r() < 0.6 ? IDS.owner : IDS.partner;
    const activityId = id(`activity:${i}`);
    const ended = type === 'sleep' || type === 'breastfeed' || type === 'tummy';
    activities.push({
      id: activityId,
      client_op_id: id(`op:${i}`),
      household_id: IDS.household,
      child_id: type === 'pump' ? null : childId,
      type,
      start_at: iso(at),
      end_at: ended ? iso(at + Math.round(r() * 3_600_000)) : null,
      quantity: quantityFor(type, r),
      canonical_unit: unitFor(type),
      notes: type === 'note' ? 'a good day' : null,
      is_private: type === 'pump' && r() < 0.1,
      metadata: {},
      created_by: author,
      updated_by: null,
      device_id: null,
      created_at: iso(at),
      updated_at: iso(at),
      deleted_at: null,
    });
    const table = DETAIL_TABLE[type];
    if (table !== null) details[table].push(detailRow(table, type, activityId, r));
  }

  // Containers: one per pumping day, each with its ADD row, and enough USE rows to make the
  // ledger 1,200 long without ever drawing a container below zero (`app.assert_container_balance`
  // would refuse the statement, which is the point of generating it this way rather than by hand).
  const containers = [];
  const ledger = [];
  const containerStep = (DAYS * DAY) / COUNTS.containers;
  for (let i = 0; i < COUNTS.containers; i++) {
    const at = Math.round(EPOCH + i * containerStep);
    const containerId = id(`container:${i}`);
    const ml = 60 + Math.round(r() * 120);
    containers.push({
      id: containerId,
      household_id: IDS.household,
      owner_id: IDS.owner,
      source_activity_id: null,
      location_id: IDS.location,
      container_type: 'BAG',
      // 0, and the balance trigger is the only writer of this column (0009:538).
      amount_ml: 0,
      initial_ml: ml,
      pumped_at: iso(at),
      status: 'STORED',
      created_by: IDS.owner,
      created_at: iso(at),
      updated_at: iso(at),
    });
    ledger.push({
      id: id(`txn:add:${i}`),
      client_op_id: id(`txnop:add:${i}`),
      household_id: IDS.household,
      container_id: containerId,
      kind: 'ADD',
      delta_ml: ml,
      occurred_at: iso(at),
      created_by: IDS.owner,
      created_at: iso(at),
    });
  }
  // 900 draws over the first 300 containers, three each, each a third of what is in it: the
  // balance can never go negative and the arithmetic is checkable by eye.
  const draws = COUNTS.ledger - COUNTS.containers;
  for (let i = 0; i < draws; i++) {
    const c = containers[i % containers.length];
    const at = Date.parse(c.pumped_at) + (Math.floor(i / containers.length) + 1) * 3_600_000;
    ledger.push({
      id: id(`txn:use:${i}`),
      client_op_id: id(`txnop:use:${i}`),
      household_id: IDS.household,
      container_id: c.id,
      kind: 'USE',
      delta_ml: -Math.floor(c.initial_ml / 4),
      occurred_at: iso(at),
      created_by: IDS.owner,
      created_at: iso(at),
    });
  }

  const rules = [];
  const instances = [];
  for (let i = 0; i < COUNTS.rules; i++) {
    const ruleId = id(`rule:${i}`);
    const childIndex = i % 2;
    const at = EPOCH + i * 3_600_000;
    rules.push({
      id: ruleId,
      household_id: IDS.household,
      phase_id: IDS.phase[childIndex],
      child_id: IDS.child[childIndex],
      activity: pick(r, ['bottle', 'sleep', 'diaper', 'med', 'bath']),
      effective_from: iso(EPOCH),
      rule_type: 'FIXED',
      at_local_time: `${String(i % 24).padStart(2, '0')}:00`,
      created_at: iso(at),
      updated_at: iso(at),
    });
    instances.push({
      id: id(`instance:${i}`),
      household_id: IDS.household,
      rule_id: ruleId,
      child_id: IDS.child[childIndex],
      scheduled_for: iso(END - (COUNTS.instances - i) * 3_600_000),
      local_date: iso(END - (COUNTS.instances - i) * 3_600_000).slice(0, 10),
      status: 'UPCOMING',
      created_at: iso(at),
      updated_at: iso(at),
    });
  }

  return {
    meta: {
      ...COUNTS,
      household_id: IDS.household,
      owner_id: IDS.owner,
      epoch: iso(EPOCH),
      end: iso(END),
      /** The cursor a "typical 24 h delta" starts from. */
      delta_since: iso(END - DAY),
    },
    activities,
    details,
    containers,
    ledger,
    rules,
    instances,
  };
}

function quantityFor(type, r) {
  if (type === 'bottle') return 60 + Math.round(r() * 120);
  if (type === 'pump') return 40 + Math.round(r() * 120);
  if (type === 'water') return 10 + Math.round(r() * 40);
  if (type === 'tummy') return 3 + Math.round(r() * 12);
  return null;
}

function unitFor(type) {
  if (type === 'bottle' || type === 'pump' || type === 'water') return 'ml';
  if (type === 'tummy') return 'min';
  return null;
}

function detailRow(table, type, activityId, r) {
  switch (table) {
    case 'bottle_details':
      return {
        activity_id: activityId,
        kind: pick(r, ['EBM', 'FORMULA', 'MIXED']),
        offered_ml: null,
        consumed_ml: 60 + Math.round(r() * 120),
        from_stash: false,
        container_id: null,
      };
    case 'breastfeed_details':
      return {
        activity_id: activityId,
        first_side: pick(r, ['LEFT', 'RIGHT']),
        left_seconds: Math.round(r() * 900),
        right_seconds: Math.round(r() * 900),
      };
    case 'pump_details':
      return {
        activity_id: activityId,
        sides: 'BOTH',
        left_ml: null,
        right_ml: null,
        total_ml: 40 + Math.round(r() * 120),
        stored_to_stash: false,
      };
    case 'diaper_details':
      return {
        activity_id: activityId,
        kind: pick(r, ['WET', 'DIRTY', 'BOTH']),
        color: null,
        consistency: null,
        rash: false,
      };
    case 'sleep_details':
      return { activity_id: activityId, kind: pick(r, ['NAP', 'NIGHT']), wake_count: null };
    case 'solids_details':
      return {
        activity_id: activityId,
        meal: pick(r, ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']),
        food: pick(r, ['pear', 'oatmeal', 'avocado', 'carrot']),
        taken: null,
        observation: null,
      };
    case 'med_details':
      // The amount is TEXT, exactly as the parent typed it. Nothing in this repository
      // calculates a pediatric dose (CLAUDE.md rule 4), including a fixture.
      return { activity_id: activityId, name: 'Vitamin D', amount_text: '1 drop', route: null };
    case 'measurement_details':
      return type === 'temp'
        ? { activity_id: activityId, temp_c_hundredths: 3650 + Math.round(r() * 80) }
        : {
            activity_id: activityId,
            weight_g: 4000 + Math.round(r() * 2000),
            length_mm: 520 + Math.round(r() * 60),
          };
    default:
      throw new Error(`no detail shape for ${table}`);
  }
}

/* ------------------------------------------------------------------ the SQL */

const q = v => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

/** One multi-row INSERT per 200 rows: the same statement, a twentieth of the bytes. */
function insertMany(table, columns, rows, conflict = 'do nothing') {
  if (rows.length === 0) return '';
  const chunks = [];
  for (let i = 0; i < rows.length; i += 200) {
    const slice = rows.slice(i, i + 200);
    const values = slice.map(row => `(${columns.map(c => q(row[c])).join(',')})`).join(',\n  ');
    chunks.push(
      `insert into ${table} (${columns.join(', ')}) values\n  ${values}\non conflict ${conflict};`,
    );
  }
  return chunks.join('\n');
}

export function toSql(h) {
  const out = [];
  out.push(`-- GENERATED by tools/fixtures/gen-household.mjs — do not edit by hand.
--
-- The 5,000-row household of WP4 D22: ${COUNTS.activities} activities with their detail rows over
-- ${DAYS} days, ${COUNTS.containers} containers, ${COUNTS.ledger} ledger rows, ${COUNTS.rules} schedule rules and ${COUNTS.instances} instances,
-- in a household of its own so that no count in the rest of the integration suite moves.
--
-- Every statement is idempotent and every timestamp is absolute, so loading it twice is a
-- no-op and the "last 24 hours" window is the same day on every run and on every machine.
-- Container amounts are left at 0 on purpose: app.assert_container_balance is the only writer
-- of milk_containers.amount_ml, and the ADD rows below are what set it.
begin;`);

  out.push(`insert into auth.users (id) values (${q(IDS.owner)}), (${q(IDS.partner)})
on conflict do nothing;`);
  out.push(
    insertMany(
      'profiles',
      ['id', 'display_name', 'time_zone', 'volume_unit'],
      [
        { id: IDS.owner, display_name: 'Budget owner', time_zone: 'UTC', volume_unit: 'ml' },
        { id: IDS.partner, display_name: 'Budget partner', time_zone: 'UTC', volume_unit: 'ml' },
      ],
    ),
  );
  out.push(
    insertMany(
      'households',
      ['id', 'name', 'owner_id', 'home_time_zone'],
      [
        {
          id: IDS.household,
          name: 'Budget fixture',
          owner_id: IDS.owner,
          home_time_zone: 'UTC',
        },
      ],
    ),
  );
  out.push(
    insertMany(
      'household_members',
      ['household_id', 'user_id', 'role'],
      [
        { household_id: IDS.household, user_id: IDS.owner, role: 'OWNER' },
        { household_id: IDS.household, user_id: IDS.partner, role: 'PARENT' },
      ],
    ),
  );
  out.push(
    insertMany(
      'children',
      ['id', 'household_id', 'name', 'birth_date', 'sort_order'],
      IDS.child.map((childId, i) => ({
        id: childId,
        household_id: IDS.household,
        name: i === 0 ? 'Ada' : 'Bo',
        birth_date: '2026-05-01',
        sort_order: i,
      })),
    ),
  );
  out.push(
    insertMany(
      'storage_locations',
      ['id', 'household_id', 'name', 'kind', 'is_default'],
      [
        {
          id: IDS.location,
          household_id: IDS.household,
          name: 'Freezer',
          kind: 'FREEZER',
          is_default: true,
        },
      ],
    ),
  );
  out.push(
    insertMany(
      'schedule_phases',
      ['id', 'household_id', 'child_id', 'name', 'effective_from', 'is_current'],
      IDS.phase.map((phaseId, i) => ({
        id: phaseId,
        household_id: IDS.household,
        child_id: IDS.child[i],
        name: 'Routine',
        effective_from: iso(EPOCH).slice(0, 10),
        is_current: true,
      })),
    ),
  );

  out.push(
    insertMany(
      'activities',
      [
        'id',
        'client_op_id',
        'household_id',
        'child_id',
        'type',
        'start_at',
        'end_at',
        'quantity',
        'canonical_unit',
        'notes',
        'is_private',
        'metadata',
        'created_by',
        'created_at',
        'updated_at',
      ],
      h.activities,
    ),
  );
  for (const [table, rows] of Object.entries(h.details)) {
    if (rows.length === 0) continue;
    out.push(insertMany(table, Object.keys(rows[0]), rows));
  }
  out.push(
    insertMany(
      'milk_containers',
      [
        'id',
        'household_id',
        'owner_id',
        'location_id',
        'container_type',
        'amount_ml',
        'initial_ml',
        'pumped_at',
        'status',
        'created_by',
        'created_at',
        'updated_at',
      ],
      h.containers,
    ),
  );
  out.push(
    insertMany(
      'milk_inventory_transactions',
      [
        'id',
        'client_op_id',
        'household_id',
        'container_id',
        'kind',
        'delta_ml',
        'occurred_at',
        'created_by',
        'created_at',
      ],
      h.ledger,
    ),
  );
  out.push(
    insertMany(
      'schedule_rules',
      [
        'id',
        'household_id',
        'phase_id',
        'child_id',
        'activity',
        'effective_from',
        'rule_type',
        'at_local_time',
        'created_at',
        'updated_at',
      ],
      h.rules,
    ),
  );
  out.push(
    insertMany(
      'schedule_instances',
      [
        'id',
        'household_id',
        'rule_id',
        'child_id',
        'scheduled_for',
        'local_date',
        'status',
        'created_at',
        'updated_at',
      ],
      h.instances,
    ),
  );
  out.push('commit;');
  return `${out.filter(Boolean).join('\n\n')}\n`;
}

/* ------------------------------------------------------------------ the page set */

/**
 * The same household as the pages a device is handed, in `PullTablePage` shape.
 *
 * The page size is the one `PAGE_SIZES` gives each table; the cursor is `(updated_at, id)`,
 * which is the tuple the client resumes on. Detail rows travel INSIDE their activity under
 * `details`, which is what `0010` does and what `apply.ts` expects — a page set that carried
 * them as their own table would be testing a wire format nothing speaks.
 */
export function toPages(h) {
  const byActivity = new Map();
  for (const [table, rows] of Object.entries(h.details)) {
    for (const row of rows) byActivity.set(row.activity_id, { table, row });
  }
  const activities = h.activities.map(a => {
    const detail = byActivity.get(a.id);
    return detail === undefined ? { ...a } : { ...a, details: { [detail.table]: detail.row } };
  });

  const page = (name, rows, size) => {
    const out = [];
    for (let i = 0; i < rows.length; i += size) {
      const slice = rows.slice(i, i + size);
      const last = slice[slice.length - 1];
      out.push({
        name,
        rows: slice,
        next_cursor:
          i + size < rows.length
            ? { updated_at: last.updated_at ?? last.created_at, id: last.id }
            : null,
        has_more: i + size < rows.length,
      });
    }
    return out;
  };

  return {
    meta: h.meta,
    pages: [
      ...page('children', [], 500),
      ...page('activities', activities, 500),
      ...page('milk_containers', h.containers, 500),
      ...page('milk_inventory_transactions', h.ledger, 1000),
      ...page('schedule_rules', h.rules, 500),
      ...page('schedule_instances', h.instances, 500),
    ],
  };
}

/* ------------------------------------------------------------------ the CLI */

function main() {
  const check = process.argv.includes('--check');
  const house = buildHousehold();
  const artifacts = [[SQL_PATH, toSql(house)]];
  if (check) {
    for (const [path, want] of artifacts) {
      let have = '';
      try {
        have = readFileSync(path, 'utf8');
      } catch {
        console.error(`missing: ${path} — run node tools/fixtures/gen-household.mjs`);
        process.exit(1);
      }
      if (have !== want) {
        console.error(`stale: ${path} — run node tools/fixtures/gen-household.mjs`);
        process.exit(1);
      }
    }
    console.log('sync fixture is up to date');
    return;
  }
  for (const [path, body] of artifacts) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
    console.log(`${path} — ${(body.length / 1024).toFixed(0)} KB`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
