import { describe, expect, it } from 'vitest';
import { listSignature, stampedAt } from './signature';

/**
 * The foot of a shared list. Two claims: the timestamp is a person's date and time rather than
 * an ISO string, and the app's name is READ, never typed — which is why this file never spells
 * it out and compares against the brand file instead (`assets/brand.test.ts` fails the build on
 * a product name written into a source file, a test included).
 */
const AT = Date.parse('2026-09-17T21:42:00Z');

describe('the signature on a shared list', () => {
  it('reads as a date and a time, not a machine stamp', () => {
    expect(stampedAt(AT, false, 'UTC')).toBe('Sep 17, 2026 at 9:42 PM');
    expect(stampedAt(AT, true, 'UTC')).toBe('Sep 17, 2026 at 21:42');
  });

  it('follows the household zone, so a partner abroad reads the sender’s evening', () => {
    expect(stampedAt(AT, false, 'America/Chicago')).toBe('Sep 17, 2026 at 4:42 PM');
    // and a zone that rolls the date over rolls the DATE, not just the clock
    expect(stampedAt(AT, false, 'Asia/Tokyo')).toBe('Sep 18, 2026 at 6:42 AM');
  });

  it('takes the app name from the brand file rather than a literal', async () => {
    const { BRAND } = await import('@nibblecue/brand');
    const sig = listSignature(AT, false, 'UTC');
    expect(sig.appName).toBe(BRAND.appDisplayName);
    expect(sig.at).toBe('Sep 17, 2026 at 9:42 PM');
    // the source itself carries no product name: this is the rule the build enforces
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'signature.ts'), 'utf8');
    expect(src).not.toContain(BRAND.appDisplayName);
  });
});
