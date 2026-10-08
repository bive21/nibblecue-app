/**
 * WHAT THE LOG'S SEARCH SAYS.
 *
 * Every sentence here is a count, a time, a name, or words the parent chose when they logged
 * ("liked 3" is their own tap on the meal sheet, counted). Nothing says a number is high, low,
 * normal, enough or worth doing anything about — `logSearch.test.ts` holds that against
 * `BANNED`, the list every sentence built from a household's own log is held to — and nothing
 * uses the word the care rules keep out of the app's own voice for a medicine (CLAUDE.md §2
 * rule 4).
 */
import { responseCounts } from '../solids/history';
import { FOOD_RESPONSES } from '../solids/items';
import { topicById, type SearchSummary } from './logSearch';

/** The field's name for a screen reader; the placeholder carries it on screen. */
export const SEARCH_LABEL = 'Search your log';
export const SEARCH_PLACEHOLDER = 'Search a food, a medicine, a note, "poop"…';

export const SEARCH_EMPTY_TITLE = (query: string): string =>
  `Nothing in your log matches “${query}”`;
export const SEARCH_EMPTY_BODY =
  'Search finds foods, medicine names and words from your notes, and things you log, like poop, ' +
  'nap, bath or formula.';

/** Under the summary on a plan that keeps a window of history in the app. */
export const searchWindow = (days: number): string => `Searching the last ${days} days`;

/** The foot of a free household's results: how many matches sit before the window. */
export const searchOlder = (n: number): string =>
  n === 1 ? '1 earlier match' : `${n} earlier matches`;

const times = (n: number): string => (n === 1 ? '1 time' : `${n} times`);
const listNames = (names: readonly string[]): string =>
  names.length <= 3
    ? names.join(', ')
    : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;

export interface SearchSummaryFormat {
  /** "today 2:10 AM", "yesterday 6:40 PM", "Tue 12:10 PM", "Sep 3". */
  when: (ms: number) => string;
  /** The household's word for a module — Tummy time or Playtime (`useModuleLabels`). */
  tummyWord?: string;
}

/**
 * THE ONE LINE ABOVE THE RESULTS.
 *
 *   food       Banana · 4 times · latest Tue 12:10 PM · liked 3 · didn't like 1
 *   foods      Banana, Banana oat · 5 meals · latest today 12:10 PM
 *   medicine   Tylenol · 3 times · latest today 2:10 AM by Sam · 2.5 ml
 *   medicines  Tylenol, Motrin · 5 times · latest today 2:10 AM
 *   topic      5 dirty diapers · latest yesterday 6:40 PM by Sam
 *   entries    7 entries · latest today 9:12 AM
 *
 * The amount on a medicine is the one the parent typed, verbatim — never worked out (rule 4).
 */
export function searchSummaryLine(s: SearchSummary, f: SearchSummaryFormat): string {
  const latest = `latest ${f.when(s.latestMs)}`;
  switch (s.kind) {
    case 'food': {
      const said = FOOD_RESPONSES.some(r => s.responses[r] > 0)
        ? ` · ${responseCounts(s.responses)}`
        : '';
      return `${s.name} · ${times(s.times)} · ${latest}${said}`;
    }
    case 'foods':
      return `${listNames(s.names)} · ${s.meals === 1 ? '1 meal' : `${s.meals} meals`} · ${latest}`;
    case 'medicine': {
      const by = s.latestBy ? ` by ${s.latestBy}` : '';
      const amount = s.latestAmount ? ` · ${s.latestAmount}` : '';
      return `${s.name} · ${times(s.times)} · ${latest}${by}${amount}`;
    }
    case 'medicines':
      return `${listNames(s.names)} · ${times(s.times)} · ${latest}`;
    case 'topic': {
      const topic = topicById(s.topic);
      const [one, many] =
        s.topic === 'tummy' && f.tummyWord
          ? [f.tummyWord.toLowerCase(), f.tummyWord.toLowerCase()]
          : topic.noun;
      const by = s.latestBy ? ` by ${s.latestBy}` : '';
      return `${s.count} ${s.count === 1 ? one : many} · ${latest}${by}`;
    }
    case 'entries':
      return `${s.count === 1 ? '1 entry' : `${s.count} entries`} · ${latest}`;
  }
}
