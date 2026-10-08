/**
 * VIEWS.reset (docs/ACCOUNTS.md §3.6; docs/DESIGN_SYSTEM.md §5, §9): one field, one button,
 * always the same reply — the sentence never confirms whether an address has an account.
 * Signed out, so no chrome, and it carries the lit first-run ground: this screen is reached from
 * the sign-in screen's "Forgot password?", and a flat page one tap from a lit one reads as a
 * different app. The error goes through FormError because a status ink cannot sit on the ground
 * (crit measures 3.98:1 there, 5.42:1 on FormError's solid surface).
 */
import { BodySm, Button, Card, Input, StepHeader, useTheme } from '@nibblecue/ui';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { View } from 'react-native';
import { Screen } from '../../app/Screen';
import { useAuth } from '../../auth/AuthContext';
import { FormError, Group, Sheet } from '../first-run/Sections';
import { EMAIL_LINK_LIFETIME, emailEntryError, failureSentence } from './copy';

export function ResetPasswordScreen() {
  const t = useTheme();
  const nav = useNavigation();
  const { auth, actions } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const emailError = emailEntryError(email);
    if (emailError) return setError(emailError);
    setBusy(true);
    setError(null);
    try {
      await auth.sendPasswordReset(email.trim());
      // an old reset link's notice on the sign-in page is about the link this one replaces
      actions.clearLinkProblem();
      setSent(true);
    } catch (err) {
      setError(failureSentence(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen chrome={false} testID="reset">
      <Sheet>
        <StepHeader
          icon="lock"
          eyebrow="Sign in help"
          title="Reset password"
          blurb={`We will email you a link. It works once and expires in ${EMAIL_LINK_LIFETIME}.`}
        />
        {sent ? (
          <Group gap="lg">
            <Card>
              <BodySm testID="reset.sent">
                If that address has an account, a reset link is on its way.
              </BodySm>
            </Card>
            <Button label="Back to sign in" onPress={() => nav.goBack()} testID="reset.back" />
          </Group>
        ) : (
          <>
            <Card>
              <View style={{ gap: t.space.lg }}>
                <Input
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  inputMode="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  testID="reset.email"
                />
                {error ? <FormError testID="reset.error">{error}</FormError> : null}
                <Button
                  label="Send reset link"
                  onPress={() => void send()}
                  loading={busy}
                  testID="reset.submit"
                />
              </View>
            </Card>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => nav.goBack()}
              testID="reset.cancel"
            />
          </>
        )}
      </Sheet>
    </Screen>
  );
}
