/**
 * Delete account (docs/SECURITY.md §9, docs/ACCOUNTS.md §7; docs/DESIGN_SYSTEM.md §12 rule 3).
 * Ownership is resolved first, the store subscription is stated plainly and linked — never
 * implied to be canceled here — and a typed confirmation plus a fresh password stand in for the
 * re-auth. Fourteen days of undo by signing back in, said out loud. Reached from Account &
 * privacy behind the avatar (§14), as a pushed page with Back and a heading.
 *
 * The confirm is the `danger` variant: the danger FILL token behind the label, never the crit
 * text ink as a background, and the words carry the meaning. The store links are the
 * platforms' own subscription pages, not brand URLs, and are the one place a URL is written
 * here on purpose. The error line carries the alert role.
 *
 * THE CONFIRMATION IS ONE CARD (2026-09-30): the typed word, the password, the error and the one
 * destructive button, with Keep my account under it. The error was a boxed banner, because crit
 * ink bare on this page's ground fails the contrast floor; it is the app's one error line now
 * (the owner's rule 4, docs/DESIGN_SYSTEM.md §4.1), so it sits on the form's card instead.
 */
import { ACCOUNT_DELETION } from '@nibblecue/brand';
import { BodySm, Button, Card, Input, useTheme } from '@nibblecue/ui';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { Screen } from '../../app/Screen';
import type { RootParams } from '../../app/types';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../ui/toast';
import { failureSentence } from '../auth/copy';
import { FormError } from '../first-run/Sections';

const STORE_SUBSCRIPTIONS =
  Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';

export function DeleteAccountScreen() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const { account, api, auth, session, actions } = useAuth();
  const toast = useToast();
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const household = account?.memberships[0];
  const ownsShared = household?.role === 'OWNER';

  const confirm = async () => {
    if (typed.trim().toLowerCase() !== 'delete') return setError('Type delete to confirm.');
    setBusy(true);
    setError(null);
    try {
      if (password && session?.user.email)
        await auth.signInWithPassword(session.user.email, password); // the fresh login
      const r = await api.requestAccountDeletion();
      if (!r.ok) {
        if (r.error === 'transfer_or_delete_household_first')
          return setError(
            'You own a household with other people in it. Make someone else the owner first, under Family.',
          );
        return setError('Could not request the deletion. Try again.');
      }
      const when = new Date(r.purge_at).toLocaleDateString();
      await actions.signOut('deletion');
      toast.show(`Account scheduled for deletion on ${when}. Sign in before then to keep it.`);
    } catch (err) {
      setError(failureSentence(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Delete account" testID="delete">
      {/* the same words as the website's deletion page, which Play asks for (@nibblecue/brand) */}
      <BodySm>{ACCOUNT_DELETION.what}</BodySm>
      {ownsShared ? (
        <BodySm testID="delete.owner_hint">{ACCOUNT_DELETION.ownerFirst}</BodySm>
      ) : null}
      <Card testID="delete.store">
        <View style={{ gap: t.space.sm }}>
          <BodySm>{ACCOUNT_DELETION.store}</BodySm>
          <Button
            label="Manage the subscription in the store"
            variant="secondary"
            onPress={() => void Linking.openURL(STORE_SUBSCRIPTIONS)}
            testID="delete.store.button"
          />
        </View>
      </Card>
      <Card>
        <View style={{ gap: t.space.lg }}>
          <Input
            label="Type delete to confirm"
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="none"
            autoCorrect={false}
            testID="delete.typed"
          />
          <Input
            label="Your password (if you have one)"
            value={password}
            onChangeText={setPassword}
            secure
            autoCapitalize="none"
            textContentType="password"
            testID="delete.password"
          />
          {/* On the card, never bare on the page: the lit ground sits behind every screen, and
              crit ink directly on it measures 4.39:1 in the slate scheme under glass. */}
          {error ? <FormError testID="delete.error">{error}</FormError> : null}
          <Button
            label="Delete my account"
            variant="danger"
            onPress={() => void confirm()}
            loading={busy}
            testID="delete.confirm"
          />
        </View>
      </Card>
      <Button
        label="Keep my account"
        variant="ghost"
        onPress={() => nav.goBack()}
        testID="delete.cancel"
      />
    </Screen>
  );
}
