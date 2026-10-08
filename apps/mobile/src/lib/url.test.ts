import { describe, expect, it } from 'vitest';
import { fragmentOf, queryOf } from './url';

describe('deep-link parsing without the platform URL class', () => {
  it('reads the query of a custom-scheme link', () => {
    expect(queryOf('cuddlecue://auth/callback?code=abc-123&type=signup')).toEqual({
      code: 'abc-123',
      type: 'signup',
    });
    expect(
      queryOf(
        'cuddlecue-mock://auth/callback?type=recovery&user=00000000-0000-4000-8000-000000000001',
      ),
    ).toEqual({
      type: 'recovery',
      user: '00000000-0000-4000-8000-000000000001',
    });
    expect(queryOf('cuddlecue://invite/abc')).toEqual({});
  });

  it('reads the fragment, keeps the first of a repeated key, and decodes what it can', () => {
    expect(
      fragmentOf('cuddlecue://auth/callback#access_token=a.b.c&refresh_token=r%20t&type=recovery'),
    ).toEqual({
      access_token: 'a.b.c',
      refresh_token: 'r t',
      type: 'recovery',
    });
    expect(queryOf('x://y?k=1&k=2&flag&bad=%E0%A4%A')).toEqual({
      k: '1',
      flag: '',
      bad: '%E0%A4%A',
    });
    expect(queryOf('x://y?a=1#b=2')).toEqual({ a: '1' });
    expect(fragmentOf('x://y?a=1')).toEqual({});
  });
});
