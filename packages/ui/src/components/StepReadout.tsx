/**
 * StepReadout — a stepper's number as it is shown, and the box that says it can be typed
 * (docs/DESIGN_SYSTEM.md §5; `stepReadout` and `TYPED_BOX` in stepperMath, which have the account).
 * One drawing for the box stepper, the compact row, the round pair and the ruler, so a length reads
 * "1h 20m" on every one of them and a typeable number is boxed the same way on every one of them.
 *
 *   PLAIN — the digits in the stepper's own size and face, and the unit beside them as the caller
 *   draws its units (the `label` role on most; the round pair's own smaller one).
 *
 *   A LENGTH OF AN HOUR AND MORE — "1h 20m", as ONE text: the digits at the stepper's size and the
 *   letters small (`DURATION_UNIT_SCALE`) in the quiet ink, nested spans of the same line, so a round
 *   stepper that shrinks its number to fit (`adjustsFontSizeToFit`) shrinks the whole of it together
 *   rather than cutting "1h 2…". No unit label beside it: the letters are the units.
 */
import { Fragment, type ReactNode } from 'react';
import { Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useTheme, type ThemeValue } from '../theme/ThemeProvider';
import { typedBoxPaint } from '../theme/typedBox';
import { DURATION_UNIT_SCALE, TYPED_BOX, type Readout, type TypedBoxShape } from './stepperMath';
import { Numeric } from './Text';

export interface StepReadoutProps {
  readout: Readout;
  /** The digits' size, in points. */
  size: number;
  variant?: 'display' | 'statValue';
  /** How the caller draws a plain number's unit ("oz", "MIN"); a duration draws its own letters. */
  unit: (label: string) => ReactNode;
  /** Shrink to fit the room rather than cut, never below this share of the size. */
  fit?: number;
  style?: StyleProp<TextStyle>;
  testID?: string;
}

export function StepReadout({
  readout,
  size,
  variant = 'display',
  unit,
  fit,
  style,
  testID,
}: StepReadoutProps) {
  const t = useTheme();
  const small = size * DURATION_UNIT_SCALE;
  const last = readout.parts.length - 1;
  const number = (
    <Numeric
      variant={variant}
      style={[{ fontSize: size, letterSpacing: -0.02 * size }, style]}
      numberOfLines={1}
      {...(fit !== undefined ? { adjustsFontSizeToFit: true, minimumFontScale: fit } : {})}
      {...(testID ? { testID } : {})}
    >
      {readout.duration
        ? readout.parts.map((p, i) => (
            <Fragment key={`${i}${p.unit}`}>
              {p.number}
              <Text style={{ fontSize: small, letterSpacing: 0, color: t.color.text2 }}>
                {i < last ? `${p.unit} ` : p.unit}
              </Text>
            </Fragment>
          ))
        : (readout.parts[0]?.number ?? '')}
    </Numeric>
  );
  const plainUnit = readout.duration ? '' : (readout.parts[0]?.unit ?? '');
  return (
    <>
      {number}
      {plainUnit ? unit(plainUnit) : null}
    </>
  );
}

/**
 * THE TYPED BOX'S STYLE (`TYPED_BOX`, `typedBoxPaint`, `TypedBoxShape`): a well of the page's own ink
 * over whatever it lands on, with no edge at rest, and the text field's own focused edge while the
 * number is typed where it stands, drawn inside the box's air (`padding − edge`) so the box keeps its
 * size when it lights.
 *
 * ITS HEIGHT AND ITS CORNER ARE WHAT IT SITS BESIDE (2026-09-30, `stepperBoxShape`): between two
 * circles a pill exactly as tall as they are, beside a ruler's strip the strip's height and corner.
 * The number is centered in it, both ways; a caller puts the number and its unit in a row of their
 * own inside, set on one baseline (`readoutRow`). The height is a floor, so a number grown past the
 * circles at a large text size is never clipped (`typedBoxHeight`).
 *
 * A style and not a view, because each stepper already has the view it belongs on, the pressable
 * number, and a second wrapper would be one more thing between the thumb and the target.
 */
export function typedBoxStyle(t: ThemeValue, shape: TypedBoxShape, focused = false): ViewStyle {
  const paint = typedBoxPaint(t.color);
  const edge = focused ? TYPED_BOX.focus : 0;
  return {
    minHeight: shape.height,
    borderRadius: shape.radius ?? t.radius.pill,
    borderWidth: edge,
    borderColor: paint.focus,
    backgroundColor: paint.fill,
    paddingHorizontal: TYPED_BOX.padX - edge,
    alignItems: 'center',
    justifyContent: 'center',
  };
}

/** The number and its unit inside a typed box: one row, on one baseline, centered in the box. */
export const readoutRow = (gap: number): ViewStyle => ({
  flexDirection: 'row',
  alignItems: 'baseline',
  justifyContent: 'center',
  maxWidth: '100%',
  gap,
});
