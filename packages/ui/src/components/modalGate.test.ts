/**
 * ONE NATIVE MODAL AT A TIME ON AN iPHONE (`modalGate.ts`): the arithmetic that keeps a sheet from
 * being presented while another is still being dismissed — the freeze the owner met twice on
 * 2026-10-06 (the pump's two pages, then a stored bag's "Use for a bottle").
 */
import { describe, expect, it } from 'vitest';
import { createModalGate, gateVisibility } from './modalGate';

function clock() {
  let now = 0;
  const due = new Map<number, { at: number; fn: () => void }>();
  let seq = 0;
  return {
    timers: {
      set: (fn: () => void, ms: number) => {
        seq += 1;
        due.set(seq, { at: now + ms, fn });
        return seq;
      },
      clear: (id: unknown) => {
        due.delete(id as number);
      },
    },
    advance(ms: number) {
      now += ms;
      for (const [id, d] of [...due.entries()].sort((a, b) => a[1].at - b[1].at))
        if (d.at <= now) {
          due.delete(id);
          d.fn();
        }
    },
  };
}

describe('the modal gate', () => {
  it('opens at once when nothing is leaving', () => {
    const c = clock();
    const g = createModalGate(c.timers);
    let opened = false;
    g.whenSettled(() => (opened = true));
    expect(opened).toBe(true);
  });

  it('holds a sheet asked to open while another is leaving, then opens it — "Use for a bottle"', () => {
    const c = clock();
    const g = createModalGate(c.timers);
    // the bag's sheet is let go and the bottle's is asked for in the same tap
    g.leave(680);
    let opened = false;
    g.whenSettled(() => (opened = true));
    expect(opened).toBe(false);
    c.advance(679);
    expect(opened).toBe(false);
    c.advance(1);
    expect(opened).toBe(true);
    expect(g.busy()).toBe(false);
  });

  it('waits for every leaving modal, not only the first', () => {
    const c = clock();
    const g = createModalGate(c.timers);
    g.leave(300);
    g.leave(700);
    let opened = false;
    g.whenSettled(() => (opened = true));
    c.advance(300);
    expect(opened).toBe(false);
    c.advance(400);
    expect(opened).toBe(true);
  });

  it('lets a modal that came back release its leave early, and a cancelled wait never opens', () => {
    const c = clock();
    const g = createModalGate(c.timers);
    const release = g.leave(1000);
    let opened = 0;
    const cancel = g.whenSettled(() => (opened += 1));
    let other = 0;
    g.whenSettled(() => (other += 1));
    cancel();
    release();
    expect(opened).toBe(0);
    expect(other).toBe(1);
    // a release twice, or after its own timer, counts once
    release();
    c.advance(2000);
    expect(g.busy()).toBe(false);
  });
});

describe('one tap closes a sheet and opens another (2026-10-07)', () => {
  // the commit's effects run in tree order, which may put the opening sheet's first
  for (const order of ['opening first', 'closing first'] as const)
    it(`the new sheet waits for the old one to go, ${order}`, () => {
      const c = clock();
      const gate = createModalGate(c.timers);
      const ticks: (() => void)[] = [];
      const defer = (fn: () => void) => {
        ticks.push(fn);
        return () => undefined;
      };
      let bagShown = true;
      let bottleShown = false;
      const open = () => gateVisibility(gate, true, false, 0, s => (bottleShown = s), defer);
      const close = () => gateVisibility(gate, false, true, 600, s => (bagShown = s), defer);
      if (order === 'opening first') {
        open();
        close();
      } else {
        close();
        open();
      }
      // the tick after the commit
      for (const t of ticks.splice(0)) t();
      expect(bagShown).toBe(false);
      expect(bottleShown).toBe(false);
      c.advance(599);
      expect(bottleShown).toBe(false);
      c.advance(1);
      expect(bottleShown).toBe(true);
    });

  it('opens on the next tick when nothing is leaving', () => {
    const gate = createModalGate(clock().timers);
    let shown = false;
    const ticks: (() => void)[] = [];
    gateVisibility(
      gate,
      true,
      false,
      0,
      s => (shown = s),
      fn => (ticks.push(fn), () => undefined),
    );
    expect(shown).toBe(false);
    for (const t of ticks.splice(0)) t();
    expect(shown).toBe(true);
  });

  it('a sheet let go before its tick never opens', () => {
    const gate = createModalGate(clock().timers);
    let shown = false;
    let pending: (() => void) | null = null;
    const cleanup = gateVisibility(
      gate,
      true,
      false,
      0,
      s => (shown = s),
      fn => {
        pending = fn;
        return () => (pending = null);
      },
    );
    cleanup();
    expect(pending).toBeNull();
    expect(shown).toBe(false);
  });
});
