/**
 * THE MARK THE LOADER DRAWS, AS ONE REGISTRY (the owner, 2026-09-26: the loading indicator is the
 * logo travelling an ∞; `logoLoader.ts`).
 *
 * This package resolves no asset paths — the artwork is brand.json's, and the app is what reads it
 * (`Mark.tsx` says why) — so the loader cannot `require` the mark for itself. The app installs it
 * ONCE, before the first frame (`apps/mobile/App.tsx`: `setLoaderMark(MARK_SOURCE)`), the way it
 * installs the motor behind `haptic()` (`feedback/haptics.ts`), and every loader reads it from here.
 *
 * UNTIL ONE IS INSTALLED — in node, in a test, in anything that renders a button without the app
 * around it — `loaderMark()` is null and a loader draws the platform's own spinner in the same ink,
 * which is exactly what a waiting button drew before the mark. Nothing waits on the mark, and a
 * loader is never an empty box.
 *
 * READ AT RENDER, NOT SUBSCRIBED TO: it is set once, before anything renders, and never changes
 * after, so there is nothing to render again for. A second install replaces the first — which is
 * what a fast refresh of `App.tsx` does, with the same image.
 */
import type { ImageSourcePropType } from 'react-native';

let installed: ImageSourcePropType | null = null;

/** Installed once by the app with the delivered mark; null takes it out again (tests). */
export function setLoaderMark(next: ImageSourcePropType | null): void {
  installed = next;
}

/** The mark every loader draws, or null when the app has installed none. */
export function loaderMark(): ImageSourcePropType | null {
  return installed;
}
