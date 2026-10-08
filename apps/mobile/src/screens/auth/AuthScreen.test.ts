/**
 * THE SIGN-UP PAGE'S CONSENT (the owner, 2026-09-22: "make a single sentence where if user click
 * the terms of condition then the whole text shows up and require user to check box... it does
 * not need an individual page"). A static scan, the same shape `step1.test.ts` uses for the
 * screens next to this one — there is no rendered-component harness for these screens, so what
 * a device would show is checked here as source: a checkbox with real accessibility state, the
 * two document names opening the full text, `submit` actually reading the box, and the record
 * written in the one order that cannot outrun the account it describes.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');

/** Comments first: this folder explains its own rules, and a scan must not read the explanation. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const screen = stripComments(read('AuthScreen.tsx'));
const flat = screen.replace(/\s+/g, ' ');

describe('the terms and privacy consent on the sign-up page', () => {
  it('is a real checkbox, not a decorative row', () => {
    expect(flat).toContain('accessibilityRole="checkbox"');
    expect(flat).toContain('accessibilityState={{ checked: agreed }}');
    expect(flat).toContain('testID="auth.consent.checkbox"');
    // sign-up starts checked (the owner, 2026-10-03). The terms step mounts with termsStep set,
    // so the same line starts clear there. An unchecked box still cannot submit.
    expect(screen).toContain("useState(termsStep === 'none')");
    expect(flat).toContain('if (create && !agreed) return setError(CONSENT_FIRST);');
    expect(flat).toContain('if (!agreed) return setError(CONSENT_FIRST);');
  });

  it('opens the full text of both documents in the same sheet this screen already reads', () => {
    expect(flat).toContain('onPress={() => setReading({ doc: TERMS, url: BRAND.termsUrl })}');
    expect(flat).toContain(
      'onPress={() => setReading({ doc: PRIVACY, url: BRAND.privacyPolicyUrl })}',
    );
    expect(flat).toContain('<LegalSheet');
  });

  it('shows only on the create side, never asked again to sign in', () => {
    // one element, `consent`, drawn on the create side — and on the terms step, below
    expect(flat).toContain(
      'const consent = ( <View style={[styles.consentRow, { gap: t.space.sm }]} testID="auth.consent">',
    );
    expect(flat).toContain('{create ? consent : null}');
  });

  it('refuses to submit an unchecked box, and says so beside the box rather than at the foot', () => {
    expect(flat).toContain(
      "const CONSENT_FIRST = 'Check the box to agree to the Terms of Use and Privacy Policy.';",
    );
    // the email form and the provider buttons both ask for the box before creating an account
    expect(flat.split('if (create && !agreed) return setError(CONSENT_FIRST);')).toHaveLength(3);
  });

  it('records the version the moment the account exists, never before the call that creates it', () => {
    // `signUpWithPassword` first, THEN the record — a validation failure or a thrown network
    // error above this line never writes a pending acceptance for an address with no account
    const call = flat.indexOf('auth.signUpWithPassword(email.trim(), password)');
    const record = flat.indexOf(
      'await savePendingTermsAcceptance(prefsStore, email.trim(), LEGAL_VERSION)',
    );
    expect(call, 'the sign-up call').toBeGreaterThan(0);
    expect(record, 'the pending record').toBeGreaterThan(call);
  });

  it('never lets the acceptance screen become the ordinary path: the drain is awaited before the session is', () => {
    // AuthContext, not this screen — asserted here because the two files are one feature and a
    // reader of the consent test should find the other half of it without hunting
    const ctx = stripComments(read('../../auth/AuthContext.tsx'));
    const ctxFlat = ctx.replace(/\s+/g, ' ');
    expect(ctxFlat).toContain('await drainPendingTerms(s)');
    expect(ctxFlat).toContain('await drainPendingTerms(result.session)');
  });
});

describe('the sign-in providers (the owner, 2026-09-26)', () => {
  it("draws Google's own G on the Google button", () => {
    expect(flat).toContain('leading={size => <GoogleMark size={size} />}');
    const art = read('../../auth/providerMarks.art.ts');
    // the four standard colors, and no fifth: the G is never tinted by a theme
    for (const hex of ['#EA4335', '#4285F4', '#FBBC05', '#34A853']) expect(art).toContain(hex);
    expect(art.match(/#[0-9A-Fa-f]{6}\b/g)?.length).toBe(4);
  });

  it('draws Apple and Google behind the rule that decides each (the owner, 2026-10-02)', () => {
    // where the button goes is `auth/socialSignIn.ts`, per platform; its own test holds the rule
    expect(flat).toContain('const buttons = socialButtons(Platform.OS, auth.socialSignIn);');
    expect(flat).toContain('{buttons.applePanel ? ( <Button label="Continue with Apple"');
    expect(flat).toContain('{buttons.google ? ( <Button label="Continue with Google"');
    expect(flat).toContain('{buttons.appleSignInSide ? ( <Button label="Sign in with Apple"');
    expect(stripComments(read('../../auth/ProviderMarks.tsx'))).toMatch(/AppleMark/);
  });

  it('borrows the mark palette nowhere else', () => {
    const marks = stripComments(read('../../auth/ProviderMarks.tsx'));
    expect(marks).toContain("from './providerMarks.art'");
    expect(screen).not.toContain('providerMarks.art');
  });
});

/**
 * A BUTTON ONLY FOR A SIGN-IN THIS BUILD CAN FINISH (the launch review and the owner, 2026-09-27:
 * "add google, apple can be later"). The Supabase provider threw "not set up yet" for both while
 * AUTH drew both, and App Review rejects controls that do not work (2.1).
 */
describe('the provider buttons a real build draws', () => {
  it('draws every provider button behind what the provider can finish, and no "or" over nothing', () => {
    const panel = flat.indexOf('{buttons.anyOnPanel ? (');
    expect(panel, 'the panel is conditional').toBeGreaterThan(0);
    expect(flat.indexOf('<Meta>or</Meta>', panel)).toBeGreaterThan(panel);
    // no provider button is drawn unconditionally any more
    for (const label of ['Continue with Apple', 'Continue with Google', 'Sign in with Apple']) {
      const at = flat.indexOf(`<Button label="${label}"`);
      expect(flat.slice(Math.max(0, at - 40), at), label).toMatch(/\{buttons\.\w+ \? \( $/);
    }
    expect(screen).not.toContain('IS_IOS');
  });

  it('asks for the box before Apple or Google creates an account, and records it for the address it returns', () => {
    const oauth = flat.slice(flat.indexOf('const oauth = '), flat.indexOf('const notice = '));
    const box = oauth.indexOf('if (create && !agreed) return setError(CONSENT_FIRST);');
    const call = oauth.indexOf('await auth.signInWithGoogle()');
    const record = oauth.indexOf(
      'await savePendingTermsAcceptance(prefsStore, s.user.email, LEGAL_VERSION);',
    );
    const signedIn = oauth.indexOf('await actions.signedIn(s);');
    expect(oauth).toContain("which === 'apple' ? await auth.signInWithApple()");
    expect(box, 'the box first').toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(box);
    expect(record, 'the record once the account exists').toBeGreaterThan(call);
    expect(signedIn, 'and before the session is handed on').toBeGreaterThan(record);
  });

  it('says nothing when the parent closed Google’s page or said no on it', () => {
    expect(flat).toContain("if (err instanceof AuthFailure && err.code === 'cancelled') return;");
  });
});

/**
 * THE TERMS STEP (2026-09-27; `auth/terms-step.ts` decides who, `terms-step.test.ts` proves it):
 * an account Google made on the sign-in side had no recorded "yes", and a Terms version bump asked
 * nobody. This page shows its own checkbox to that one person, and nothing else happens until it is
 * ticked. Not a separate screen and not a phase — the owner deleted both on 2026-09-22.
 */
describe('the terms step: the sign-up page’s own checkbox, for whoever reached the app without it', () => {
  const step = flat.slice(flat.indexOf("if (termsStep !== 'none') return ("));
  const body = step.slice(0, step.indexOf('); return ( <Screen'));

  it('is this page, drawn when the context says so, with the very same box', () => {
    expect(flat).toContain("if (termsStep !== 'none') return (");
    expect(body).toContain('<Screen chrome={false} testID="auth">');
    // the same element the create side draws, not a copy of it
    expect(body).toContain('{consent}');
    expect(body).not.toContain('accessibilityRole="checkbox"');
  });

  it('says why in one line, over the box, and offers Continue', () => {
    expect(body).toContain(
      '<BodySm testID="auth.terms_step.line">{TERMS_STEP_LINE[termsStep]}</BodySm>',
    );
    const line = body.indexOf('auth.terms_step.line');
    const box = body.indexOf('{consent}');
    const go = body.indexOf('label="Continue"');
    expect(line).toBeGreaterThan(-1);
    expect(box).toBeGreaterThan(line);
    expect(go).toBeGreaterThan(box);
    expect(body).toContain('onPress={finish}');
  });

  it('refuses Continue until the box is ticked, and records it the way the create side does', () => {
    const finish = flat.slice(
      flat.indexOf('const finish = () =>'),
      flat.indexOf('const notice = '),
    );
    const refuse = finish.indexOf('if (!agreed) return setError(CONSENT_FIRST);');
    const record = finish.indexOf('await actions.agreeToTerms();');
    expect(refuse).toBeGreaterThan(-1);
    expect(record).toBeGreaterThan(refuse);
    // and in the context: the pending record the sign-up side writes, then accept_terms
    const ctx = stripComments(read('../../auth/AuthContext.tsx')).replace(/\s+/g, ' ');
    const agree = ctx.slice(ctx.indexOf('const agreeToTerms = useCallback('));
    const save = agree.indexOf(
      'await savePendingTermsAcceptance(prefsStore, email, LEGAL_VERSION);',
    );
    const held = agree.indexOf('setTermsTickedHere(pendingTermsKey(email));');
    const drain = agree.indexOf('await drainPendingTerms(s);');
    expect(save).toBeGreaterThan(-1);
    expect(held).toBeGreaterThan(save);
    expect(drain).toBeGreaterThan(held);
  });

  it('keeps one way out that is not agreeing — signing out, as Verify offers — and nothing else', () => {
    expect(body).toContain("onPress={() => void actions.signOut('local')}");
    for (const gone of ['auth.mode', 'auth.email', 'auth.oauth', 'auth.invite', 'auth.forgot'])
      expect(body, gone).not.toContain(gone);
  });

  it('is the only screen registered while it shows, and the phase under it is not a new one', () => {
    const nav = stripComments(read('../../app/navigation.tsx')).replace(/\s+/g, ' ');
    const gate = nav.slice(nav.indexOf("if (termsStep !== 'none') return ("));
    const tree = gate.slice(0, gate.indexOf('</Root.Navigator>'));
    expect(tree.match(/<Root\.Screen name="(\w+)"/g)).toEqual([
      '<Root.Screen name="Auth"',
      '<Root.Screen name="NewPassword"',
    ]);
    const ctx = read('../../auth/AuthContext.tsx');
    expect(ctx).toMatch(
      /export type Phase =\s*\|\s*'booting'\s*\|\s*'signed_out'\s*\|\s*'unverified'\s*\|\s*'onboarding'/,
    );
    expect(ctx).not.toMatch(/\|\s*'terms'/);
  });
});
