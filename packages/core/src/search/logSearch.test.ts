/**
 * SEARCH YOUR LOG — what a word finds, what the one line says, and what it will never say.
 *
 * The questions come from the probe that retired "Ask your log" (2026-09-24): of fourteen things
 * parents actually ask, Ask answered two. Each of those questions is here as the words a parent
 * would type, and each has to reach the entries that answer it.
 */
import { describe, expect, it } from 'vitest';
import type { SolidsItem } from '../solids/items';
import { BANNED } from '../schedule/foresight.banned';
import {
  SEARCH_EMPTY_BODY,
  SEARCH_PLACEHOLDER,
  SEARCH_TOPICS,
  fold,
  matchEntry,
  parseQuery,
  searchEntries,
  searchOlder,
  searchSummaryLine,
  searchWindow,
  stem,
  summarize,
  textHas,
  textNeedles,
  type SearchableEntry,
} from './index';

const H = 3_600_000;
const NOW = Date.parse('2026-09-24T14:00:00.000Z');
let n = 0;
const entry = (
  fields: Partial<SearchableEntry> & Pick<SearchableEntry, 'type'>,
): SearchableEntry => {
  n += 1;
  return { id: `e${String(n).padStart(3, '0')}`, startMs: NOW - n * H, ...fields };
};
const food = (name: string, response: SolidsItem['response'] = null): SolidsItem => ({
  name,
  amount: null,
  unit: null,
  response,
});

const LOG: SearchableEntry[] = [
  entry({ type: 'diaper', diaperKind: 'DIRTY', byName: 'Sam' }),
  entry({ type: 'diaper', diaperKind: 'WET' }),
  entry({ type: 'diaper', diaperKind: 'BOTH', diaperRash: true }),
  entry({ type: 'bottle', bottleKind: 'FORMULA' }),
  entry({ type: 'bottle', bottleKind: 'WATER' }),
  entry({ type: 'bottle', bottleKind: 'EBM' }),
  entry({ type: 'breastfeed' }),
  entry({ type: 'sleep', sleepKind: 'NAP' }),
  entry({ type: 'sleep', sleepKind: 'NIGHT' }),
  entry({ type: 'med', medName: 'Tylenol', medAmount: '2.5 ml', byName: 'Sam' }),
  entry({ type: 'med', medName: 'Vitamin D', medAmount: '1 drop' }),
  entry({ type: 'med', medName: 'Tylenol', medAmount: '2.5 ml', byName: 'Dana' }),
  entry({ type: 'temp' }),
  entry({ type: 'growth', weightG: 6200, lengthMm: null, headMm: null }),
  entry({
    type: 'solids',
    meal: 'LUNCH',
    solidsItems: [food('Banana', 'LIKED'), food('Oat cereal')],
  }),
  entry({ type: 'solids', meal: 'BREAKFAST', solidsItems: [food('Strawberries', 'DISLIKED')] }),
  entry({ type: 'solids', meal: 'DINNER', solidsItems: [food('banana', 'LOVED')] }),
  entry({ type: 'solids', food: 'Banana, pear' }), // an older meal's single text box
  entry({ type: 'bath', notes: 'Fussy after the bath, rash on her cheek' }),
  entry({ type: 'pump' }),
  entry({ type: 'tummy' }),
];

const ids = (query: string): string[] => {
  const q = parseQuery(query);
  return q === null ? [] : searchEntries(q, LOG).map(h => h.entry.id);
};
const types = (query: string): string[] => {
  const q = parseQuery(query);
  return q === null ? [] : searchEntries(q, LOG).map(h => h.entry.type);
};
const line = (query: string, entries: readonly SearchableEntry[] = LOG): string | null => {
  const q = parseQuery(query);
  if (q === null) return null;
  const s = summarize(searchEntries(q, entries));
  return s === null
    ? null
    : searchSummaryLine(s, { when: ms => `@${Math.round((NOW - ms) / H)}h` });
};

describe('the words a parent types', () => {
  it('folds case, accents and punctuation the way a food is keyed', () => {
    expect(fold('  Ácido-FÓLICO! ')).toBe('acido folico');
    expect(textHas('Ácido fólico', 'acido')).toBe(true);
  });

  it('finds a plural by its singular, and inside a word from three letters', () => {
    expect(stem('strawberries')).toBe('strawberry');
    expect(stem('eggs')).toBe('egg');
    expect(stem('peaches')).toBe('peach');
    expect(textHas('Strawberries', 'strawberry')).toBe(true);
    expect(textHas('Blueberries', 'berr')).toBe(true);
    // one or two letters only at the start of a word: "d" is Vitamin D, not every word with a d
    expect(textHas('Vitamin D', 'd')).toBe(true);
    expect(textHas('Pudding', 'd')).toBe(false);
  });

  it('a needle is a substring of every ASCII spelling textHas would find', () => {
    const words = [
      'egg',
      'eggs',
      'strawberry',
      'strawberries',
      'berry',
      'berries',
      'blueberry',
      'blueberries',
      'peach',
      'peaches',
      'box',
      'boxes',
      'baby',
      'babies',
      'nap',
      'naps',
      'napping',
      'berr',
      'potato',
      'potatoes',
      'glass',
      'glasses',
    ];
    const storedOf = (word: string): string[] => [
      word,
      `${word}s`,
      `${word}es`,
      word.endsWith('y') ? `${word.slice(0, -1)}ies` : word,
      `xx${word}yy`,
      `${word}-salad`,
    ];
    for (const query of words) {
      for (const stored of storedOf(query)) {
        if (!textHas(stored, query)) continue;
        const lower = stored.toLowerCase();
        expect(
          textNeedles(query).some(n => lower.includes(n)),
          `${query} in ${stored}`,
        ).toBe(true);
      }
    }
    // accents are not a needle's job: the row is kept whole and textHas folds it
    expect(textHas('Ácido fólico', 'acido')).toBe(true);
  });

  it('drops the words a question wraps around its subject, and the baby’s name', () => {
    expect(parseQuery('when did she last poop?')?.terms.map(t => t.word)).toEqual(['poop']);
    expect(parseQuery('did Ada have tylenol', { ignore: ['Ada'] })?.terms.map(t => t.word)).toEqual(
      ['tylenol'],
    );
    // a question made only of those words is not a search
    expect(parseQuery('when did she last')).toBeNull();
    expect(parseQuery('a')).toBeNull();
  });

  it('keeps a two-word name together, so breast milk is not "breast" and "milk"', () => {
    const q = parseQuery('breast milk');
    expect(q?.terms).toHaveLength(1);
    expect(q?.terms[0]?.topic?.id).toBe('breastmilk');
  });
});

describe('what each word finds', () => {
  it('poop is the dirty and mixed diapers — never the wet ones', () => {
    expect(types('poop')).toEqual(['diaper', 'diaper']);
    const kinds =
      parseQuery('poop') && searchEntries(parseQuery('poop')!, LOG).map(h => h.entry.diaperKind);
    expect(kinds).toEqual(['DIRTY', 'BOTH']);
  });

  it('every word has to match: "dirty diapers" is the dirty ones, not every diaper', () => {
    expect(ids('dirty diapers')).toEqual(ids('poop'));
    expect(ids('wet diaper')).toHaveLength(2);
  });

  it('a medicine by its name, and a vitamin by its words', () => {
    expect(types('tylenol')).toEqual(['med', 'med']);
    expect(ids('vitamin d')).toHaveLength(1);
    expect(ids('TYLENOL')).toEqual(ids('tylenol'));
  });

  it('a food by its name, in the new lines and in an older meal’s single box', () => {
    // two new-style meals and one older meal written as "Banana, pear"
    expect(ids('banana')).toHaveLength(3);
    expect(ids('strawberry')).toHaveLength(1);
    expect(ids('pear')).toHaveLength(1);
  });

  it('a bottle by what was in it: water, formula, breast milk', () => {
    expect(ids('water')).toHaveLength(1);
    expect(ids('formula')).toHaveLength(1);
    expect(ids('breast milk')).toHaveLength(1);
    // a feed is a breastfeed or a bottle of milk — never the water (the feeding audit's M7)
    expect(types('feeds').sort()).toEqual(['bottle', 'bottle', 'breastfeed']);
  });

  it('naps and nights apart, and sleep for both', () => {
    expect(ids('nap')).toHaveLength(1);
    expect(ids('night')).toHaveLength(1);
    expect(ids('sleep')).toHaveLength(2);
  });

  it('a word from a note, whatever the entry is', () => {
    expect(types('fussy')).toEqual(['bath']);
  });

  it('rash is the diapers with the rash ticked, and any note that says it', () => {
    expect(types('rash').sort()).toEqual(['bath', 'diaper']);
  });

  it('never maps a condition word onto readings: "fever" finds only what a note says', () => {
    expect(SEARCH_TOPICS.some(t => t.names.includes('fever'))).toBe(false);
    expect(ids('fever')).toEqual([]);
  });

  it('newest first, every time', () => {
    const q = parseQuery('diaper')!;
    const starts = searchEntries(q, LOG).map(h => h.entry.startMs);
    expect(starts).toEqual([...starts].sort((a, b) => b - a));
  });

  it('a word that is in nothing finds nothing', () => {
    expect(ids('zucchini')).toEqual([]);
    expect(matchEntry(parseQuery('zucchini')!, LOG[0] as SearchableEntry)).toBeNull();
  });
});

describe('the one line above the results', () => {
  it('one food: how many times, the latest, and how it went — the parent’s own taps', () => {
    expect(line('banana')).toMatch(/^Banana · 3 times · latest @\d+h · loved 1 · liked 1$/);
  });

  it('two foods on the same meals: their names and the meals', () => {
    expect(line('oat banana')).toMatch(/^Banana, Oat cereal · 1 meal · latest/);
  });

  it('one medicine: the latest, who gave it, and the amount they typed', () => {
    expect(line('tylenol')).toMatch(/^Tylenol · 2 times · latest @\d+h by Sam · 2\.5 ml$/);
  });

  it('an activity: the count in its own words', () => {
    expect(line('poop')).toMatch(/^2 dirty diapers · latest @\d+h by Sam$/);
    expect(line('dirty diapers')).toMatch(/^2 dirty diapers/);
    expect(line('nap')).toMatch(/^1 nap · latest/);
  });

  it('a mix: just the entries', () => {
    expect(line('rash')).toMatch(/^2 entries · latest/);
  });

  it('nothing: no line at all', () => {
    expect(line('zucchini')).toBeNull();
  });

  it('the household’s own word for tummy time', () => {
    const q = parseQuery('tummy')!;
    const s = summarize(searchEntries(q, LOG))!;
    expect(searchSummaryLine(s, { when: () => 'today', tummyWord: 'Playtime' })).toBe(
      '1 playtime · latest today',
    );
  });
});

describe('what it will never say', () => {
  it('no judgement, no condition, no instruction — and never the word the care rules keep out', () => {
    const lines = [
      'banana',
      'oat banana',
      'tylenol',
      'vitamin tylenol',
      'poop',
      'rash',
      'water',
      'temperature',
      'weight',
      'feeds',
    ]
      .map(q => line(q))
      .filter((l): l is string => l !== null);
    const all = [
      ...lines,
      SEARCH_PLACEHOLDER,
      SEARCH_EMPTY_BODY,
      searchWindow(7),
      searchOlder(3),
      ...SEARCH_TOPICS.flatMap(t => [...t.noun]),
    ]
      .join('\n')
      .toLowerCase();
    for (const word of BANNED) expect(all, word).not.toContain(word);
    expect(all).not.toMatch(/\bdose|\bfever|\bsick|\bill\b|\bworr/);
  });
});

describe('a Health note in the search (2026-10-08)', () => {
  const note = entry({
    type: 'wellbeing',
    wellbeingSeen: ['RASH', 'SPIT_UP'],
    notes: 'Red patches on her cheeks after lunch',
  });
  const rashDiaper = entry({ type: 'diaper', diaperKind: 'WET', diaperRash: true });
  const bottle = entry({ type: 'bottle', bottleKind: 'FORMULA' });
  const all = [note, rashDiaper, bottle];
  const find = (q: string) =>
    searchEntries(parseQuery(q) as NonNullable<ReturnType<typeof parseQuery>>, all).map(
      h => h.entry.id,
    );

  it('is found by a chip’s own word, as the parent tapped it', () => {
    expect(find('spit up')).toEqual([note.id]);
    // "rash" finds the note's chip and the diaper's rash tick, each as what it is
    expect(find('rash').sort()).toEqual([note.id, rashDiaper.id].sort());
  });

  it('is found by its words, verbatim, and by its own name', () => {
    expect(find('cheeks')).toEqual([note.id]);
    expect(find('health note')).toEqual([note.id]);
    expect(find('health notes')).toEqual([note.id]);
  });

  it('a chip is never a condition word: "allergy" finds only what someone wrote', () => {
    expect(find('allergy')).toEqual([]);
    expect(SEARCH_TOPICS.find(t => t.id === 'wellbeing')?.names).toEqual([
      'health note',
      'health notes',
    ]);
  });
});
