/**
 * `ownLinks.ts` (2026-09-28): a link the app hands itself — a tap on a visit reminder — reaches
 * `LinkRouter` whether it listens yet or not, once, and never after it has stopped listening.
 */
import { describe, expect, it } from 'vitest';
import { onOwnLink, openOwnLink } from './ownLinks';

describe('a link the app hands itself', () => {
  it('goes straight to the listener', () => {
    const got: string[] = [];
    const off = onOwnLink(url => got.push(url));
    openOwnLink('x://vaccines/summary');
    expect(got).toEqual(['x://vaccines/summary']);
    off();
  });

  it('is kept when nobody listens yet — the tap that launched the app — and given over once', () => {
    openOwnLink('x://first');
    openOwnLink('x://second'); // a second tap replaces the first, as a second tap on a link would
    const got: string[] = [];
    const off = onOwnLink(url => got.push(url));
    expect(got).toEqual(['x://second']);
    off();
    // …and not again to whoever listens next
    const again: string[] = [];
    const off2 = onOwnLink(url => again.push(url));
    expect(again).toEqual([]);
    off2();
  });

  it('reaches nobody who has stopped listening', () => {
    const got: string[] = [];
    const off = onOwnLink(url => got.push(url));
    off();
    openOwnLink('x://late');
    expect(got).toEqual([]);
    // it waits for the next listener instead
    const next: string[] = [];
    const off2 = onOwnLink(url => next.push(url));
    expect(next).toEqual(['x://late']);
    off2();
  });
});
