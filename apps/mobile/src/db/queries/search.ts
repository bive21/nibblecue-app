/**
 * WHAT A SEARCH OF THE LOG READS (`packages/core/src/search/logSearch.ts` decides what matches).
 *
 * Only the fields a word can find — the type, what the sheets recorded as a kind, a medicine's
 * name, a meal's foods, the notes — newest first. With a query, the read is the rows that word
 * might fit (`searchNarrowing`); `matchEntry` still decides. Without one, it is every live entry
 * in scope. The Log's own page query (`timelineRows`) joins every detail table for sixty rows at
 * a time; a search reads a narrow row per candidate here and fetches the few it found whole
 * afterwards (`timelineRowsByIds`).
 *
 * THE WHOLE LOG, NOT THE PLAN'S WINDOW. The caller splits the matches at the history floor: the
 * ones inside are the results, the ones before it are counted for the gate's card, which has to
 * show what is behind it (CLAUDE.md §4). Nothing here decides what a free household may see.
 *
 * Local, like every read in this app: a search works on a plane and never sends a word anywhere.
 */
import {
  parseItems,
  seenOf,
  textNeedles,
  type ActivityType,
  type BottleKind,
  type DiaperKind,
  type Meal,
  type ParsedQuery,
  type SearchableEntry,
  type SleepKind,
  type TopicId,
} from '@nibblecue/core';
import type { Db, SqlValue } from '../driver';

/** A search row, plus what `visibleTo` needs to keep another caregiver's private pump out. */
export interface SearchRow extends SearchableEntry {
  childId: string | null;
  isPrivate: boolean;
  createdBy: string;
}

interface SearchRowRaw {
  id: string;
  child_id: string | null;
  type: string;
  start_at: string;
  is_private: number;
  created_by: string;
  by_name: string | null;
  notes: string | null;
  med_name: string | null;
  amount_text: string | null;
  solids_items: string | null;
  food: string | null;
  observation: string | null;
  meal: string | null;
  diaper_kind: string | null;
  diaper_rash: number | null;
  bottle_kind: string | null;
  sleep_kind: string | null;
  weight_g: number | null;
  length_mm: number | null;
  head_mm: number | null;
  /** `wellbeing_details.seen`, JSON array text. */
  wellbeing_seen: string | null;
}

/** A household with years of entries is still one read; this only stops a runaway. */
export const SEARCH_ROW_CAP = 50_000;

/**
 * The columns a word can find, in the same places `matchEntry` reads text. A topic word
 * also matches the activity itself, which is `TOPIC_SQL`.
 */
const TEXT_COLS = [
  'a.notes',
  'm.name',
  'so.food',
  'so.observation',
  'so.items',
  // a Health note's chips, stored as tokens (`["SPIT_UP"]`): a chip's word is in its token, and
  // SQLite's like ignores ASCII case, so "spit up" or "rash" narrows to it and `matchEntry` decides
  'wb.seen',
] as const;

/**
 * What `SearchTopic.test` accepts, as SQL. A word still has to go through `matchEntry`:
 * this only decides which rows are worth loading. Every id is named so a new topic fails
 * the build until it has a clause here.
 */
const TOPIC_SQL: Record<TopicId, string> = {
  poop: `a.type = 'diaper' and d.kind in ('DIRTY', 'BOTH')`,
  pee: `a.type = 'diaper' and d.kind in ('WET', 'BOTH')`,
  dry: `a.type = 'diaper' and d.kind = 'DRY'`,
  rash: `a.type = 'diaper' and d.rash = 1`,
  diaper: `a.type = 'diaper'`,
  formula: `a.type = 'bottle' and b.kind in ('FORMULA', 'MIXED')`,
  breastmilk: `a.type = 'bottle' and b.kind in ('EBM', 'MIXED')`,
  water: `a.type = 'bottle' and b.kind = 'WATER'`,
  bottle: `a.type = 'bottle'`,
  breastfeed: `a.type = 'breastfeed'`,
  feed: `a.type = 'breastfeed' or (a.type = 'bottle' and ifnull(b.kind, '') != 'WATER')`,
  pump: `a.type = 'pump'`,
  nap: `a.type = 'sleep' and s.kind = 'NAP'`,
  night: `a.type = 'sleep' and s.kind = 'NIGHT'`,
  sleep: `a.type = 'sleep'`,
  breakfast: `a.type = 'solids' and so.meal = 'BREAKFAST'`,
  lunch: `a.type = 'solids' and so.meal = 'LUNCH'`,
  dinner: `a.type = 'solids' and so.meal = 'DINNER'`,
  snack: `a.type = 'solids' and so.meal = 'SNACK'`,
  solids: `a.type = 'solids'`,
  med: `a.type = 'med'`,
  temp: `a.type = 'temp'`,
  weight: `a.type = 'growth' and g.weight_g is not null`,
  length: `a.type = 'growth' and g.length_mm is not null`,
  head: `a.type = 'growth' and g.head_mm is not null`,
  growth: `a.type = 'growth'`,
  bath: `a.type = 'bath'`,
  tummy: `a.type = 'tummy'`,
  wellbeing: `a.type = 'wellbeing'`,
};

/**
 * Rows that MIGHT match, as SQL. Every term has to be possible (the same AND as
 * `matchEntry`), and a term is possible when its activity matches or a text column holds
 * a needle. A column with a character outside ASCII is kept whole: SQLite cannot fold
 * accents, and dropping "Ácido" on a search for "acido" would hide a row the matcher finds.
 * The cap still applies to what comes back, newest first.
 */
function searchNarrowing(query: ParsedQuery): { sql: string; params: SqlValue[] } {
  const params: SqlValue[] = [];
  const terms = query.terms.map(term => {
    const parts: string[] = [];
    if (term.topic !== null) parts.push(`(${TOPIC_SQL[term.topic.id]})`);
    for (const needle of textNeedles(term.word)) {
      const like = `%${needle.replace(/[\\%_]/g, ch => `\\${ch}`)}%`;
      for (const col of TEXT_COLS) {
        parts.push(`${col} like ? escape '\\'`);
        params.push(like);
      }
    }
    return `(${parts.join(' or ')})`;
  });
  const nonAscii = TEXT_COLS.map(col => `${col} glob '*[^ -~]*'`).join(' or ');
  return { sql: ` and ((${nonAscii}) or (${terms.join(' and ')}))`, params };
}

export async function searchableRows(
  db: Db,
  req: { householdId: string; childId: string | null; query?: ParsedQuery },
): Promise<SearchRow[]> {
  const params: SqlValue[] = [req.householdId];
  let scope = '';
  if (req.childId !== null) {
    // the child in view and the household's own entries (a pump belongs to nobody), as the Log
    scope = ' and (a.child_id = ? or a.child_id is null)';
    params.push(req.childId);
  }
  // no query: the whole window, as before. A query narrows to rows the matcher might keep.
  const narrowing = req.query === undefined ? { sql: '', params: [] } : searchNarrowing(req.query);
  params.push(...narrowing.params);
  params.push(SEARCH_ROW_CAP);
  const rows = await db.all<SearchRowRaw>(
    `select a.id, a.child_id, a.type, a.start_at, a.is_private, a.created_by, a.notes,
            pr.display_name as by_name,
            m.name as med_name, m.amount_text,
            so.items as solids_items, so.food, so.observation, so.meal,
            d.kind as diaper_kind, d.rash as diaper_rash,
            b.kind as bottle_kind, s.kind as sleep_kind,
            g.weight_g, g.length_mm, g.head_mm,
            wb.seen as wellbeing_seen
       from activities a
       left join profiles pr on pr.id = a.created_by
       left join med_details m on m.activity_id = a.id
       left join solids_details so on so.activity_id = a.id
       left join diaper_details d on d.activity_id = a.id
       left join bottle_details b on b.activity_id = a.id
       left join sleep_details s on s.activity_id = a.id
       left join measurement_details g on g.activity_id = a.id
       left join wellbeing_details wb on wb.activity_id = a.id
      where a.household_id = ? and a.deleted_at is null${scope}${narrowing.sql}
      order by a.start_at desc, a.id desc
      limit ?`,
    params,
  );
  return rows.map(r => ({
    id: r.id,
    childId: r.child_id,
    type: r.type as ActivityType,
    startMs: Date.parse(r.start_at),
    isPrivate: r.is_private === 1,
    createdBy: r.created_by,
    byName: r.by_name,
    notes: r.notes,
    medName: r.med_name,
    medAmount: r.amount_text,
    solidsItems: r.solids_items === null ? null : parseItems(r.solids_items),
    food: r.food,
    observation: r.observation,
    meal: r.meal as Meal | null,
    diaperKind: r.diaper_kind as DiaperKind | null,
    diaperRash: r.diaper_rash === null ? null : r.diaper_rash === 1,
    bottleKind: r.bottle_kind as BottleKind | null,
    sleepKind: r.sleep_kind as SleepKind | null,
    weightG: r.weight_g,
    lengthMm: r.length_mm,
    headMm: r.head_mm,
    wellbeingSeen: r.wellbeing_seen === null ? null : seenOf(r.wellbeing_seen),
  }));
}
