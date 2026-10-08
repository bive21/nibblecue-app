/**
 * Account & privacy (docs/DESIGN_SYSTEM.md §14: everything account-shaped lives behind the
 * avatar and nowhere else; docs/AUTH_AND_TRIAL.md §5 "Sessions"; docs/PRICING.md §4b): one
 * page for the email, the name (a sheet, the name the household sees), the password, the data, the policy, the deletion and — last, and
 * since 2026-09-26 the only place they are — both sign-outs. "Sign out everywhere" is the remote
 * revoke; plain sign out goes to the sheet that says what it will do first.
 *
 * The free download sits ABOVE the paid export and is never harder to find than it: the full
 * download is a legal duty on every plan (GDPR Art. 20 with Art. 12), and choosing a range,
 * one child or a PDF is the convenience Plus sells. Both rows open a sheet that does the thing;
 * the paid one looks gated before the tap while it is locked — a lock glyph and one line saying
 * which plan includes it — and that tap opens the gate rather than changing anything.
 *
 * THE ORDER OF THOSE TWO ROWS IS LOAD-BEARING, not a layout preference, and `chooseExport.test.ts`
 * reads this file to prove it: the free download is first, it carries no lock, no gate and no
 * plan check, and its detail line says "on every plan" without being asked. A build where the
 * paid row came first, or where the free one grew a condition, would be a build that sells a
 * right back to the person who already has it.
 *
 * The paid row's detail line names the three things this build actually does. Emailing it is on
 * the plan matrix and is NOT here: it needs a sending address on a domain whose mail is not set
 * up (CLAUDE.md §8), and rule 11 says to stop rather than invent a credential — so the row
 * promises what exists and the sheet says the rest out loud.
 *
 * Deleting is a 14-day window said out loud; the danger is carried by the
 * trash glyph in the status hue AND the words, never the color alone — on the neutral chip
 * (`surface2`), because category tints belong to categories (DESIGN_SYSTEM.md §11).
 *
 * Why "Sign out everywhere" refuses to run offline: the teardown (auth/teardown.ts) treats a
 * failed server revoke as one more step that did not run — it keeps going, signs this device
 * out, and never retries the revoke — so offline it would be a plain local sign-out wearing
 * the wrong name, and "Signed out on all devices" would be false on the one night it matters
 * (AUTH_AND_TRIAL.md §5: sign-out revokes on the server). The row says it needs a connection
 * before the tap, and the tap says so again instead of pretending.
 *
 * Online, it asks first, with no undo behind it: the app's own confirmation, mounted on this page
 * (`useConfirm`; it was the phone's own dialog until 2026-09-29, when the owner saw Android's and
 * asked why it did not follow the app's design).
 *
 * THE PICTURE LEADS THE PAGE (the owner, 2026-09-30; migration 0148): the first row is the person's
 * own picture, drawn as the top bar draws it, and it opens the sheet that changes it (a photo, a
 * drawing, or the initial). The top bar's profile button is the door here, so the picture a person
 * taps to arrive is the first thing they can change.
 */
import { BRAND } from '@nibblecue/brand';
import { Row, Rows, SectionHeader, useTheme } from '@nibblecue/ui';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { Screen } from '../../app/Screen';
import type { RootParams } from '../../app/types';
import { useAuth } from '../../auth/AuthContext';
import { useMemberPictures } from '../../household/MemberPictures';
import { DownloadSheet } from '../../sheets/account/DownloadSheet';
import { MemberPictureSheet } from '../../sheets/account/MemberPictureSheet';
import { NameSheet } from '../../sheets/account/NameSheet';
import { MEMBER_PICTURE_COPY } from '../../sheets/account/pictureCopy';
import { useConfirm } from '../../ui/confirm';
import { useToast } from '../../ui/toast';

/** Sign out everywhere's question: every device, this one too, and nothing to undo it with. */
const SIGN_OUT_EVERYWHERE = {
  title: 'Sign out everywhere?',
  body: 'Every device, including this one, will be signed out.',
  action: 'Sign out everywhere',
  cancel: 'Cancel',
  destructive: true,
} as const;

export function AccountScreen() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const { session, account, actions, online, auth } = useAuth();
  const toast = useToast();
  const confirm = useConfirm('account.confirm');
  const [busy, setBusy] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [pictureOpen, setPictureOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const pictures = useMemberPictures();

  const email = session?.user.email ?? account?.profile?.email ?? '';
  // null until we know. An OAuth-only account with no email has nothing to change.
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void auth
      .hasPassword()
      .then(has => {
        if (live) setHasPassword(has);
      })
      .catch(() => {
        if (live) setHasPassword(true);
      });
    return () => {
      live = false;
    };
  }, [auth]);
  const showPassword = hasPassword !== false || email !== '';
  const name = account?.profile?.display_name ?? '';

  const signOutEverywhere = async () => {
    if (busy) return;
    if (!online) {
      toast.show("Signing out everywhere needs a connection. Try again when you're back online.");
      return;
    }
    // every device, including this one, with no undo: it asks first, as the sign-out sheet does
    if (!(await confirm.ask(SIGN_OUT_EVERYWHERE))) return;
    setBusy(true);
    void actions
      .signOut('global')
      .then(() => toast.show('Signed out on all devices'))
      .finally(() => setBusy(false));
  };

  return (
    <Screen title="Account & privacy" testID="account">
      <Rows>
        <Row
          title={MEMBER_PICTURE_COPY.row}
          detail={
            pictures.myChoice.kind === 'photo'
              ? MEMBER_PICTURE_COPY.rowPhoto
              : pictures.myChoice.kind === 'drawing'
                ? MEMBER_PICTURE_COPY.rowDrawing
                : MEMBER_PICTURE_COPY.rowInitial
          }
          avatar={{ name, ...(pictures.mine !== null ? { photoUri: pictures.mine } : {}) }}
          onPress={() => setPictureOpen(true)}
          accessibilityHint={MEMBER_PICTURE_COPY.rowHint}
          testID="account.picture"
        />
        <Row title="Email" detail={email} right="none" testID="account.email" />
        <Row
          title="Name"
          detail={name}
          onPress={() => setNameOpen(true)}
          accessibilityHint="Change the name your household sees"
          testID="account.name"
        />
        {showPassword ? (
          <Row
            title="Change password"
            onPress={() => nav.navigate('NewPassword')}
            testID="account.password"
          />
        ) : null}
      </Rows>

      <SectionHeader title="Your data" />
      <View style={{ gap: t.space.sm }}>
        <Rows>
          <Row
            title="Download everything"
            detail="JSON and CSV of everything ever logged, on every plan"
            icon="export"
            onPress={() => setDownloadOpen(true)}
            testID="account.download"
          />
        </Rows>
        {/* The pediatrician summary, NibbleCue's printable export, is on More (NibbleCue Plus);
            CuddleCue's range and PDF export is CuddleCue's. */}
      </View>

      {/* CuddleCue's "who can see my pumping" switch is not here: NibbleCue logs no private entry,
          and a parent changes that sharing where the entries are made, in CuddleCue. */}

      <SectionHeader title="Privacy" />
      <Rows>
        <Row
          title="Privacy policy"
          onPress={() => void Linking.openURL(BRAND.privacyPolicyUrl)}
          testID="account.privacy"
        />
        <Row
          title="Delete account"
          detail="A 14-day window, then everything is gone"
          icon="trash"
          tint={{ fg: t.color.crit, soft: t.color.surface2 }}
          onPress={() => nav.navigate('DeleteAccount')}
          testID="account.delete"
        />
      </Rows>

      {/* SIGN OUT IS THE LAST THING ON THE PAGE, AND ONLY HERE (the owner, 2026-09-26: "logout
          should be there, it should be in account privacy. logging out is not something user
          will do a lot, keep it inside this page instead"). It left the avatar's menu, where it
          was one of four rows a parent read past every time they opened it for Plan. At the foot
          of this page it is still two taps from the avatar and one more to the sheet that says
          what it will do; the two sign-outs stay side by side, as they always were here. */}
      <Rows testID="account.signouts">
        <Row title="Sign out" onPress={() => nav.navigate('SignOut')} testID="account.signout" />
        <Row
          title="Sign out everywhere"
          detail={
            online
              ? 'Every device, including this one'
              : 'Every device, including this one · needs a connection'
          }
          onPress={() => void signOutEverywhere()}
          disabled={busy}
          right="none"
          testID="account.signout_all"
        />
      </Rows>

      <MemberPictureSheet visible={pictureOpen} onClose={() => setPictureOpen(false)} />
      <NameSheet visible={nameOpen} onClose={() => setNameOpen(false)} />
      <DownloadSheet visible={downloadOpen} onClose={() => setDownloadOpen(false)} />
      {confirm.element}
    </Screen>
  );
}
