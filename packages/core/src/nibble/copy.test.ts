/**
 * Every sentence the plan can say, held to the voice (bpnc-studio product-and-design.md): no
 * banned phrase, no dash in a sentence, US English, sentence case.
 */
import { describe, expect, it } from 'vitest';
import { ALLERGEN_IDS } from './types';
import * as copy from './copy';
import { REASONS } from './planner/plan';
import { HARD_RULES } from './safety/rules';
import { bannedIn } from './copy.banned';
import { parseDraft, safeNote } from './planner/ai';

const UK = /\b(colour|favourite|flavour|fibre|yoghurt|diarrhoea|mum|centre|organise|realise)/i;
const DASH = /\s[-–—]\s|—|–/;

function everyString(): string[] {
  const out: string[] = [];
  for (const v of Object.values(copy)) {
    if (typeof v === 'string') out.push(v);
    else if (v && typeof v === 'object')
      out.push(...Object.values(v).filter((x): x is string => typeof x === 'string'));
  }
  for (const reason of REASONS) {
    out.push(copy.reasonText({ reason }));
    for (const a of ALLERGEN_IDS) {
      out.push(copy.reasonText({ reason, firstAllergen: a, keepGoing: [a, 'egg'] }));
    }
  }
  out.push(...HARD_RULES.map(r => r.text));
  return out;
}

describe('the plan’s words', () => {
  it('never use a banned phrase, a sentence dash or UK spelling', () => {
    for (const s of everyString()) {
      expect(bannedIn(s), s).toEqual([]);
      expect(DASH.test(s), s).toBe(false);
      expect(UK.test(s), s).toBe(false);
    }
  });

  it('start with a capital letter', () => {
    for (const s of everyString()) expect(/^[A-Z0-9"]/.test(s), s).toBe(true);
  });

  it('never call a noticed sign by a condition name', () => {
    for (const label of Object.values(copy.SIGN_LABEL)) {
      expect(/allerg|eczema|anaphyla|intoleran|fpies/i.test(label), label).toBe(false);
    }
  });
});

describe('the model’s words', () => {
  it('are shown only when short, plain and free of verdicts, amounts and dashes', () => {
    expect(safeNote('Adds a new color to the week.')).toBe('Adds a new color to the week.');
    expect(safeNote('Good for babies who are not eating enough.')).toBeNull();
    expect(safeNote('Give 2 tablespoons.')).toBeNull();
    expect(safeNote('Iron rich — great choice')).toBeNull();
    expect(safeNote('x'.repeat(91))).toBeNull();
    expect(safeNote(42)).toBeNull();
  });

  it('drop what the plan cannot hold: unknown foods, other days, bad meals, junk', () => {
    const items = parseDraft(
      {
        days: [
          {
            day: '2026-10-08',
            meals: [
              {
                meal: 'breakfast',
                items: [{ foodId: 'pear', reason: 'Sweet and soft.' }, { foodId: 'shark' }],
              },
            ],
          },
          { day: '2026-12-01', meals: [{ meal: 'breakfast', items: [{ foodId: 'pear' }] }] },
          { day: '2026-10-09', meals: [{ meal: 'brunch', items: [{ foodId: 'pear' }] }, 'junk'] },
        ],
      },
      { days: ['2026-10-08', '2026-10-09'], foodIds: new Set(['pear']) },
    );
    expect(items).toEqual([
      { day: '2026-10-08', meal: 'breakfast', foodId: 'pear', note: 'Sweet and soft.' },
    ]);
    expect(parseDraft(null, { days: [], foodIds: new Set() })).toEqual([]);
    expect(parseDraft('nope', { days: [], foodIds: new Set() })).toEqual([]);
  });
});
