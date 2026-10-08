/**
 * SHEETS.signout (docs/ACCOUNTS.md §3.7–3.8; docs/AUTH_AND_TRIAL.md §5 "Sessions": sign out is
 * two taps from the avatar — the account popover, then this sheet): the signed-in email, the
 * household, the unsynced count when there is one, and three exits — this device, all devices,
 * a different account. Every one of them runs the same twelve-step teardown. A form sheet, so
 * no chrome and a heading of its own. The count of unsynced entries is a number through
 * Numeric. Deleting the account is a separate page under Account & privacy, and the hint says
 * where, now that More no longer holds it (§14).
 *
 * THE COUNT IS REAL NOW (WP4.9). It is `pending + sending + failed` — every row the server has
 * not accepted, which is exactly what teardown step 3 quarantines — read from the live snapshot
 * and re-read once on open, because a sheet that opened on a stale zero would be the one screen
 * in the app that lies about whether anything is still owed. When there is something owed, §3.7
 * reorders the sheet: `Try to sync now` becomes the primary action and `Sign out` steps back to
 * secondary. Nothing is blocked either way — signing out with a queue is safe, because the
 * entries are quarantined and replayed on the next sign-in as the same rows (§6.3) — but the
 * order of the buttons is the sheet saying which one it would pick.
 */
import { Body, BodySm, Button, Card, H1, Numeric, useTheme } from '@nibblecue/ui';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '../app/Screen';
import { useAuth } from '../auth/AuthContext';
import { syncRuntime, unsyncedCount, useSyncStatus } from '../sync/status';
import { useToast } from '../ui/toast';

export function SignOutSheet() {
  const t = useTheme();
  const nav = useNavigation();
  const { session, account, actions } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const household = account?.memberships[0];
  const queue = useSyncStatus();
  const unsynced = unsyncedCount(queue);

  // The worker pushes a snapshot on every pass; a sheet opened between passes would show the
  // last one. One re-read on mount costs a count query and makes the number current.
  useEffect(() => {
    void syncRuntime()?.refresh();
  }, []);

  const go = async (scope: 'local' | 'global' | 'switch') => {
    setBusy(scope);
    await actions.signOut(scope);
    toast.show(scope === 'global' ? 'Signed out on all devices' : 'Signed out');
  };

  const trySync = async () => {
    setBusy('sync');
    try {
      await syncRuntime()?.flush('manual');
      await syncRuntime()?.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen chrome={false} testID="signout">
      <H1 style={{ marginTop: t.space.lg }}>Sign out</H1>
      <Card>
        <View style={{ gap: t.space.xs }}>
          <Body testID="signout.email">{session?.user.email ?? ''}</Body>
          {household ? (
            <BodySm testID="signout.household">{household.household_name}</BodySm>
          ) : null}
          {unsynced > 0 ? (
            <BodySm testID="signout.unsynced">
              <Numeric variant="bodySm" ink="text2">
                {unsynced}
              </Numeric>
              {unsynced === 1 ? ' entry has not synced yet.' : ' entries have not synced yet.'}
            </BodySm>
          ) : null}
        </View>
      </Card>
      {unsynced > 0 ? (
        <Button
          label="Try to sync now"
          onPress={() => void trySync()}
          loading={busy === 'sync'}
          testID="signout.trysync"
        />
      ) : null}
      <Button
        label="Sign out"
        variant={unsynced > 0 ? 'secondary' : 'primary'}
        onPress={() => void go('local')}
        loading={busy === 'local'}
        testID="signout.local"
      />
      <Button
        label="Sign out on all devices"
        variant="secondary"
        onPress={() => void go('global')}
        loading={busy === 'global'}
        testID="signout.global"
      />
      <Button
        label="Sign in to a different account"
        variant="secondary"
        onPress={() => void go('switch')}
        loading={busy === 'switch'}
        testID="signout.switch"
      />
      <Button label="Cancel" variant="ghost" onPress={() => nav.goBack()} testID="signout.cancel" />
      <BodySm>
        {unsynced > 0
          ? 'Unsynced entries are kept on this phone and finish syncing when you sign back in with this email. '
          : ''}
        Signing out never deletes anything. Your household keeps every entry, and the other
        caregivers stay signed in unless you sign out everywhere. Deleting the account is separate,
        under Account & privacy.
      </BodySm>
    </Screen>
  );
}
