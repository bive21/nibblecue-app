/**
 * THE ROWS TICKED HERE A MOMENT AGO, which keep their places until the list settles
 * (`listMotion.ts` says why; the owner, 2026-09-25).
 *
 * ONE TIMER FOR THE WHOLE LIST, restarted by every tick. A timer per row would move each row the
 * moment its own wait ran out — so a parent ticking three things in a row would have the first
 * leave under the finger aiming at the third. Restarting one timer means the list settles ONCE,
 * after the parent pauses, with every ticked row leaving together.
 *
 * It holds ids and nothing else: which rows are placed where they were. What is ticked is always
 * the database's answer, so a row taken off, cleared or unticked meanwhile is drawn as it is.
 *
 * TWO THINGS MORE, FOR A LIST WHOSE ROWS GLIDE (the shopping list, 2026-09-26; the checklist asks
 * for neither and gets exactly what it had):
 *
 *   - WHERE a row is held, when the caller says — the card it was in when it was tapped, so a tick
 *     and an untick can each be held on their own side (`places`);
 *   - and, with `glideMs`, the rows the settle let go, with where each had been held, for that long
 *     after it (`gliding`): the caller draws each one leaving the card it was held in as it
 *     arrives in the one it belongs in. The glide is over on its own clock, not the next tick's.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const NO_HOLDS: ReadonlyMap<string, string | null> = new Map();
const NO_GLIDE: ReadonlyMap<string, string> = new Map();

export interface Settling<P extends string = string> {
  /** The rows keeping their places. */
  ids: ReadonlySet<string>;
  /** Where each row is kept, for the rows held with a place. */
  places: ReadonlyMap<string, P>;
  /** The rows the last settle let go, and where each had been kept — for `glideMs` after it. */
  gliding: ReadonlyMap<string, P>;
  /** Keep `id` where it is (in `place`, when given), and settle the list `ms` after the last tick. */
  hold: (id: string, ms: number, place?: P) => void;
  /** Let `id` go now: it was unticked, or nothing may move and it never waited. */
  release: (id: string) => void;
}

export function useSettling<P extends string = string>(glideMs = 0): Settling<P> {
  const [held, setHeld] = useState<ReadonlyMap<string, P | null>>(
    NO_HOLDS as ReadonlyMap<string, P | null>,
  );
  const [gliding, setGliding] = useState<ReadonlyMap<string, P>>(
    NO_GLIDE as ReadonlyMap<string, P>,
  );
  // the holds as they are now, for the timer that lets them go: a state updater must not start one
  const holds = useRef<ReadonlyMap<string, P | null>>(held);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const glides = useRef(new Set<ReturnType<typeof setTimeout>>());

  // a list that goes away mid-wait leaves no timer behind to set state on nothing
  useEffect(() => {
    const running = glides.current;
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      for (const g of running) clearTimeout(g);
      running.clear();
    };
  }, []);

  const put = useCallback((next: ReadonlyMap<string, P | null>) => {
    holds.current = next;
    setHeld(next);
  }, []);

  const hold = useCallback(
    (id: string, ms: number, place?: P) => {
      const next = new Map(holds.current);
      next.set(id, place ?? null);
      put(next);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        const letGo = holds.current;
        put(NO_HOLDS as ReadonlyMap<string, P | null>);
        if (glideMs <= 0) return;
        // the rows held with a place glide from it; each settle's glide ends on its own clock
        const from = new Map<string, P>();
        for (const [k, p] of letGo) if (p !== null) from.set(k, p);
        if (from.size === 0) return;
        setGliding(g => new Map([...g, ...from]));
        const end = setTimeout(() => {
          glides.current.delete(end);
          setGliding(g => {
            const rest = new Map(g);
            for (const [k, p] of from) if (rest.get(k) === p) rest.delete(k);
            return rest.size === g.size ? g : rest;
          });
        }, glideMs);
        glides.current.add(end);
      }, ms);
    },
    [glideMs, put],
  );

  const release = useCallback(
    (id: string) => {
      if (!holds.current.has(id)) return;
      const next = new Map(holds.current);
      next.delete(id);
      put(next);
    },
    [put],
  );

  const ids = useMemo(() => new Set(held.keys()), [held]);
  const places = useMemo(() => {
    const out = new Map<string, P>();
    for (const [k, p] of held) if (p !== null) out.set(k, p);
    return out;
  }, [held]);

  return { ids, places, gliding, hold, release };
}
