/**
 * StepGlyph: a stepper's − or +, DRAWN (the owner, 2026-09-30: *"the icon plus and minus is not
 * exactly on the aligned in the middle of the border. This is very bad and need fixing."*).
 *
 * Two rounded bars on a layer exactly the size of the circle they sit in, each placed by arithmetic
 * (`stepGlyph` in stepperMath, which has the account of why a text "+" never sat in the middle), so
 * the mark's center is the circle's center on every phone and in every face. The layer covers the
 * circle from its top left: the circle has no border and no padding, and Yoga places an absolute
 * child from its parent's border (`surfacePadding.ts` has the source).
 *
 * It says nothing to a screen reader and takes no touch: the button it sits in carries the name
 * ("Increase amount") and the press.
 */
import { StyleSheet, View } from 'react-native';
import { stepGlyph } from './stepperMath';

export interface StepGlyphProps {
  kind: 'minus' | 'plus';
  /** The circle it is drawn in, in points across. */
  box: number;
  color: string;
}

export function StepGlyph({ kind, box, color }: StepGlyphProps) {
  const g = stepGlyph(box);
  const round = { borderRadius: g.thickness / 2, backgroundColor: color };
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.layer, { width: box, height: box }]}
    >
      <View style={[styles.bar, round, g.bar, { width: g.length, height: g.thickness }]} />
      {kind === 'plus' ? (
        <View style={[styles.bar, round, g.post, { width: g.thickness, height: g.length }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, top: 0 },
  bar: { position: 'absolute' },
});
