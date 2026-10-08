/**
 * THE PASSWORD'S RULE, UNDER THE FIELD, TICKED WHEN IT IS MET (the owner, 2026-09-28: *"the
 * password enter 10 characters, and when it's at least 10, says "long enough" this does not feel
 * very professional or industry standard. when i sign up it usually says Password something
 * something with a green checkmark"*). A count going down and then "Long enough" read as the app
 * talking to itself; a sign-up form states its rule before the first key and ticks it off, which is
 * what a parent has seen on every other form.
 *
 * SHOWN FROM THE START, not once typing begins: a rule met only after failing it is a trap. Met is
 * said three ways (the ring fills, a check appears in it, the words take the good ink), so it never
 * rests on color alone (CLAUDE.md §6), and a screen reader hears it once, when it changes.
 *
 * The sign-up side of `AuthScreen` and `NewPasswordScreen` draw this one row, so the two can never
 * state the rule differently.
 */
import { BodySm, Icon, useTheme } from '@nibblecue/ui';
import { StyleSheet, View } from 'react-native';
import { PASSWORD_RULE, passwordRuleMet } from './copy';

/** The ring, drawn; the row itself is the full width, so its target is never the ring alone. */
const RING = 18;

export function PasswordRule({ password, testID }: { password: string; testID: string }) {
  const t = useTheme();
  const met = passwordRuleMet(password);
  return (
    <View
      style={[styles.row, { gap: t.space.sm }]}
      accessible
      accessibilityLabel={`${PASSWORD_RULE}, ${met ? 'done' : 'not yet'}`}
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      <View
        style={[
          styles.ring,
          {
            borderColor: met ? t.color.good : t.color.line2,
            backgroundColor: met ? t.color.good : 'transparent',
          },
        ]}
        testID={`${testID}.${met ? 'met' : 'unmet'}`}
      >
        {/* the panel's own color on the good ring: white on the light theme's deep green, dark on
            the dark theme's light one, so the tick clears it on both */}
        {met ? <Icon name="check" size={12} color={t.color.surfaceSolid} /> : null}
      </View>
      <BodySm ink={met ? 'good' : 'text2'}>{PASSWORD_RULE}</BodySm>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
