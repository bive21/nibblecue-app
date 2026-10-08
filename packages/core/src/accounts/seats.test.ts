import { describe, expect, it } from 'vitest';
import {
  canInviteRole,
  isSeatLength,
  MAX_SEAT_HOURS,
  parentsIn,
  seatLabel,
  seatRemaining,
  seatsLeft,
  SEAT_DURATIONS,
} from './seats';

const NOW = Date.parse('2026-09-22T12:00:00.000Z');
const inHours = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

describe('temporary seats', () => {
  it('says nothing at all about a permanent member', () => {
    expect(seatRemaining(null, NOW)).toBeNull();
    expect(seatLabel(null, NOW)).toBeNull();
  });

  it('counts down in the unit a parent would use', () => {
    expect(seatLabel(inHours(0.25), NOW)).toBe('15 minutes left');
    expect(seatLabel(inHours(5), NOW)).toBe('5 hours left');
    expect(seatLabel(inHours(24 * 3), NOW)).toBe('3 days left');
  });

  it('is singular at one', () => {
    expect(seatLabel(new Date(NOW + 60_000).toISOString(), NOW)).toBe('1 minute left');
    expect(seatLabel(inHours(1), NOW)).toBe('1 hour left');
    expect(seatLabel(inHours(24), NOW)).toBe('1 day left');
  });

  it('rounds up, so a seat that still works never reads as zero', () => {
    // 61 minutes is "2 hours left", not "1": the number may overstate, never understate,
    // because understating tells a parent access is gone while it is not
    expect(seatRemaining(new Date(NOW + 61 * 60_000).toISOString(), NOW)).toEqual({
      kind: 'hours',
      n: 2,
    });
    expect(seatRemaining(new Date(NOW + 1_000).toISOString(), NOW)).toEqual({
      kind: 'minutes',
      n: 1,
    });
  });

  it('calls a lapsed seat ended, at the second it lapses', () => {
    expect(seatRemaining(new Date(NOW).toISOString(), NOW)).toEqual({ kind: 'ended' });
    expect(seatLabel(inHours(-1), NOW)).toBe('Access ended');
  });

  it('ignores a date it cannot read rather than inventing one', () => {
    expect(seatRemaining('not a date', NOW)).toBeNull();
  });

  it('offers three lengths, each inside the server bound', () => {
    expect(SEAT_DURATIONS).toHaveLength(3);
    for (const d of SEAT_DURATIONS) {
      expect(isSeatLength(d.hours)).toBe(true);
      expect(d.hours).toBeLessThanOrEqual(MAX_SEAT_HOURS);
      // the chip says the length the way the owner asked for it (2026-10-08): "24 hours", "1 week"
      expect(d.label).toMatch(/^\d+ (hours|week|month)$/);
    }
    expect(SEAT_DURATIONS.map(d => d.hours)).toEqual([24, 168, 720]);
    // the owner, 2026-10-08: 24 hours, 1 week, 1 month and until I turn it off; no evening
    expect(SEAT_DURATIONS.map(d => d.label)).toEqual(['24 hours', '1 week', '1 month']);
  });

  it('refuses a seat length the server would refuse', () => {
    expect(isSeatLength(0)).toBe(false);
    expect(isSeatLength(-1)).toBe(false);
    expect(isSeatLength(1.5)).toBe(false);
    expect(isSeatLength(MAX_SEAT_HOURS + 1)).toBe(false);
    expect(isSeatLength(MAX_SEAT_HOURS)).toBe(true);
  });
});

describe('who the household may invite (the owner, 2026-09-27: caregivers are Plus only)', () => {
  const FREE = { limit: 2, extra: false };
  const PLUS = { limit: null, extra: true };
  const owner = { role: 'OWNER' as const };
  const parent = { role: 'PARENT' as const };
  const sitter = { role: 'CAREGIVER' as const };
  const viewer = { role: 'VIEW_ONLY' as const };

  it('counts the parents down from the matrix limit, the owner among them', () => {
    expect(parentsIn([owner])).toBe(1);
    expect(parentsIn([owner, parent, sitter, viewer])).toBe(2);
    expect(seatsLeft(1, 2)).toBe(1);
    expect(seatsLeft(2, 2)).toBe(0);
    // never below zero, even for a household that was over before the limit was enforced
    expect(seatsLeft(5, 2)).toBe(0);
    // and not at all when the matrix says the capability is uncounted
    expect(seatsLeft(9, null)).toBeNull();
  });

  it('on the free plan, invites the other parent and nobody else', () => {
    expect(canInviteRole('PARENT', [owner], FREE)).toBe(true);
    expect(canInviteRole('CAREGIVER', [owner], FREE)).toBe(false);
    expect(canInviteRole('VIEW_ONLY', [owner], FREE)).toBe(false);
    expect(canInviteRole('PARENT', [owner, parent], FREE)).toBe(false);
  });

  it('never lets a caregiver kept from the preview take the other parent’s place', () => {
    expect(canInviteRole('PARENT', [owner, sitter, viewer], FREE)).toBe(true);
    expect(canInviteRole('CAREGIVER', [owner, sitter], FREE)).toBe(false);
  });

  it('on Plus, invites anyone', () => {
    for (const role of ['PARENT', 'CAREGIVER', 'VIEW_ONLY'] as const) {
      expect(canInviteRole(role, [owner, parent, sitter, viewer], PLUS)).toBe(true);
    }
  });
});
