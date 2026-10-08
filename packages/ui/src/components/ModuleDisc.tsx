/**
 * ModuleDisc — A MODULE'S FLAT CIRCULAR ICON: the Log's chip (docs/DESIGN_SYSTEM.md §5, §16.3), a
 * 32 pt circle of the module's own swatch off the owner's color reference with its glyph on it in
 * the module's ink. Flat: no gradient, no shadow, no edge.
 *
 * ONE COMPONENT, BECAUSE TWO LISTS HAVE TO MATCH (the owner, 2026-09-26, of the running timers:
 * *"the rest collapse into an 'Also running' card with compact rows using the same flat circular
 * icons as the Log chips … Fixes the wall and the visual-language mismatch at once"*). The chip
 * was drawn inline in `TimelineItem`; Today's "Also running" rows draw the same thing, so it is
 * drawn here once and both read it — a change to the Log's chip is a change to the rows.
 *
 * `disc` is the owner's swatch at full strength (`useCategory` says why a holder never composites
 * it toward the ground); Night has none, and the disc falls back to the module's soft tint there.
 * A picture inside a control, never a control itself: hidden from assistive technology, because
 * the row it sits in speaks for it.
 */
import { MODULE_BY_ID, type ModuleId } from '@nibblecue/core';
import { StyleSheet, View } from 'react-native';
import { Icon, MODULE_ICON } from '../icons/Icon';
import type { IconName } from '../icons/paths';
import { useCategory } from '../theme/ThemeProvider';

/** The chip's diameter: the Log's rows, Up next and the "Also running" rows. */
export const TIMELINE_CHIP = 32;
/** The glyph on it: a timeline row's 16 (§5 "Icons"). */
export const MODULE_DISC_GLYPH = 16;

export interface ModuleDiscProps {
  moduleId: ModuleId;
  /** A glyph other than the module's own (the Log passes an entry's, where it has one). */
  icon?: IconName;
  /** The disc's diameter; the Log's 32 when absent. A sheet's title takes a larger one. */
  size?: number;
}

export function ModuleDisc({ moduleId, icon, size }: ModuleDiscProps) {
  const cat = useCategory(moduleId);
  const glyph = icon ?? MODULE_ICON[MODULE_BY_ID[moduleId].icon] ?? 'note';
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // icon holders are circles everywhere except the Cards shape (§16.3, §16.4)
      style={[
        styles.chip,
        { backgroundColor: cat.disc ?? cat.soft },
        size === undefined ? null : { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Icon
        name={glyph}
        size={size === undefined ? MODULE_DISC_GLYPH : Math.round(size * 0.55)}
        color={cat.fg}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    width: TIMELINE_CHIP,
    height: TIMELINE_CHIP,
    borderRadius: TIMELINE_CHIP / 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
