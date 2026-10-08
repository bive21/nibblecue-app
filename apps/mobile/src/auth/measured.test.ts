/**
 * NOTHING IS MEASURED ON THE SIGN-IN SCREENS (`measured.ts`): the gate on the app's one emitter,
 * which launches count, and which sign-outs do — per phase, with and without the terms step.
 */
import { describe, expect, it } from 'vitest';
import { analyticsOpen, launchCounted, signOutMeasured, type PhaseName } from './measured';

const PHASES: PhaseName[] = ['booting', 'signed_out', 'unverified', 'onboarding', 'ended', 'ready'];
const pick = (rule: (p: PhaseName, t: boolean) => boolean, terms: boolean): PhaseName[] =>
  PHASES.filter(p => rule(p, terms));

describe('what may be measured, and when', () => {
  it('the emitter is shut on every sign-in screen and open past them', () => {
    expect(pick(analyticsOpen, false)).toEqual(['onboarding', 'ended', 'ready']);
  });

  it('the terms step is AUTH: nothing is measured while it shows, whatever the phase', () => {
    expect(pick(analyticsOpen, true)).toEqual([]);
    expect(pick(launchCounted, true)).toEqual([]);
    expect(pick(signOutMeasured, true)).toEqual([]);
  });

  it('a launch counts once it lands in a household or its setup, never on AUTH, Verify or Ended', () => {
    expect(pick(launchCounted, false)).toEqual(['onboarding', 'ready']);
  });

  it('a sign-out is measured only when made from inside the household', () => {
    expect(pick(signOutMeasured, false)).toEqual(['ready']);
  });
});
