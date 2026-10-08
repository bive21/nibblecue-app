/**
 * VIEWS.verify (docs/ACCOUNTS.md §3.3; docs/DESIGN_SYSTEM.md §5, §9): the address, a resend, a
 * way back. Signed out, so no chrome (§14: the top bar belongs to a household). The mock
 * provider adds a dev-only button that "opens" the emailed link; a production build never
 * shows it.
 *
 * The lit ground and the single `Sheet` are shared with the age gate and the five onboarding
 * steps so create → verify → onboard reads as one continuous room. The failure line goes
 * through `FormError`, the app's one error line, announced when it appears, and it sits on the
 * card that holds the email's two lines and the resend it answers (2026-09-30, the owner's rule 4:
 * docs/DESIGN_SYSTEM.md §4.1): crit measures 3.98:1 directly on the ground against a 4.5 floor,
 * which is why it was a box until then, and 5.16:1 or better on a card.
 *
 * AN EMAILED LINK THAT DID NOT WORK is said here too (the first-day trace, 2026-09-25;
 * `auth/linkError.ts`): this is the screen a parent is looking at when they tap an old email, and
 * the resend it names is the button right under it.
 *
 * BACK TO SIGN IN IS ALWAYS THERE (the owner, 2026-10-02): iPhone has no system Back, and after a
 * confirmation link that looked expired the stack sometimes had nowhere for `goBack` to go — so
 * the way out is an explicit button that clears the pending email, signs out if a half-session
 * is stuck here, and lands on AUTH.
 */
import { Body, BodySm, Button, Card, StepHeader, useTheme } from '@nibblecue/ui';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { View } from 'react-native';
import { Screen } from '../../app/Screen';
import type { RootParams } from '../../app/types';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../ui/toast';
import { FormError, Group, Sheet } from '../first-run/Sections';
import { EMAIL_LINK_LIFETIME, failureSentence, linkProblemNotice } from './copy';
import { JOIN } from './joinCopy';

export function VerifyScreen() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const { auth, actions, pendingEmail, mock, env, session, linkProblem, heldInvite, heldPreview } =
    useAuth();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const email = pendingEmail ?? session?.user.email ?? '';

  const resend = async () => {
    try {
      await auth.resendVerification(email);
      // the notice was about the old link; the new one is on its way
      actions.clearLinkProblem();
      toast.show('Email sent');
    } catch (err) {
      setError(failureSentence(err));
    }
  };

  /** Leave Verify for AUTH, even when the stack has no prior screen (deep link, unverified phase). */
  const backToSignIn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      actions.clearLinkProblem();
      actions.setPendingEmail(null);
      if (session) {
        await actions.signOut('local');
        return;
      }
      if (nav.canGoBack()) {
        nav.goBack();
        return;
      }
      // Typed reset (same path as JoinedScreen): CommonActions.reset's payload is too wide for
      // NativeStackNavigationProp<RootParams>.dispatch under the current @react-navigation types.
      nav.reset({ index: 0, routes: [{ name: 'Auth' }] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen chrome={false} testID="verify">
      <Sheet>
        {/* no eyebrow: "Your email" over "Check your email" said it twice (2026-09-29; the rule
            the owner set for the sign-up page's own, in `StepHeader`) */}
        <StepHeader icon="bell" title="Check your email" />
        {linkProblem ? (
          <Card tint={t.color.accentSoft} testID="verify.link_problem">
            <Body accessibilityLiveRegion="polite">{linkProblemNotice(linkProblem, 'verify')}</Body>
          </Card>
        ) : null}
        {/* THE EMAIL, ON ONE PANEL (2026-09-30): where it went, how long it lasts, and the
            resend, with the one error the page has said under what it is about, on the card
            (`FormError` is a line now, and a line needs a card under it on this ground). */}
        <Card>
          <View style={{ gap: t.space.lg }}>
            <Group gap="sm">
              <BodySm testID="verify.email">
                {`We sent a link to ${email || 'your address'}. Open it on this phone to continue.`}
              </BodySm>
              <BodySm testID="verify.lifetime">
                {`The link works once and expires in ${EMAIL_LINK_LIFETIME}.`}
              </BodySm>
            </Group>
            {error ? <FormError testID="verify.error">{error}</FormError> : null}
            <Button
              label="Resend the email"
              variant="secondary"
              onPress={() => void resend()}
              testID="verify.resend"
            />
          </View>
        </Card>
        {/* THE INVITE WAITS WITH THEM (2026-09-29): the partner who typed a code first is told it is
            saved, and that opening the email is the last thing left to do */}
        {heldInvite ? (
          <Card tint={t.color.accentSoft} testID="verify.held_invite">
            <Body>{JOIN.verify(heldPreview?.household_name ?? '')}</Body>
          </Card>
        ) : null}
        <Group gap="sm">
          {/* When the link looked expired, Back is the way on (often the address is already
              confirmed); secondary so it is not missed on iPhone with no system Back. */}
          <Button
            label="Back to sign in"
            variant={linkProblem ? 'secondary' : 'ghost'}
            onPress={() => void backToSignIn()}
            disabled={busy}
            testID="verify.back"
          />
          {mock && env.stage !== 'production' && mock.lastLink ? (
            <Button
              label="Open the emailed link (mock)"
              onPress={() => void actions.openLink(mock.lastLink ?? '')}
              testID="verify.mock_open_link"
            />
          ) : null}
        </Group>
      </Sheet>
    </Screen>
  );
}
