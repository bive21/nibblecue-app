import { BRAND } from '@nibblecue/brand';
import { describe, expect, it } from 'vitest';
import { pathOf, resolveLink } from './linking';

const HOST = BRAND.universalLinkHost;
const ctx = { scheme: BRAND.urlScheme, host: HOST, knownChildIds: [], linkPath: BRAND.linkPath };

describe('NibbleCue deep links', () => {
  it('reads the scheme, Expo Go and the universal link the same way', () => {
    expect(resolveLink('nibblecue://today', ctx)).toEqual({ kind: 'today' });
    expect(resolveLink('exp://192.168.1.4:8081/--/food/sweet-potato', ctx)).toEqual({
      kind: 'food',
      foodId: 'sweet-potato',
    });
    expect(resolveLink(`https://${HOST}${BRAND.linkPath}/allergens`, ctx)).toEqual({
      kind: 'allergens',
    });
    expect(resolveLink('nibblecue://plan?day=2026-10-09', ctx)).toEqual({
      kind: 'plan',
      day: '2026-10-09',
    });
  });

  it('falls back to Today for anything it does not know, and checks every id', () => {
    expect(resolveLink('nibblecue://stash', ctx)).toEqual({ kind: 'today' });
    expect(resolveLink('nibblecue://food/<script>', ctx)).toEqual({ kind: 'foods' });
    expect(resolveLink('nibblecue://plan?day=tomorrow', ctx)).toEqual({ kind: 'plan' });
    expect(resolveLink('https://example.com/nibblecue/app/foods', ctx)).toEqual({ kind: 'today' });
  });

  it('still reads CuddleCue’s /app invite links, so a family can be joined from either app', () => {
    expect(pathOf(`https://${HOST}/app/invite/#abc`, ctx)?.path).toBe('/invite');
    expect(resolveLink(`https://${HOST}/app/invite/#abc`, ctx)).toEqual({ kind: 'invite' });
  });

  it('leaves auth callbacks to the accounts provider', () => {
    expect(resolveLink('nibblecue://auth/callback?code=x', ctx)).toEqual({ kind: 'auth' });
  });
});
