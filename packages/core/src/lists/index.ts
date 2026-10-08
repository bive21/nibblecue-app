/**
 * The two shared lists — what the household is buying, and the chores that keep the day
 * working (WP6b, WP6c; the prototype's `VIEWS.shoplist` and `VIEWS.tasks`).
 *
 * Every function here is a mapping over plain rows: which chores are due today, how a list
 * groups, and the text a share produces. Pure, so the screens are thin and the claims are
 * tested in node rather than by tapping.
 *
 * NOTHING HERE IS ABOUT THE BABY. No arithmetic on the log, no inference, no suggestion.
 * `shoppingText` is the household's own lines, reformatted for a message. The checklist has no
 * share (the owner, 2026-09-19), so its text builder went with the button (2026-09-27).
 *
 * A line may point at a catalog item (`../supplies`), and when it does it carries that item's
 * size, pack and link along for the ride — because the whole point of the catalog is that the
 * person in the aisle gets the right box.
 */

export type { TaskRepeat } from '../sync/chains';
import type { TaskRepeat } from '../sync/chains';

/* --------------------------------- the shopping list --------------------------------- */

export interface ShoppingLine {
  id: string;
  title: string;
  qty: number;
  note: string | null;
  store: string | null;
  /** ISO instant it went in the basket, or null while it is still to buy. */
  checkedAt: string | null;
  /** The catalog item this line came from, or null/absent for a one-off ("bananas"). */
  supplyId?: string | null;
  /**
   * WHAT KIND OF THING IT IS, in the catalog's own word — `Diapers`, `Wipes`, `Formula`.
   *
   * Read through from the item like `variant` and `pack` and never copied onto the line, for the
   * same reason: a supply filed under the wrong category is corrected once, on the item, and
   * every line that points at it says the new word.
   *
   * Absent on a one-off, which has no catalog entry to have a category in.
   */
  categoryLabel?: string | null;
  /** The catalog item's size and pack, so the message names the right box. */
  variant?: string | null;
  pack?: string | null;
  /** The catalog item's product page. */
  link?: string | null;
}

/**
 * `Diapers: Pampers Swaddlers` — what a line is called when it is read away from its catalog
 * (the owner, 2026-09-19: "the category needs to be written for clarity … Diapers: Pampers
 * Swaddle / Size 3").
 *
 * THE CATEGORY IS THE PART A READER CANNOT GUESS. `Pampers Swaddlers` is a brand somebody in
 * the household knows and a grandparent sent the list does not; `Size 3` on its own is a size of
 * what. Naming the kind first turns three unfamiliar words into one familiar one followed by the
 * detail that identifies the box — which is exactly the order a person says it in a shop.
 *
 * It is the LINE's title, not the item's: a one-off has no category and keeps its own words.
 */
export function lineTitle(l: ShoppingLine): string {
  const category = (l.categoryLabel ?? '').trim();
  const name = lineLabel(l);
  return category === '' ? name : `${category}: ${name}`;
}

/** `Size 3 (16–28 lb) · 84-count box`, from whatever the line carries. */
const lineSpec = (l: ShoppingLine): string =>
  [l.variant, l.pack]
    .map(s => (s ?? '').trim())
    .filter(s => s.length > 0 && s !== '—')
    .join(' · ');

/**
 * Where a line with no shop of its own is grouped. Their word, not a category.
 *
 * `Any shop` AND NOT `Anywhere` (the shopping brief, 2026-09-19 §5). Both are true; only one of
 * them reads as a heading over a group of shops. "Anywhere" answers "where can I get this?",
 * which is a sentence about the item; the headings above and below it are shop NAMES, and the
 * last one has to be a shop name too or the group stops looking like the others. It is also the
 * word the Edit-supply sheet uses when nothing is picked ("shows under Any shop"), so the sheet
 * and the list say the same thing about the same line.
 */
export const NO_STORE = 'Any shop';

export const storeOf = (l: Pick<ShoppingLine, 'store'>): string => l.store ?? NO_STORE;

export const stillToBuy = (lines: readonly ShoppingLine[]): ShoppingLine[] =>
  lines.filter(l => l.checkedAt === null);

export const inTheBasket = (lines: readonly ShoppingLine[]): ShoppingLine[] =>
  lines.filter(l => l.checkedAt !== null);

export interface StoreGroup {
  store: string;
  lines: ShoppingLine[];
}

/*
 * `byStore` WAS HERE, and `groupByShop` below replaced it on 2026-09-22. It grouped by the literal
 * shop string, so "Target" and "target" were two groups — which nothing on screen had done since
 * `groupByShop` landed, and the one caller left was `shoppingText`. Two functions for one rule is
 * how a message ends up disagreeing with the list it was made from, so there is one now.
 */

/** `Diapers ×2` — the quantity only where there is more than one of it. */
export const lineLabel = (l: Pick<ShoppingLine, 'title' | 'qty'>): string =>
  l.qty > 1 ? `${l.title} ×${l.qty}` : l.title;

/** `3 of 11 in the basket`, or the empty state's own sentence. */
export function basketLine(lines: readonly ShoppingLine[]): string {
  if (lines.length === 0) return 'The list is empty';
  const done = inTheBasket(lines).length;
  return `${done} of ${lines.length} in the basket`;
}

/**
 * Who the run is for and who made the list — both supplied by the caller, never known here.
 *
 * `appName` is a PARAMETER and not a string in this file on purpose: every product name in
 * this repository is read from `assets/brand.json`, and `assets/brand.test.ts` fails the build
 * on one typed anywhere else. The date and time are preformatted for the same reason a chore's
 * time is — the household's locale, zone and 12/24-hour choice live at the edge, not in here.
 */
export interface ShoppingMessage {
  /** The babies this run is for, in the household's own order. Empty names it for nobody. */
  childNames?: readonly string[];
  /** The signature line's two facts: what made the list, and when. */
  madeBy?: { appName: string; at: string } | null;
}

/** `Emma`, `Emma and Noah`, `Emma, Noah and Ava` — an ordinary sentence, not a list of ids. */
function namesSentence(names: readonly string[]): string {
  const clean = names.map(n => n.trim()).filter(n => n.length > 0);
  if (clean.length <= 1) return clean[0] ?? '';
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1] as string}`;
}

/** `6 items · 2 shops` — how big the errand is, in the two numbers a reader wants first. */
const errandLine = (groups: readonly StoreGroup[]): string => {
  const items = groups.reduce((n, g) => n + g.lines.length, 0);
  return `${one(items, 'item')} · ${one(groups.length, 'shop')}`;
};

/** `1 item` / `6 items`. The visit sheet has the same helper, for the same reason. */
const one = (n: number, singular: string, plural = `${singular}s`): string =>
  `${n} ${n === 1 ? singular : plural}`;

/**
 * The list as a message — what gets sent to the partner already at the shop.
 *
 * ONLY THE LINES STILL TO BUY. Sending the whole list with half of it ticked makes the reader
 * work out which half, and the one thing this message exists to do is be readable in a queue.
 *
 * IT SAYS WHO IT IS FOR AND WHERE IT CAME FROM (the owner, 2026-09-17: "Sharing supply list
 * need to have more than just a simple line, add please buy this for [baby name], and then in
 * the end, the list is generated by cuddlecue on [date] [time]"). This file used to argue the
 * opposite — "no app name: it is the household's list, not an advertisement" — and the owner
 * overruled it, which is their call. The two lines earn their place anyway: a bare list of
 * brands landing in a group chat says nothing about whose baby or how old the list is, and a
 * grandparent sent one last week should not have to ask.
 *
 * BUILT LIKE THE PEDIATRICIAN SHEET, on the owner's instruction (2026-09-22: *"when sharing by
 * text, make it more interesting. right now for shopping list: it's literaly just some text please
 * buy. think what would be better, same like pediatrician report"*). Three things came across from
 * `reports/visitSheet.ts`, and each one earns its place in a message read in a checkout queue:
 *
 *  1. A CONTEXT LINE under the heading: `6 items · 2 shops`. It is the first question a reader
 *     asks of a list somebody sent them — is this a dash in or a whole trip — and it was nowhere.
 *  2. SHOP HEADINGS IN UPPER CASE, as the sheet's section titles are. The old plain `Target` sat
 *     at the same weight as the lines under it, so a five-shop list read as one run of bullets
 *     with stray words in it. A heading has to look like a heading in monospaced-nothing plain
 *     text, and case is the only weight plain text has.
 *  3. EVERY GROUP'S LINES INDENTED under it, so the shape says which shop a line belongs to even
 *     when the message is rewrapped by a chat app — which is exactly what happens to it.
 *
 * `one()` came across too, in place of the inline ternaries that were about to be written here.
 *
 * SHOPS MERGE CASE-INSENSITIVELY NOW: it groups by `groupByShop`, the same function the screen
 * uses, so "Target" and "target" are one heading in the message as they already were on the list.
 * `byStore` did not, and a list that showed two shops when the app showed one is the message
 * disagreeing with the app about the household's own data.
 */
export function shoppingText(lines: readonly ShoppingLine[], msg: ShoppingMessage = {}): string {
  const names = namesSentence(msg.childNames ?? []);
  const heading = names === '' ? 'Shopping list' : `Please buy this for ${names}`;
  const signature =
    msg.madeBy == null ? [] : ['', `Generated by ${msg.madeBy.appName} on ${msg.madeBy.at}`];
  const open = stillToBuy(lines);
  if (open.length === 0) return [heading, '', '(Nothing on the list.)', ...signature].join('\n');
  const groups = groupByShop(open);
  const out: string[] = [heading, '', errandLine(groups)];
  for (const g of groups) {
    out.push('', g.store.toUpperCase());
    for (const l of g.lines) {
      const spec = lineSpec(l);
      /*
        THE KIND, THEN THE NAME, THEN THE SIZE ON ITS OWN LINE (the owner, 2026-09-19). It used
        to be `• Pampers Swaddlers — Size 3` on one line, which reads as a brand and a dash to
        somebody who does not already know what a Swaddler is. Two lines, with the size indented
        under the name like the note and the link already are, is the same information in the
        order a person would say it out loud.
      */
      out.push(`  • ${lineTitle(l)}`);
      if (spec !== '') out.push(`      ${spec}`);
      // the note and the link go on their own indented lines: they are what stops the wrong
      // box coming home, and a reader skimming a queue should be able to skip them
      if (l.note !== null && l.note.trim() !== '') out.push(`      ${l.note.trim()}`);
      if (l.link !== undefined && l.link !== null && l.link.trim() !== '') {
        out.push(`      ${l.link.trim()}`);
      }
    }
  }
  return [...out, ...signature].join('\n');
}

/* --------------------------------- the household checklist --------------------------------- */

export interface TaskRow {
  id: string;
  title: string;
  atLocalTime: string | null;
  repeat: TaskRepeat;
  assignedTo: string | null;
  /** `YYYY-MM-DD` in the household's zone: the day it was last ticked off. */
  lastDoneOn: string | null;
}

export const TASK_REPEAT_LABEL: Readonly<Record<TaskRepeat, string>> = {
  DAILY: 'Every day',
  WEEKDAYS: 'Weekdays',
  WEEKENDS: 'Weekends',
  ONCE: 'Just once',
};

/** A chore with no time is "any time" and gets no reminder — the app never picks one. */
export const ANY_TIME = 'Any time';

/**
 * Whether a chore belongs to today, from the local weekday (0 = Sunday, as `Date.getDay`).
 *
 * `ONCE` stays on the list until it is ticked and then leaves: a one-off that came back
 * tomorrow would be a repeating chore with extra steps, and one that vanished unticked would
 * be the app deciding it did not matter.
 */
export function dueToday(t: Pick<TaskRow, 'repeat' | 'lastDoneOn'>, weekday: number): boolean {
  switch (t.repeat) {
    case 'WEEKDAYS':
      return weekday >= 1 && weekday <= 5;
    case 'WEEKENDS':
      return weekday === 0 || weekday === 6;
    case 'ONCE':
      return t.lastDoneOn === null;
    default:
      return true;
  }
}

export const isDone = (t: Pick<TaskRow, 'lastDoneOn'>, today: string): boolean =>
  t.lastDoneOn === today;

/**
 * Past its time and not ticked. It is a fact about the clock and the household's own number —
 * never a judgment, and never a color on its own (the word rides with it).
 */
export function isLate(
  t: Pick<TaskRow, 'atLocalTime' | 'lastDoneOn'>,
  today: string,
  nowMinutes: number,
): boolean {
  if (t.atLocalTime === null || isDone(t, today)) return false;
  const [h, m] = t.atLocalTime.split(':');
  const due = Number(h) * 60 + Number(m ?? 0);
  return Number.isFinite(due) && nowMinutes > due;
}

/** Today's chores, earliest first, with the any-time ones after the timed ones. */
export function tasksForToday(tasks: readonly TaskRow[], weekday: number): TaskRow[] {
  return tasks
    .filter(t => dueToday(t, weekday))
    .slice()
    .sort(
      (a, b) =>
        Number(a.atLocalTime === null) - Number(b.atLocalTime === null) ||
        (a.atLocalTime ?? '').localeCompare(b.atLocalTime ?? '') ||
        a.title.localeCompare(b.title),
    );
}

/** `2 of 5 done` — the strip's own count, and the More row's. */
export function doneLine(tasks: readonly TaskRow[], today: string): string {
  if (tasks.length === 0) return 'Nothing on the list';
  return `${tasks.filter(t => isDone(t, today)).length} of ${tasks.length} done`;
}

/* ------------------------------------------------- the 2026-09-19 shopping redesign ------- */

/**
 * SHOPS MERGE CASE-INSENSITIVELY, which `byStore` did not do (the brief §8: "Normalize shop
 * names case-insensitively so grouping on the list stays consistent").
 *
 * Two parents typing "target" and "Target" produced two groups on one trip, each with half the
 * things in it — the failure a grouped list exists to prevent. A supply's shop is free text and
 * always will be, so the merge belongs here rather than in a constraint: the FIRST spelling the
 * list meets wins the group's name, because that is the one a person chose most recently and
 * renaming it to a canonical form would be the app correcting their typing.
 */
export function groupByShop(lines: readonly ShoppingLine[]): StoreGroup[] {
  const groups = new Map<string, StoreGroup>();
  for (const l of lines) {
    const shown = storeOf(l);
    const key = shown.trim().toLowerCase();
    const hit = groups.get(key);
    if (hit) hit.lines.push(l);
    else groups.set(key, { store: shown, lines: [l] });
  }
  // IN EACH SHOP, THE SAVED SUPPLIES FIRST AND THE ONE-OFFS TOGETHER UNDER THEM (the owner,
  // 2026-10-06: "sort all one off items to be grouped together under the supplies items on the
  // bottom"). A stable split: each half keeps the order the list had
  return [...groups.values()]
    .map(g => ({
      ...g,
      lines: [...g.lines.filter(l => !isOneOff(l)), ...g.lines.filter(isOneOff)],
    }))
    .sort(sortShops);
}

/** A line typed in for this trip, with no saved supply behind it. */
const isOneOff = (l: ShoppingLine): boolean => (l.supplyId ?? null) === null;

/** Named shops alphabetically, `Any shop` last: a trip is named shops, then whatever is on the way. */
const sortShops = (a: StoreGroup, b: StoreGroup): number =>
  a.store === NO_STORE ? 1 : b.store === NO_STORE ? -1 : a.store.localeCompare(b.store);

/**
 * What a tap on a catalog row does: on the list, or off it. Pure, so the screen states the
 * INTENT and the caller writes it — and so "turning it on starts at one" is a rule with a test
 * rather than a number typed into two sheets.
 */
export type ListToggle =
  { action: 'add'; supplyId: string; qty: 1 } | { action: 'remove'; lineId: string };

/**
 * A SUPPLY IS ON THE LIST WHILE IT HAS A LINE STILL TO BUY. A line in the basket has been bought:
 * it is the trip's, and it leaves with the trip (`boughtOn`, and Clear in the app). So the toggle
 * and the pill beside it read the same lines, and both read only the ones still to buy.
 *
 * IT USED TO READ THE BASKET TOO, and that was the owner's shopping bug (2026-09-26: *"i added a one
 * off in the basket, checklisted all and started a new shopping list, but the one off was not
 * removed from it"*). Since the 2026-09-19 redesign the picker and the Supplies page have drawn a
 * supply whose line is in the basket as OFF — a + — while this still counted that line as on. So
 * with everything ticked, each + on the way to a new list took a bought line out of the basket
 * instead of adding (nothing recorded against the item), and the one-off, which has no + anywhere,
 * stayed behind in the new list. A + that takes something off is a control lying about what it does.
 */
export function toggleOnList(supplyId: string, lines: readonly ShoppingLine[]): ListToggle {
  // the FIRST line still to buy for this supply: a second tap takes off what the first put on,
  // and a supply that is somehow on the list twice loses one line per tap rather than neither
  const on = stillToBuy(lines).find(l => l.supplyId === supplyId);
  return on ? { action: 'remove', lineId: on.id } : { action: 'add', supplyId, qty: 1 };
}

/** Whether a supply is on the list — still to buy — and how many of it: the toggle's own label. */
export function onListQty(supplyId: string, lines: readonly ShoppingLine[]): number | null {
  const on = stillToBuy(lines).filter(l => l.supplyId === supplyId);
  return on.length === 0 ? null : on.reduce((sum, l) => sum + Math.max(1, l.qty), 0);
}

/**
 * THE TRIP IS OVER: something is in the basket and nothing is left to buy — the list the screen
 * says "All done" over. The next thing put on the list starts a new one, and the trip that ended
 * is finished first, exactly as Clear finishes it (`putOnList` in the app): every bought line
 * leaves, one-offs included, and each bought supply records the day it was bought.
 *
 * ONLY THEN, never mid-trip. A line added while something is still to buy is a thing remembered in
 * the aisle, and the basket is the parent's record of what is already in the cart; clearing it
 * under them would be the app deciding the trip was over. With nothing left to buy, there is no
 * trip left to be in the middle of — and no unbought line anywhere for the finish to take.
 */
export const tripFinished = (lines: readonly Pick<ShoppingLine, 'checkedAt'>[]): boolean =>
  lines.length > 0 && lines.every(l => l.checkedAt !== null);

/**
 * THE DAY EACH BOUGHT SUPPLY WAS BOUGHT, for its `last_bought_on`: the household's own day of the
 * tick that put its line in the basket — the latest, for a supply bought twice on one trip.
 *
 * THE TICK'S DAY AND NOT THE DAY THE TRIP IS FINISHED, because a trip is finished by whoever next
 * starts a list, and that can be days after the shop (a list left on "All done" over a weekend).
 * "Bought 9 days ago" and the running-low arithmetic behind it are only as true as this date. A
 * tick that will not parse falls back to `today`, and an item's date never moves backwards: a date
 * it already holds that is later than this trip's (another phone's trip, synced meanwhile) stays.
 *
 * `dayOf` is the caller's — the household's zone lives at the edge, never in `packages/core`.
 * One-offs are not in the answer: a line with no supply records nothing anywhere.
 */
export function boughtOn(
  basket: readonly Pick<ShoppingLine, 'checkedAt' | 'supplyId'>[],
  dayOf: (ms: number) => string,
  today: string,
  held: ReadonlyMap<string, string | null> = new Map(),
): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of basket) {
    const supplyId = l.supplyId ?? '';
    if (supplyId === '' || l.checkedAt === null) continue;
    const ms = Date.parse(l.checkedAt);
    const day = Number.isFinite(ms) ? dayOf(ms) : today;
    const seen = out.get(supplyId);
    if (seen === undefined || day > seen) out.set(supplyId, day);
  }
  for (const [supplyId, day] of out) {
    const before = held.get(supplyId) ?? null;
    if (before !== null && before > day) out.set(supplyId, before);
  }
  return out;
}
