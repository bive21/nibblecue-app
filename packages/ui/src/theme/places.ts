/**
 * The two hooks over `placeTones.ts`, which is where a place's colors are actually decided.
 *
 * SPLIT FOR THE SAME REASON `useAccent.ts` IS. `packages/ui`'s vitest runs in node, and the one
 * claim in this family that is a MEASUREMENT — that the deepest icon square still lets the
 * owner's artwork read on it — has to be testable there. A module that imports `ThemeProvider`
 * imports `react-native`, which that suite cannot parse. So the table and the arithmetic live
 * next door and this file is the two lines that read the resolved palette.
 */
export * from './placeTones';
import { placeSquare, placeTone, type PlaceTone } from './placeTones';
import { useTheme } from './ThemeProvider';

/** A place's tone for a component. */
export function usePlace(kind: string | null): PlaceTone {
  return placeTone(useTheme().color, kind);
}

/** A place's icon-square fill for a component. */
export function usePlaceSquare(kind: string | null): string {
  return placeSquare(useTheme().color, kind);
}
