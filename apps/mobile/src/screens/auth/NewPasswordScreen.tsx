/**
 * VIEWS.newpassword (docs/AUTH_AND_TRIAL.md §5 "Password change revokes other sessions"): a
 * new password keeps this session and signs out every other one, and the screen says so
 * before the field. Reached from a recovery link or from Account & privacy. It is a pushed
 * page, the same shape as Delete account: Back and Not now both return to the page under it.
 * It was a form sheet until 2026-10-03, which is why it slid up like a menu and Not now, which
 * only cleared the recovery flag, left it sitting there. The error line has the alert role.
 *
 * IT GOES THROUGH `FormError` since 2026-09-22, when the doodle pattern became the background of
 * the whole app rather than of the first run. This screen used to be the one deliberate
 * exception to the first-run decoration — it is reachable while signed in — and that exception
 * is what kept a bare `ink="crit"` legal here. Now every page is decorated, and crit on the
 * pattern measures 3.92:1 on Glass against a 4.5 floor, so the message was boxed on a solid
 * surface until 2026-09-30, and is the app's one error line on the form's card since (the owner's
 * rule 4, docs/DESIGN_SYSTEM.md §4.1): the field, the rule, the error and Save, as the sign-in
 * page's and the reset page's forms are. Not now leaves, and stays off the card.
 */
import { BodySm, Button, Card, Input, useTheme } from '@nibblecue/ui';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { backHeld } from '../../app/backGuard';
import { Screen } from '../../app/Screen';
import type { RootParams } from '../../app/types';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../ui/toast';
import { FormError } from '../first-run/Sections';
import { AuthSignature } from './AuthSignature';
import { failureSentence, MIN_PASSWORD } from './copy';
import { PasswordRule } from './PasswordRule';

/**
 * A recovery link already proved the inbox, so that path asks only for the new password.
 * Signed in from Account, the current password is required: sign in with it, then update.
 * Forgetting that password sends the same emailed link a signed-out reset uses. An account
 * with no password is offered that link when it has an email, and nothing when it does not.
 */
export function NewPasswordScreen() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const { auth, actions, recovery, session } = useAuth();
  const toast = useToast();
  const email = session?.user.email ?? null;
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'password' | 'email' | 'none'>(
    recovery ? 'password' : 'password',
  );

  useEffect(() => {
    if (recovery) return undefined;
    let live = true;
    void auth
      .hasPassword()
      .then(has => {
        if (!live) return;
        if (has) setMode('password');
        else if (email) setMode('email');
        else setMode('none');
      })
      .catch(() => {
        if (live) setMode('password');
      });
    return () => {
      live = false;
    };
  }, [auth, recovery, email]);

  /*
    LEAVING CLEARS THE RECOVERY FLAG. A link sets it, and RecoveryRedirect opens this page while
    it is set. Back, the swipe, and Not now all pop the page; if the flag stayed set, the redirect
    would open it again the next time that effect ran. The flag is cleared on the way out, so a
    parent who is not ready yet is back on the page they came from.
  */
  useEffect(() => {
    return nav.addListener('beforeRemove', () => {
      actions.clearRecovery();
    });
  }, [actions, nav]);

  const leave = () => {
    if (!backHeld()) nav.goBack();
  };

  const save = async () => {
    if (password.length < MIN_PASSWORD)
      return setError(`Pick a password of at least ${MIN_PASSWORD} characters.`);
    if (!recovery && !current) return setError('Enter your current password.');
    setBusy(true);
    setError(null);
    try {
      if (!recovery) {
        if (!email) return setError('This account has no email for a password.');
        await auth.signInWithPassword(email, current);
        await auth.updatePassword(password, current);
      } else {
        await auth.updatePassword(password);
      }
      toast.show('Password updated. Other devices were signed out.');
      leave();
    } catch (err) {
      setError(failureSentence(err));
    } finally {
      setBusy(false);
    }
  };

  const sendLink = async () => {
    if (!email) return;
    setBusy(true);
    setError(null);
    try {
      await auth.sendPasswordReset(email);
      toast.show('We emailed you a link to choose a new password.');
      actions.clearRecovery();
    } catch (err) {
      setError(failureSentence(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Choose a new password" testID="newpassword">
      {/* the form fills the page, and the signature sits at the foot, as it does on sign in */}
      <View style={{ flexGrow: 1, gap: t.space.lg }}>
        <BodySm>
          {recovery
            ? 'Your other devices will be signed out. This one stays signed in.'
            : mode === 'email'
              ? 'This account has no password yet. We can email a link to set one.'
              : mode === 'none'
                ? 'This account has no password to change.'
                : 'Enter your current password, then choose a new one. Other devices will be signed out.'}
        </BodySm>
        {mode === 'none' ? null : mode === 'email' ? (
          <Card>
            <View style={{ gap: t.space.lg }}>
              {error ? <FormError testID="newpassword.error">{error}</FormError> : null}
              <Button
                label="Email me a link"
                onPress={() => void sendLink()}
                loading={busy}
                testID="newpassword.email"
              />
            </View>
          </Card>
        ) : (
          <Card>
            <View style={{ gap: t.space.lg }}>
              {recovery ? null : (
                <>
                  <Input
                    label="Current password"
                    value={current}
                    onChangeText={setCurrent}
                    secure
                    autoCapitalize="none"
                    autoComplete="current-password"
                    textContentType="password"
                    placeholder="Your current password"
                    testID="newpassword.current"
                  />
                  {email ? (
                    <Button
                      label="Forgot it? Email me a link"
                      variant="ghost"
                      onPress={() => void sendLink()}
                      loading={busy}
                      testID="newpassword.forgot"
                    />
                  ) : null}
                </>
              )}
              <Input
                label="New password"
                value={password}
                onChangeText={setPassword}
                secure
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder="Your new password"
                testID="newpassword.password"
              />
              {/* the sign-up page's own row, so the two never state the rule differently */}
              <PasswordRule password={password} testID="newpassword.rule" />
              {error ? <FormError testID="newpassword.error">{error}</FormError> : null}
              <Button
                label="Save password"
                onPress={() => void save()}
                loading={busy}
                testID="newpassword.submit"
              />
            </View>
          </Card>
        )}
        <Button label="Not now" variant="ghost" onPress={leave} testID="newpassword.skip" />
        <View style={{ marginTop: 'auto' }}>
          <AuthSignature />
        </View>
      </View>
    </Screen>
  );
}
