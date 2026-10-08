import { describe, expect, it } from 'vitest';
import { bannedIn } from './copy.banned';
import { GUIDANCE_DATA } from './guidance.data';
import { SOURCE_BY_ID } from './sources';
import { CARD_TRIGGERS, GuidanceCard } from './types';

const cards = GUIDANCE_DATA.map(c => GuidanceCard.parse(c));

function textsOf(c: GuidanceCard): string[] {
  return [c.title, c.body, ...c.points];
}

const SENTENCE_DASH = / - |—|–/;
/** UK spellings, matched from the start of a word so "colours" and "flavoured" count too. */
const UK_SPELLING = /\b(colour|favourite|yoghurt|fibre|flavour|diarrhoea)|\bmums?\b/i;

describe('the guidance cards', () => {
  it('parses every card with the GuidanceCard schema', () => {
    for (const c of GUIDANCE_DATA) {
      const r = GuidanceCard.safeParse(c);
      expect(r.success, `${c.id}: ${r.success ? '' : r.error.message}`).toBe(true);
    }
  });

  it('holds 20 to 30 cards with unique ids', () => {
    expect(cards.length).toBeGreaterThanOrEqual(20);
    expect(cards.length).toBeLessThanOrEqual(30);
    expect(new Set(cards.map(c => c.id)).size).toBe(cards.length);
  });

  it('cites only sources that exist', () => {
    for (const c of cards)
      for (const s of c.sources) expect(SOURCE_BY_ID.has(s), `${c.id} cites ${s}`).toBe(true);
  });

  it('never says a banned phrase', () => {
    for (const c of cards)
      for (const t of textsOf(c)) expect(bannedIn(t), `${c.id}: ${t}`).toEqual([]);
  });

  it('never tells the parent what they should do', () => {
    for (const c of cards)
      for (const t of textsOf(c)) expect(/\bshould\b/i.test(t), `${c.id}: ${t}`).toBe(false);
  });

  it('uses no dash as sentence punctuation', () => {
    for (const c of cards)
      for (const t of textsOf(c)) expect(SENTENCE_DASH.test(t), `${c.id}: ${t}`).toBe(false);
  });

  it('writes US English', () => {
    for (const c of cards)
      for (const t of textsOf(c)) expect(UK_SPELLING.test(t), `${c.id}: ${t}`).toBe(false);
  });

  it('keeps every body to three sentences or fewer, in sentence case', () => {
    for (const c of cards) {
      const sentences = c.body.split(/(?<=[.!?]["”]?)\s+/).filter(s => s.trim().length > 0);
      expect(sentences.length, c.id).toBeLessThanOrEqual(3);
      expect(/^[A-Z0-9]/.test(c.body), c.id).toBe(true);
      expect(/^[A-Z0-9]/.test(c.title), c.id).toBe(true);
    }
  });

  it('runs every card over a month range that starts no later than it ends', () => {
    for (const c of cards) expect(c.fromMonths, c.id).toBeLessThanOrEqual(c.toMonths);
  });

  it('has a card for every trigger', () => {
    for (const t of CARD_TRIGGERS)
      expect(
        cards.some(c => c.trigger === t),
        t,
      ).toBe(true);
  });

  it('says milk is still the main food until about one, in the words the spec sets', () => {
    const milk = cards.find(c => c.id === 'milk-is-main');
    expect(milk?.body).toContain(
      'Until about 12 months, breast milk or formula gives most of what your baby needs. Food is for exploring and practice.',
    );
    expect(milk?.fromMonths).toBe(6);
    expect(milk?.toMonths).toBe(11);
  });

  it('tells the parent to call emergency services for choking and for the emergency signs', () => {
    const gag = cards.find(c => c.id === 'gagging-vs-choking');
    expect(gag?.points.join(' ')).toMatch(/emergency services/);
    expect(gag?.points.join(' ')).toMatch(/Never sweep a finger/);
    const reaction = cards.find(c => c.id === 'possible-reaction');
    expect(reaction?.body).toMatch(/emergency services/);
    expect(reaction?.body).toMatch(/breathing/);
    expect(reaction?.body).toMatch(/swelling/);
  });

  it('keeps region-only cards to their regions', () => {
    expect(cards.find(c => c.id === 'salt-uk')?.regions).toEqual(['UK']);
    expect(cards.find(c => c.id === 'snacks-uk')?.regions).toEqual(['UK']);
    expect(cards.find(c => c.id === 'snacks-ca')?.regions).toEqual(['CA']);
  });
});
