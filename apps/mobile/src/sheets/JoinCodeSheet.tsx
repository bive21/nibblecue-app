/**
 * SHEETS.joincode — "Join a household" (docs/ACCOUNTS.md §3.5, docs/AUTH_AND_TRIAL.md §2.1;
 * docs/DESIGN_SYSTEM.md §16.4): six boxes in two threes, paste-aware, sent on the sixth letter.
 *
 * SIX LETTERS FOR FIVE MINUTES (migration 0144; the owner, 2026-09-29: *"just make it alphabetical
 * with 6 digits, so 26^6 … maybe just 5 minutes"*), read out as two threes ("WDJ-BMA"), in any
 * case. AND A LINK PASTED HERE WORKS TOO (0140; the owner, the same day: *"Make sure the email
 * invite also works, and bypasses the need to enter 6 random digit"*): a link that would not open
 * the app — Expo Go opens only its own `exp://` links, and a message app may show any link as
 * plain text — can be copied and brought here. "Paste code or link" reads the clipboard once, on
 * the tap, and takes a code or a link, alone or inside the whole message Family sent. A paste
 * straight into the field (a keyboard's clipboard chip) is read the same way.
 *
 * WHAT IT DOES DEPENDS ON WHO IS HOLDING THE PHONE (the owner's report of 2026-09-29: *"the join
 * household button from sign in does not work … there was no text saying if i joined or not, or
 * even for me that i needed to sign up"*):
 *
 *   signed out   the code is CHECKED (`check_invite`, migration 0139) and the sheet turns into what
 *                the check said: whose household it is, who invited them, the seat, and that they
 *                need their own account — "Create an account to join", "Sign in to join". The
 *                invite is held on the phone (`auth/held-invite.ts`) as the token the server made
 *                in the code's place, which outlives the confirmation email. It used to hold a
 *                code unchecked and close with no word, over a notice drawn at the top of a page
 *                scrolled to its foot, so nothing on the screen changed: "does not work".
 *   no household the code JOINS, now (setup's "Invited? Use a code instead", Ended's "I have a new
 *                invite code"), and the account moves on to the confirmation (`JoinedScreen`); a
 *                refusal is said here, under the boxes.
 *   a household  there is nothing to type: one account holds one household for now (0139), so the
 *                sheet says so, names the household, and says what to do instead — and when nobody
 *                else is in it (0143), that is to leave it first: "Leave <name> first" opens
 *                Family's leave confirmation, in place of the second-account workaround.
 *
 * The client never learns why a code failed (ACCOUNTS.md §3.5); attempts left show from the third.
 * A form sheet, so no chrome and a heading of its own. The boxes are INPUTS on the solid surface
 * with the `line2` edge, the active box in the accent; the letters are values, in the mono face,
 * and the boxes size themselves to the phone's width so six always fit, each letter inside its box
 * at every text size (`joinCodeBoxes.ts`, measured in its test). The real field is a
 * hidden TextInput that owns focus and the keyboard (letters, capitals, no suggestions); the boxes
 * only show what it holds. The error line carries the alert role.
 */
import { BRAND } from '@nibblecue/brand';
import {
  INVITE_CODE_LENGTH,
  inviteCodeIn,
  isCompleteInviteCode,
  normalizeInviteCode,
  showAttemptsLeft,
} from '@nibblecue/core';
import { aloneIn, canJoinAnother } from '@nibblecue/core';
import {
  Body,
  BodySm,
  BodyStrong,
  BottomSheet,
  Button,
  Card,
  Numeric,
  SHEET_DURATION_MS,
  useTheme,
} from '@nibblecue/ui';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import type { RootParams } from '../app/types';
import { useAuth } from '../auth/AuthContext';
import { inviteTokenIn } from '../auth/inviteLink';
import { checkOutcomeOf, sheetModeOf } from '../auth/join';
import type { InvitePreview } from '../auth/providers/types';
import { checkRefusalSentence, failureSentence, INVITE_FAILED } from '../screens/auth/copy';
import { JOIN } from '../screens/auth/joinCopy';
import { BOX_EDGE, boxWidthFor, letterScaleCap } from './joinCodeBoxes';

/** Three boxes, a gap, three boxes: the code as it is read out. */
const GROUP = INVITE_CODE_LENGTH / 2;
const LINK_CONTEXT = { scheme: BRAND.urlScheme, host: BRAND.universalLinkHost };

/** What a paste or a keystroke brought: a link's token, a whole code, or letters so far. */
type Ask = { code: string } | { token: string };

/**
 * THE ROUTE'S OPTIONS: a see-through page that holds the app's own bottom sheet (the owner,
 * 2026-10-07, on Android: "it's a menu up page, but no corner edge and a line to let us know you
 * can drag it down"). The native form sheet drew a square-cornered full page there with no handle,
 * and its hidden field did not always bring the keyboard up. `BottomSheet` is the sheet every Quick
 * Entry is: rounded, a handle, dragged down to close, and lifted by the keyboard on both platforms.
 */
export const JOIN_SHEET_ROUTE = {
  presentation: 'transparentModal',
  animation: 'none',
  contentStyle: { backgroundColor: 'transparent' },
} as const;

/** The sheet around each of the page's three states; a close slides it away, then the route goes. */
function JoinSheetFrame({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <BottomSheet
      visible={open}
      title={title}
      onClose={onClose}
      bottomInset={insets.bottom}
      testID="joincode"
    >
      {children}
    </BottomSheet>
  );
}

export function JoinCodeSheet() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const { phase, api, actions, account } = useAuth();
  // in a family already, a second one joins below the limit (0153)
  const mode = sheetModeOf(phase, canJoinAnother(account));
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * SIGNED OUT, A CODE THAT CHECKED OUT: what the check said (`preview`), or `unchecked` when the
   * server had no check to make and the code was held as typed.
   */
  const [found, setFound] = useState<{ preview: InvitePreview | null } | null>(null);
  const input = useRef<TextInput>(null);
  const route = useRoute();
  const [open, setOpen] = useState(true);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );
  /** Close: the sheet slides down, then the page under it is back. */
  const close = () => {
    setOpen(false);
    setTimeout(() => {
      if (mountedRef.current && nav.canGoBack()) nav.goBack();
    }, SHEET_DURATION_MS + 20);
  };
  /**
   * A JOIN THAT LANDED TAKES THE SHEET WITH IT, wherever it is in the stack (the owner, 2026-10-07:
   * "i entered the code, then it asks for my name, and it just brought me back to join a
   * household"). The page that says "You joined" opens over this sheet, so the sheet is not on top
   * and `goBack` would close the wrong page; it is taken out by its own key instead.
   */
  const dropSheet = () => {
    if (!mountedRef.current) return;
    const state = nav.getState();
    if (!state.routes.some(r => r.key === route.key)) return;
    const routes = state.routes.filter(r => r.key !== route.key);
    // typed reset (as VerifyScreen): CommonActions.reset's payload is too wide for this prop's dispatch
    nav.reset({ ...state, routes, index: Math.max(0, routes.length - 1) });
  };
  /**
   * IN A HOUSEHOLD NOBODY ELSE IS IN (0143): the roster, read once the sheet opens, says whether
   * leaving it is the way through. Until it answers, or if it cannot, the sheet says what it always
   * said; the server counts again when they leave.
   */
  const [aloneHere, setAloneHere] = useState(false);
  const householdHere = account?.memberships[0]?.household_id;
  /** The family this account is a parent in, by name, or null: a parent's code elsewhere is refused (0153). */
  const parentHome =
    account?.memberships.find(m => m.role === 'OWNER' || m.role === 'PARENT')?.household_name ??
    null;
  /*
    …AND WHEN A PARENT'S INVITE IS REFUSED BECAUSE THEY ARE A PARENT ALREADY (0153 `admin_elsewhere`;
    the regression review, 2026-10-08): the second parent who set up their own household by mistake
    is offered the same way through, leave it first, rather than only "ask for a caregiver seat".
  */
  const [parentElsewhere, setParentElsewhere] = useState(false);
  useEffect(() => {
    if ((mode !== 'in_household' && !parentElsewhere) || householdHere === undefined) return;
    let live = true;
    void api
      .listMembers(householdHere)
      .then(members => {
        if (live) setAloneHere(aloneIn(members));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [mode, parentElsewhere, householdHere, api]);

  /* signed out: check, and hold what the check said */
  const check = async (ask: Ask) => {
    setBusy(true);
    setError(null);
    const origin = 'code' in ask ? 'code' : 'link';
    try {
      const outcome = checkOutcomeOf(await api.checkInvite(ask));
      if (outcome.kind === 'found') {
        await actions.holdInvite({ token: outcome.token }, { origin, preview: outcome.preview });
        setFound({ preview: outcome.preview });
        return;
      }
      if (outcome.kind === 'unchecked') {
        await actions.holdInvite(ask, { origin });
        setFound({ preview: null });
        return;
      }
      if (outcome.reason === 'wrong') setFailures(f => f + 1);
      // a link that no longer works is said as a link, not as letters to check
      setError(
        'token' in ask && outcome.reason === 'wrong'
          ? JOIN.refusal.link
          : checkRefusalSentence(outcome),
      );
      setCode('');
    } catch (err) {
      setError(failureSentence(err));
    } finally {
      setBusy(false);
    }
  };

  /* no household: join now; the account moves on to the confirmation when it lands */
  const join = async (ask: Ask) => {
    setBusy(true);
    setError(null);
    try {
      const outcome =
        'code' in ask
          ? await actions.joinWithCode(ask.code)
          : await actions.joinWithLink(ask.token);
      if (outcome === null || outcome.kind === 'in_household') return;
      if (outcome.kind === 'joined') {
        /* joined: the sheet goes, whether it is still on top (the account read that opens the
           household has not landed, and the page under it says so and tries again) or under the
           "You joined" page. When the phase changed or another family came on screen, the sheet
           went with the tree it was in, and there is nothing to take out. */
        dropSheet();
        return;
      }
      if (outcome.kind === 'refused') {
        setFailures(f => f + 1);
        setAttemptsLeft(outcome.attempts_left ?? null);
        setError(
          outcome.reason === 'own'
            ? JOIN.refusal.own
            : 'token' in ask
              ? JOIN.refusal.link
              : INVITE_FAILED,
        );
        setCode('');
        return;
      }
      setError(
        outcome.problem === 'offline'
          ? JOIN.refusal.offline
          : outcome.problem === 'rate_limited'
            ? JOIN.refusal.rateLimited
            : outcome.problem === 'codes_paused'
              ? JOIN.refusal.codesPaused
              : outcome.problem === 'needs_plus'
                ? JOIN.refusal.needsPlus('', null)
                : outcome.problem === 'unverified'
                  ? JOIN.refusal.unverified
                  : outcome.problem === 'household_limit'
                    ? JOIN.refusal.householdLimit
                    : outcome.problem === 'admin_elsewhere'
                      ? JOIN.refusal.parentElsewhere
                      : JOIN.refusal.failed,
      );
      setParentElsewhere(outcome.problem === 'admin_elsewhere');
    } finally {
      setBusy(false);
    }
  };

  const send = (ask: Ask) => void (mode === 'check' ? check(ask) : join(ask));

  const submit = (value: string) => {
    if (busy) return;
    if (!isCompleteInviteCode(value)) {
      setError(JOIN.sheet.incomplete);
      input.current?.focus();
      return;
    }
    send({ code: value });
  };

  const onChange = (raw: string) => {
    // the code is being sent: the boxes are locked, and what is in them is what goes
    if (busy) return;
    // a link pasted into the field itself (a keyboard's clipboard chip): the token, not its letters
    const token = inviteTokenIn(raw, LINK_CONTEXT);
    if (token !== null) {
      setCode('');
      setError(null);
      if (!busy) send({ token });
      return;
    }
    /*
      MORE LETTERS THAN A CODE AND ONE KEYSTROKE, AND NO CODE AMONG THEM: words pasted into the field,
      read as the Paste button reads them (0144). Every six-letter word is a well-formed code, so the
      first six letters of a sentence are never taken for one and sent, spending a try; the field
      keeps what it held and says it was not a code. Typing never gets here: the field holds six
      letters at most, and a key adds one.
    */
    if (
      inviteCodeIn(raw) === null &&
      raw.replace(/[^A-Za-z]/g, '').length > INVITE_CODE_LENGTH + 1
    ) {
      setError(JOIN.sheet.pasteNothing);
      return;
    }
    /*
      NEVER SENT BY THE LAST LETTER (the owner, 2026-10-08: "when finish typing the code, dont auto
      submit it, so that users can still change it if there is a typo"). The sixth letter fills the
      boxes and Join sends them; a code sent on its own spent one of five tries on a slip of a thumb.
    */
    setCode(normalizeInviteCode(raw));
    setError(null);
  };

  /*
    PASTE, ON THE TAP ONLY. The clipboard is read once, when the person asks — never on opening the
    sheet — so nothing they copied for something else is looked at, and iOS asks before it hands
    over what another app copied.
  */
  const paste = async () => {
    if (busy) return;
    const text = await Clipboard.getStringAsync().catch(() => '');
    if (text.trim() === '') {
      setError(JOIN.sheet.pasteEmpty);
      return;
    }
    const token = inviteTokenIn(text, LINK_CONTEXT);
    if (token !== null) {
      setCode('');
      send({ token });
      return;
    }
    /* A CODE ONLY IN A SHAPE A SENTENCE DOES NOT MAKE (core's `inviteCodeIn`): every six-letter word
       is a well-formed code now (0144), so the first six letters of whatever was copied are not a
       code to spend a try on. "see you at dinner" says it is not a code, not that SEEYOU was wrong. */
    const found = inviteCodeIn(text);
    if (found === null) {
      setError(JOIN.sheet.pasteNothing);
      return;
    }
    // in the boxes to check, and sent by Join, as a typed one is
    setCode(found);
    setError(null);
  };

  // six boxes in two threes, as the code is read out, sized so all six fit on a narrow phone
  const { width } = useWindowDimensions();
  const gap = t.space.sm;
  const groupGap = t.space.xl;
  const boxWidth = boxWidthFor(width, t.space);

  /*
    THE KEYBOARD, ONCE THE SHEET IS UP. The sheet slides in for `SHEET_DURATION_MS`, and a focus
    asked for while it moves can be dropped by the platform, so it is asked once the slide is done.
    A tap anywhere on the boxes is a tap on the field itself (it lies over them), which every phone
    answers with the keyboard.
  */
  useEffect(() => {
    if (mode === 'in_household' || found !== null) return;
    const id = setTimeout(() => input.current?.focus(), SHEET_DURATION_MS + 80);
    return () => clearTimeout(id);
  }, [mode, found]);

  /* ---------------------------------------------------------------- a household already */
  if (mode === 'in_household') {
    const current = account?.memberships[0]?.household_name ?? '';
    return (
      <JoinSheetFrame title={JOIN.inHousehold.title} open={open} onClose={close}>
        <View style={{ gap: t.space.lg }}>
          <Card tint={t.color.accentSoft} testID="joincode.in_household">
            <View style={{ gap: t.space.sm }}>
              <Body>{JOIN.inHousehold.body(current)}</Body>
              {aloneHere ? (
                <BodySm testID="joincode.alone">{JOIN.inHousehold.alone(current)}</BodySm>
              ) : (
                <BodySm>{JOIN.inHousehold.workaround}</BodySm>
              )}
            </View>
          </Card>
          {/* DOWN TO THE FAMILY PAGE UNDER THIS SHEET, with its leave confirmation up: `pop`, as the
            found sheet's buttons go back down to AUTH (React Navigation 7's `navigate` would push a
            second Family over the sheet) */}
          {aloneHere ? (
            <Button
              label={JOIN.inHousehold.leaveFirst(current)}
              variant="secondary"
              onPress={() => nav.navigate('Family', { confirmLeave: Date.now() }, { pop: true })}
              testID="joincode.leave_first"
            />
          ) : null}
          <Button
            label={JOIN.inHousehold.close}
            variant={aloneHere ? 'ghost' : 'secondary'}
            onPress={close}
            testID="joincode.close"
          />
        </View>
      </JoinSheetFrame>
    );
  }

  /* ---------------------------------------------------------------- signed out, a code that checked out */
  if (found !== null) {
    const p = found.preview;
    return (
      <JoinSheetFrame title={JOIN.sheet.title} open={open} onClose={close}>
        <View style={{ gap: t.space.lg }}>
          <Card tint={t.color.accentSoft} testID="joincode.found">
            <View style={{ gap: t.space.sm }}>
              {/* announced when it appears: it replaces the boxes the person just filled */}
              <BodyStrong accessibilityLiveRegion="polite" testID="joincode.found.title">
                {JOIN.found.title(p?.household_name ?? '')}
              </BodyStrong>
              {p ? (
                <Body testID="joincode.found.invited">
                  {JOIN.found.invited(p.inviter_name, p.role)}
                </Body>
              ) : null}
              {p && p.seat_hours !== null ? (
                <BodySm testID="joincode.found.seat">{JOIN.found.seat(p.seat_hours)}</BodySm>
              ) : null}
              <BodySm testID="joincode.found.account">
                {p ? JOIN.found.needAccount : JOIN.found.unchecked}
              </BodySm>
            </View>
          </Card>
          {/* BACK DOWN TO THE AUTH UNDER THIS SHEET, on the side the button names. `pop`, because
            React Navigation 7's `navigate` PUSHES a route that is in the stack but not on top: a
            second sign-in page over the sheet (`app/backToTabs.ts` has the story). */}
          <Button
            label={JOIN.found.create}
            onPress={() => nav.navigate('Auth', { mode: 'create', at: Date.now() }, { pop: true })}
            testID="joincode.found.create"
          />
          <Button
            label={JOIN.found.signIn}
            variant="secondary"
            onPress={() => nav.navigate('Auth', { mode: 'signin', at: Date.now() }, { pop: true })}
            testID="joincode.found.signin"
          />
          <Button
            label={JOIN.found.different}
            variant="ghost"
            onPress={() => {
              setFound(null);
              setCode('');
              setError(null);
            }}
            testID="joincode.found.different"
          />
        </View>
      </JoinSheetFrame>
    );
  }

  /* ---------------------------------------------------------------- the six boxes */
  return (
    <JoinSheetFrame title={JOIN.sheet.title} open={open} onClose={close}>
      <View style={{ gap: t.space.lg }}>
        <BodySm>{JOIN.sheet.lede}</BodySm>
        {/* A PARENT ALREADY: the one-family rule before the code is typed, not after it fails */}
        {parentHome !== null ? (
          <BodySm testID="joincode.parent_rule">{JOIN.sheet.parentRule(parentHome)}</BodySm>
        ) : null}
        <Pressable
          accessibilityRole="none"
          onPress={() => input.current?.focus()}
          // LOCKED WHILE IT IS BEING SENT (the owner, 2026-10-08): nothing typed or tapped changes
          // the code on its way, and the boxes say so by going quiet
          disabled={busy}
          accessibilityState={{ disabled: busy }}
          style={[
            styles.boxes,
            { gap: groupGap, marginVertical: t.space.md, opacity: busy ? 0.5 : 1 },
          ]}
          testID="joincode.boxes"
        >
          {[0, 1].map(group => (
            <View key={group} style={[styles.group, { gap }]}>
              {Array.from({ length: GROUP }, (_, j) => {
                const i = group * GROUP + j;
                return (
                  <View
                    key={i}
                    style={[
                      styles.box,
                      {
                        width: boxWidth,
                        minHeight: t.hit.primary,
                        borderRadius: t.radius.s,
                        backgroundColor: t.color.surfaceSolid,
                        borderColor: i === code.length ? t.color.accent : t.color.line2,
                      },
                    ]}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    {/* as large as the phone's text size asks, short of crossing the box's edge */}
                    <Numeric
                      variant="statValue"
                      maxFontSizeMultiplier={letterScaleCap(boxWidth, t.type.statValue.fontSize)}
                    >
                      {code[i] ?? ''}
                    </Numeric>
                  </View>
                );
              })}
            </View>
          ))}
          {/* THE FIELD LIES OVER THE BOXES, unseen, so a tap on them is a tap on it (2026-10-07:
            a 1-point field focused from code did not bring the keyboard up on a Samsung).
            LETTERS, CAPITALS, NO SUGGESTIONS: Android's password keyboard is the one that offers no
            words to "correct" a code into, and iOS's ASCII keyboard has no emoji to wander into. No
            length cap: a pasted message is read for its link or code (`onChange`), never cut off. */}
          <TextInput
            ref={input}
            value={code}
            onChangeText={onChange}
            editable={!busy}
            accessibilityLabel={JOIN.sheet.field}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            importantForAutofill="no"
            keyboardType={Platform.OS === 'android' ? 'visible-password' : 'ascii-capable'}
            caretHidden
            selectionColor="transparent"
            style={[styles.field, { color: 'transparent' }]}
            testID="joincode.input"
          />
        </Pressable>
        {/* the error is the app's one error line (BodySm crit, docs/DESIGN_SYSTEM.md §4.1), the
          size of the attempts line under it */}
        {error ? (
          <BodySm
            ink="crit"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            testID="joincode.error"
          >
            {error}
          </BodySm>
        ) : null}
        {parentElsewhere && aloneHere && householdHere !== undefined ? (
          <>
            <BodySm testID="joincode.alone">
              {JOIN.inHousehold.alone(account?.memberships[0]?.household_name ?? '')}
            </BodySm>
            <Button
              label={JOIN.inHousehold.leaveFirst(account?.memberships[0]?.household_name ?? '')}
              variant="secondary"
              onPress={() => nav.navigate('Family', { confirmLeave: Date.now() }, { pop: true })}
              testID="joincode.leave_first"
            />
          </>
        ) : null}
        {showAttemptsLeft(failures) && attemptsLeft !== null ? (
          <BodySm testID="joincode.attempts">
            <Numeric variant="bodySm" ink="text2">
              {attemptsLeft}
            </Numeric>
            {attemptsLeft === 1 ? ' attempt left' : ' attempts left'}
          </BodySm>
        ) : null}
        {/* ALWAYS PRESSABLE (a control that does nothing when tapped teaches a parent the app is
          broken): short of six letters it says so. It is the one thing that sends a code */}
        <Button
          label={mode === 'check' ? JOIN.sheet.check : JOIN.sheet.join}
          onPress={() => submit(code)}
          loading={busy}
          testID="joincode.submit"
        />
        <Button
          label={JOIN.sheet.paste}
          variant="secondary"
          onPress={() => void paste()}
          testID="joincode.paste"
        />
        <Button
          label={JOIN.sheet.cancel}
          variant="ghost"
          onPress={close}
          testID="joincode.cancel"
        />
        <BodySm>{JOIN.sheet.footnote}</BodySm>
      </View>
    </JoinSheetFrame>
  );
}

const styles = StyleSheet.create({
  boxes: { flexDirection: 'row', justifyContent: 'center' },
  group: { flexDirection: 'row' },
  box: { borderWidth: BOX_EDGE, alignItems: 'center', justifyContent: 'center' },
  // over the boxes, nearly clear: a field at opacity 0 is skipped by some phones' touch handling
  field: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.011,
    fontSize: 1,
  },
});
