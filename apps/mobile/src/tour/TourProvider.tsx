/**
 * NIBBLECUE HAS NO FIRST-RUN TOUR YET (2026-10-08). CuddleCue's tour walks its own Today, Schedule
 * and Stash, none of which NibbleCue has, so it was not carried over. The screens shared with
 * CuddleCue still ask for it (`useTour()?.did(...)`, `tour !== null && ...`), and every one of
 * them already handles "no tour" as null: this answers null everywhere, and the screens behave
 * exactly as they do once CuddleCue's tour is finished. A NibbleCue tour, when it is designed,
 * replaces this file (bpnc-studio: "a tour whose buttons log real entries").
 */
import type { WriteOutcome } from '../data/repository';

export interface TourApi {
  phase: 'off' | string;
  guide: string | null;
  seen: readonly string[];
  paused: string | null;
  did(event: string, outcome?: WriteOutcome): void;
  start(): void;
  resume(): void;
  startGuide(id: string): void;
  resetTips(): void;
  undone(taken: readonly string[]): void;
  undoOffered(outcome: WriteOutcome): boolean;
}

export function useTour(): TourApi | null {
  return null;
}
