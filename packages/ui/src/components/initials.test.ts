import { describe, expect, it } from 'vitest';
import { initialOf } from './initials';

describe('initialOf', () => {
  it('takes the first letter, uppercased', () => {
    expect(initialOf('emma')).toBe('E');
    expect(initialOf('Liam')).toBe('L');
  });
  it('ignores leading and trailing whitespace', () => {
    expect(initialOf('  dana ')).toBe('D');
  });
  it('is empty for an empty or blank name rather than throwing', () => {
    expect(initialOf('')).toBe('');
    expect(initialOf('   ')).toBe('');
  });
  it('uppercases accented letters', () => {
    expect(initialOf('émile')).toBe('É');
    expect(initialOf('øyvind')).toBe('Ø');
  });
  it('keeps a surrogate-pair character whole', () => {
    expect(initialOf('👶 baby')).toBe('👶');
  });
  it('keeps a letter whose uppercase would be two letters', () => {
    expect(initialOf('ßen')).toBe('ß');
  });
});
