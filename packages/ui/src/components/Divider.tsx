/**
 * Divider (docs/DESIGN_SYSTEM.md §13, §16.4): the hairline between rows sharing one surface. It
 * reads `line`, or `line2` when the skin rules with hairlines instead of shadows (Paper): on a
 * flat surface the rule is the only thing separating two rows, and the 15% line disappears. A
 * divider is decoration and is hidden from assistive technology, so a list of six rows is six
 * focus stops, not eleven.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export interface DividerProps {
  /** Left inset, so the rule starts where the text does (past an icon chip) rather than at the edge. */
  inset?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Divider({ inset = 0, style, testID }: DividerProps) {
  const t = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        {
          height: t.skinTokens.hairlines ? 1 : StyleSheet.hairlineWidth,
          backgroundColor: t.skinTokens.hairlines ? t.color.line2 : t.color.line,
          marginLeft: inset,
        },
        style,
      ]}
      {...(testID ? { testID } : {})}
    />
  );
}
