/**
 * The derived accent family for the screen being drawn (`accent.ts` derives it; this reads the
 * resolved palette out of the provider).
 *
 * It is a FILE OF ITS OWN and not two lines at the foot of `accent.ts` for the same reason
 * `sync-chip-copy.ts` exists: `packages/ui`'s vitest runs in node, and `accent.test.ts` proves
 * the one claim in the family that is a measurement — white on a filled button, on every scheme,
 * in both themes. A module that imports `ThemeProvider` imports `react-native`, which that
 * suite cannot parse, so the arithmetic stays where it can be argued with and the hook lives
 * here.
 */
import { useMemo } from 'react';
import { deriveAccent, type AccentTheme } from './accent';
import { useTheme } from './ThemeProvider';

/** Memoized on the accent itself: a scheme change or a dark switch re-derives, a render does not. */
export function useAccent(): AccentTheme {
  const palette = useTheme().color;
  return useMemo(() => deriveAccent(palette), [palette]);
}
