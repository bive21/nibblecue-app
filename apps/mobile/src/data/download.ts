/**
 * The free full download (PRODUCT_SPEC.md §8; CLAUDE.md §4) — built entirely from the LOCAL
 * mirror.
 *
 * It is a legal duty rather than a feature (GDPR Art. 20 with Art. 12), so it is on every plan
 * and it is one tap. Building it locally is not a shortcut around a missing server: it is the
 * right architecture for this app. The mirror already holds everything this household has, the
 * write path is local-first, and a person asking for their own data should not need a network,
 * an account lookup or a signed URL to get it. It works on a plane.
 *
 * COMPLETE BY CONSTRUCTION. Every table in `MIRRORED_TABLES` is read and put in the document,
 * rather than an allow-list somebody has to remember to extend. `download.test.ts` asserts the
 * set matches the schema's, so a table added next year is in the export the day it exists.
 *
 * SOFT-DELETED ROWS ARE INCLUDED, with their `deleted_at` intact. An export is the record, and a
 * row the household deleted is still a row it made; dropping it would make the file disagree
 * with the account's own history and with the undo the app promises. The column is right there
 * for a reader who wants to filter.
 *
 * THE SYNC MACHINERY IS NOT. The outbox, the cursors, the dedupe keys and the widget intents are
 * the app's bookkeeping; every row they describe is already in the table it was written to, and
 * a token is nobody's data.
 *
 * THE CHOSEN EXPORT IS THIS SAME FUNCTION WITH A WINDOW ON IT (`input.scope`, WP "choose what to
 * export"). Plus sells the convenience of picking a month or one twin; it does not sell access to
 * anything, and running both through one reader is what makes that true in the code rather than
 * only in the copy — the paid path cannot reach a row the free path cannot, because it starts
 * from the free path's own result and removes from it.
 */
import {
  activityCsv,
  exportDocument,
  exportFileName,
  exportJson,
  mlToVolume,
  scopeExport,
  UNIT_LABEL,
  type ExportActivity,
  type ExportScope,
  type VolumeUnit,
} from '@nibblecue/core';
import type { Db } from '../db/driver';
import { MIRRORED_TABLES } from '../db/schema';
import { DETAIL_TABLES } from '@nibblecue/core';

export interface DownloadInput {
  householdId: string;
  timeZone: string;
  /** The household's own volume unit, so the CSV carries the number they typed. */
  unit: VolumeUnit;
  generatedAt: string;
  /** The account state's `Membership.heard_from`, when answered; the server keeps it, not a table here. */
  heardFrom?: string;
  /**
   * THE PAID NARROWING, AND IT IS OPTIONAL BECAUSE THE FREE DOWNLOAD NEVER HAS ONE (CLAUDE.md §4).
   *
   * Both exports run through this one function on purpose. The free copy is the whole mirror and
   * the chosen copy is the same mirror with a window and a child applied to it, so the two can
   * never drift into being two different readings of the household's record — and it is
   * structurally impossible for the paid path to reach a row the free path cannot.
   */
  scope?: ExportScope;
  /** What was chosen, for the file name: `…-30-days-emma.json`. Empty on the free download. */
  nameParts?: readonly string[];
}

export interface DownloadFiles {
  json: string;
  csv: string;
  jsonName: string;
  csvName: string;
  /** For the sheet: how much is in there, so the person can see it worked. */
  tables: number;
  rows: number;
  activities: number;
}

/** Does this table carry a `household_id`? Asked of the database, never assumed from a list. */
async function hasHouseholdColumn(db: Db, table: string): Promise<boolean> {
  const cols = await db.all<{ name: string }>(`pragma table_info(${table})`);
  return cols.some(c => c.name === 'household_id');
}

/** The household's whole mirror, table by table — the free download's own result, and what the
 *  chosen export narrows. Read once: `scopeExport` is pure, so a sheet that lets a parent move a
 *  range chip re-scopes in memory rather than re-reading the database on every tap. */
export async function readMirror(
  db: Db,
  householdId: string,
): Promise<Record<string, Record<string, unknown>[]>> {
  const whole: Record<string, Record<string, unknown>[]> = {};
  for (const table of MIRRORED_TABLES) {
    const household = await hasHouseholdColumn(db, table);
    whole[table] = await db.all<Record<string, unknown>>(
      household ? `select * from ${table} where household_id = ?` : `select * from ${table}`,
      household ? [householdId] : [],
    );
  }
  return whole;
}

/** The two files, from a mirror already read. Pure, so it is the same arithmetic in a test. */
export function buildFiles(
  whole: Readonly<Record<string, readonly Record<string, unknown>[]>>,
  input: DownloadInput,
): DownloadFiles {
  // The narrowing, where one was asked for. `scopeExport` keeps every table — empty where nothing
  // survived — so everything below reads the same shape either way.
  const scoped =
    input.scope === undefined
      ? {
          tables: whole,
          rows: Object.values(whole).reduce((n, list) => n + list.length, 0),
        }
      : scopeExport(whole, input.scope);
  const tables = scoped.tables;

  const children = (tables['children'] ?? []) as readonly { id: string; name: string }[];
  const nameOf = new Map(children.map(c => [c.id, c.name]));

  // the detail row per activity, so one CSV line carries the whole entry
  const detailOf = new Map<string, Record<string, unknown>>();
  for (const table of DETAIL_TABLES) {
    for (const d of tables[table] ?? []) {
      const key = d['activity_id'];
      if (typeof key === 'string') detailOf.set(key, d);
    }
  }

  const activities = (tables['activities'] ?? []) as unknown as readonly ExportActivity[];
  const csv = activityCsv(
    activities.map(a => ({ ...a, detail: detailOf.get(a.id) ?? null })),
    {
      childName: id => (id === null ? '' : (nameOf.get(id) ?? '')),
      // THE DISPLAY COLUMNS FOLLOW THE HOUSEHOLD'S UNIT; the canonical pair beside them stays ml,
      // untouched (`quantity_canonical`, `canonical_unit`), so a restore or a spreadsheet never
      // depends on the unit. Ounces are the quarter-ounce grid they were typed on (7.25, never
      // 7.3) and milliliters are whole — never compacted into liters here, so one column holds
      // one unit a spreadsheet can add up.
      display: (quantity, canonicalUnit) =>
        canonicalUnit === 'ml'
          ? {
              value: String(mlToVolume(quantity, input.unit)),
              unit: UNIT_LABEL[input.unit] ?? input.unit,
            }
          : { value: String(quantity), unit: canonicalUnit },
    },
  );

  const doc = exportDocument(
    {
      generatedAt: input.generatedAt,
      householdId: input.householdId,
      timeZone: input.timeZone,
      ...(input.heardFrom ? { heardFrom: input.heardFrom } : {}),
    },
    tables,
  );

  return {
    json: exportJson(doc),
    csv,
    jsonName: exportFileName('json', input.generatedAt, input.nameParts ?? []),
    csvName: exportFileName('csv', input.generatedAt, input.nameParts ?? []),
    tables: MIRRORED_TABLES.length,
    rows: scoped.rows,
    activities: activities.length,
  };
}

export async function buildDownload(db: Db, input: DownloadInput): Promise<DownloadFiles> {
  return buildFiles(await readMirror(db, input.householdId), input);
}
