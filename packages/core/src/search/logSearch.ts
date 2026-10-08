/**
 * SEARCH YOUR LOG — find entries by what is in them.
 *
 * The owner, 2026-09-24, after a probe of "Ask your log" answered two of fourteen everyday
 * questions correctly, got two wrong and refused two plain lookups: "yes go ahead with both" — a
 * search on the Log in its place, and "From your log" moved onto Routine
 * (docs/COACH_AND_SEARCH.md).
 *
 * Ask matched a typed QUESTION against twelve fixed answers. This matches typed WORDS against the
 * household's own entries and shows the entries themselves: a food ("banana"), a medicine
 * ("tylenol"), a word from a note, or an activity ("poop", "nap", "formula"). There is no question
 * to understand, so there is nothing to misunderstand and nothing to refuse, and what comes back
 * is always rows the parent wrote — their own log, narrowed.
 *
 * ── WHAT IT WILL NOT DO ─────────────────────────────────────────────────────────────────────
 *
 * The one-line summary above the results is a count, a time, a name and the words the parent
 * chose when they logged: "Banana · 4 times · latest Tue 12:10 PM · liked 3". Nothing here says a
 * count is high or low, a gap long or short, or what anything means for a baby (CLAUDE.md §2
 * rules 1–3), and `copy.ts` is held to `BANNED`.
 *
 * "fever" is deliberately NOT a word for temperature entries. A search for it finds the notes
 * that say it and nothing else: mapping it to every reading would be the app deciding which
 * readings were a fever, which is a diagnosis (rule 3). The same holds for every word below —
 * each names an activity or a thing the parent picked on a sheet, never a condition.
 *
 * Pure: rows in, matches and a summary model out. No clock, no zone, no database.
 */
import type { ActivityType, WellbeingSeen } from '../domain/domain-types';
import type { Meal } from '../entry/remembered';
import {
  FOOD_RESPONSES,
  foodKey,
  itemsOf,
  type FoodResponse,
  type SolidsItem,
} from '../solids/items';
import type { BottleKind, DiaperKind, SleepKind } from '../today/rows';
import { countsAsFeed } from '../today/totals';
import { NOTE_NAME, SEEN_LABEL } from '../wellbeing/copy';

/** The fields a search reads — a projection of `TodayActivity` plus the note and who wrote it. */
export interface SearchableEntry {
  id: string;
  type: ActivityType;
  startMs: number;
  /** The caregiver's display name, when it has arrived. */
  byName?: string | null;
  notes?: string | null;
  medName?: string | null;
  /** The amount the parent typed on a medicine, verbatim. Shown, never computed (rule 4). */
  medAmount?: string | null;
  solidsItems?: readonly SolidsItem[] | null;
  /** An older meal's single text box, read as a list by `itemsOf`. */
  food?: string | null;
  observation?: string | null;
  meal?: Meal | null;
  diaperKind?: DiaperKind | null;
  diaperRash?: boolean | null;
  bottleKind?: BottleKind | null;
  sleepKind?: SleepKind | null;
  weightG?: number | null;
  lengthMm?: number | null;
  headMm?: number | null;
  /** A Health note's chips, as tapped: searched by their own words ("rash", "spit up"). */
  wellbeingSeen?: readonly WellbeingSeen[] | null;
}

/** Two characters, so a single letter typed on the way to a word does not list the whole log. */
const SEARCH_MIN_CHARS = 2;

/**
 * Case, accents and punctuation out, so "Ácido fólico", "acido folico" and "ACIDO-FOLICO" are one
 * string — the way `foodKey` compares two spellings of a food.
 */
export function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** A plural's stem, so "strawberries" finds "strawberry", "eggs" finds "egg", "peaches" "peach". */
export function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(ch|sh|x|z|ss|o)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/**
 * DOES THIS TEXT HOLD THIS WORD. Three characters or more match inside a word ("berr" finds
 * strawberries and blueberries); one or two only at the start of one ("d" finds Vitamin D, not
 * every word with a d in it).
 */
export function textHas(text: string, word: string): boolean {
  const target = stem(word);
  for (const w of fold(text).split(' ')) {
    if (w === '') continue;
    const s = stem(w);
    if (word.length >= 3 ? s.includes(target) || w.includes(word) : w.startsWith(word)) return true;
  }
  return false;
}

/**
 * A substring an ASCII field has to hold for `textHas` to be able to match `word`.
 *
 * The reader asks SQLite for rows that contain one of these, then `matchEntry` decides.
 * A like of the raw word drops hits: "eggs" has to find "egg", and "berry" has to find
 * "blueberries". The ies/y stem is the one rewrite that replaces letters, so its needle
 * is the stem without that y ("strawberry" and "strawberries" both hold "strawberr").
 * Every other stem only adds a suffix, and the stem is still in the stored word.
 *
 * A field with a character outside ASCII is not covered here. The phone's SQLite cannot
 * fold accents, so the reader keeps that row and `textHas` decides.
 */
export function textNeedles(word: string): readonly string[] {
  if (word.length < 3) return [word];
  const target = stem(word);
  if (target.endsWith('y') && target.length > 1) return [target.slice(0, -1)];
  return [target === '' ? word : target];
}

/* ------------------------------------------------------------------ the activity words */

export type TopicId =
  | 'poop'
  | 'pee'
  | 'dry'
  | 'rash'
  | 'diaper'
  | 'formula'
  | 'breastmilk'
  | 'water'
  | 'bottle'
  | 'breastfeed'
  | 'feed'
  | 'pump'
  | 'nap'
  | 'night'
  | 'sleep'
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'snack'
  | 'solids'
  | 'med'
  | 'temp'
  | 'weight'
  | 'length'
  | 'head'
  | 'growth'
  | 'bath'
  | 'tummy'
  | 'wellbeing';

export interface SearchTopic {
  id: TopicId;
  /** Folded words and phrases that name it, matched whole. */
  names: readonly string[];
  /** What the summary calls one of these entries, and several. */
  noun: readonly [one: string, many: string];
  test: (e: SearchableEntry) => boolean;
}

const diaperOf =
  (...kinds: DiaperKind[]) =>
  (e: SearchableEntry): boolean =>
    e.type === 'diaper' && e.diaperKind != null && kinds.includes(e.diaperKind);
const bottleOf =
  (...kinds: BottleKind[]) =>
  (e: SearchableEntry): boolean =>
    e.type === 'bottle' && e.bottleKind != null && kinds.includes(e.bottleKind);
const mealOf =
  (meal: Meal) =>
  (e: SearchableEntry): boolean =>
    e.type === 'solids' && e.meal === meal;

/**
 * THE WORDS FOR THINGS THE SHEETS RECORD, in the order the summary prefers them: a narrower
 * topic comes before the broader one it sits inside ("poop" before "diaper", "nap" before
 * "sleep"), so "dirty diapers" is summarised as dirty diapers rather than as diapers.
 *
 * Every name is something a parent picked or an activity they logged. None is a condition.
 */
export const SEARCH_TOPICS: readonly SearchTopic[] = [
  {
    id: 'poop',
    names: ['poop', 'poops', 'pooped', 'poopy', 'poo', 'dirty', 'stool', 'stools', 'bm'],
    noun: ['dirty diaper', 'dirty diapers'],
    test: diaperOf('DIRTY', 'BOTH'),
  },
  {
    id: 'pee',
    names: ['pee', 'peed', 'wee', 'wet', 'wets', 'urine'],
    noun: ['wet diaper', 'wet diapers'],
    test: diaperOf('WET', 'BOTH'),
  },
  { id: 'dry', names: ['dry'], noun: ['dry check', 'dry checks'], test: diaperOf('DRY') },
  {
    id: 'rash',
    names: ['rash', 'diaper rash'],
    noun: ['diaper with a rash noted', 'diapers with a rash noted'],
    test: e => e.type === 'diaper' && e.diaperRash === true,
  },
  {
    id: 'diaper',
    names: ['diaper', 'diapers', 'nappy', 'nappies', 'change', 'changes', 'changed'],
    noun: ['diaper', 'diapers'],
    test: e => e.type === 'diaper',
  },
  {
    id: 'formula',
    names: ['formula'],
    noun: ['formula bottle', 'formula bottles'],
    test: bottleOf('FORMULA', 'MIXED'),
  },
  {
    id: 'breastmilk',
    names: ['breast milk', 'breastmilk', 'expressed milk', 'pumped milk', 'ebm'],
    noun: ['bottle of breast milk', 'bottles of breast milk'],
    test: bottleOf('EBM', 'MIXED'),
  },
  {
    id: 'water',
    names: ['water'],
    noun: ['bottle of water', 'bottles of water'],
    test: bottleOf('WATER'),
  },
  {
    id: 'bottle',
    names: ['bottle', 'bottles'],
    noun: ['bottle', 'bottles'],
    test: e => e.type === 'bottle',
  },
  {
    id: 'breastfeed',
    names: [
      'breastfeed',
      'breastfeeds',
      'breastfeeding',
      'breastfed',
      'breast',
      'nurse',
      'nursed',
      'nursing',
    ],
    noun: ['breastfeed', 'breastfeeds'],
    test: e => e.type === 'breastfeed',
  },
  {
    id: 'feed',
    names: ['feed', 'feeds', 'feeding', 'feedings', 'fed', 'milk'],
    noun: ['feed', 'feeds'],
    test: e => countsAsFeed({ type: e.type, bottleKind: e.bottleKind ?? null }),
  },
  {
    id: 'pump',
    names: ['pump', 'pumps', 'pumping', 'pumped', 'expressing'],
    noun: ['pumping session', 'pumping sessions'],
    test: e => e.type === 'pump',
  },
  {
    id: 'nap',
    names: ['nap', 'naps', 'napped', 'napping', 'nap time'],
    noun: ['nap', 'naps'],
    test: e => e.type === 'sleep' && e.sleepKind === 'NAP',
  },
  {
    id: 'night',
    names: ['night', 'nights', 'overnight', 'bedtime', 'night sleep'],
    noun: ['night sleep', 'night sleeps'],
    test: e => e.type === 'sleep' && e.sleepKind === 'NIGHT',
  },
  {
    id: 'sleep',
    names: ['sleep', 'sleeps', 'slept', 'sleeping', 'asleep'],
    noun: ['sleep', 'sleeps'],
    test: e => e.type === 'sleep',
  },
  {
    id: 'breakfast',
    names: ['breakfast', 'breakfasts'],
    noun: ['breakfast', 'breakfasts'],
    test: mealOf('BREAKFAST'),
  },
  { id: 'lunch', names: ['lunch', 'lunches'], noun: ['lunch', 'lunches'], test: mealOf('LUNCH') },
  {
    id: 'dinner',
    names: ['dinner', 'dinners', 'supper'],
    noun: ['dinner', 'dinners'],
    test: mealOf('DINNER'),
  },
  { id: 'snack', names: ['snack', 'snacks'], noun: ['snack', 'snacks'], test: mealOf('SNACK') },
  {
    id: 'solids',
    names: ['solids', 'solid', 'meal', 'meals', 'food', 'foods', 'ate', 'eat', 'eating'],
    noun: ['meal', 'meals'],
    test: e => e.type === 'solids',
  },
  {
    id: 'med',
    names: ['medicine', 'medicines', 'med', 'meds', 'medication', 'medications', 'dose', 'doses'],
    noun: ['medicine entry', 'medicine entries'],
    test: e => e.type === 'med',
  },
  {
    id: 'temp',
    names: ['temperature', 'temperatures', 'temp', 'temps', 'thermometer'],
    noun: ['temperature reading', 'temperature readings'],
    test: e => e.type === 'temp',
  },
  {
    id: 'weight',
    names: ['weight', 'weights', 'weigh', 'weighed', 'weigh in'],
    noun: ['weight', 'weights'],
    test: e => e.type === 'growth' && e.weightG != null,
  },
  {
    id: 'length',
    names: ['length', 'lengths', 'height'],
    noun: ['length', 'lengths'],
    test: e => e.type === 'growth' && e.lengthMm != null,
  },
  {
    id: 'head',
    names: ['head', 'head circumference'],
    noun: ['head measurement', 'head measurements'],
    test: e => e.type === 'growth' && e.headMm != null,
  },
  {
    id: 'growth',
    names: ['growth', 'measurement', 'measurements', 'measure', 'measured'],
    noun: ['growth entry', 'growth entries'],
    test: e => e.type === 'growth',
  },
  {
    id: 'bath',
    names: ['bath', 'baths', 'bathed', 'bathe', 'bathtime', 'bath time'],
    noun: ['bath', 'baths'],
    test: e => e.type === 'bath',
  },
  {
    id: 'tummy',
    names: ['tummy', 'tummy time', 'playtime', 'play time', 'play'],
    noun: ['tummy time', 'tummy times'],
    test: e => e.type === 'tummy',
  },
  /*
    THE HEALTH NOTE BY ITS OWN NAME (2026-10-08), read from the registry's label so the fallback
    name is found the day it ships. Only the name: a chip's word ("rash", "cough") finds a note
    through the note's own text below, never through a topic that would gather every diaper's rash
    tick and every note under one word as if they were one thing.
  */
  {
    id: 'wellbeing',
    names: [fold(NOTE_NAME), `${fold(NOTE_NAME)}s`],
    noun: [NOTE_NAME.toLowerCase(), `${NOTE_NAME.toLowerCase()}s`],
    test: e => e.type === 'wellbeing',
  },
];

const TOPIC_BY_NAME: ReadonlyMap<string, SearchTopic> = new Map(
  SEARCH_TOPICS.flatMap(t => t.names.map(n => [n, t] as const)),
);
/** The multi-word names, longest first, so "breast milk" is taken before "breast" can be. */
const PHRASES: readonly (readonly [string, SearchTopic])[] = [...TOPIC_BY_NAME]
  .filter(([n]) => n.includes(' '))
  .sort((a, b) => b[0].length - a[0].length);

/**
 * THE WORDS A QUESTION WRAPS AROUND ITS SUBJECT, dropped: "when did she last poop" searches for
 * poop. Without this a parent who types the question Ask taught them to type gets nothing,
 * because every word has to match and "when" is in no entry.
 */
const SEARCH_STOP_WORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'the',
  'of',
  'and',
  'or',
  'to',
  'in',
  'on',
  'at',
  'for',
  'with',
  'my',
  'our',
  'her',
  'his',
  'their',
  'she',
  'he',
  'they',
  'we',
  'i',
  'baby',
  'when',
  'what',
  'which',
  'how',
  'many',
  'much',
  'did',
  'does',
  'do',
  'was',
  'were',
  'is',
  'has',
  'have',
  'had',
  'last',
  'latest',
  'first',
  'time',
  'times',
  'ever',
  'give',
  'gave',
  'given',
  'get',
  'got',
  'try',
  'tried',
]);

export interface SearchTerm {
  /** The folded word or phrase. */
  word: string;
  /** The activity it names, when it names one. */
  topic: SearchTopic | null;
}

export interface ParsedQuery {
  /** The query as the parent typed it, trimmed — for "Nothing matches “…”". */
  raw: string;
  /** Every term must match an entry for it to be a result. */
  terms: readonly SearchTerm[];
}

/**
 * The query, as terms. Null when there is nothing to search for — too short, or only the words a
 * question wraps around its subject (or a baby's name, which `ignore` carries: "did Ada poop" is
 * a search for poop within the baby already in view).
 */
export function parseQuery(
  raw: string,
  opts: { ignore?: readonly string[] } = {},
): ParsedQuery | null {
  const trimmed = raw.trim();
  let rest = ` ${fold(trimmed)} `;
  if (rest.trim().length < SEARCH_MIN_CHARS) return null;
  const terms: SearchTerm[] = [];
  for (const [phrase, topic] of PHRASES) {
    const at = ` ${phrase} `;
    if (rest.includes(at)) {
      terms.push({ word: phrase, topic });
      rest = rest.replace(at, ' ');
    }
  }
  const ignored = new Set((opts.ignore ?? []).map(fold).filter(Boolean));
  for (const word of rest.split(' ')) {
    if (word === '' || SEARCH_STOP_WORDS.has(word) || ignored.has(word)) continue;
    terms.push({ word, topic: TOPIC_BY_NAME.get(word) ?? null });
  }
  if (terms.length === 0) return null;
  return { raw: trimmed, terms };
}

/* ------------------------------------------------------------------ matching */

export interface SearchHit {
  entry: SearchableEntry;
  /** The foods on the meal that a term found, as the meal spells them. */
  foods: readonly string[];
  /** A term found the medicine's name. */
  medicine: boolean;
  /** A term found the entry's note, or a meal's "what was noticed". */
  note: boolean;
  /** The activity words that matched, in the order the query gave them. */
  topics: readonly TopicId[];
  /** Every term matched through its activity word alone — no text was needed. */
  topicalOnly: boolean;
}

/** One entry against the query: every term has to find something in it, or it is not a result. */
export function matchEntry(q: ParsedQuery, e: SearchableEntry): SearchHit | null {
  const items =
    e.type === 'solids' ? itemsOf({ items: e.solidsItems ?? null, food: e.food ?? null }) : [];
  const foods = new Set<string>();
  const topics: TopicId[] = [];
  let medicine = false;
  let note = false;
  let topicalOnly = true;
  for (const term of q.terms) {
    let found = false;
    if (term.topic !== null && term.topic.test(e)) {
      found = true;
      topics.push(term.topic.id);
    }
    let text = false;
    for (const item of items) {
      if (textHas(item.name, term.word)) {
        foods.add(item.name);
        text = true;
      }
    }
    if (e.medName != null && textHas(e.medName, term.word)) {
      medicine = true;
      text = true;
    }
    // a Health note's chips are part of what the parent wrote down: "rash" finds the note with
    // the Rash chip as surely as one that says it in words
    const chips = (e.wellbeingSeen ?? []).map(k => SEEN_LABEL[k]).join(' ');
    if (
      (e.notes != null && textHas(e.notes, term.word)) ||
      (e.observation != null && textHas(e.observation, term.word)) ||
      (chips !== '' && textHas(chips, term.word))
    ) {
      note = true;
      text = true;
    }
    if (text) topicalOnly = false;
    if (!found && !text) return null;
  }
  // in the order the meal lists them, the way the parent wrote it down
  const ordered = [...new Set(items.map(i => i.name).filter(name => foods.has(name)))];
  return { entry: e, foods: ordered, medicine, note, topics, topicalOnly };
}

/** Every entry that matches, newest first. */
export function searchEntries(q: ParsedQuery, entries: readonly SearchableEntry[]): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const e of entries) {
    const hit = matchEntry(q, e);
    if (hit !== null) hits.push(hit);
  }
  return hits.sort(
    (a, b) => b.entry.startMs - a.entry.startMs || a.entry.id.localeCompare(b.entry.id),
  );
}

/* ------------------------------------------------------------------ the one line */

export type SearchSummary =
  | {
      kind: 'food';
      name: string;
      times: number;
      latestMs: number;
      responses: Readonly<Record<FoodResponse, number>>;
    }
  | { kind: 'foods'; names: readonly string[]; meals: number; latestMs: number }
  | {
      kind: 'medicine';
      name: string;
      times: number;
      latestMs: number;
      latestBy: string | null;
      latestAmount: string | null;
    }
  | { kind: 'medicines'; names: readonly string[]; times: number; latestMs: number }
  | { kind: 'topic'; topic: TopicId; count: number; latestMs: number; latestBy: string | null }
  | { kind: 'entries'; count: number; latestMs: number };

const noResponses = (): Record<FoodResponse, number> =>
  Object.fromEntries(FOOD_RESPONSES.map(r => [r, 0])) as Record<FoodResponse, number>;

/** Distinct names by their folded form, spelled the way the most recent entry spelled them. */
function distinctNames(names: readonly string[], keyOf: (n: string) => string): string[] {
  const seen = new Map<string, string>();
  for (const n of names) {
    const k = keyOf(n);
    if (k !== '' && !seen.has(k)) seen.set(k, n);
  }
  return [...seen.values()];
}

/**
 * WHAT THE RESULTS HAVE IN COMMON, in the most particular words that are true of all of them:
 * one food, then one medicine, then one activity, then just "entries". `hits` is newest first.
 */
export function summarize(hits: readonly SearchHit[]): SearchSummary | null {
  const latest = hits[0];
  if (latest === undefined) return null;
  const latestMs = latest.entry.startMs;

  if (hits.every(h => h.foods.length > 0)) {
    const names = distinctNames(
      hits.flatMap(h => h.foods),
      foodKey,
    );
    if (names.length === 1) {
      const key = foodKey(names[0] as string);
      const responses = noResponses();
      for (const h of hits) {
        const items = itemsOf({ items: h.entry.solidsItems ?? null, food: h.entry.food ?? null });
        // each meal once, the way the food history counts it (`summarizeFoods`)
        const said = items.find(i => foodKey(i.name) === key && i.response !== null)?.response;
        if (said != null) responses[said] += 1;
      }
      return { kind: 'food', name: names[0] as string, times: hits.length, latestMs, responses };
    }
    return { kind: 'foods', names, meals: hits.length, latestMs };
  }

  if (hits.every(h => h.medicine)) {
    const names = distinctNames(
      hits.map(h => h.entry.medName ?? ''),
      fold,
    );
    if (names.length === 1) {
      return {
        kind: 'medicine',
        name: names[0] as string,
        times: hits.length,
        latestMs,
        latestBy: latest.entry.byName ?? null,
        latestAmount: latest.entry.medAmount?.trim() || null,
      };
    }
    return { kind: 'medicines', names, times: hits.length, latestMs };
  }

  if (hits.every(h => h.topicalOnly && h.topics.length > 0)) {
    // the narrowest activity every result shares, by the topic list's own order
    const shared = SEARCH_TOPICS.find(t => hits.every(h => h.topics.includes(t.id)));
    if (shared !== undefined) {
      return {
        kind: 'topic',
        topic: shared.id,
        count: hits.length,
        latestMs,
        latestBy: latest.entry.byName ?? null,
      };
    }
  }

  return { kind: 'entries', count: hits.length, latestMs };
}

export const topicById = (id: TopicId): SearchTopic =>
  SEARCH_TOPICS.find(t => t.id === id) as SearchTopic;
