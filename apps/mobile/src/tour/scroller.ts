/** No tour (`TourProvider.tsx`): nothing asks a page to scroll, and a scroll is nobody's news. */
export function registerTourScroller(scroll: (dy: number) => void): () => void {
  void scroll;
  return () => undefined;
}

export function tourSawScroll(y: number): void {
  void y;
}
