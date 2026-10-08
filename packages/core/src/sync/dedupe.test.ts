/**
 * @AT-17 — docs/OFFLINE_SYNC.md §9 rows 17 and 17a, and docs/MULTIPLES.md §2's fan-out rule.
 *
 * The boundary table this file prints is the contract the widget and the Save button share:
 * inside the window one entry, outside it two, and the second twin is never the first twin's
 * double tap.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEDUPE_TTL_MS, DEDUPE_WINDOW_MS, WIDGET_DEDUPE_WINDOW_MS } from './constants';
import { dedupeKey, dedupeKeyExpiryCutoffMs, shouldSuppress } from './dedupe';

const EMMA = 'cccccccc-0000-0000-0000-0000000000e1';
const LIAM = 'cccccccc-0000-0000-0000-0000000000e2';
const T0 = Date.parse('2026-09-14T03:00:00.000Z');

describe('dedupeKey', () => {
  it('is module, child and salient value', () => {
    expect(dedupeKey('diaper', EMMA, 'WET')).toBe(`diaper:${EMMA}:WET`);
  });

  it('falls back to the household for an activity no child owns', () => {
    // Pumping is the mother's, not a child's: it is not child-scoped anywhere in the product.
    expect(dedupeKey('pump', null, '120')).toBe('pump:household:120');
  });

  it('separates twins, so the second baby is never the first baby’s double tap', () => {
    expect(dedupeKey('bottle', EMMA, '120')).not.toBe(dedupeKey('bottle', LIAM, '120'));
  });
});

describe('the double-tap window', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  /** The first accepted tap opens the window; suppressed taps never move it. */
  const firstTapAt = () => Date.now();

  it.each([
    [100, true],
    [200, true],
    [399, true],
    [3499, true],
    [3500, false],
    [3501, false],
    [6000, false],
  ])('a second tap %i ms later is suppressed: %s', (afterMs, suppressed) => {
    const opened = firstTapAt();
    vi.advanceTimersByTime(afterMs);
    expect(shouldSuppress(opened, Date.now(), DEDUPE_WINDOW_MS)).toBe(suppressed);
  });

  it('keeps a run of fast taps to one entry: suppression does not extend the window', () => {
    const opened = firstTapAt();
    let accepted = 1;
    for (const at of [100, 200, 399, 3499]) {
      vi.setSystemTime(T0 + at);
      if (!shouldSuppress(opened, Date.now(), DEDUPE_WINDOW_MS)) accepted += 1;
    }
    expect(accepted).toBe(1);
    // …and the next deliberate tap is not pushed away by the parent's own mistakes.
    vi.setSystemTime(T0 + 3501);
    expect(shouldSuppress(opened, Date.now(), DEDUPE_WINDOW_MS)).toBe(false);
  });

  it('gives a widget tap a wider window than an in-app Save', () => {
    const opened = firstTapAt();
    vi.setSystemTime(T0 + 3800);
    expect(shouldSuppress(opened, Date.now(), DEDUPE_WINDOW_MS)).toBe(false);
    expect(shouldSuppress(opened, Date.now(), WIDGET_DEDUPE_WINDOW_MS)).toBe(true);
    expect(WIDGET_DEDUPE_WINDOW_MS).toBeGreaterThan(DEDUPE_WINDOW_MS);
  });

  it('gives two twins three seconds apart two keys and two entries', () => {
    const emma = dedupeKey('bottle', EMMA, '120');
    const liam = dedupeKey('bottle', LIAM, '120');
    const seen = new Map<string, number>([[emma, T0]]);
    vi.setSystemTime(T0 + 3000);
    expect(shouldSuppress(seen.get(emma), Date.now(), DEDUPE_WINDOW_MS)).toBe(true);
    expect(shouldSuppress(seen.get(liam), Date.now(), DEDUPE_WINDOW_MS)).toBe(false);
  });

  it('never suppresses a key that has never been seen', () => {
    expect(shouldSuppress(null, Date.now(), DEDUPE_WINDOW_MS)).toBe(false);
    expect(shouldSuppress(undefined, Date.now(), DEDUPE_WINDOW_MS)).toBe(false);
  });

  it('never suppresses on a clock that went backwards', () => {
    // A device whose clock jumps back must not silently swallow a real second entry.
    expect(shouldSuppress(T0 + 10_000, T0, DEDUPE_WINDOW_MS)).toBe(false);
  });

  it('expires keys a minute after they were written', () => {
    expect(dedupeKeyExpiryCutoffMs(T0)).toBe(T0 - DEDUPE_TTL_MS);
    expect(DEDUPE_TTL_MS).toBe(60_000);
  });
});
