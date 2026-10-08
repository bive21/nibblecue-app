/**
 * The three ways to give a medicine are the owner's three, in the owner's order, and the
 * fourth stored value is kept without being offered (careRoute.ts).
 */
import { describe, expect, it } from 'vitest';
import {
  CARE_ROUTE_LABEL,
  CARE_ROUTES,
  careRouteLabel,
  CareRouteSchema,
  type CareRoute,
} from './careRoute';

describe('the offered routes', () => {
  it('are exactly the owner’s three, in that order, with those words', () => {
    expect(CARE_ROUTES.map(r => CARE_ROUTE_LABEL[r])).toEqual([
      'Oral',
      'With milk/food',
      'On skin',
    ]);
  });

  it('do not include OTHER, which every stored route may still be', () => {
    expect(CARE_ROUTES).not.toContain('OTHER');
    expect(CareRouteSchema.safeParse('OTHER').success).toBe(true);
    for (const r of CARE_ROUTES) expect(CareRouteSchema.safeParse(r).success).toBe(true);
  });

  it('refuses a token that is not a route', () => {
    expect(CareRouteSchema.safeParse('NOSE').success).toBe(false);
    expect(CareRouteSchema.safeParse('oral').success).toBe(false);
  });
});

describe('careRouteLabel, at the read edge', () => {
  it('gives the words for an offered value', () => {
    expect(careRouteLabel('MOUTH')).toBe('Oral');
    expect(careRouteLabel('WITH_FOOD')).toBe('With milk/food');
    expect(careRouteLabel('SKIN')).toBe('On skin');
  });

  it('says nothing for OTHER, nothing, and a token it does not know', () => {
    const silent: (CareRoute | string | null | undefined)[] = [
      'OTHER',
      '',
      null,
      undefined,
      'NOSE',
    ];
    for (const r of silent) expect(careRouteLabel(r)).toBeNull();
  });
});
