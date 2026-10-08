/**
 * FAMILY'S "LEAVE <FAMILY>" FOR A CAREGIVER OR A VIEWER (the verification sweep of 2026-10-08;
 * `auth/leave.ts` `leaveSeat`).
 *
 * The limit's sentence and the five-families sheet both say "leave one first, from Family in
 * More", and until now Family offered Leave only to somebody alone in the family (0143,
 * `LeaveHouseholdSection`). A caregiver or a viewer in a family its parents are still in had no way
 * out but asking a parent to remove them.
 *
 *   WHEN   the person's seat here is a caregiver's, a viewer's or (since the owner's "build
 *          everything" of 2026-10-08) a parent's (`canLeaveSeat`), and somebody else is in the
 *          family. Alone, `LeaveHouseholdSection` draws its own row instead.
 *   OWNER  never a dead control: the owner's row says "Make someone else the owner first" and opens
 *          the one way on, Family's own "Make owner" for each person with a lasting seat
 *          (`onMakeOwner`, which asks first). Handed on, they are a parent and the row is Leave.
 *          `auth/leave.ts` `canLeaveSeat` has the rule and why it is the cheapest reversible one.
 *   HOW    a quiet row in the group Join another household is in, the crit glyph on the neutral
 *          chip, as Leave's own row is drawn, and a confirmation IN THE PAGE under it: it names the
 *          family, says what they stop seeing, says their entries stay in its log, and offers one
 *          destructive button and Cancel.
 *   THEN   `actions.leaveSeat()`: what the phone owes the family is sent first, the seat is ended,
 *          and the family leaves the phone the way a removal does: its file, sync and reminders go,
 *          and the next family they are in comes on screen (or Ended, with none left, in its "You
 *          left" words).
 *   ON     a person on for the family (who's on) is asked first, in the card, as the switcher asks:
 *          "You're on for Lee's family until 2:00 AM. Leave anyway?" A yes hands the shift back
 *          (`household/switchDuty.ts`) and leaves; Cancel changes nothing.
 */
import { clockText, type Role } from '@nibblecue/core';
import { BodySm, BodyStrong, Body, Button, Card, Row, Rows, useTheme } from '@nibblecue/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { mustHandOnFirst, type SeatLeaveOutcome } from '../../auth/leave';
import type { MemberRow } from '../../auth/providers/types';
import type { OnDuty } from '../../household/switchDuty';
import { SWITCH } from '../../household/switchCopy';
import { deviceClock24 } from '../../sheets/quick/prefs';
import { useTimeZone } from '../../time/useZone';
import { LEAVE } from './leaveCopy';

/** What a seat leave that did not happen says, where it was asked for. */
export function seatLeaveProblemSentence(
  outcome: Exclude<SeatLeaveOutcome, { kind: 'left' } | { kind: 'on_duty' }>,
): string {
  switch (outcome.kind) {
    case 'unsynced':
      return LEAVE.unsynced(outcome.count);
    case 'offline':
      return LEAVE.offline;
    case 'not_allowed':
      return LEAVE.seat.notAllowed;
    case 'failed':
      return LEAVE.failed;
  }
}

/** Who can take the family on: anybody else here whose seat lasts (a seat that ends never can, 0109). */
export const ownerCandidates = (members: readonly MemberRow[]): MemberRow[] =>
  members.filter(m => !m.is_self && m.expires_at === null);

export interface LeaveSeatSectionProps {
  /** The family's name, as the account lists it. */
  family: string;
  /** This person's role in it: the owner hands it on first, everyone else leaves. */
  role?: Role | null;
  /** The page's live roster, for who can take the family on. */
  members?: readonly MemberRow[];
  /** Family's own "Make owner", for one of `ownerCandidates`; it asks first. */
  onMakeOwner?: (member: MemberRow) => void;
  /** Rows drawn first in the same group (Family's Join and Start your own rows). */
  leading?: ReactNode;
}

export function LeaveSeatSection({
  family,
  role = null,
  members = [],
  onMakeOwner,
  leading,
}: LeaveSeatSectionProps) {
  const t = useTheme();
  const { actions, api } = useAuth();
  const timeZone = useTimeZone();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** On for the family, and asked "Leave anyway?" (`leave.ts` `leaveSeat`). */
  const [onDuty, setOnDuty] = useState<OnDuty | null>(null);
  /** A parent who pays for Plus through a store: the one line about it. */
  const [store, setStore] = useState(false);
  const owner = mustHandOnFirst(role);

  // a role that changed under the page (the owner just handed the family on) starts it closed
  useEffect(() => {
    setOpen(false);
    setOnDuty(null);
    setError(null);
  }, [role]);

  // asked when a parent's confirmation opens, and only then: the line is for this moment
  useEffect(() => {
    if (!open || role !== 'PARENT') return;
    let live = true;
    void api
      .storeSubscription()
      .then(r => {
        if (live) setStore(r.ok && r.active);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open, role, api]);

  const leave = async (handBackDuty: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setOnDuty(null);
    const outcome = await actions.leaveSeat(handBackDuty ? { handBackDuty } : {});
    // left: the family leaves the phone, and this page with it
    if (outcome.kind === 'left') return;
    setBusy(false);
    if (outcome.kind === 'on_duty') {
      setOnDuty(outcome.duty);
      return;
    }
    setError(seatLeaveProblemSentence(outcome));
  };

  const close = () => {
    setOpen(false);
    setOnDuty(null);
    setError(null);
  };
  const toggle = () => {
    setOpen(o => !o);
    setOnDuty(null);
    setError(null);
  };
  const clock = (ms: number) => clockText(ms, timeZone, deviceClock24());

  /* THE OWNER: the one way on, never a dead control */
  if (owner) {
    const candidates = ownerCandidates(members);
    return (
      <View style={{ gap: t.space.sm }} testID="family.leave_owner">
        <Rows>
          {leading}
          <Row
            title={LEAVE.owner.row}
            detail={LEAVE.owner.rowDetail(family)}
            icon="home"
            tint={{ fg: t.color.crit, soft: t.color.surface2 }}
            onPress={toggle}
            accessibilityHint={LEAVE.owner.rowHint}
            testID="family.leave_owner.row"
          />
        </Rows>
        {open ? (
          <Card testID="family.leave_owner.card">
            <View style={{ gap: t.space.sm }}>
              <BodyStrong accessibilityRole="header" testID="family.leave_owner.title">
                {LEAVE.owner.title}
              </BodyStrong>
              <Body>{LEAVE.owner.body(family)}</Body>
              {candidates.length === 0 || onMakeOwner === undefined ? (
                <BodySm testID="family.leave_owner.nobody">{LEAVE.owner.nobody}</BodySm>
              ) : (
                candidates.map(m => (
                  <Button
                    key={m.user_id}
                    label={LEAVE.owner.pick(m.display_name || m.email || '')}
                    variant="secondary"
                    onPress={() => onMakeOwner(m)}
                    accessibilityHint={LEAVE.owner.pickHint}
                    testID={`family.leave_owner.pick.${m.user_id}`}
                  />
                ))
              )}
              <Button
                label={LEAVE.owner.cancel}
                variant="ghost"
                onPress={close}
                testID="family.leave_owner.cancel"
              />
            </View>
          </Card>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: t.space.sm }} testID="family.leave_seat">
      <Rows>
        {leading}
        <Row
          title={LEAVE.seat.row(family)}
          detail={LEAVE.seat.rowDetail}
          icon="home"
          // the danger in the status hue AND the words, on the neutral chip, as Leave's own row
          tint={{ fg: t.color.crit, soft: t.color.surface2 }}
          onPress={toggle}
          accessibilityHint={LEAVE.seat.rowHint}
          testID="family.leave_seat.row"
        />
      </Rows>
      {open ? (
        <Card testID="family.leave_seat.confirm">
          <View style={{ gap: t.space.sm }}>
            <BodyStrong accessibilityRole="header" testID="family.leave_seat.title">
              {LEAVE.seat.title(family)}
            </BodyStrong>
            <Body>{LEAVE.seat.body(family)}</Body>
            <BodySm>{LEAVE.seat.kept}</BodySm>
            {store ? <BodySm testID="family.leave_seat.store">{LEAVE.seat.store}</BodySm> : null}
            {error ? (
              <BodySm
                ink="crit"
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                testID="family.leave_seat.error"
              >
                {error}
              </BodySm>
            ) : null}
            {/* ON FOR THE FAMILY: asked here, as the switcher asks, before anything changes */}
            {onDuty !== null ? (
              <View style={{ gap: t.space.sm }} testID="family.leave_seat.on_duty">
                <BodyStrong accessibilityRole="alert" testID="family.leave_seat.on_duty.title">
                  {SWITCH.onDuty.title(
                    family,
                    clock(onDuty.fromMs),
                    clock(onDuty.untilMs),
                    onDuty.started,
                  )}
                </BodyStrong>
                <Body>{LEAVE.seat.onDuty.ask}</Body>
                <Body>{LEAVE.seat.onDuty.body(family)}</Body>
              </View>
            ) : null}
            <Button
              label={onDuty !== null ? LEAVE.seat.onDuty.confirm : LEAVE.seat.confirm}
              variant="danger"
              onPress={() => void leave(onDuty !== null)}
              loading={busy}
              accessibilityHint={LEAVE.seat.confirmHint(family)}
              testID="family.leave_seat.go"
            />
            <Button
              label={LEAVE.seat.cancel}
              variant="ghost"
              onPress={close}
              testID="family.leave_seat.cancel"
            />
          </View>
        </Card>
      ) : null}
    </View>
  );
}
