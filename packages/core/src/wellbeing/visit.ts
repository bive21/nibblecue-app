/**
 * THE HEALTH NOTES ON THE PEDIATRICIAN SHEET (the owner, 2026-10-08: "most importantly the entries
 * will be shown in pediatricians sheet generated"). The section `visitSheet.ts` draws, built here
 * beside the look back it repeats, so the two can never say different things about one note.
 *
 * EACH NOTE, THEN WHAT WAS LOGGED BEFORE IT. The note: when it started, when it stopped (or that no
 * end was logged — never "still going", which the sheet cannot know on the day it is read), the
 * chips as tapped and the parent's words verbatim. Under it, the 48 hours before it started, from
 * the same log and by the same rules as the look back (`lookBackFor`): the foods named meal by meal
 * with a first time logged marked, each medicine with the amount AS TYPED, each temperature with
 * how it was taken, and feeds, sleep and diapers counted.
 *
 * THE ORDER UNDER A NOTE IS THE SHEET'S OWN SECTION ORDER — sleep, feeding, solids, diapers,
 * temperature, medicines — and inside each, time order. It is fixed, so nothing about one entry can
 * move it up; nothing is ranked, highlighted or tied to the note, and no sentence here says what
 * anything means (CLAUDE.md §2 rules 1 to 3; `visitSheet.ts`'s header is the whole argument). The
 * notes themselves run newest first, as the household's notes do.
 *
 * Pure: the sheet's own rows and formatters in, labelled rows out.
 */
import type { WellbeingSeen } from '../domain/domain-types';
import { MODULE_BY_ID, type ModuleId } from '../modules/module-registry';
import type { MealEntry } from '../solids/history';
import { itemsOf } from '../solids/items';
import type { TodayActivity } from '../today/rows';
import { countsAsDiaper, countsAsMilk, recordedMs } from '../today/totals';
import type { VisitFormat, VisitRow } from '../reports/visitSheet';
import { NOTE_NAME, noteLine, seenText, VISIT_NOTE_COPY as C } from './copy';
import { lookBackFor, type LookBackHours } from './lookBack';

/** The sheet's window under each note: two days, the look back's own default. */
export const VISIT_LOOK_BACK_HOURS: LookBackHours = 48;
/** Notes named one by one; past this they are counted, never dropped. */
const NOTES_NAMED = 12;

const one = (n: number, singular: string, plural = `${singular}s`): string =>
  `${n} ${n === 1 ? singular : plural}`;

const seenOfRow = (r: TodayActivity): readonly WellbeingSeen[] => r.wellbeingSeen ?? [];

/** The facts under one note: what the look back holds, as the sheet's rows. */
function beforeRows(
  note: TodayActivity,
  rows: readonly TodayActivity[],
  meals: readonly MealEntry[],
  fmt: VisitFormat,
): VisitRow[] {
  const back = lookBackFor({
    note: { id: note.id, childId: note.childId, startMs: note.startMs },
    rows,
    meals,
    hours: VISIT_LOOK_BACK_HOURS,
  });
  const entries = back.items.map(i => i.entry);
  const out: VisitRow[] = [
    {
      label: C.before(VISIT_LOOK_BACK_HOURS),
      value: entries.length === 0 ? C.nothingBefore : one(entries.length, 'entry', 'entries'),
      note: C.since(fmt.stamp(back.fromMs)),
      sub: true,
    },
  ];
  if (entries.length === 0) return out;

  // SLEEP — how many, and how long the finished ones were, as recorded
  const sleeps = entries.filter(e => e.type === 'sleep');
  if (sleeps.length > 0) {
    const ms = sleeps.reduce((s, e) => s + recordedMs(e), 0);
    out.push({
      label: C.sleep,
      value: one(sleeps.length, 'sleep'),
      ...(ms > 0 ? { note: fmt.duration(Math.round(ms / 60_000)) } : {}),
      sub: true,
    });
  }

  // FEEDING — bottles of milk with what was taken, and breastfeeds; a bottle of water is counted
  // as itself, as everywhere else in the app (`countsAsMilk`)
  const bottles = entries.filter(e => countsAsMilk(e));
  const water = entries.filter(e => e.type === 'bottle' && !countsAsMilk(e));
  const breast = entries.filter(e => e.type === 'breastfeed');
  if (bottles.length + water.length + breast.length > 0) {
    const ml = bottles.reduce((s, e) => s + (e.consumedMl ?? 0), 0);
    const parts = [
      bottles.length > 0
        ? `${one(bottles.length, 'bottle')}${ml > 0 ? ` (${fmt.volume(ml)})` : ''}`
        : '',
      breast.length > 0 ? one(breast.length, 'breastfeed') : '',
      water.length > 0 ? one(water.length, 'bottle of water', 'bottles of water') : '',
    ].filter(Boolean);
    out.push({ label: C.feeds, value: parts.join(' · '), sub: true });
  }

  // SOLIDS — every meal, its foods as the meal spells them, a first time logged said beside it
  for (const item of back.items) {
    if (item.entry.type !== 'solids') continue;
    const firsts = new Set(item.firstTimeFoods);
    const foods = itemsOf({ items: item.entry.solidsItems ?? null, food: item.entry.food ?? null })
      .map(f => f.name.trim())
      .filter(n => n !== '');
    const named = [...new Set(foods)].map(n => (firsts.has(n) ? `${n} (${C.firstTime})` : n));
    out.push({
      label: C.solids(fmt.stamp(item.entry.startMs)),
      value: named.length > 0 ? named.join(', ') : MODULE_BY_ID.solids.label,
      ...(item.entry.observation?.trim() ? { note: item.entry.observation.trim() } : {}),
      sub: true,
    });
  }

  // DIAPERS — counted, with what was in them and the rash tick, as the diaper section counts them
  const diapers = entries.filter(e => e.type === 'diaper');
  if (diapers.length > 0) {
    const changes = diapers.filter(e => countsAsDiaper(e));
    const wet = changes.filter(e => e.diaperKind === 'WET' || e.diaperKind === 'BOTH').length;
    const dirty = changes.filter(e => e.diaperKind === 'DIRTY' || e.diaperKind === 'BOTH').length;
    const rash = diapers.filter(e => e.diaperRash === true).length;
    out.push({
      label: C.diapers,
      value: one(changes.length, 'change'),
      note: [`${wet} wet`, `${dirty} dirty`, rash > 0 ? `rash noted ${rash}` : '']
        .filter(Boolean)
        .join(' · '),
      sub: true,
    });
  }

  // TEMPERATURE — every reading, with how it was taken; no reading is called anything
  for (const e of entries) {
    if (e.type !== 'temp' || typeof e.tempCHundredths !== 'number') continue;
    out.push({
      label: C.temperature(fmt.stamp(e.startMs)),
      value: fmt.temperature(e.tempCHundredths),
      ...(e.tempMethod ? { note: String(e.tempMethod).toLowerCase() } : {}),
      sub: true,
    });
  }

  // MEDICINES — every one, by the name logged and the amount AS TYPED (CLAUDE.md rule 4)
  for (const e of entries) {
    if (e.type !== 'med') continue;
    const name = e.medName?.trim() || MODULE_BY_ID.med.label;
    const amount = e.medAmount?.trim() ?? '';
    out.push({
      label: C.medicine(fmt.stamp(e.startMs)),
      value: amount === '' ? name : `${name} · ${amount}`,
      sub: true,
    });
  }

  // EVERYTHING ELSE the baby's log holds in the window, counted by its own name
  const others = new Map<string, number>();
  for (const e of entries) {
    if (
      ['sleep', 'bottle', 'breastfeed', 'solids', 'diaper', 'temp', 'med', 'wellbeing'].includes(
        e.type,
      )
    )
      continue;
    const label = MODULE_BY_ID[e.type as ModuleId]?.label ?? e.type;
    others.set(label, (others.get(label) ?? 0) + 1);
  }
  if (others.size > 0) {
    out.push({
      label: C.other,
      value: [...others].map(([label, n]) => `${label} ${n}`).join(' · '),
      sub: true,
    });
  }

  // ANOTHER HEALTH NOTE in the window, as the entry it is
  for (const e of entries) {
    if (e.type !== 'wellbeing') continue;
    out.push({
      label: C.note(fmt.stamp(e.startMs)),
      value: noteLine(seenOfRow(e), e.notes),
      sub: true,
    });
  }
  return out;
}

/**
 * THE SECTION'S ROWS: every Health note of this child's that started in the range, newest first,
 * each followed by what was logged in the 48 hours before it. `rows` is every row the sheet is
 * handed (the range and the year before it), which is what lets a note on the range's first morning
 * still show the evening before; `meals` is every meal, for "first time logged".
 */
export function healthNoteRows(input: {
  notes: readonly TodayActivity[];
  rows: readonly TodayActivity[];
  meals: readonly MealEntry[];
  fmt: VisitFormat;
}): VisitRow[] {
  const { fmt } = input;
  const notes = [...input.notes]
    .filter(r => r.type === 'wellbeing')
    .sort((a, b) => b.startMs - a.startMs || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  const out: VisitRow[] = [];
  for (const note of notes.slice(0, NOTES_NAMED)) {
    const seen = seenOfRow(note);
    const words = note.notes?.trim() ?? '';
    const chips = seenText(seen);
    out.push({
      label: fmt.stamp(note.startMs),
      value: chips !== '' ? chips : words !== '' ? words : NOTE_NAME,
      note:
        note.endMs !== null && note.endMs > note.startMs ? C.until(fmt.stamp(note.endMs)) : C.noEnd,
    });
    if (chips !== '' && words !== '') out.push({ label: C.words, value: words, sub: true });
    out.push(...beforeRows(note, input.rows, input.meals, fmt));
  }
  if (notes.length > NOTES_NAMED) {
    out.push({ label: C.more, value: `+${String(notes.length - NOTES_NAMED)}`, note: C.moreNote });
  }
  return out;
}
