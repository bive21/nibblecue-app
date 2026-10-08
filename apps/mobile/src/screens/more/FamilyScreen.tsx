/**
 * Family (docs/ACCOUNTS.md §7, SECURITY.md §3; docs/DESIGN_SYSTEM.md §5, §14, §21): who is
 * in the household and what each can do, invites by code (6 letters, 5 minutes) or link, role
 * changes, removal and ownership transfer. The secret is shown once and never stored on the
 * device.
 *
 * Reached from More, the first row of its Household group (again since 2026-09-29: the avatar's
 * menu held it for two days from 2026-09-27, and the owner then thought More "suit it better"),
 * from the handoff guide's Open Family, from Today's invite card, and from the join sheet's way to
 * Leave. It is the household's page, so its door is on the household's list, not in the menu about
 * you. The file lives in `more/` for that reason.
 *
 * A pushed page under the household's name. The owner taps that name and a field appears
 * (`rename_household`, 0151): the same 2 to 60 characters setup already requires. A parent sees
 * the name and cannot change it, because `households_write` is the owner's (SECURITY.md).
 * A role is never rendered as its enum: one label
 * map, used for the member rows, the picker chips and the invite control. The code is a value
 * and is set in the mono face at display size, spoken digit by digit; the countdown is mono
 * too. The role chips are Chips with `selected`, so the choice is the check and the a11y
 * state, never a fill alone. The error line carries the alert role.
 */
import { BRAND } from '@nibblecue/brand';
import {
  canInviteRole,
  canStartOwnFamily,
  defaultInviteRole,
  formatInviteCode,
  HouseholdNameSchema,
  parentsIn,
  roleDetail,
  roleLabel,
  seatLabel,
  seatsLeft,
  SEAT_DURATIONS,
  SEAT_UNTIL_OFF,
  type Role,
} from '@nibblecue/core';
import {
  BodySm,
  BodyStrong,
  Button,
  Card,
  Chip,
  IconButton,
  Input,
  Label,
  Numeric,
  Row,
  Rows,
  SegmentedControl,
  useTheme,
} from '@nibblecue/ui';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { useEffect, useRef, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import type { ScrollView } from 'react-native';
import { inExpoGo } from '../../app/runtime';
import { Screen } from '../../app/Screen';
import { childLine } from '../../app/childSwitcher';
import { useShell } from '../../app/shell';
import { useScreenAwake } from '../../app/useScreenAwake';
import type { RootParams } from '../../app/types';
import { useChild } from '../../household/ChildContext';
import { useMemberPictures } from '../../household/MemberPictures';
import { useAuth } from '../../auth/AuthContext';
import { keys, store as dataStore } from '../../data/store';
import { openLocalDb } from '../../db';
import { inviteShareLink } from '../../auth/inviteLink';
import { inviteShareMessage } from '../../auth/inviteMessage';
import { answerInviteCard } from '../../inviteCard/answer';
import type { MemberRow } from '../../auth/providers/types';
import { usePlan } from '../../plan/PlanProvider';
import { JOIN } from '../auth/joinCopy';
import { OWN_FAMILY } from '../onboarding/ownFamilyCopy';
import { syncRuntime } from '../../sync/status';
import { HouseholdsList } from '../../household/HouseholdsList';
import { useConfirm } from '../../ui/confirm';
import { useToast } from '../../ui/toast';
import { LeaveHouseholdSection } from './LeaveHouseholdSection';
import { LEAVE } from './leaveCopy';
import { FAMILY_REMOVE } from './removeCopy';

type InviteRole = Exclude<Role, 'OWNER'>;
const INVITE_ROLES: readonly InviteRole[] = ['PARENT', 'CAREGIVER', 'VIEW_ONLY'];

/**
 * A SEAT THAT ENDS IS NEVER AN ADMIN'S (migration 0109): the server refuses to make a temporary
 * member a parent or the owner, so the page does not offer it. Before 0109 this page's "Parent"
 * chip was the one way a temporary admin could be made.
 */
const TEMPORARY_SEAT_NOTE = 'To make them a parent, invite them again without an end.';

/** The same sentence setup shows when the household name will not fit (OnboardingScreen). */
const HOUSEHOLD_NAME_RULE = 'A household name of 2 to 60 characters.';

/**
 * HOW LONG THE SEAT LASTS. `null` is the permanent seat this page has always made; a number of
 * hours is the babysitter, the night nurse, the grandparent on a rota — access that ends on its
 * own, because a seat somebody must remember to revoke is a seat that never gets revoked.
 *
 * Only a CAREGIVER may be temporary: the server refuses anything else (`create_timed_invite`),
 * so the control disappears rather than offering a choice that would be turned down.
 */
type SeatChoice = number | null;

/** How long a role or length must stay chosen before a showing code is made again for it. */
export const INVITE_REMAKE_MS = 700;

export function FamilyScreen() {
  // a pushed page is not a tab, so the tab bar cannot report it: the screen says it is here
  const t = useTheme();
  const { account, api, actions, session } = useAuth();
  const shell = useShell();
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const { children: born, expecting, photoOf } = useChild();
  // the household's children, born and on the way (migration 0150), in the order the server keeps
  const children = [...born, ...expecting];
  // each member's own picture (0148): the roster this page reads carries it, and the provider
  // turns it into a file every surface shares
  const { pictureOf, learn } = useMemberPictures();
  const toast = useToast();
  const confirm = useConfirm();
  const household = account?.memberships[0];
  const canAdmin = household?.role === 'OWNER' || household?.role === 'PARENT';
  const isOwner = household?.role === 'OWNER';
  // the name at the top is a button for the owner only: the server refuses anyone else
  const [naming, setNaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const plan = usePlan();
  const [members, setMembers] = useState<MemberRow[]>([]);
  /*
    THE SECOND SEAT STARTS ON PARENT (the handoff audit's U1). The pill used to start on Caregiver,
    so the other parent — the person most households invite first — joined as a caregiver and was
    reminded of nothing unless someone put them on. Until the parent picks, the role follows the
    household: Parent while it has fewer than two parents, Caregiver after (`defaultInviteRole`).
  */
  const [picked, setPicked] = useState<InviteRole | null>(null);
  const role: InviteRole = picked ?? defaultInviteRole(members);
  const [seat, setSeat] = useState<SeatChoice>(null);
  const [invite, setInvite] = useState<{
    code?: string;
    url?: string;
    expires_at: string;
    seat_hours?: number;
    /** What it was made for, so a change of either makes a new code (`useEffect` below). */
    role: InviteRole;
    seat: SeatChoice;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  /* "Leave <name> first" opens this page with the leave confirmation up, at its foot (0143) */
  const route = useRoute<RouteProp<RootParams, 'Family'>>();
  const scroller = useRef<ScrollView | null>(null);

  /**
   * WHO THIS HOUSEHOLD MAY INVITE, from the plan matrix — never from a tier name (CLAUDE.md §4).
   * `caregivers` is `free: false, limit: 2`, and since 2026-09-27 the two are the parents (the
   * owner: *"caretaker only avail on plus"*): the people who live with the baby both log for free,
   * or the shared record has a hole in it, and a caregiver or a viewer is what Plus sells. A
   * caregiver who joined during the preview keeps their seat and never takes a parent's place
   * (`canInviteRole`).
   *
   * `members` is the LIVE roster, so a seat that has ended is nobody in the count.
   */
  const limit = plan.limitFor('caregivers');
  const left = seatsLeft(parentsIn(members), limit);
  const room = canInviteRole(role, members, { limit, extra: plan.can('caregivers') });

  const load = async () => {
    if (!household) return;
    const roster = await api.listMembers(household.household_id);
    setMembers(roster);
    // the roster is fresher than the mirror: every surface draws what it says
    learn(roster);
  };
  // `load` is a plain function rebuilt every render, so listing it would re-read the roster on
  // each one; the household it reads is the dependency that matters.
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household?.household_id]);
  // the invite code's countdown and the seats' "left" labels, once a second — only while this page
  // is in front and the app is open (`useScreenAwake`), and read afresh the moment it is again
  const awake = useScreenAwake();
  useEffect(() => {
    if (!awake) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [awake]);

  const create = async (
    kind: 'CODE' | 'LINK',
    choice: { role: InviteRole; seat: SeatChoice } = { role, seat },
  ) => {
    if (!household) return;
    // the gate opens BEFORE anything is made, with the feature's own sentence, so nobody fills
    // in a code and then meets a paywall (`GATES`: family.invite_over_limit → caregivers)
    if (!room) return shell.openGate('caregivers');
    setError(null);
    const r = await api.createInvite(
      household.household_id,
      choice.role,
      kind,
      ...(choice.seat === null ? [] : [choice.seat]),
    );
    if (!r.ok)
      return setError(
        r.status === 429
          ? 'Too many invites for now. Try again in an hour.'
          : r.status === 403
            ? 'Only a parent or the owner can invite, and not from a seat that ends.'
            : 'Could not create the invite. Try again.',
      );
    /*
      AN INVITE MADE HERE ENDS TODAY'S LOG TOGETHER CARD, ON THIS PHONE (docs/SHARED_CARE.md §6).
      The app never reads `invites` (the Supabase provider's own rule), so no phone can see one
      waiting; this is the phone that made it, and it is the one that knows. Whatever the role:
      a parent who has made an invite here has found the door the Today card points at.
    */
    const uid = session?.user.id ?? null;
    if (uid !== null) void answerInviteCard(uid, 'INVITED').catch(() => undefined);
    const hours = r.seat_hours === undefined ? {} : { seat_hours: r.seat_hours };
    setInvite(
      r.kind === 'CODE'
        ? { code: r.code, expires_at: r.expires_at, ...hours, ...choice }
        : { url: r.url, expires_at: r.expires_at, ...hours, ...choice },
    );
    /*
      THE LINK GOES OUT AS A MESSAGE, and as a link every app shows as one (the owner, 2026-09-29:
      "Make sure the email invite also works"). It went out as the bare `cuddlecue://` address, which
      most mail and message apps leave as plain text, and which Expo Go cannot open at all. Now: who
      and where, the website's https link (Expo Go's own `exp://` form while testing in Expo Go), and
      the way in when a tap will not open the app: paste the message into Join a household.
    */
    if (r.kind === 'LINK') {
      const link = inviteShareLink(r.token, {
        host: BRAND.universalLinkHost,
        expoGoBase: inExpoGo() ? Constants.linkingUri : null,
      });
      const message = inviteShareMessage(
        account?.profile?.display_name ?? '',
        household.household_name,
        link,
      );
      void Share.share({ message }).catch(() => undefined);
    }
  };

  /*
    A NEW ROLE OR LENGTH MAKES A NEW CODE BY ITSELF (the owner, 2026-10-08: "when changing the
    invitation type, the code need to automatically change without needing me to click create an
    invite code"). Only while a code is showing and still works, once the choice has settled: the
    server allows ten invites an hour per household, so flipping through the three roles is one new
    code, not three. Where the new role has no room (Plus), the old code goes: a code on screen for
    a role that is not the one selected would be handed over as the wrong key.
  */
  const remaking = useRef(false);
  const codeLive = invite?.code !== undefined && Date.parse(invite.expires_at) > Date.now();
  const stale = codeLive && invite !== null && (invite.role !== role || invite.seat !== seat);
  useEffect(() => {
    if (!stale) return undefined;
    if (!room) {
      setInvite(null);
      return undefined;
    }
    const handle = setTimeout(() => {
      if (remaking.current) return;
      remaking.current = true;
      void create('CODE', { role, seat }).finally(() => {
        remaking.current = false;
      });
    }, INVITE_REMAKE_MS);
    return () => clearTimeout(handle);
    // `create` reads this render's household and plan; the choice is what moves the effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale, role, seat, room]);

  // a temporary seat is a CAREGIVER on the server, so the choice follows the role rather than
  // offering a length that would be refused
  const seatOffered = role === 'CAREGIVER';
  const seatDetail = SEAT_DURATIONS.find(d => d.hours === seat)?.detail ?? null;

  const change = async (
    fn: () => Promise<{ ok: boolean; error?: string; detail?: string }>,
    done: string,
  ) => {
    setError(null);
    const r = await fn();
    if (!r.ok) {
      setError(
        r.error === 'last_owner'
          ? 'Every household needs an owner. Pick someone first.'
          : r.detail === 'temporary_seat'
            ? `Someone whose access ends can’t be a parent or the owner. ${TEMPORARY_SEAT_NOTE}`
            : 'Could not save that. Try again.',
      );
      return;
    }
    toast.show(done);
    setSelected(null);
    await load();
    await actions.refreshAccount();
    /*
      AND THE PHONES FOLLOW NOW, NOT AT THE NEXT PULL (the handoff audit's L4). A person removed or
      made view-only mid-shift stops counting as on only once this phone's copy of the member list
      has it — and it had it only after the next five-minute pull, while the page said it was done.
    */
    void syncRuntime()
      ?.pullNow()
      .catch(() => undefined);
  };

  /*
    REMOVING SOMEBODY ASKS FIRST (the owner, 2026-10-08: "easily turn off or delete (clicking X then
    confirmation box) on the user row"). The X on their row and the button in their card both come
    here, so neither removes on one tap: it is a person's access to the family's log, and a slip of
    the thumb on a list of names is the likeliest way to do it by mistake.
  */
  const askRemove = async (m: MemberRow) => {
    if (!household) return;
    const name = m.display_name || m.email || 'Someone';
    const ok = await confirm.ask({
      title: FAMILY_REMOVE.title(name),
      body: FAMILY_REMOVE.body(household.household_name),
      action: FAMILY_REMOVE.action,
      destructive: true,
    });
    if (!ok) return;
    await change(
      () => api.removeMember(household.household_id, m.user_id),
      FAMILY_REMOVE.done(name),
    );
  };

  /*
    THE OWNER LEAVING A FAMILY OTHERS ARE IN HANDS IT ON FIRST (2026-10-08; `auth/leave.ts`
    `mustHandOnFirst`): Leave's row opens this, the same transfer as "Make owner" in the person's card,
    asked first because it cannot be taken back by the one who made it.
  */
  const makeOwnerToLeave = async (m: MemberRow) => {
    if (!household) return;
    const name = m.display_name || m.email || '';
    const ok = await confirm.ask({
      title: LEAVE.owner.confirmTitle(name),
      body: LEAVE.owner.confirmBody,
      action: LEAVE.owner.confirmAction,
      destructive: true,
    });
    if (!ok) return;
    await change(
      () => api.transferOwnership(household.household_id, m.user_id),
      'Ownership transferred',
    );
  };

  const saveName = async () => {
    if (!household || savingName) return;
    const parsed = HouseholdNameSchema.safeParse(nameDraft);
    if (!parsed.success) {
      setNameError(HOUSEHOLD_NAME_RULE);
      return;
    }
    if (parsed.data === household.household_name) {
      setNaming(false);
      setNameError(null);
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      const r = await api.renameHousehold(household.household_id, parsed.data);
      if (!r.ok) {
        setNameError(
          r.status === 403
            ? 'Only the owner can change the household name.'
            : r.status === 422
              ? HOUSEHOLD_NAME_RULE
              : 'Could not save the name. Check your connection, then try again.',
        );
        return;
      }
      // this phone's copy of the row, so a later read is not the old name until the pull lands
      try {
        const db = await openLocalDb();
        await db.run('update households set name = ? where id = ?', [
          parsed.data,
          household.household_id,
        ]);
        dataStore.invalidate(keys.household(household.household_id));
      } catch {
        // the mirror catches up at the next pull; the account read below already asks for the name
      }
      await actions.refreshAccount().catch(() => null);
      void syncRuntime()
        ?.pullNow()
        .catch(() => undefined);
      toast.show('Household name saved.');
      setNaming(false);
    } catch {
      // offline throws, the same as the other account writes; the sentence covers a fault too
      setNameError('Could not save the name. Check your connection, then try again.');
    } finally {
      setSavingName(false);
    }
  };

  const secondsLeft = invite
    ? Math.max(0, Math.round((Date.parse(invite.expires_at) - now) / 1000))
    : 0;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <Screen
      title={household?.household_name ?? 'Family'}
      {...(naming && household
        ? {
            titleEditor: (
              <View style={{ gap: t.space.sm }}>
                <Input
                  label="Household name"
                  value={nameDraft}
                  onChangeText={v => {
                    setNameDraft(v);
                    setNameError(null);
                  }}
                  autoFocus
                  autoCapitalize="words"
                  maxLength={80}
                  returnKeyType="done"
                  onSubmitEditing={() => void saveName()}
                  {...(nameError !== null ? { error: nameError } : {})}
                  testID="family.name.input"
                />
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: t.space.sm }}>
                  <Button
                    label="Cancel"
                    variant="secondary"
                    size="xs"
                    onPress={() => {
                      setNaming(false);
                      setNameError(null);
                    }}
                    testID="family.name.cancel"
                  />
                  <Button
                    label="Save"
                    size="xs"
                    onPress={() => void saveName()}
                    loading={savingName}
                    testID="family.name.save"
                  />
                </View>
              </View>
            ),
          }
        : {})}
      {...(isOwner && !naming && household
        ? {
            onTitlePress: () => {
              setNameDraft(household.household_name);
              setNameError(null);
              setNaming(true);
            },
            titlePressLabel: `Household name, ${household.household_name}`,
            titlePressTestID: 'family.name',
          }
        : {})}
      scrollRef={scroller}
      testID="family"
    >
      {/* YOUR FAMILIES (0153): the families this account is in, for one in more than one —
          here too, since Family is where the household's people are */}
      <HouseholdsList testID="family.families" />
      <Label>People</Label>
      <Rows>
        {members.map(m => {
          // WHEN THIS SEAT ENDS, beside the role, counted down live. Nothing is said about a
          // permanent member: "forever" is not a fact anyone needs told about the person they
          // live with, and a badge on every row would make the temporary one invisible.
          const ends = seatLabel(m.expires_at, now);
          const picture = pictureOf(m.user_id);
          return (
            <Row
              key={m.user_id}
              title={`${m.display_name || m.email || 'Someone'}${m.is_self ? ' (you)' : ''}`}
              // THE PERSON'S OWN PICTURE, or their initial (0148): the circle every member is drawn
              // with, beside the name the row already says
              avatar={{
                name: m.display_name || m.email || 'Someone',
                ...(picture !== null ? { photoUri: picture } : {}),
              }}
              detail={ends === null ? roleLabel(m.role) : `${roleLabel(m.role)} · ${ends}`}
              // the badge is the thing that catches an eye scanning the list; the words carry
              // it too, so the state is never in a color alone (§ accessibility)
              {...(ends === null ? {} : { badge: { label: 'Temporary', tone: 'warn' as const } })}
              {...(canAdmin && !m.is_self && m.role !== 'OWNER'
                ? {
                    onPress: () => setSelected(selected === m.user_id ? null : m.user_id),
                    // THE X ON THE ROW (the owner, 2026-10-08): ends their access, after asking
                    right: (
                      <IconButton
                        icon="x"
                        accessibilityLabel={FAMILY_REMOVE.label(
                          m.display_name || m.email || 'Someone',
                        )}
                        onPress={() => void askRemove(m)}
                        testID={`family.member.${m.user_id}.remove`}
                      />
                    ),
                  }
                : { right: 'none' as const })}
              testID={`family.member.${m.user_id}`}
            />
          );
        })}
      </Rows>
      {left === null ? null : (
        <BodySm ink="text2" testID="family.seats_left">
          {left > 0
            ? `${left === 1 ? 'One more parent' : `${left} more parents`} can join on the free plan.`
            : 'Both parents are here. The free plan holds the two of you.'}
        </BodySm>
      )}
      {members
        .filter(m => selected === m.user_id && household)
        .map(m => (
          <Card key={m.user_id} testID={`family.member.${m.user_id}.manage`}>
            <View style={{ gap: t.space.sm }}>
              <BodyStrong>{`${m.display_name || m.email || 'Someone'}`}</BodyStrong>
              <Label>Role</Label>
              <View style={[styles.chips, { gap: t.space.sm }]}>
                {INVITE_ROLES.filter(r => m.expires_at === null || r !== 'PARENT').map(r => (
                  <Chip
                    key={r}
                    label={roleLabel(r)}
                    selected={m.role === r}
                    onPress={() =>
                      household
                        ? void change(
                            () => api.setRole(household.household_id, m.user_id, r),
                            'Role updated on the server',
                          )
                        : undefined
                    }
                    testID={`family.role.${r}`}
                  />
                ))}
              </View>
              {isOwner && household && m.expires_at === null ? (
                <Button
                  label="Make owner"
                  variant="secondary"
                  onPress={() =>
                    void change(
                      () => api.transferOwnership(household.household_id, m.user_id),
                      'Ownership transferred',
                    )
                  }
                  testID="family.transfer"
                />
              ) : null}
              {household ? (
                <Button
                  label="Remove from household"
                  variant="ghost"
                  onPress={() => void askRemove(m)}
                  testID="family.remove"
                />
              ) : null}
              {m.expires_at === null ? null : (
                <BodySm ink="text2" testID={`family.member.${m.user_id}.ends`}>
                  {`Their access ends on its own: ${seatLabel(m.expires_at, now)?.toLowerCase() ?? 'it has ended'}. Removing them ends it now. ${TEMPORARY_SEAT_NOTE}`}
                </BodySm>
              )}
              <BodySm>
                Removing someone keeps every entry they logged. A store subscription stays with the
                person who bought it.
              </BodySm>
            </View>
          </Card>
        ))}

      {/* THE CHILDREN, where the household's composition already lives. A twin who was not
          added at setup, or a new baby in the house, is added from here or from the child
          switcher — the same sheet either way (docs/MULTIPLES.md §8). A caregiver sees the list
          and no button: RLS would refuse the write, and a control that fails is worse than one
          that is not there. */}
      <Card testID="family.children">
        <View style={{ gap: t.space.sm }}>
          <Label>Children</Label>
          <Rows>
            {children.map(c => {
              const photoUri = photoOf(c.id);
              return (
                <Row
                  key={c.id}
                  title={c.name}
                  detail={childLine(c, Date.now())}
                  // THE BABY'S OWN FACE where the household's composition is listed
                  // (docs/MEDIA.md; 2026-09-20). Without a photo it is the generated circle,
                  // which is the default and not a placeholder — `babyface` was the glyph
                  // before and it named a category where a person was the subject.
                  avatar={{ name: c.name, ...(photoUri !== null ? { photoUri } : {}) }}
                  // a caregiver opens the same sheet and finds the name, the date and the
                  // picture, and no buttons: the server owns the boundary (`canSetChildPhoto`)
                  onPress={() => shell.openChildPhoto(c.id)}
                  accessibilityHint="Name, date of birth and photo"
                  testID={`family.child.${c.id}`}
                />
              );
            })}
          </Rows>
          {canAdmin ? (
            <Button
              label="Add a child"
              variant="secondary"
              onPress={shell.openAddChild}
              testID="family.add_child"
            />
          ) : null}
        </View>
      </Card>

      {canAdmin ? (
        <Card testID="family.invite">
          <View style={{ gap: t.space.sm }}>
            <Label>Invite someone</Label>
            <BodySm>Everyone gets their own login. Pick what they can do first.</BodySm>
            <SegmentedControl<InviteRole>
              label="Role for the invite"
              value={role}
              // a length belongs to a caregiver, so moving off one drops it rather than sending
              // the server a request it is bound to refuse
              onChange={next => {
                setPicked(next);
                if (next !== 'CAREGIVER') setSeat(null);
              }}
              options={INVITE_ROLES.map(r => ({ value: r, label: roleLabel(r) }))}
              testID="family.invite.role"
            />
            {/* WHAT THE CHOSEN ROLE CAN DO, under the pills (`roleDetail`).
                "Pick what they can do first" over three bare words asked the one person who must
                not guess — the one handing over a key to the household's log — to guess. The
                sentence follows the selection rather than listing all three, because a parent is
                deciding one thing at a time and three lines of small print is how none of them
                gets read. */}
            <BodySm ink="text2" testID="family.invite.role.detail">
              {roleDetail(role)}
            </BodySm>

            {/* HOW LONG THEY STAY (the owner, 2026-09-22). A babysitter for the evening, a
                grandparent for the week, a night nurse for the month — and then it ends on its
                own, which is the whole feature. "Until I turn it off" is still the default,
                because that is what the two household seats always are. */}
            {seatOffered ? (
              <View style={{ gap: t.space.sm }} testID="family.invite.seat">
                <Label>How long they stay</Label>
                {/* 24 hours, 1 week, 1 month, then until I turn it off, in the owner's order
                    (2026-10-08); the evening went */}
                <View style={[styles.chips, { gap: t.space.sm }]}>
                  {SEAT_DURATIONS.map(d => (
                    <Chip
                      key={d.hours}
                      label={d.label}
                      selected={seat === d.hours}
                      onPress={() => setSeat(d.hours)}
                      testID={`family.seat.${d.hours}`}
                    />
                  ))}
                  <Chip
                    label={SEAT_UNTIL_OFF}
                    selected={seat === null}
                    onPress={() => setSeat(null)}
                    testID="family.seat.permanent"
                  />
                </View>
                <BodySm ink="text2" testID="family.invite.seat.detail">
                  {seatDetail === null
                    ? 'They stay until you turn it off, with the X on their row under People.'
                    : `Their access ends by itself, ${seatDetail}. Nothing to remember and nothing to cancel.`}
                </BodySm>
              </View>
            ) : null}
            {invite?.code ? (
              <View
                style={[styles.codeWrap, { marginVertical: t.space.lg, gap: t.space.sm }]}
                testID="family.code"
              >
                {/* two threes, as it is read out: "WDJ-BMA"; a screen reader spells it. The
                    countdown under it runs from the server's own `expires_at`: 05:00 (0144) */}
                <Numeric
                  variant="display"
                  accessibilityLabel={`Invite code ${invite.code.split('').join(' ')}`}
                  selectable
                >
                  {formatInviteCode(invite.code)}
                </Numeric>
                <BodySm testID="family.code.expires">
                  {secondsLeft > 0 ? (
                    <>
                      {'Expires in '}
                      <Numeric variant="bodySm" ink="text2">{`${mm}:${ss}`}</Numeric>
                      {'. It works once.'}
                    </>
                  ) : (
                    'This code expired. Create a new one.'
                  )}
                </BodySm>
                {/* TWO DIFFERENT CLOCKS, and saying only one of them would mislead: the
                    countdown above is the CODE, this line is the SEAT, and the seat's starts
                    when they join rather than now. */}
                {invite.seat_hours === undefined ? null : (
                  <BodySm ink="text2" testID="family.code.seat">
                    {`Once they join, their access lasts ${
                      SEAT_DURATIONS.find(d => d.hours === invite.seat_hours)?.detail ??
                      'for a set time'
                    }.`}
                  </BodySm>
                )}
              </View>
            ) : null}
            {invite?.url ? <BodySm testID="family.link">{JOIN.share.sent}</BodySm> : null}
            {error ? (
              <BodySm
                ink="crit"
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                testID="family.invite.error"
              >
                {error}
              </BodySm>
            ) : null}
            {/* THE CONTROL LOOKS GATED BEFORE IT IS TAPPED (CLAUDE.md §4): the lock is on the
                button and the sentence under it says what is behind, so nobody fills in a code
                and then meets a paywall. The press still opens the gate rather than doing
                nothing — a dead control teaches a parent the app is broken. */}
            <Button
              label="Create an invite code"
              {...(room ? {} : { icon: 'lock' as const })}
              onPress={() => void create('CODE')}
              testID="family.invite.create_code"
            />
            <Button
              label="Share a link instead"
              variant="secondary"
              {...(room ? {} : { icon: 'lock' as const })}
              onPress={() => void create('LINK')}
              testID="family.invite.create_link"
            />
            {room ? null : (
              <BodySm ink="text2" testID="family.invite.locked">
                {role === 'PARENT'
                  ? 'Both parents are here. Plus adds more people, each with their own login.'
                  : 'Caregivers and view only come with Plus, each with their own login.'}
              </BodySm>
            )}
            {role === 'PARENT' ? (
              <BodySm testID="family.invite.parent_rule">{JOIN.share.parentRule}</BodySm>
            ) : null}
            <BodySm>
              A caregiver can log for the baby but cannot change settings, billing or private mom
              entries, and gets reminders only while they’re on. View only can look, not log.
            </BodySm>
          </View>
        </Card>
      ) : (
        <BodySm testID="family.readonly">
          Only a parent or the owner can invite people or change roles.
        </BodySm>
      )}

      {/* LEAVING A HOUSEHOLD NOBODY ELSE IS IN (migration 0143; the owner, 2026-09-29: "Should a
          household with nobody else in it get a 'Leave' option?" "Yes."). The way out of a
          household set up by mistake, drawn only while the roster is this person alone, and last
          on the page, quiet: never its primary button (`LeaveHouseholdSection`).

          AND JOINING ANOTHER HOUSEHOLD, first in the same group (the owner's report of 2026-09-29:
          "how does if caregiver takes care of more than 2 babies from different households?").
          Here, where the household's people are, for everyone in it — a nanny or a grandparent is
          exactly who asks. Since 0153 it joins: up to five families, a parent in one of them, and
          the family joined comes on screen. At the limit the sheet says so instead; it never takes
          a code it would have to refuse. A ROW, as Leave is (the owner, 2026-09-30: "Why join another household is not a
          button, it just look different"): it was a bare ghost button over the Leave row, two
          doors out of the household drawn two ways.

          AND STARTING ONE'S OWN, under it (the owner, 2026-10-08; 0154): a nanny or a grandparent
          who helps in other families and now has a baby of their own. Setup is pushed over this
          page (`auth/startFamily.ts`). DRAWN ONLY WHEN IT CAN WORK: below the limit and with no
          parent's seat anywhere (core `ownFamilyVerdict`). A parent here, or somebody in five
          families, would only meet the server's refusal at the end of six pages, so the row is
          left out rather than drawn and refused: a control that does nothing teaches the app is
          broken (CLAUDE.md). The cheapest choice; the server refuses the same two anyway.

          AND LEAVING A FAMILY OTHERS ARE IN, for a caregiver or a viewer (2026-10-08): the same
          group gets "Leave <family>" (`LeaveSeatSection`, drawn by the section below), the door
          the limit's sentence ("leave one first, from Family in More") points to. A parent leaves
          the same way since the owner's "build everything" (2026-10-08); the owner's row says
          "Make someone else the owner first" and opens the transfer below (`makeOwnerToLeave`). */}
      <LeaveHouseholdSection
        members={members}
        confirmAt={route.params?.confirmLeave ?? null}
        onReveal={() => scroller.current?.scrollToEnd({ animated: true })}
        onRefresh={() => void load()}
        onMakeOwner={m => void makeOwnerToLeave(m)}
        leading={[
          <Row
            key="join"
            title={JOIN.inHousehold.familyButton}
            detail={JOIN.inHousehold.familyDetail}
            icon="link"
            onPress={() => nav.navigate('JoinCode')}
            testID="family.join_other"
          />,
          ...(canStartOwnFamily(account)
            ? [
                <Row
                  key="own"
                  title={OWN_FAMILY.row}
                  detail={OWN_FAMILY.rowDetail}
                  icon="plus"
                  onPress={() => nav.navigate('Onboarding')}
                  accessibilityHint={OWN_FAMILY.rowHint}
                  testID="family.start_own"
                />,
              ]
            : []),
        ]}
      />
      {/* the confirmation the X and Remove ask with, mounted on this screen (`ui/confirm.tsx`) */}
      {confirm.element}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  codeWrap: { alignItems: 'center' },
});
