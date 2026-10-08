/**
 * FAMILY'S "LEAVE THIS HOUSEHOLD" (migration 0143; the owner, 2026-09-29: *"Should a household with
 * nobody else in it get a 'Leave' option?"* *"Yes."*).
 *
 * The way out of a household set up by mistake: one account holds one household (0139), so a
 * partner who went through setup instead of joining could not join the household they meant to.
 *
 *   WHEN   only while the signed-in person is the only one in the household: the live roster
 *          (`household_roster`, permanent members and seats that have not lapsed) is exactly them
 *          (core's `aloneIn`). Anybody else here and the section is not drawn. The server counts
 *          again when they confirm (`not_alone`), so a roster read a moment ago can only ever hide
 *          it; when it does, the roster is read again and the one sentence saying why stays where
 *          the section was.
 *   HOW    a quiet row at the foot of the page, the crit glyph on the neutral chip and the words
 *          saying it, as Delete account's row is drawn: never the page's primary button. It opens
 *          a confirmation IN THE PAGE, under the row, rather than a sheet, so the free download
 *          can open over it (a sheet over a sheet is not something both platforms draw):
 *            · names the household, and says nobody else is in it, so it closes;
 *            · says its entries are kept for 30 days and it can be brought back until then;
 *            · offers the free full download, the same sheet Account & privacy opens, never gated;
 *            · says one line about a store subscription, only when this person has one;
 *            · one destructive button that says what it does, and Cancel.
 *   THEN   `actions.leaveHousehold()`: what the phone owes the household goes first, the server
 *          closes it, and the household leaves the phone by the account read, onto Ended, where
 *          "Bring back" waits until the purge date (`auth/leave.ts`).
 *
 * "LEAVE <NAME> FIRST" arrives here from the two pages that used to say only "make a second
 * account" — the join sheet in a household, and the page an unused invite lands on: Family opens
 * with `confirmLeave` set, and the confirmation opens and is scrolled to (`onReveal`).
 *
 * ONE GROUP WITH JOIN ANOTHER HOUSEHOLD (the owner, 2026-09-30: *"Why join another household is
 * not a button, it just look different"*). The page's other door out of this household was a bare
 * ghost button above this row: two household-level actions, two looks. It is a row now, handed in
 * as `leading` and drawn first in this row's own group, so the two doors read as one list; with no
 * Leave row to draw, it is a group of one.
 *
 * A CAREGIVER, A VIEWER OR A PARENT IN A FAMILY OTHERS ARE IN (2026-10-08) is handed to
 * `LeaveSeatSection`, which draws the same group with "Leave <family>" in it: their seat ends, the
 * family stays. THE OWNER of such a family is handed to it too, and gets "Make someone else the
 * owner first", which opens Family's own Make owner (`onMakeOwner`): never a dead control.
 */
import { aloneIn } from '@nibblecue/core';
import { Body, BodySm, BodyStrong, Button, Card, Row, Rows, useTheme } from '@nibblecue/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { canLeaveSeat, mustHandOnFirst, type LeaveOutcome } from '../../auth/leave';
import type { MemberRow } from '../../auth/providers/types';
import { DownloadSheet } from '../../sheets/account/DownloadSheet';
import { LEAVE } from './leaveCopy';
import { LeaveSeatSection } from './LeaveSeatSection';

/** A beat for the confirmation to be laid out before the page is scrolled to it. */
const REVEAL_MS = 120;

export interface LeaveHouseholdSectionProps {
  /** The page's live roster (`household_roster`). */
  members: readonly MemberRow[];
  /** When "Leave <name> first" asked for the confirmation, or null (a route param, never a household). */
  confirmAt: number | null;
  /** Bring the confirmation into view: it opens at the foot of a long page (called once it is laid out). */
  onReveal: () => void;
  /** Read the roster again: somebody joined meanwhile, and the section should go. */
  onRefresh: () => void;
  /** Rows drawn first in the same group, whether or not Leave is drawn (Family's Join row). */
  leading?: ReactNode;
  /** Family's own "Make owner", for the owner of a family others are in (it asks first). */
  onMakeOwner?: (member: MemberRow) => void;
}

/** What a leave that did not happen says, where it was asked for. */
export function leaveProblemSentence(outcome: Exclude<LeaveOutcome, { kind: 'left' }>): string {
  switch (outcome.kind) {
    case 'not_alone':
      return LEAVE.notAlone;
    case 'unsynced':
      return LEAVE.unsynced(outcome.count);
    case 'offline':
      return LEAVE.offline;
    case 'failed':
      return LEAVE.failed;
  }
}

export function LeaveHouseholdSection({
  members,
  confirmAt,
  onReveal,
  onRefresh,
  leading,
  onMakeOwner,
}: LeaveHouseholdSectionProps) {
  const t = useTheme();
  const { account, api, actions } = useAuth();
  const household = account?.memberships[0];
  const alone = aloneIn(members);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** This person pays for Plus through a store: the one line about it (never a household's row). */
  const [store, setStore] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);

  // "Leave <name> first" from the join sheet or an unused invite's page: opened, and shown
  useEffect(() => {
    if (confirmAt === null || !alone) return;
    setOpen(true);
    setError(null);
    const timer = setTimeout(onReveal, REVEAL_MS);
    return () => clearTimeout(timer);
    // `onReveal` is a new function every render of the page; the ask is what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmAt, alone]);

  // somebody else is in it now (the roster read again after the server said `not_alone`): the
  // confirmation goes, and only the reason stays where the section was
  useEffect(() => {
    if (!alone) setOpen(false);
  }, [alone]);

  // asked when the confirmation opens, and only then: the line is for this moment
  useEffect(() => {
    if (!open) return;
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
  }, [open, api]);

  /* the page's own rows, in a group of their own when there is no Leave row to join them */
  const leadingGroup = leading ? <Rows>{leading}</Rows> : null;
  if (household === undefined) return leadingGroup;
  /* NOT ALONE ANY MORE: the section is not drawn, save the one sentence that says why the leave
     just asked for did not happen. The roster above shows who is in it now.
     A CAREGIVER, A VIEWER OR A PARENT gets their own way out instead, in the same group
     (`LeaveSeatSection`, 2026-10-08): ending their seat, never closing a family others are in. The
     OWNER gets the way to hand it on first, in the same place. */
  if (!alone)
    return (
      <>
        {canLeaveSeat(household.role) || mustHandOnFirst(household.role) ? (
          <LeaveSeatSection
            family={household.household_name}
            role={household.role}
            members={members}
            leading={leading}
            {...(onMakeOwner !== undefined ? { onMakeOwner } : {})}
          />
        ) : (
          leadingGroup
        )}
        {error === LEAVE.notAlone ? (
          <BodySm
            ink="crit"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            testID="family.leave.not_alone"
          >
            {LEAVE.notAlone}
          </BodySm>
        ) : null}
      </>
    );
  const name = household.household_name;

  const leave = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await actions.leaveHousehold();
    // left: the household leaves the phone, and this page with it (onto Ended)
    if (outcome.kind === 'left') return;
    setBusy(false);
    setError(leaveProblemSentence(outcome));
    if (outcome.kind === 'not_alone') onRefresh();
  };

  return (
    <View style={{ gap: t.space.sm }} testID="family.leave">
      <Rows>
        {leading}
        <Row
          title={LEAVE.row}
          detail={LEAVE.rowDetail}
          icon="home"
          // the danger in the status hue AND the words, on the neutral chip, as Delete account
          tint={{ fg: t.color.crit, soft: t.color.surface2 }}
          onPress={() => {
            setOpen(o => !o);
            setError(null);
          }}
          accessibilityHint={LEAVE.rowHint}
          testID="family.leave.row"
        />
      </Rows>
      {open ? (
        <Card testID="family.leave.confirm">
          <View style={{ gap: t.space.sm }}>
            <BodyStrong accessibilityRole="header" testID="family.leave.title">
              {LEAVE.title(name)}
            </BodyStrong>
            <Body>{LEAVE.body}</Body>
            <BodySm>{LEAVE.kept}</BodySm>
            {store ? <BodySm testID="family.leave.store">{LEAVE.store}</BodySm> : null}
            {/* THE FREE FULL DOWNLOAD, one tap from here and never gated (the bill of rights) */}
            <Button
              label={LEAVE.download}
              variant="secondary"
              icon="export"
              onPress={() => setDownloadOpen(true)}
              accessibilityHint={LEAVE.downloadHint}
              testID="family.leave.download"
            />
            {error ? (
              <BodySm
                ink="crit"
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                testID="family.leave.error"
              >
                {error}
              </BodySm>
            ) : null}
            <Button
              label={LEAVE.confirm}
              variant="danger"
              onPress={() => void leave()}
              loading={busy}
              accessibilityHint={LEAVE.confirmHint(name)}
              testID="family.leave.go"
            />
            <Button
              label={LEAVE.cancel}
              variant="ghost"
              onPress={() => {
                setOpen(false);
                setError(null);
              }}
              testID="family.leave.cancel"
            />
          </View>
        </Card>
      ) : null}
      <DownloadSheet visible={downloadOpen} onClose={() => setDownloadOpen(false)} />
    </View>
  );
}
