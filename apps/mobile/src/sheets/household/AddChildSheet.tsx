/**
 * A second child, after setup (docs/MULTIPLES.md §8). Opened from Family (More's first Household
 * row; behind your initial for two days from 2026-09-27) and from the child switcher's last row;
 * both close first, so this is never a sheet on a sheet.
 *
 * TWO WRITES, IN ORDER, AND THE SECOND ONLY IF THE FIRST LANDED. The child row is an account
 * write and goes through the API — the server owns who may add a child (RLS `children_write`)
 * and the row has to exist on it before any device can see it. The rhythms copied for the new
 * child are local-first like every other rule and run only once the child exists, so a parent
 * offline gets one sentence and nothing half-written: no rules for a child who is not there.
 *
 * THE COPY IS OFFERED, NEVER SILENT. The toggle's default follows the gap between the dates of
 * birth (`suggestCopyRhythms` in core says why 60 days): a twin starts with the first child's
 * rhythms, a newborn sibling of a toddler does not. The parent flips it either way, and the
 * row says whose rhythms in words.
 *
 * A BABY ON THE WAY (2026-10-01; migration 0150): "Not yet" asks the due date instead of the date
 * of birth, lets the name wait (the server stores "Baby" until the birth sheet names it), and has
 * no rhythms to copy, since nothing is logged or reminded for a baby before the birth. The sibling
 * of a toddler gets the toddler's household as it is, with the Today card for the one on the way.
 */
import {
  checkNewChild,
  copySourceFor,
  DUE_AHEAD_DAYS,
  DUE_PAST_DAYS,
  isUnnamed,
  suggestCopyRhythms,
} from '@nibblecue/core';
import {
  BodySm,
  BottomSheet,
  Button,
  Input,
  Label,
  SegmentedControl,
  Switch,
  useTheme,
} from '@nibblecue/ui';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { deviceId } from '../../data/ids';
import { systemClock } from '../../data/repository';
import { copyRulesToChild } from '../../data/schedule';
import { openLocalDb, rethrowUnlessTeardown } from '../../db';
import { useChild } from '../../household/ChildContext';
import { todayIso } from '../../lib/locale';
import { DateField } from '../../ui/DateField';
import { useToast } from '../../ui/toast';
import { ONBOARD_EXPECTING } from '../../screens/onboarding/copy';
import { useTimeZone } from '../quick/prefs';

const REASON: Record<string, string> = {
  required: 'Pick a date of birth.',
  future: 'A date of birth cannot be in the future.',
  'due_date.window': 'A due date is within a year of the birth date.',
  too_small: 'Give the baby a name.',
  'due.invalid': 'Pick the due date.',
  'due.past': 'That due date is more than six weeks ago. If the baby is here, choose Yes.',
  'due.far': `That due date is more than ${DUE_AHEAD_DAYS} days away.`,
};

type ChildField = 'name' | 'birth_date' | 'due_date';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const fromIso = (s: string | null) => (s ? new Date(`${s}T12:00:00Z`) : null);
/** A day `days` from a `yyyy-mm-dd`, as the noon Date the pickers take. */
const noonAfter = (dayIso: string, days: number): Date => {
  const d = new Date(`${dayIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

/** The words for a baby on the way; the rest of the sheet's are inline, as they were. */
export const ADD_CHILD = {
  onTheWayNote: 'Today shows a card for the baby until the birth. Logging for them starts then.',
  addedOnTheWay: (name: string) =>
    isUnnamed(name) ? 'Added your baby on the way' : `Added ${name}`,
} as const;

export function AddChildSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { account, session, api, actions, analytics } = useAuth();
  const { children, select } = useChild();
  const timeZone = useTimeZone();
  const household = account?.memberships[0];

  const [name, setName] = useState('');
  const [onTheWay, setOnTheWay] = useState(false);
  const [birth, setBirth] = useState<string | null>(null);
  const [early, setEarly] = useState(false);
  const [due, setDue] = useState<string | null>(null);
  const [copy, setCopy] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: ChildField; text: string } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setOnTheWay(false);
    setBirth(null);
    setEarly(false);
    setDue(null);
    setCopy(null);
    setBusy(false);
    setError(null);
  }, [visible]);

  // nothing to copy to a baby on the way: no rule is kept for a child before the birth
  const source = useMemo(
    () => (onTheWay || birth === null ? null : copySourceFor(children, birth)),
    [children, birth, onTheWay],
  );
  // the toggle is pre-set from the dates and never re-set over a parent's own choice
  const copyOn =
    copy ??
    (birth !== null &&
      suggestCopyRhythms(
        children.map(c => c.birth_date),
        birth,
      ));

  const save = async () => {
    if (!household || busy) return;
    const check = checkNewChild(
      onTheWay
        ? { name, birth_date: null, due_date: due, expecting: true }
        : { name, birth_date: birth, due_date: early ? due : null },
      todayIso(new Date(), timeZone),
    );
    if (!check.ok) {
      setError({ field: check.field, text: REASON[check.reason] ?? 'Please check this.' });
      return;
    }
    setError(null);
    setBusy(true);
    const r = await api.addChild(household.household_id, check.value);
    if (!r.ok) {
      setBusy(false);
      setError({
        field: 'name',
        text:
          r.status === 403
            ? 'Only a parent or owner can add a child.'
            : r.status >= 500 || r.status === 0
              ? 'Could not reach the server. Try again when you are online.'
              : 'Could not add the child. Please check the details.',
      });
      return;
    }
    analytics.emit('child_added', {
      source: 'family',
      child_count_after: children.length + 1,
      has_due_date: check.value.due_date !== null,
    });
    let copied = 0;
    if (copyOn && source !== null && session) {
      const db = await openLocalDb();
      const out = await copyRulesToChild(db, systemClock, {
        householdId: household.household_id,
        createdBy: session.user.id,
        deviceId: await deviceId(db),
        source: 'sheet',
        fromChildId: source.id,
        toChildId: r.child.id,
      });
      copied = out.ruleIds.length;
    }
    await actions.refreshAccount();
    // a baby on the way is not one the bar can show yet: the selection stays where it was
    if (!onTheWay) select(r.child.id);
    setBusy(false);
    onClose();
    toast.show(
      onTheWay
        ? ADD_CHILD.addedOnTheWay(r.child.name)
        : copied > 0
          ? `Added ${r.child.name} · ${copied} rhythm${copied === 1 ? '' : 's'} from ${source?.name ?? ''}`
          : `Added ${r.child.name}`,
    );
  };

  return (
    <BottomSheet
      visible={visible}
      title="Add a child"
      onClose={onClose}
      detent="large"
      bottomInset={insets.bottom}
      footer={
        <Button
          label={busy ? 'Adding…' : 'Add'}
          // a teardown that began while the server was adding the child (the rhythms are copied
          // on this phone after it answers) leaves no database to copy them into: the account is
          // going away, and it is not a crash (2026-09-29). Anything else is as loud as it was.
          onPress={() => void save().catch(rethrowUnlessTeardown)}
          disabled={busy}
          testID="addchild.save"
        />
      }
      testID="addchild"
    >
      <View style={{ gap: t.space.lg }}>
        <View style={{ gap: t.space.sm }}>
          <Label>{ONBOARD_EXPECTING.question}</Label>
          <SegmentedControl
            options={[
              { value: 'born', label: ONBOARD_EXPECTING.born },
              { value: 'expecting', label: ONBOARD_EXPECTING.expecting },
            ]}
            value={onTheWay ? 'expecting' : 'born'}
            onChange={v => {
              setOnTheWay(v === 'expecting');
              setError(null);
            }}
            label={ONBOARD_EXPECTING.question}
            testID="addchild.expecting"
          />
        </View>
        <Input
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder={onTheWay ? ONBOARD_EXPECTING.namePlaceholder : 'Liam'}
          autoCapitalize="words"
          {...(error?.field === 'name' ? { error: error.text } : {})}
          testID="addchild.name"
        />
        {onTheWay ? (
          <View style={{ gap: t.space.xs }}>
            <DateField
              label={ONBOARD_EXPECTING.dueDate}
              value={fromIso(due)}
              onChange={d => setDue(iso(d))}
              minimumDate={noonAfter(todayIso(new Date(), timeZone), -DUE_PAST_DAYS)}
              maximumDate={noonAfter(todayIso(new Date(), timeZone), DUE_AHEAD_DAYS)}
              openAt={noonAfter(todayIso(new Date(), timeZone), 0)}
              testID="addchild.due_expected"
            />
            {error?.field === 'due_date' ? (
              <BodySm ink="crit" accessibilityRole="alert" testID="addchild.error">
                {error.text}
              </BodySm>
            ) : null}
            <BodySm ink="text2">{ADD_CHILD.onTheWayNote}</BodySm>
          </View>
        ) : (
          <View style={{ gap: t.space.xs }}>
            <DateField
              label="Date of birth"
              value={fromIso(birth)}
              onChange={d => setBirth(iso(d))}
              maximumDate={new Date()}
              testID="addchild.birth"
            />
            {error?.field === 'birth_date' ? (
              <BodySm ink="crit" accessibilityRole="alert" testID="addchild.error">
                {error.text}
              </BodySm>
            ) : null}
          </View>
        )}

        {onTheWay ? null : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Label>Born early</Label>
              <BodySm ink="text2">The due date lets the app count the age both ways.</BodySm>
            </View>
            <Switch
              value={early}
              onValueChange={v => {
                setEarly(v);
                if (!v) setDue(null);
              }}
              accessibilityLabel="Born early"
              testID="addchild.early"
            />
          </View>
        )}
        {early && !onTheWay ? (
          <View style={{ gap: t.space.xs }}>
            <DateField
              label="Due date"
              value={fromIso(due)}
              onChange={d => setDue(iso(d))}
              testID="addchild.due"
            />
            {error?.field === 'due_date' ? (
              <BodySm ink="crit" accessibilityRole="alert" testID="addchild.error">
                {error.text}
              </BodySm>
            ) : null}
          </View>
        ) : null}

        {source !== null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Label>{`Start with ${source.name}’s rhythms`}</Label>
              <BodySm ink="text2">
                {copyOn
                  ? `Every interval and medicine time ${source.name} has, for this baby too. Change any of them on Schedule.`
                  : 'A clean start: set the rhythms on Schedule when you are ready.'}
              </BodySm>
            </View>
            <Switch
              value={copyOn}
              onValueChange={setCopy}
              accessibilityLabel={`Start with ${source.name}'s rhythms`}
              testID="addchild.copy"
            />
          </View>
        ) : null}

        {/* the same small hint as Born early's and the rhythms' lines above it (the owner,
            2026-09-30: "why is the text in different format for born early and the twins and
            siblings underneath it?") */}
        <BodySm ink="text2">
          Twins and siblings each keep their own log, plan, vaccines and records. Switch between
          them from the top of every screen.
        </BodySm>
      </View>
    </BottomSheet>
  );
}
