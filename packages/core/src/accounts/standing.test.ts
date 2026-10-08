import { describe, expect, it } from 'vitest';
import { ENDED, endedReading, standingWithNoHousehold } from './standing';

describe('an account that belongs to no household', () => {
  it('sends a brand-new account to setup', () => {
    expect(standingWithNoHousehold(null)).toBe('setup');
  });

  it('tells an account that used to be in one that its time has ended', () => {
    expect(standingWithNoHousehold({ id: 'h1', name: 'The Iversen family' })).toBe('ended');
  });

  it('names the household where it knows it, and says the same thing where it does not', () => {
    expect(ENDED.title('The Iversen family')).toBe('Your time with The Iversen family has ended');
    // a device that remembered the id but not the name still gets a whole sentence
    expect(ENDED.title('')).toBe('You are not in a household any more');
    expect(ENDED.title('')).not.toContain('undefined');
  });

  it('blames nobody, because the app cannot tell which of the two happened', () => {
    const all = [ENDED.title('X'), ENDED.body, ENDED.keptTitle, ENDED.keptBody].join(' ');
    for (const word of [
      'removed you',
      'kicked',
      'revoked',
      'expired',
      'denied',
      'no longer allowed',
      'lost',
    ]) {
      expect(all.toLowerCase(), word).not.toContain(word);
    }
    // every reason is named, none is asserted
    expect(ENDED.body).toContain('temporary invite runs out');
    expect(ENDED.body).toContain('can remove someone');
    expect(ENDED.body).toContain('anyone can leave');
  });

  it('answers the fear before it is asked: the entries are not gone', () => {
    expect(ENDED.keptTitle).toContain('Nothing you logged was deleted');
    expect(ENDED.keptBody).toContain('stays with the household');
  });

  it('offers three ways on, and a new code is the first of them', () => {
    // a sitter invited back for another evening should not have to sign out to get in
    for (const label of [ENDED.joinLabel, ENDED.startLabel, ENDED.signOutLabel]) {
      expect(label.length).toBeGreaterThan(0);
    }
    expect(ENDED.joinLabel.toLowerCase()).toContain('invite code');
    expect(ENDED.startLabel.toLowerCase()).toContain('own household');
  });
});

describe('an account that left its only family itself (2026-10-08)', () => {
  it('is still Ended, and reads as left only when the device wrote that down', () => {
    const left = { id: 'h1', name: 'Lee’s family', left: true };
    expect(standingWithNoHousehold(left)).toBe('ended');
    expect(endedReading(left)).toBe('left');
    // a removal and a seat that ran out keep the words that blame nobody
    expect(endedReading({ id: 'h1', name: 'Lee’s family' })).toBe('ended');
    expect(endedReading(null)).toBe('ended');
  });

  it('says they left it, and that their entries stay with that family', () => {
    expect(ENDED.left.title('Lee’s family')).toBe('You left Lee’s family');
    expect(ENDED.left.title(' ')).toBe('You left the family');
    expect(ENDED.left.keptBody('Lee’s family')).toBe(
      'Every entry you made stays with Lee’s family, under your name.',
    );
    expect(ENDED.left.keptBody('')).toContain('stays with the family');
    expect(ENDED.left.body).toContain('A parent there can invite you again.');
  });

  it('never says somebody else ended it, and never uses a dash', () => {
    const all = [
      ENDED.left.title('X'),
      ENDED.left.body,
      ENDED.left.keptBody('X'),
      ENDED.left.keptBody(''),
    ].join(' ');
    for (const word of ['removed', 'has ended', 'ran out', 'runs out', 'kicked', 'revoked']) {
      expect(all.toLowerCase(), word).not.toContain(word);
    }
    expect(all).not.toMatch(/[\u2010-\u2015]| - /);
  });
});
