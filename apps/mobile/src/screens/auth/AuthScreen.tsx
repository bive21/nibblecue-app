/**
 * VIEWS.auth — the first screen after install (docs/AUTH_AND_TRIAL.md §2 "precisely",
 * docs/ACCOUNTS.md §3.1–3.2; docs/BRANDING.md §2 "Sign in / create account: wordmark +
 * tagline, above the form"). The one screen whose job is to say what this is, so it is the one
 * place the wordmark is drawn at size — the image from the brand package, named for assistive
 * technology by the display name, over the tagline. No guest mode, no skip. Signed out, so no
 * chrome (§14: the top bar belongs to a household).
 *
 * Every mode, error, dev line, invite and quarantine behavior is WP2's; this file changes only
 * what it is built from. The error line carries the alert role so it is announced when it
 * appears; the legal links are the accent-2 ink, the one that clears 4.5:1 on every ground.
 *
 * NOTHING HERE IS MEASURED (CLAUDE.md §7; Privacy §2). The sign-up funnel's two events fired from
 * this screen until 2026-09-27; the count is setup's first page's now (`auth/measured.ts`), and
 * `noAnalytics.scan.test.ts` fails the build if an emit is reachable from any file in this folder.
 *
 * AND IT IS WHERE THE TERMS ARE ACCEPTED, for everyone (`auth/terms-step.ts`): somebody signed in
 * without a recorded "yes" to the current Terms — an account Google made on the sign-in side, or
 * Terms that moved on since — is shown this page's own checkbox again, with one line saying why and
 * Continue. Not a separate screen and not a phase: the owner deleted both on 2026-09-22.
 *
 * AND IT IS THE WAY INTO SOMEBODY ELSE'S HOUSEHOLD (the owner's report of 2026-09-29). "Join a
 * household" opens the code sheet, which checks the code and names the household; while an invite
 * is held, this page says so at its top — "Your invite to Dana's family is saved." — and its
 * heading becomes the step that is left: "Create an account to join", or "Sign in to join". The
 * sheet's two buttons turn the page to the side they name and bring it back to its top: the notice
 * that used to say it was drawn up there while the page stayed scrolled to its foot, where the
 * invite card is, so nothing the person could see changed.
 */
import {
  BRAND,
  IN_APP_STRINGS,
  LEGAL_VERSION,
  PRIVACY,
  TERMS,
  type LegalDocument,
} from '@nibblecue/brand';
import {
  AppText,
  Body,
  BodySm,
  BodyStrong,
  Button,
  Card,
  Divider,
  Icon,
  Input,
  Meta,
  SegmentedControl,
  StepHeader,
  useTheme,
} from '@nibblecue/ui';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Screen } from '../../app/Screen';
import type { RootParams } from '../../app/types';
import { useAuth } from '../../auth/AuthContext';
import { AppleMark, GoogleMark } from '../../auth/ProviderMarks';
import { savePendingTermsAcceptance } from '../../auth/pending-terms';
import { AuthFailure } from '../../auth/providers/types';
import { socialButtons } from '../../auth/socialSignIn';
import { WORDMARK_ASPECT, WORDMARK_SOURCE } from '../../brand/assets';
import { localDbFileExists } from '../../db';
import { prefsStore } from '../../prefs/async-storage';
import { LegalSheet } from '../../sheets/LegalSheet';
import { FormError, Group, Sheet } from '../first-run/Sections';
import {
  failureSentence,
  forcedSignOutSentence,
  inviteLapseSentence,
  emailEntryError,
  emailNotAuthorized,
  linkProblemNotice,
  MIN_PASSWORD,
  TERMS_STEP_LINE,
} from './copy';
import { JOIN } from './joinCopy';
import { AuthSignature } from './AuthSignature';
import { PasswordRule } from './PasswordRule';

type Mode = 'signin' | 'create';

const WORDMARK_HEIGHT = 32;
/** The mark at the foot of the page: a signature, so the size of a line of small type beside it. */
/** The sentence an unchecked box gets, whichever way the account is being made. */
const CONSENT_FIRST = 'Check the box to agree to the Terms of Use and Privacy Policy.';

export function AuthScreen() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const {
    auth,
    actions,
    quarantined,
    forcedSignOut,
    heldInvite,
    heldPreview,
    inviteLapse,
    linkProblem,
    mock,
    env,
    termsStep,
  } = useAuth();
  const route = useRoute<RouteProp<RootParams, 'Auth'>>();
  const scroller = useRef<ScrollView | null>(null);
  const [mode, setMode] = useState<Mode>('create');
  /**
   * AN EMAILED LINK THAT DID NOT WORK TURNS THE PAGE TO ITS SIGN-IN SIDE (`auth/linkError.ts`).
   * Whoever tapped it already has an account, and the two ways on the notice names — signing in,
   * or a new link through "Forgot password?" — are on that side only.
   */
  useEffect(() => {
    if (linkProblem !== null) setMode('signin');
  }, [linkProblem]);
  /**
   * THE CODE SHEET'S TWO BUTTONS ("Create an account to join", "Sign in to join") turn the page to
   * the side they name and bring it back to its top, where the saved invite and the heading that
   * says what is left are (2026-09-29). `at` makes the same side asked for twice a second request.
   */
  const asked = route.params?.mode;
  const askedAt = route.params?.at;
  useEffect(() => {
    if (asked === undefined) return;
    setMode(asked);
    setError(null);
    scroller.current?.scrollTo({ y: 0, animated: true });
  }, [asked, askedAt]);
  /** And an invite that arrives while the page is open — a link, a code — is shown where it is said. */
  const heldKey = heldInvite?.token ?? heldInvite?.code ?? null;
  useEffect(() => {
    if (heldKey !== null) scroller.current?.scrollTo({ y: 0, animated: true });
  }, [heldKey]);
  /** What the held invite is for, when the code sheet's check named it; '' when nothing did. */
  const joiningName = heldPreview?.household_name ?? '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** The terms or the privacy policy, read in a sheet — no connection needed, no leaving the screen. */
  const [reading, setReading] = useState<{ doc: LegalDocument; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * THE BOX, CHECKED ON THIS PAGE (the owner, 2026-09-22: "make a single sentence where if user
   * click the terms of condition then the whole text shows up and require user to check box...
   * it does not need an individual page"). What used to be a full screen after verification —
   * "A few things to agree to", read-summary, "I agree" — is now this one row: a checkbox, one
   * sentence, and the two document names open the SAME full text this screen already reads
   * (`reading`, below). Checking it records nothing by itself; `submit` writes the record the
   * moment the account is created, and `AuthContext` drains it into `accept_terms` the instant a
   * session for this address exists, which is why the acceptance screen the app used to show is
   * no longer the ordinary path — see `auth/pending-terms.ts`.
   *
   * Sign-up starts checked (the owner, 2026-10-03). The box can be cleared, and an unchecked box
   * still cannot submit. The terms step mounts on its own tree, so this starts clear there:
   * updated terms stay an active accept.
   */
  const [agreed, setAgreed] = useState(termsStep === 'none');
  const create = mode === 'create';
  /**
   * ONLY THE BUTTONS THIS BUILD CAN FINISH (`auth/socialSignIn.ts` has the three rules): the
   * provider says which sign-ins it can do, an iPhone shows Google only beside Apple (guideline
   * 4.8), and Apple sits where Apple is the phone. A real build offers each once the owner has
   * switched it on; the in-app test backend offers both.
   */
  const buttons = socialButtons(Platform.OS, auth.socialSignIn);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      // a closed or refused Apple/Google sheet was the parent's choice, and gets no sentence
      if (err instanceof AuthFailure && err.code === 'cancelled') return;
      if (err instanceof AuthFailure && err.code === 'email_not_verified') {
        actions.setPendingEmail(email.trim());
        nav.navigate('Verify');
      } else if (err instanceof AuthFailure && err.code === 'email_not_authorized') {
        // the door in may name the app (BRANDING.md §2), and this is the only screen whose
        // sign-up and sign-in link can meet an address the project's email will not reach yet
        setError(emailNotAuthorized(BRAND.appDisplayName));
      } else {
        setError(failureSentence(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = () =>
    run(async () => {
      const emailError = emailEntryError(email);
      if (emailError) return setError(emailError);
      if (create && password.length < MIN_PASSWORD)
        return setError(`Pick a password of at least ${MIN_PASSWORD} characters.`);
      if (!create && !password) return setError('Enter your password.');
      if (create && !agreed) return setError(CONSENT_FIRST);
      if (create) {
        const r = await auth.signUpWithPassword(email.trim(), password);
        /**
         * WRITTEN THE MOMENT THE ACCOUNT EXISTS, not the moment the box was checked: a checked
         * box that never becomes an account (a validation error above, an offline sign-up)
         * would otherwise leave a pending acceptance for an address with nothing behind it.
         */
        await savePendingTermsAcceptance(prefsStore, email.trim(), LEGAL_VERSION);
        if (r.session) return actions.signedIn(r.session);
        actions.setPendingEmail(email.trim());
        nav.navigate('Verify');
        return;
      }
      const s = await auth.signInWithPassword(email.trim(), password);
      await actions.signedIn(s);
    });

  const oauth = (which: 'apple' | 'google') =>
    run(async () => {
      /*
        CREATING AN ACCOUNT WITH APPLE OR GOOGLE IS CREATING AN ACCOUNT: the same box, before the
        page opens, and the same record the moment the account exists — keyed by the address the
        provider returned, which is the only one there is (`auth/pending-terms.ts`). `signedIn`
        drains it into `accept_terms` before anything else reads the account.
      */
      if (create && !agreed) return setError(CONSENT_FIRST);
      const s = which === 'apple' ? await auth.signInWithApple() : await auth.signInWithGoogle();
      if (create && s.user.email)
        await savePendingTermsAcceptance(prefsStore, s.user.email, LEGAL_VERSION);
      /*
        ON THE SIGN-IN SIDE THERE IS NO BOX, and a provider makes an account for an address that
        has none. That account arrives with no recorded "yes", and the terms step below is what
        asks for it — this page's own checkbox, before anything else happens (`auth/terms-step.ts`).
      */
      await actions.signedIn(s);
    });

  /**
   * THE TERMS STEP'S CONTINUE: the box first, as on the create side, then the same record the
   * create side makes (`actions.agreeToTerms`) — nothing else is reachable until it is ticked.
   */
  const finish = () =>
    run(async () => {
      if (!agreed) return setError(CONSENT_FIRST);
      await actions.agreeToTerms();
    });

  const notice = (children: string, testID: string) => (
    <Card tint={t.color.accentSoft} testID={testID}>
      <Body>{children}</Body>
    </Card>
  );

  /* The one screen BRANDING.md §2 gives the wordmark, and the only brand mark in the whole first
     run. It sits at xxxl rather than lg so it falls inside the ground's top-right wash instead of
     jammed under the status bar. */
  const door = (
    <View style={[styles.mark, { gap: t.space.sm, marginTop: t.space.xxxl }]}>
      <Image
        source={WORDMARK_SOURCE}
        style={{ height: WORDMARK_HEIGHT, width: WORDMARK_HEIGHT * WORDMARK_ASPECT }}
        resizeMode="contain"
        accessible
        accessibilityRole="image"
        accessibilityLabel={BRAND.appDisplayName}
        testID="auth.wordmark"
      />
      <BodySm align="center">{IN_APP_STRINGS.signInTagline}</BodySm>
    </View>
  );

  /**
   * THE BOX, ONE ELEMENT (2026-09-22; the terms step, 2026-09-27): drawn on the create side and on
   * the terms step, so the second is the sign-up page's own checkbox in its own words and never a
   * copy that could drift from it.
   */
  const consent = (
    <View style={[styles.consentRow, { gap: t.space.sm }]} testID="auth.consent">
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
        accessibilityLabel="Accept the Terms of Use and Privacy Policy"
        onPress={() => setAgreed(a => !a)}
        hitSlop={t.space.sm}
        style={({ pressed }) => [
          styles.checkbox,
          {
            borderRadius: t.radius.s,
            borderColor: agreed ? t.color.accent : t.color.line,
            backgroundColor: agreed ? t.color.accent : 'transparent',
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        testID="auth.consent.checkbox"
      >
        {agreed ? <Icon name="check" size={14} color={t.color.onAccent} /> : null}
      </Pressable>
      <BodySm ink="text2" style={styles.grow} testID="auth.consent.text">
        {'I have reviewed and agree to the '}
        <AppText
          variant="bodySm"
          ink="accent2"
          accessibilityRole="link"
          onPress={() => setReading({ doc: TERMS, url: BRAND.termsUrl })}
        >
          Terms of Use
        </AppText>
        {' and '}
        <AppText
          variant="bodySm"
          ink="accent2"
          accessibilityRole="link"
          onPress={() => setReading({ doc: PRIVACY, url: BRAND.privacyPolicyUrl })}
        >
          Privacy Policy
        </AppText>
        {'.'}
      </BodySm>
    </View>
  );

  const legal = (
    <LegalSheet
      doc={reading?.doc ?? null}
      url={reading?.url ?? BRAND.termsUrl}
      onClose={() => setReading(null)}
    />
  );

  /*
    THE TERMS STEP (`auth/terms-step.ts`): somebody signed in with no recorded "yes" to the current
    Terms. This page, drawn for them with its own box: the line that says why, the box, Continue —
    and the one way out that is not agreeing, signing out, as Verify offers. Nothing else in the app
    is reachable meanwhile (`app/navigation.tsx` registers AUTH alone while this shows).
  */
  if (termsStep !== 'none')
    return (
      <Screen chrome={false} testID="auth">
        <Sheet>
          {door}
          <StepHeader
            icon="users"
            title={termsStep === 'new_account' ? 'Create your account' : 'Welcome back'}
            titleTestID="auth.headline"
          />
          <Card>
            <View style={{ gap: t.space.lg }}>
              <BodySm testID="auth.terms_step.line">{TERMS_STEP_LINE[termsStep]}</BodySm>
              {error ? <FormError testID="auth.error">{error}</FormError> : null}
              {consent}
              <Button
                label="Continue"
                onPress={finish}
                loading={busy}
                testID="auth.terms_step.continue"
              />
            </View>
          </Card>
          <Button
            label="Sign out"
            variant="ghost"
            onPress={() => void actions.signOut('local')}
            testID="auth.terms_step.sign_out"
          />
        </Sheet>
        {legal}
      </Screen>
    );

  return (
    <Screen chrome={false} scrollRef={scroller} testID="auth">
      <Sheet>
        {door}

        {forcedSignOut || quarantined || heldInvite || inviteLapse || linkProblem ? (
          <Group gap="md">
            {linkProblem
              ? notice(linkProblemNotice(linkProblem, 'auth'), 'auth.link_problem')
              : null}
            {/* one sentence saying WHY (the first-day trace, 2026-09-25): the server ended this
                phone's sign-in, or stopped handing it the household's entries with no account
                read to say why (`auth/mirror.ts`); the quarantine line under it says what was kept */}
            {forcedSignOut
              ? notice(forcedSignOutSentence(forcedSignOut), 'auth.forced_notice')
              : null}
            {quarantined
              ? notice(
                  `${quarantined.count === 1 ? '1 entry is' : `${quarantined.count} entries are`} waiting to sync.${
                    quarantined.email ? ` Sign in as ${quarantined.email} to finish.` : ''
                  }`,
                  'auth.quarantine',
                )
              : null}
            {/* THE INVITE IS SAVED, and whose household it is when the check named it; the heading
                under it says the one step left (2026-09-29) */}
            {heldInvite ? notice(JOIN.auth.saved(joiningName), 'auth.held_invite') : null}
            {/* a held code can run out while its owner is still signed out; the join page after
                sign-in says the same and has the way to enter a new one (`JoinStep.tsx`) */}
            {inviteLapse ? notice(inviteLapseSentence(inviteLapse), 'auth.invite_lapsed') : null}
          </Group>
        ) : null}

        {/* NOTHING UNDER THE WELCOME (the owner, 2026-09-28): who made it signs the foot of the
            page instead (`signature`, below). */}
        <StepHeader
          icon="users"
          /* no eyebrow on the create side: "Create account" over "Create your account" is the
             same sentence twice (the owner, 2026-09-21). "Sign in" over "Welcome back" is not. */
          {...(create ? {} : { eyebrow: 'Sign in' })}
          /* WITH AN INVITE HELD, THE HEADING IS THE STEP LEFT (2026-09-29): the person came here
             to join, and the page says what joining needs from them, not what the app is */
          title={
            heldInvite
              ? create
                ? JOIN.auth.createTitle
                : JOIN.auth.signInTitle
              : create
                ? 'Create your account'
                : 'Welcome back'
          }
          blurb={
            heldInvite
              ? create
                ? JOIN.auth.createBlurb
                : JOIN.auth.signInBlurb
              : create
                ? IN_APP_STRINGS.signInBlurbCreate
                : IN_APP_STRINGS.signInBlurbReturning
          }
          titleTestID="auth.headline"
        />

        {/* A lit room needs one lit panel: without it the form floats on the wash with no
            figure-ground relationship at all. Measured, `text` on a surface over the fully
            decorated ground is 10.32:1 worst and `text2` 5.12:1, Glass at 52% alpha included. */}
        <Card>
          <View style={{ gap: t.space.lg }}>
            <SegmentedControl<Mode>
              label="Account"
              value={mode}
              onChange={m => {
                setMode(m);
                setError(null);
              }}
              options={[
                { value: 'signin', label: 'Sign in' },
                { value: 'create', label: 'Create account' },
              ]}
              testID="auth.mode"
            />

            {/* EACH PROVIDER WEARS ITS OWN MARK (the owner, 2026-09-26: "sign up with Google should
                provide the Google logo to make it industry standard"). Google's G in its four
                colors, Apple's in the button's ink — what both companies' guidelines ask for.
                APPLE IS OFFERED WHERE APPLE IS THE PHONE ("shouldnt sign up with apple available
                only on apple devices?"): on an iPhone it is required beside Google (App Store
                guideline 4.8) and sits first; on Android nobody expects it on the sign-up panel.
                A BUTTON IS DRAWN ONLY FOR A SIGN-IN THIS BUILD CAN FINISH (`buttons`, above): with
                none, the panel is the email form alone, with no "or" over it. */}
            {buttons.anyOnPanel ? (
              <>
                <Group gap="md">
                  {buttons.applePanel ? (
                    <Button
                      label="Continue with Apple"
                      variant="secondary"
                      leading={(size, ink) => <AppleMark size={size} color={ink} />}
                      onPress={() => oauth('apple')}
                      testID="auth.oauth.apple"
                    />
                  ) : null}
                  {buttons.google ? (
                    <Button
                      label="Continue with Google"
                      variant="secondary"
                      leading={size => <GoogleMark size={size} />}
                      onPress={() => oauth('google')}
                      testID="auth.oauth.google"
                    />
                  ) : null}
                </Group>

                {/* the rule the prototype draws through this word; a bare centered "or" was the
                    screen's one outright visual defect. Divider is already hidden from assistive
                    technology, so a reader still hears one word. */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.lg }}>
                  <Divider style={{ flex: 1 }} />
                  <Meta>or</Meta>
                  <Divider style={{ flex: 1 }} />
                </View>
              </>
            ) : null}

            <Group gap="lg">
              <Input
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                inputMode="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
                testID="auth.email"
              />
              <Input
                label="Password"
                value={password}
                onChangeText={setPassword}
                /* the rule is the row under the field now, so the field no longer says it twice */
                placeholder={create ? 'Create a password' : 'Your password'}
                secure
                autoCapitalize="none"
                autoComplete={create ? 'new-password' : 'current-password'}
                textContentType={create ? 'newPassword' : 'password'}
                {...(create ? { passwordRules: `minlength: ${MIN_PASSWORD};` } : {})}
                returnKeyType="go"
                onSubmitEditing={submit}
                testID="auth.password"
              />
            </Group>

            {create ? <PasswordRule password={password} testID="auth.password.rule" /> : null}
            {error ? <FormError testID="auth.error">{error}</FormError> : null}

            {create ? consent : null}

            <Button
              label={create ? 'Create account' : 'Sign in'}
              onPress={submit}
              loading={busy}
              testID="auth.submit"
            />
          </View>
        </Card>

        {/* outside the panel: the way back in without the password, not part of the main choice.
            ONE WAY, NOT TWO (the owner, 2026-09-27: *"remove the 'email me a sign in link instead'
            i dont like this, if user forgets password, then they can reset with receive code/ link
            from email instead"*): a forgotten password is reset by email, and a second emailed
            route to the same place was one more button to read past.
            AND AN ACCOUNT MADE ON AN IPHONE MUST STILL OPEN ON ANDROID: a parent who signed up
            with Apple and moves to an Android phone has no password and — with Apple's hidden
            email — no address they know. So signing in keeps a quiet way back on Android when
            this build can finish it (Services ID; `buttons.appleSignInSide`). */}
        {!create ? (
          <Group gap="sm">
            <Button
              label="Forgot password?"
              variant="ghost"
              onPress={() => nav.navigate('ResetPassword')}
              testID="auth.forgot"
            />
            {buttons.appleSignInSide ? (
              <Button
                label="Sign in with Apple"
                variant="ghost"
                leading={(size, ink) => <AppleMark size={size} color={ink} />}
                onPress={() => oauth('apple')}
                testID="auth.oauth.apple"
              />
            ) : null}
          </Group>
        ) : null}

        <Divider />

        <Group gap="md">
          {/* "JOIN A HOUSEHOLD" OPENS THE CODE ENTRY RIGHT AWAY (2026-09-29; it said "Use an
              invite code"). With an invite held, the card is that invite: what happens next, a
              different code, or not joining at all. */}
          <Card testID="auth.invite">
            {heldInvite ? (
              <View style={{ gap: t.space.sm }}>
                <BodyStrong>{JOIN.auth.cardTitle}</BodyStrong>
                <BodySm testID="auth.invite.joining">{JOIN.auth.cardBody(joiningName)}</BodySm>
                <Button
                  label={JOIN.auth.differentCode}
                  variant="secondary"
                  onPress={() => nav.navigate('JoinCode')}
                  testID="auth.invite.button"
                />
                <Button
                  label={JOIN.auth.forget}
                  variant="ghost"
                  onPress={() => void actions.forgetInvite()}
                  testID="auth.invite.forget"
                />
              </View>
            ) : (
              <View style={{ gap: t.space.sm }}>
                <BodyStrong>{JOIN.door.title}</BodyStrong>
                <BodySm>{JOIN.door.body}</BodySm>
                <Button
                  label={JOIN.door.button}
                  variant="secondary"
                  onPress={() => nav.navigate('JoinCode')}
                  testID="auth.invite.button"
                />
              </View>
            )}
          </Card>
          <BodySm>
            Accounts are per person. Everyone in the household signs in as themselves, and roles
            decide what each can do.
          </BodySm>
        </Group>

        <AuthSignature />

        {mock && env.stage !== 'production' ? (
          // the acceptance assertion of docs/ACCOUNTS.md §4, on screen for the E2E flow: no database file survives a sign-out
          <Meta
            testID={
              localDbFileExists() ? 'auth.dev.local_data_present' : 'auth.dev.local_data_absent'
            }
          >
            {localDbFileExists()
              ? 'Dev: a local database file is still present'
              : 'Dev: no local data on this phone'}
          </Meta>
        ) : null}
      </Sheet>
      {legal}
    </Screen>
  );
}

const styles = StyleSheet.create({
  mark: { alignItems: 'center' },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start' },
  /*
    22×22 drawn, a much bigger tap target through `hitSlop` — the same trade the design system
    already makes for a chip or a small icon button, rather than growing a checkbox to 44pt and
    making it look like a button instead of a checkbox.
  */
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1 },
});
