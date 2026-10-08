/**
 * `phase: 'ended'` — an account that belongs to no household, HAVING BELONGED TO ONE.
 *
 * A temporary caregiver whose evening ran out (`household_members.expires_at`, migration 0101),
 * or anyone an owner removed. Both used to land in setup, and a babysitter opening CuddleCue the
 * morning after was asked for a baby's name and date of birth — nothing was broken, but it reads
 * as though the account was wiped (the owner, 2026-09-22). `core/accounts/standing.ts` holds the
 * words and says how the two readings are told apart.
 *
 * AND THE LAST PERSON IN A HOUSEHOLD WHO LEFT IT (migration 0143, 2026-09-29): Family's "Leave
 * household" closes it and lands here, where a signed-in person with no household lands. The page
 * then says what happened — they left it, nobody else was in it, it is kept until its purge date —
 * rather than that their time ran out, and "Bring back <name>" opens it again until that date
 * (`auth/leave.ts`). The button stays on this page whenever the household this account closed can
 * still come back, whichever household the page is about.
 *
 * AND SOMEBODY WHO LEFT THEIR ONLY FAMILY THEMSELVES (2026-10-08): a caregiver, a viewer or a
 * parent who used Family's "Leave <family>". The device marked its memory of the family as left
 * (`auth/leave.ts` `rememberLeaving`), so the page says "You left Lee's family" and that their
 * entries stay with it (core `endedReading`, `ENDED.left`), rather than that their time ran out.
 * The same three ways on. A removal and a seat that ran out keep the ordinary words.
 *
 * SIGNED OUT CHROME, because there is no household to put a top bar over (§14) — the same lit
 * ground and single `Sheet` as verify and the setup steps, so this reads as part of the same
 * room rather than an error page.
 *
 * THREE WAYS ON, in the order a person in this position wants them. The code sheet comes FIRST:
 * a sitter invited back for another evening should not have to sign out to get in, and a partner
 * who left a household set up by mistake has somebody else's code in hand.
 */
import { BodySm, BodyStrong, Button, Card, StepHeader } from '@nibblecue/ui';
import { ENDED, endedReading } from '@nibblecue/core';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Screen } from '../../app/Screen';
import type { RootParams } from '../../app/types';
import { useAuth } from '../../auth/AuthContext';
import { keptUntilLabel, restorable, type LeftHousehold } from '../../auth/leave';
import { useToast } from '../../ui/toast';
import { FormError, Group, Sheet } from '../first-run/Sections';
import { LEAVE } from '../more/leaveCopy';

export function EndedScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const { lastHousehold, actions, heldInvite, inviteLapse, joinNote, leftHousehold } = useAuth();
  const toast = useToast();
  /*
    AN INVITE ARRIVING HERE IS SENT, AND SHOWN BEING SENT (2026-09-29): a link opened on Ended, or a
    code held on the first screen by somebody whose evening had ended. The account has no household,
    so the join goes on its own (`AuthContext`'s auto-join); the join page is where it is shown, and
    where anything that stops it is said. Its "Not now" comes back here.
  */
  const pending = heldInvite !== null || inviteLapse !== null || joinNote?.kind === 'joined';
  /* only from the front: with the code sheet open over this page, a join lands there first, and the
     sheet closes onto this page when there is still something to show (`JoinCodeSheet`) */
  const focused = useIsFocused();
  useEffect(() => {
    if (pending && focused) nav.navigate('Onboarding');
  }, [pending, focused, nav]);

  /*
    THE HOUSEHOLD THIS ACCOUNT CLOSED, while it can still come back (0143), and whether it is the
    one this page is about: the household this phone was showing when it left.
  */
  const left = restorable(leftHousehold, Date.now()) ? leftHousehold : null;
  const leftHere: LeftHousehold | null =
    left !== null && (lastHousehold === null || lastHousehold.id === left.id) ? left : null;
  /* LEFT IT THEMSELVES (2026-10-08): the device's own mark on the family last shown */
  const leftSeat = leftHere === null && endedReading(lastHousehold) === 'left';
  const lastName = lastHousehold?.name ?? '';
  const [restoring, setRestoring] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const bringBack = async () => {
    if (left === null || restoring) return;
    setRestoring(true);
    setProblem(null);
    const outcome = await actions.restoreHousehold();
    // back: the account read lists it again, the phase turns `ready`, and this page goes
    if (outcome.kind === 'restored') {
      toast.show(LEAVE.ended.restored(outcome.household_name || left.name));
      return;
    }
    setRestoring(false);
    // it can no longer come back: the phone lets go of it, and when this page was about it the page
    // goes too (onto setup), so it is said where it outlives the page
    if (outcome.kind === 'gone') {
      toast.show(LEAVE.ended.gone);
      return;
    }
    setProblem(
      outcome.kind === 'in_household'
        ? LEAVE.ended.inHousehold
        : outcome.kind === 'offline'
          ? LEAVE.ended.offline
          : LEAVE.ended.failed,
    );
  };

  return (
    <Screen chrome={false} testID="ended">
      <Sheet>
        <StepHeader
          icon="home"
          eyebrow="Your household"
          title={
            leftHere !== null
              ? LEAVE.ended.title(leftHere.name)
              : leftSeat
                ? ENDED.left.title(lastName)
                : ENDED.title(lastHousehold?.name ?? '')
          }
        />
        <Group gap="sm">
          <BodySm testID="ended.body">
            {leftHere !== null ? LEAVE.ended.body : leftSeat ? ENDED.left.body : ENDED.body}
          </BodySm>
        </Group>

        {/* THE FEAR, ANSWERED BEFORE IT IS ASKED. Somebody who logged for a household all
            evening wants to know where those entries went before they want a button. */}
        <Group gap="sm">
          <BodyStrong testID="ended.kept">
            {leftHere !== null ? LEAVE.ended.keptTitle : ENDED.keptTitle}
          </BodyStrong>
          <BodySm>
            {leftHere !== null
              ? LEAVE.ended.kept(keptUntilLabel(leftHere.purge_at))
              : leftSeat
                ? ENDED.left.keptBody(lastName)
                : ENDED.keptBody}
          </BodySm>
        </Group>

        {/* THE WAYS ON, ON ONE PANEL (2026-09-30), with the one thing that can go wrong on this
            page, a household that could not be brought back, said over them on the card: the
            app's one error line (`FormError`) needs a card under it on this ground. Sign out,
            which leaves, stays under the panel. */}
        <Card>
          <Group gap="sm">
            {problem !== null ? <FormError testID="ended.problem">{problem}</FormError> : null}
            <Button
              label={ENDED.joinLabel}
              accessibilityHint={ENDED.joinHint}
              onPress={() => nav.navigate('JoinCode')}
              testID="ended.join"
            />
            {left !== null ? (
              <Button
                label={LEAVE.ended.restore(left.name)}
                accessibilityHint={LEAVE.ended.restoreHint}
                variant="secondary"
                loading={restoring}
                onPress={() => void bringBack()}
                testID="ended.restore"
              />
            ) : null}
            <Button
              label={ENDED.startLabel}
              accessibilityHint={ENDED.startHint}
              variant="secondary"
              onPress={() => nav.navigate('Onboarding')}
              testID="ended.start"
            />
          </Group>
        </Card>
        <Button
          label={ENDED.signOutLabel}
          variant="ghost"
          onPress={() => void actions.signOut('local')}
          testID="ended.sign_out"
        />
      </Sheet>
    </Screen>
  );
}
