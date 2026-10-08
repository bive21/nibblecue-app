/**
 * ── WHAT A BABY ATE, ONE FOOD AT A TIME ───────────────────────────────────────────────────────
 *
 * The owner, 2026-09-24: *"ours is just lazy development, where user type in full the food … we
 * would type 'strawberry and banana', later on there is no way of tracking it, we can type
 * 'straberry banana' and it wouldnt recognize it at the same entry … user should be able to put
 * entry for the qty, for example strabery 5, banana 1, and the reaction."*
 *
 * A meal is now a short list of foods — one line each, a name and an amount — and how it went.
 * `docs/SOLIDS.md` has the decision in full; the shape is:
 *
 *   { name: 'Strawberry', amount: 5, unit: 'PIECE', response: 'LOVED' }
 *
 * STORED AS ONE JSON LIST ON THE MEAL'S OWN DETAIL ROW (`solids_details.items`, migration 0114),
 * not as rows of their own. A meal is written and corrected as one thing, so the list travels
 * with it through the same one-row-per-entry sync every other detail uses; nothing on the server
 * needs to read inside it; and every report is built on the phone from the log it already holds.
 *
 * THE AMOUNT IS WHAT THE PARENT COUNTED, IN THE UNIT THEY COUNTED IT IN. Five pieces of
 * strawberry have no millilitre, and turning two tablespoons into 30 ml would print a precision
 * nobody measured — so, unlike a bottle, a portion is never converted and never summed across
 * units (CLAUDE.md §6's canonical units are for things that were measured).
 *
 * `response` IS HOW THE PARENT SAYS IT WENT — liked, or not. It is never a symptom and never a
 * verdict on the baby: anything the parent noticed goes in the meal's own words (`observation`),
 * stored verbatim and never read for meaning (CLAUDE.md §2 rules 1–3).
 */
import { z } from 'zod';

export const FOOD_UNITS = ['PIECE', 'TSP', 'TBSP', 'OZ', 'G', 'ML'] as const;
export type FoodUnit = (typeof FOOD_UNITS)[number];

export const FOOD_RESPONSES = ['LOVED', 'LIKED', 'UNSURE', 'DISLIKED'] as const;
export type FoodResponse = (typeof FOOD_RESPONSES)[number];

/** The same limits the server's `app.solids_items_ok` holds (migration 0114). */
export const FOOD_NAME_MAX = 60;
export const FOOD_AMOUNT_MAX = 10_000;
export const FOODS_PER_MEAL_MAX = 20;

export interface SolidsItem {
  /**
   * As the parent typed it, tidied: trimmed, single-spaced. Never rewritten beyond that. At most
   * sixty characters in a saved list; a food read from an older meal's text is read whole and may
   * be longer (`foodNameTooLong`).
   */
  name: string;
  /** How much, as counted; null when not said. Zero is real: offered and not eaten. */
  amount: number | null;
  unit: FoodUnit | null;
  response: FoodResponse | null;
}

/**
 * AT MOST `max` CHARACTERS, counted the way the server counts them — whole code points, never
 * UTF-16 units. `.slice` cuts an emoji in half at the boundary, and a lone half of one is not
 * valid Unicode: Postgres refuses the JSON it arrives in, and the whole push with it.
 */
const clipChars = (s: string, max: number): string => Array.from(s).slice(0, max).join('');

/** How many characters, as the server's `char_length` counts them. */
const charCount = (s: string): number => Array.from(s).length;

/** Trimmed, single-spaced, no control characters — and whole, however long. */
export function tidySpaces(raw: string): string {
  return (
    raw
      // eslint-disable-next-line no-control-regex -- stripping them is the point
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** A name as it is saved: `tidySpaces`, then at most sixty characters. */
export function tidyFoodName(raw: string): string {
  return clipChars(tidySpaces(raw), FOOD_NAME_MAX).trim();
}

/**
 * LONGER THAN A SAVED NAME MAY BE. Only an older meal's text can be — its one field took 200
 * characters, and `splitLegacyFood` reads it whole. A sheet asks for such a line to be shortened
 * before a changed list is saved, rather than `tidyFoodName` cutting a parent's words at sixty
 * where they cannot see it happen (CLAUDE.md §2 rule 7).
 */
export const foodNameTooLong = (raw: string): boolean => charCount(tidySpaces(raw)) > FOOD_NAME_MAX;

/** What the phone writes: the strict shape the server checks, so a write it would refuse never leaves. */
const SolidsItemSchema = z.object({
  name: z
    .string()
    .min(1)
    .refine(n => charCount(n) <= FOOD_NAME_MAX, { message: 'name too long' }),
  amount: z.number().finite().min(0).max(FOOD_AMOUNT_MAX).nullable(),
  unit: z.enum(FOOD_UNITS).nullable(),
  response: z.enum(FOOD_RESPONSES).nullable(),
});
const SolidsItemsSchema = z.array(SolidsItemSchema).max(FOODS_PER_MEAL_MAX);

/**
 * The list a meal is saved with: empty lines dropped, names tidied, at most twenty. Throws if
 * what is left would not pass the server's check — the sheet has already refused to save it.
 */
export function itemsForSave(items: readonly SolidsItem[]): SolidsItem[] {
  const kept = items
    .map(i => ({ ...i, name: tidyFoodName(i.name) }))
    .filter(i => i.name !== '')
    .slice(0, FOODS_PER_MEAL_MAX);
  return SolidsItemsSchema.parse(kept);
}

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

/**
 * READING IS FORGIVING WHERE WRITING IS STRICT. A list from a later version may carry a unit this
 * build has never heard of; losing the whole meal over it would be the wrong trade, so an
 * unknown unit or response reads as unsaid, an impossible amount as unsaid, and only an element
 * with no name at all is dropped. Takes the column as stored (JSON text) or already parsed.
 */
export function parseItems(raw: unknown): SolidsItem[] | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value)) return null;
  const out: SolidsItem[] = [];
  for (const el of value.slice(0, FOODS_PER_MEAL_MAX)) {
    if (el === null || typeof el !== 'object') continue;
    const o = el as Record<string, unknown>;
    const name = typeof o['name'] === 'string' ? tidyFoodName(o['name']) : '';
    if (name === '') continue;
    const a = o['amount'];
    out.push({
      name,
      amount:
        typeof a === 'number' && Number.isFinite(a) && a >= 0 && a <= FOOD_AMOUNT_MAX ? a : null,
      unit: isOneOf(FOOD_UNITS, o['unit']) ? o['unit'] : null,
      response: isOneOf(FOOD_RESPONSES, o['response']) ? o['response'] : null,
    });
  }
  return out;
}

/**
 * A MEAL LOGGED BEFORE 2026-09-24 has one free-text `food` and no list. It is read as a list of
 * names split on the separators nobody puts inside a food's name — commas, semicolons, new lines
 * and a spaced plus — and never on "and" or "&", which live inside "mac and cheese". The stored
 * text is not touched; this is only how it is read.
 *
 * EACH PART IS READ WHOLE, however long. The old field took 200 characters, so a part can be a
 * sentence; cut at sixty, the log, the Foods card and the visit summary would all print less than
 * the parent wrote.
 */
export function splitLegacyFood(text: string | null | undefined): string[] {
  if (typeof text !== 'string') return [];
  return text
    .split(/[,;\n]+|\s\+\s/)
    .map(tidySpaces)
    .filter(s => s !== '');
}

/** The foods of one meal: its list, or — for an older entry — its text read as one. */
export function itemsOf(detail: { items?: unknown; food?: string | null }): SolidsItem[] {
  const parsed = parseItems(detail.items ?? null);
  if (parsed !== null && parsed.length > 0) return parsed;
  return splitLegacyFood(detail.food).map(name => ({
    name,
    amount: null,
    unit: null,
    response: null,
  }));
}

/**
 * THE `food` COLUMN A NEW MEAL STILL WRITES: its names, in order, comma-separated. Anything that
 * reads `food` — an older build on the other parent's phone, the support console, the file
 * export's detail column — still sees what was eaten, and `splitLegacyFood` reads it back into
 * the same names.
 */
export function foodListText(items: readonly SolidsItem[]): string | null {
  const names = items.map(i => tidyFoodName(i.name)).filter(Boolean);
  return names.length === 0 ? null : clipChars(names.join(', '), 200);
}

/* ── one food, whatever it was typed as ───────────────────────────────────────────────────── */

/**
 * THE KEY TWO SPELLINGS OF ONE FOOD SHARE, so "Strawberry", "strawberries " and "STRAWBERRY"
 * are one food in every count and every history. Case, accents, spacing and punctuation go; so
 * does a plain plural on the last word (berries → berry, peaches → peach, peas → pea), which is
 * the difference a parent types without noticing. Nothing smarter: a typo is a different word,
 * and the sheet's own suggestions are what stop a second spelling being typed at all.
 *
 * A KEY IS NEVER READ BY A PERSON — every screen shows the food's own spelling — so it only has
 * to put the singular and the plural of one food in the same place, not spell either of them
 * right. That is why "cookie" and "cookies" both key as `cooky` (the audit of 2026-09-24 found
 * Cookie/Cookies, Veggie/Veggies, Smoothie/Smoothies, Brownie/Brownies, Kiwi/Kiwis and
 * Zucchini/Zucchinis counted as two foods each, with a false "First time" on the second).
 *
 * A NAME WITH NO LETTER OR DIGIT IN IT — "🍌" — keys as itself, tidied. It used to key as
 * nothing, and a food with no key was skipped by every count: in the log, and missing from
 * Reports, the visit summary, the first times and the suggestions.
 *
 * It is never stored — computed on read, so improving it improves every meal already logged.
 */
export function foodKey(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  const last = words.pop();
  if (last === undefined) return symbolKey(name);
  return [...words, singular(last)].join(' ');
}

/**
 * The key of a name made only of symbols: the name itself, spaced once, lower-cased, without the
 * variation selectors that make "🍌" and "🍌️" two strings for one picture. Empty only when the
 * name is.
 */
function symbolKey(name: string): string {
  return name.normalize('NFKC').replace(/[︎️]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function singular(w: string): string {
  if (w.length <= 3) return w;
  let s = w;
  if (w.endsWith('ies') && w.length > 4) s = `${w.slice(0, -3)}y`;
  else if (/(ch|sh|x|z|ss|o)es$/.test(w)) s = w.slice(0, -2);
  // hummus, couscous, asparagus, swiss… a word ending -us or -ss is not a plural. A word ending
  // -is IS one — kiwis, zucchinis, salamis — which the -is exception used to deny.
  else if (w.endsWith('s') && !/(ss|us)$/.test(w)) s = w.slice(0, -1);
  // THE SINGULAR FOLDED THE WAY ITS PLURAL IS: "cookies" became `cooky` above, so "cookie" must
  // too; "quiches" lost its -es, so "quiche" loses its e. Only past three letters, so "pie" and
  // "pies" still meet at `pie`.
  if (s.length > 3 && s.endsWith('ie')) return `${s.slice(0, -2)}y`;
  if (s.length > 3 && /(ch|sh|x|z|ss|o)e$/.test(s)) return s.slice(0, -1);
  return s;
}

/* ── how a meal reads ─────────────────────────────────────────────────────────────────────── */

export const RESPONSE_LABEL: Readonly<Record<FoodResponse, string>> = {
  LOVED: 'Loved it',
  LIKED: 'Liked it',
  UNSURE: 'Not sure',
  DISLIKED: "Didn't like it",
};

/** Unit words as they sit after a number: `5 pcs`, `1 pc`, `2 tbsp`, `30 g`. */
export function unitLabel(unit: FoodUnit, amount: number | null = null): string {
  switch (unit) {
    case 'PIECE':
      return amount === 1 ? 'pc' : 'pcs';
    case 'TSP':
      return 'tsp';
    case 'TBSP':
      return 'tbsp';
    case 'OZ':
      return 'oz';
    case 'G':
      return 'g';
    case 'ML':
      // the symbol a person reads, as every milk amount writes it (2026-09-26): mL, never ml
      return 'mL';
  }
}

/** The unit picker's words, in the order a parent reaches for them. */
export const UNIT_CHOICE_LABEL: Readonly<Record<FoodUnit, string>> = {
  PIECE: 'pieces',
  TSP: 'tsp',
  TBSP: 'tbsp',
  OZ: 'oz',
  G: 'g',
  ML: 'mL',
};

/**
 * THE KITCHEN FRACTIONS an amount is shown back as when two decimals cannot say it: a spoon is
 * marked in halves, thirds, quarters and eighths, and a parent who typed "1/8" reads "1/8" again
 * rather than "0.13" (the audit of 2026-09-24: 1/8 tsp came back as 0.13, 1/3 as 0.33, 1/16 as
 * 0.06 — and was STORED as those, a quarter off in the case of a sixteenth).
 */
const FRACTION_DENOMINATORS = [2, 3, 4, 6, 8, 16] as const;
/** Four places hold a sixteenth exactly and a third to a ten-thousandth. */
const AMOUNT_PLACES = 10_000;
/** How near a stored amount (or a sum of a few) must be to a fraction to be shown as one. */
const FRACTION_TOLERANCE = 0.0005;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** `1/8`, `1 1/3` — or null when the amount is no kitchen fraction. */
function asFraction(n: number): string | null {
  const whole = Math.floor(n + FRACTION_TOLERANCE);
  const part = n - whole;
  for (const d of FRACTION_DENOMINATORS) {
    const k = Math.round(part * d);
    if (k <= 0 || k >= d || Math.abs(part - k / d) > FRACTION_TOLERANCE) continue;
    const g = gcd(k, d);
    const f = `${String(k / g)}/${String(d / g)}`;
    return whole === 0 ? f : `${String(whole)} ${f}`;
  }
  return null;
}

/** Whether two decimals say the amount exactly — 5, 0.5, 1.25 — as every amount used to be. */
const twoPlaces = (n: number): boolean => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

/**
 * `5`, `0.5`, `1.25` — no trailing zeros; and `1/8`, `1 1/3` for an amount two decimals cannot
 * hold, so nothing a parent typed as a fraction is shown back rounded. Anything else is rounded
 * to two places for reading; the stored number keeps its four.
 */
export function formatFoodAmount(n: number): string {
  if (twoPlaces(n)) return String(Math.round(n * 100) / 100);
  return asFraction(n) ?? String(Math.round(n * 100) / 100);
}

/**
 * The amount as the field of an EDITED line shows it: the fraction when it is one, else the
 * number exactly as stored — so opening a meal and saving it untouched writes back what was there
 * (`parseFoodAmount` of this is the stored amount).
 */
export function amountFieldText(n: number): string {
  if (twoPlaces(n)) return String(Math.round(n * 100) / 100);
  return asFraction(n) ?? String(n);
}

/** `5 pcs` · `2 tbsp` · `3` (no unit said) · '' (no amount said). */
export function amountLabel(amount: number | null, unit: FoodUnit | null): string {
  if (amount === null) return '';
  const n = formatFoodAmount(amount);
  return unit === null ? n : `${n} ${unitLabel(unit, amount)}`;
}

/** `Strawberry 5 pcs` · `Banana` */
export function itemLabel(item: SolidsItem): string {
  const amount = amountLabel(item.amount, item.unit);
  return amount === '' ? item.name : `${item.name} ${amount}`;
}

/** The response every food shares, or null when they differ or none was said. */
export function sharedResponse(items: readonly SolidsItem[]): FoodResponse | null {
  const first = items[0]?.response ?? null;
  if (first === null) return null;
  return items.every(i => i.response === first) ? first : null;
}

/**
 * ONE LINE FOR THE LOG: `Strawberry 5 pcs · Banana 1 pc · Loved it`. When the foods went
 * differently each carries its own — `Strawberry 5 pcs, loved it · Banana, didn't like it` — so
 * the line never claims the whole meal went one way when it did not.
 */
export function mealLine(items: readonly SolidsItem[]): string {
  if (items.length === 0) return '';
  const shared = sharedResponse(items);
  const mixed = shared === null && items.some(i => i.response !== null);
  const foods = items.map(i =>
    mixed && i.response !== null
      ? `${itemLabel(i)}, ${RESPONSE_LABEL[i.response].toLowerCase()}`
      : itemLabel(i),
  );
  return [...foods, ...(shared === null ? [] : [RESPONSE_LABEL[shared]])].join(' · ');
}

/**
 * WHAT THE PARENT TYPES IN THE AMOUNT FIELD, READ AS A NUMBER: `5`, `0.5`, `0,5`, `1/2`,
 * `1 1/2`. Empty is null (not said); anything else unreadable is `undefined`, which the sheet
 * shows as a problem with that line rather than guessing.
 *
 * KEPT TO FOUR PLACES, not two: at two, 1/16 was stored as 0.06 — nearly a quarter less than the
 * parent measured — and 1/8 as 0.13. Four hold every kitchen fraction closely enough to be shown
 * back as the fraction it was (`formatFoodAmount`), and the server's check is a range, not a
 * precision.
 */
export function parseFoodAmount(text: string): number | null | undefined {
  const s = text.trim().replace(',', '.');
  if (s === '') return null;
  let n: number;
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
  const frac = /^(\d+)\/(\d+)$/.exec(s);
  if (mixed) {
    n = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  } else if (frac) {
    n = Number(frac[1]) / Number(frac[2]);
  } else if (/^\d*\.?\d+$/.test(s) || /^\d+\.$/.test(s)) {
    n = Number(s);
  } else {
    return undefined;
  }
  if (!Number.isFinite(n) || n < 0 || n > FOOD_AMOUNT_MAX) return undefined;
  return Math.round(n * AMOUNT_PLACES) / AMOUNT_PLACES;
}
