/**
 * THE ONE-FAMILY RULE FOR PARENTS, SAID BEFORE IT REFUSES (the owner, 2026-10-08: "Can I as parent
 * join 2 household? If I can't then you need to write this when inviting a parent and when joining
 * as a parent with existing household"). An account is a parent in one family at most (0153), and
 * the server's `admin_elsewhere` was the first a person heard of it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JOIN } from './joinCopy';

const read = (rel: string) => readFileSync(join(__dirname, '..', '..', rel), 'utf8');

describe('a parent can be a parent in one family only', () => {
  it('the join sheet says so to a parent, naming their family', () => {
    expect(JOIN.sheet.parentRule('Bradley’s family')).toBe(
      'You’re a parent in Bradley’s family. An account can be a parent in one family only, so a code for another family needs to be for a caregiver or view only.',
    );
    expect(JOIN.sheet.parentRule('')).toMatch(/^You’re a parent in your own family\./);
    const sheet = read('sheets/JoinCodeSheet.tsx');
    expect(sheet).toMatch(/m\.role === 'OWNER' \|\| m\.role === 'PARENT'/);
    expect(sheet).toMatch(/parentHome !== null \? \(\s*<BodySm testID="joincode\.parent_rule">/);
  });

  it('inviting a parent says so where the role is picked', () => {
    expect(JOIN.share.parentRule).toMatch(/one family only/);
    expect(JOIN.share.parentRule).toMatch(/invite them as a caregiver instead\.$/);
    expect(read('screens/more/FamilyScreen.tsx')).toMatch(
      /role === 'PARENT' \? \(\s*<BodySm testID="family\.invite\.parent_rule">\{JOIN\.share\.parentRule\}/,
    );
  });

  it('the refusal says the rule too', () => {
    expect(JOIN.refusal.parentElsewhere).toMatch(/a parent in one family only/);
  });
});
