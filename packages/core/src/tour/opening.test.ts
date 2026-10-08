/**
 * WHEN THE TOUR ASKS BEFORE IT PICKS UP AGAIN (the owner, 2026-09-28: *"Tour changes: … it asks
 * before resuming"*), for every state the provider can read it in, at every hour of the day.
 */
import { describe, expect, it } from 'vitest';
import { DAYTIME } from '../today/daytime';
import { tourArmed, type TourArmState } from './opening';

/** A tour under way when the app closed, read as the app opens at 10 a.m. */
const underWay: TourArmState = {
  pending: true,
  at: 'schedule',
  paused: false,
  cards: 6,
  asked: false,
  put: false,
  hour: 10,
};
const HOURS = Array.from({ length: 24 }, (_, h) => h);

describe('a tour the app closed under', () => {
  it('asks before it picks up again, in the daytime, instead of jumping back in', () => {
    expect(tourArmed(underWay)).toBe('ask');
    // whatever card it stopped on, the first included
    for (const at of ['log', 'entry', 'schedule', 'stash', 'shopping', 'end']) {
      expect(tourArmed({ ...underWay, at }), at).toBe('ask');
    }
  });

  it('never asks at night: it waits, in Help, for the daytime', () => {
    for (const hour of HOURS) {
      const day = hour >= DAYTIME.fromHour && hour < DAYTIME.untilHour;
      expect(tourArmed({ ...underWay, hour }), `${hour}:00`).toBe(day ? 'ask' : 'wait');
    }
    // the edges, spelled out: 8 a.m. asks, 9 p.m. waits, 3 a.m. waits
    expect(tourArmed({ ...underWay, hour: 8 })).toBe('ask');
    expect(tourArmed({ ...underWay, hour: 7 })).toBe('wait');
    expect(tourArmed({ ...underWay, hour: 20 })).toBe('ask');
    expect(tourArmed({ ...underWay, hour: 21 })).toBe('wait');
    expect(tourArmed({ ...underWay, hour: 3 })).toBe('wait');
  });

  it('asks once an opening: read again later in the same opening, it waits', () => {
    for (const hour of HOURS) expect(tourArmed({ ...underWay, put: true, hour })).toBe('wait');
  });

  it('never runs by itself: only Help asking runs it, at any hour', () => {
    for (const hour of HOURS) {
      for (const put of [false, true]) {
        expect(tourArmed({ ...underWay, hour, put }), `${hour} ${String(put)}`).not.toBe('run');
        // Show me around or Resume the tour, which the parent just tapped: straight in
        expect(tourArmed({ ...underWay, hour, put, asked: true })).toBe('run');
      }
    }
  });
});

describe('every other state, as it was', () => {
  it('offers the tour after setup, day or night, and never asks whether to continue one that has not started', () => {
    for (const hour of HOURS) {
      expect(tourArmed({ ...underWay, at: null, hour })).toBe('offer');
      expect(tourArmed({ ...underWay, at: null, hour, put: true })).toBe('offer');
    }
  });

  it('leaves a tour closed with × waiting in Help, whatever else is true', () => {
    for (const hour of HOURS) {
      expect(tourArmed({ ...underWay, paused: true, hour })).toBe('paused');
      expect(tourArmed({ ...underWay, paused: true, hour, put: true })).toBe('paused');
    }
  });

  it('does nothing for a tour nobody owes, or a household whose tour has no cards', () => {
    expect(tourArmed({ ...underWay, pending: false })).toBe('none');
    expect(tourArmed({ ...underWay, pending: false, asked: true })).toBe('none');
    expect(tourArmed({ ...underWay, cards: 0 })).toBe('none');
    expect(tourArmed({ ...underWay, cards: 0, at: null })).toBe('none');
  });
});
