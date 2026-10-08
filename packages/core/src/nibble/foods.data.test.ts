import { describe, expect, it } from 'vitest';
import { bannedIn } from './copy.banned';
import { FOOD_DATA } from './foods.data';
import { SOURCE_BY_ID } from './sources';
import { AGE_BANDS, ALLERGEN_IDS, type AllergenId, CUISINES, Food } from './types';

const foods = FOOD_DATA.map(f => Food.parse(f));
const byId = new Map(foods.map(f => [f.id, f]));

/** Every string a parent can read on a food. */
function textsOf(f: Food): string[] {
  return [
    f.name,
    ...f.aliases,
    ...f.serving.map(s => s.how),
    ...(f.chokingNote ? [f.chokingNote] : []),
    ...f.ideas,
  ];
}

const SENTENCE_DASH = / - |—|–/;
/** UK spellings, matched from the start of a word so "colours" and "flavoured" count too. */
const UK_SPELLING = /\b(colour|favourite|yoghurt|fibre|flavour|diarrhoea)|\bmums?\b/i;
const TREE_NUTS: readonly AllergenId[] = [
  'almond',
  'cashew',
  'walnut',
  'pecan',
  'pistachio',
  'hazelnut',
];
const HIGH_MERCURY = /shark|swordfish|marlin|king mackerel|orange roughy|tilefish|bigeye/i;
/** Each band's first month, and the month after its last ([from, to) as in types.ts). */
const BAND_START: Record<(typeof AGE_BANDS)[number], number> = {
  '6-8': 6,
  '9-11': 9,
  '12-17': 12,
  '18-24': 18,
};
const BAND_END: Record<(typeof AGE_BANDS)[number], number> = {
  '6-8': 9,
  '9-11': 12,
  '12-17': 18,
  '18-24': 25,
};

describe('the food library', () => {
  it('parses every entry with the Food schema', () => {
    for (const f of FOOD_DATA) {
      const r = Food.safeParse(f);
      expect(r.success, `${f.id}: ${r.success ? '' : r.error.message}`).toBe(true);
    }
  });

  it('holds between 160 and 200 foods with unique ids', () => {
    expect(foods.length).toBeGreaterThanOrEqual(160);
    expect(foods.length).toBeLessThanOrEqual(200);
    expect(new Set(foods.map(f => f.id)).size).toBe(foods.length);
  });

  it('cites only sources that exist', () => {
    for (const f of foods) {
      expect(f.sources.length, f.id).toBeGreaterThan(0);
      for (const s of f.sources) expect(SOURCE_BY_ID.has(s), `${f.id} cites ${s}`).toBe(true);
    }
  });

  it('never says a banned phrase', () => {
    for (const f of foods)
      for (const t of textsOf(f)) expect(bannedIn(t), `${f.id}: ${t}`).toEqual([]);
  });

  it('uses no dash as sentence punctuation', () => {
    for (const f of foods)
      for (const t of textsOf(f)) expect(SENTENCE_DASH.test(t), `${f.id}: ${t}`).toBe(false);
  });

  it('writes US English', () => {
    for (const f of foods)
      for (const t of textsOf(f)) expect(UK_SPELLING.test(t), `${f.id}: ${t}`).toBe(false);
  });

  it('starts every sentence a parent reads with a capital letter', () => {
    for (const f of foods) {
      const sentences = [...f.serving.map(s => s.how), ...f.ideas, f.chokingNote ?? 'X'];
      for (const t of sentences) expect(/^[A-Z0-9]/.test(t), `${f.id}: ${t}`).toBe(true);
      expect(/^[A-Z0-9]/.test(f.name), f.id).toBe(true);
    }
  });

  it('gives every medium or high choking risk food a choking note, and no note to a low one', () => {
    for (const f of foods) {
      if (f.chokingRisk === 'low') expect(f.chokingNote, f.id).toBeNull();
      else expect(f.chokingNote?.length ?? 0, f.id).toBeGreaterThan(0);
    }
  });

  it('cites the choking guidance for every medium or high choking risk food', () => {
    for (const f of foods)
      if (f.chokingRisk !== 'low') expect(f.sources, f.id).toContain('aap-choking');
  });

  it('lists the four serving bands in order', () => {
    for (const f of foods)
      expect(
        f.serving.map(s => s.band),
        f.id,
      ).toEqual([...AGE_BANDS]);
  });

  it('offers nothing in a band that ends before the food is allowed, and something after', () => {
    for (const f of foods) {
      for (const s of f.serving) {
        if (BAND_END[s.band] <= f.notBeforeMonths) expect(s.forms, `${f.id} ${s.band}`).toEqual([]);
      }
      if (f.id === 'honey') continue; // an added sugar: never planned before 2 (usda-dga)
      const allowed = f.serving.filter(s => BAND_START[s.band] >= f.notBeforeMonths);
      for (const s of allowed) expect(s.forms.length, `${f.id} ${s.band}`).toBeGreaterThan(0);
    }
  });

  it('keeps every food at 6 months except the few a source holds back', () => {
    const later = foods.filter(f => f.notBeforeMonths !== 6).map(f => f.id);
    expect(later.sort()).toEqual(['cows-milk-drink', 'fruit-juice', 'honey', 'soy-milk-drink']);
  });

  it('holds honey, milk to drink, plant milk and juice to 12 months', () => {
    expect(byId.get('honey')?.notBeforeMonths).toBe(12);
    expect(byId.get('honey')?.animal).toBe('honey');
    expect(byId.get('honey')?.sources).toEqual(expect.arrayContaining(['cdc-faqs', 'usda-dga']));
    expect(byId.get('cows-milk-drink')?.notBeforeMonths).toBe(12);
    expect(byId.get('cows-milk-drink')?.sources).toContain('cdc-milk');
    expect(byId.get('soy-milk-drink')?.notBeforeMonths).toBe(12);
    expect(byId.get('fruit-juice')?.notBeforeMonths).toBe(12);
    expect(byId.get('fruit-juice')?.sources).toContain('aap-juice');
    expect(byId.get('fruit-juice')?.ideas.join(' ')).toMatch(/4 oz.*never in a bottle/);
    expect(byId.get('water')?.notBeforeMonths).toBe(6);
  });

  it('carries no high-mercury fish', () => {
    for (const f of foods) {
      for (const t of [f.id, f.name, ...f.aliases])
        expect(HIGH_MERCURY.test(t), `${f.id}: ${t}`).toBe(false);
    }
  });

  it('carries none of the foods that stay off the menu', () => {
    const never =
      /popcorn|marshmallow|candy|hot dog|raw egg|rice (drink|milk)|unpasteuri|\bliver\b|ackee|hijiki|seaweed|whole nuts?\b/i;
    for (const f of foods) {
      for (const t of [f.id, f.name, ...f.aliases]) {
        expect(never.test(t), `${f.id}: ${t}`).toBe(false);
        // Raw sprouts never; Brussels sprouts are a cooked vegetable, not a sprouted seed.
        if (f.id !== 'brussels-sprouts') expect(/sprout/i.test(t), `${f.id}: ${t}`).toBe(false);
      }
    }
  });

  it('tags allergens to match the category', () => {
    for (const f of foods) {
      if (f.category === 'fish') {
        expect(['fish', 'shellfish'], f.id).toContain(f.animal);
        expect(f.allergens, f.id).toContain(f.animal === 'fish' ? 'fish' : 'shellfish');
      }
      if (f.animal === 'fish') expect(f.allergens, f.id).toContain('fish');
      if (f.animal === 'shellfish') expect(f.allergens, f.id).toContain('shellfish');
      if (f.category === 'egg') expect(f.allergens, f.id).toContain('egg');
      if (f.category === 'dairy') expect(f.allergens, f.id).toContain('milk');
      if (f.animal === 'dairy') expect(f.allergens, f.id).toContain('milk');
      // Drinks cite their own milk guidance; the allergen step is the food form (cows-milk).
      if (f.allergens.length > 0 && f.category !== 'drink')
        expect(f.sources, f.id).toContain('aap-allergens');
      if (f.allergens.includes('peanut')) expect(f.sources, f.id).toContain('niaid-peanut');
    }
    expect(byId.get('hummus')?.allergens).toEqual(['sesame']);
    expect(byId.get('pancake')?.allergens).toEqual(['wheat', 'egg', 'milk']);
    expect(byId.get('butter')?.allergens).toEqual(['milk']);
    expect(byId.get('ghee')?.allergens).toEqual(['milk']);
    expect(byId.get('paneer')?.allergens).toEqual(['milk']);
    expect(byId.get('bread')?.allergens).toEqual(['wheat']);
  });

  it('keeps nuts as smooth butter or ground, in thin or mixed-in forms only', () => {
    const nuts: readonly AllergenId[] = ['peanut', ...TREE_NUTS];
    const nutFoods = foods.filter(f => f.allergens.some(a => nuts.includes(a)));
    expect(nutFoods.length).toBeGreaterThanOrEqual(8);
    for (const f of nutFoods)
      for (const s of f.serving)
        for (const form of s.forms)
          expect(['spread', 'mixed_in'], `${f.id} ${s.band}`).toContain(form);
  });

  it('offers at least one food for every allergen, each tree nut on its own', () => {
    for (const a of ALLERGEN_IDS)
      expect(
        foods.some(f => f.allergens.includes(a)),
        a,
      ).toBe(true);
    for (const a of TREE_NUTS)
      expect(
        foods.some(f => f.allergens.length === 1 && f.allergens[0] === a),
        a,
      ).toBe(true);
  });

  it('marks iron-rich foods by their iron level, and has at least 25 of them', () => {
    for (const f of foods) expect(f.ironRich, f.id).toBe(f.nutrients.iron >= 2);
    expect(foods.filter(f => f.ironRich).length).toBeGreaterThanOrEqual(25);
  });

  it('gives every cuisine at least 4 foods', () => {
    for (const c of CUISINES)
      expect(foods.filter(f => f.cuisines.includes(c)).length, c).toBeGreaterThanOrEqual(4);
  });

  it('sets the meat and animal flags together', () => {
    for (const f of foods) {
      if (f.meat !== null) expect(f.animal, f.id).toBe('meat');
      if (f.category === 'meat') expect(f.meat, f.id).not.toBeNull();
    }
  });

  it('flags the root and bulb vegetables a Jain diet leaves out', () => {
    for (const id of [
      'onion',
      'garlic',
      'potato',
      'carrot',
      'beet',
      'sweet-potato',
      'daikon',
      'turnip',
      'ginger',
      'yam',
      'cassava',
    ])
      expect(byId.get(id)?.root, id).toBe(true);
  });

  it('offers grapes and cherry tomatoes only quartered or mashed', () => {
    for (const id of ['grapes', 'cherry-tomato']) {
      const f = byId.get(id);
      expect(f?.chokingRisk).toBe('high');
      expect(f?.chokingNote).toMatch(/quarter/i);
      expect(f?.chokingNote).toMatch(/lengthwise/i);
    }
  });

  it('flags rice cereal as firming, with a reminder to rotate grains', () => {
    const rice = byId.get('infant-rice-cereal');
    expect(rice?.firming).toBe(true);
    expect(rice?.ideas.join(' ')).toMatch(/rotate/i);
  });
});
