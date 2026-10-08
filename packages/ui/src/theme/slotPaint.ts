/**
 * A MODULE'S SLOTS (`SlotRow`'s `module`), in its soft colors (`moduleSoft`, the owner, 2026-10-06:
 * "much softer"): a resting slot is the module's light wash with a pastel edge, the chosen one its
 * pastel with the page's dark words on it, at least 4.5:1 either way (`components/slotRow.test.ts`).
 * Night keeps the start tile's amber pair. Pure, so the measure runs in node.
 */
import { composite, contrastRatio } from './contrast';
import { moduleSoft } from './moduleAccent';
import type { Palette, ThemeName } from './theme';
import { pathTileColors, type PathModule } from '../components/pathCard';

/** How far a resting slot's pastel edge is taken toward the module's deep ink. */
export const SLOT_EDGE_DEEPEN = 0.35;

export function moduleSlotPaint(palette: Palette, module: PathModule, theme: ThemeName) {
  if (theme !== 'night') {
    const s = moduleSoft(palette, module, theme);
    // the chosen one outlined in the muted ink: a pastel apart from its neighbors by more than tint;
    // a resting one's edge taken part of the way to that ink, so a row of chips reads as chips
    // (the owner, 2026-10-08: the diaper's and the feed's "−15m −30m Custom" borders were "way too
    // subtle … make it darker a little")
    return {
      rest: s.rest,
      restEdge: composite(s.edge, s.deep, SLOT_EDGE_DEEPEN),
      on: s.fill,
      onEdge: s.deep,
      onInk: s.onFill,
    };
  }
  const c = pathTileColors(palette, module, theme, 'start');
  const onInk =
    contrastRatio('#FFFFFF', c.disc) >= contrastRatio(palette.page, c.disc)
      ? '#FFFFFF'
      : palette.page;
  return { rest: c.ground, restEdge: c.edge, on: c.disc, onEdge: c.disc, onInk };
}
