/**
 * Switch (docs/DESIGN_SYSTEM.md §5; docs/MOBILE.md §4): the platform switch painted from the
 * palette. On: the flat accent track with an `onAccent` thumb — the pair the token gate verifies.
 * Off: the `line2` track with a `text2` thumb. The off thumb is an ink on purpose: a white thumb
 * vanishes on a dark track in the dark and night themes, and `text2` is the one token verified
 * to read on every ground (§12 rule 1), so both states show a visible disc and differ in track
 * AND thumb, not in hue alone. The label is REQUIRED — a switch is a glyph, and a glyph without
 * a name is invisible to everyone who cannot see it.
 *
 * The target: the platform control is 31pt tall and hitSlop does not reach its native hit test
 * (on iOS the slop band hits the wrapper, not the UISwitch; on Android the native control only
 * toggles inside its own bounds), so the control sits inside a 44×44 Pressable that IS the
 * toggle — one press handler, one `onValueChange` — and the platform control is display only:
 * a live control under the pressable would toggle natively AND fire the press, flipping the
 * value twice. The pressable is the switch for assistive technology; the platform control is
 * hidden from it so a screen reader meets one element, not two.
 *
 * `pointerEvents="none"` GOES ON A WRAPPER VIEW, NEVER ON THE `Switch` ITSELF, and that is the
 * whole of a bug the owner reported three times (2026-09-16: "the toggle to enable what's shown
 * in the log menu still does not work"). React Native's `Switch` does not forward the prop to
 * the Android platform control, so the native switch kept its own hit test: a tap landed on it,
 * it animated to the other position out of its own internal state, and the Pressable's
 * `onPress` — the only thing wired to `onValueChange` — never ran. The thumb moved and nothing
 * was written, which is indistinguishable from a control that does nothing, and it is why the
 * arrows beside it (plain Pressables) worked while the switch did not. `Row.tsx` has always
 * used the wrapper form, which is why every switch inside a Row worked and this one did not.
 *
 * A FLIP IS FELT AS A `tap` (the owner, 2026-09-25, of the "that's cool" list: "Let's try doing
 * everything"), in the one press handler, so a tap is one flip and one feel. The thumb moving is
 * the same news on the screen. A Row that carries a switch feels the same through its own handler
 * (`Row.tsx`): the platform control there is display only, and so is this one's. The tap comes
 * AFTER the flip is handed on, for the one switch whose flip decides whether anything is felt at
 * all — Vibration, on the Appearance sheet: turned on, its own tap is the first thing felt;
 * turned off, it is already still. Before the flip it would be the other way round.
 */
import { Pressable, Switch as RNSwitch, View, type StyleProp, type ViewStyle } from 'react-native';
import { haptic } from '../feedback/haptics';
import { useTheme } from '../theme/ThemeProvider';

export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Switch({
  value,
  onValueChange,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  style,
  testID,
}: SwitchProps) {
  const t = useTheme();
  return (
    <Pressable
      accessible
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => {
        onValueChange(!value);
        haptic('tap');
      }}
      style={[
        {
          minHeight: t.hit.min,
          minWidth: t.hit.min,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'flex-start',
        },
        style,
      ]}
      {...(testID ? { testID } : {})}
    >
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <RNSwitch
          value={value}
          disabled={disabled}
          trackColor={{ false: t.color.line2, true: t.color.accent }}
          thumbColor={value ? t.color.onAccent : t.color.text2}
          ios_backgroundColor={t.color.line2}
        />
      </View>
    </Pressable>
  );
}
