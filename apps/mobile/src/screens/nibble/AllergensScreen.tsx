/**
 * THE ALLERGEN TRACKER (spec §6.5): each common allergen, where it is (not started, introduced,
 * in the week, established, on hold, not planned), how often it was offered, and how it is doing
 * against the plan's own weekly target. The parent's controls are the safe ones: put one on hold,
 * mark one their pediatrician approved, and take one off hold only after being told to talk to
 * their pediatrician first. The app never suggests offering a held allergen again (spec §1).
 */
import {
  ALLERGENS,
  allergenOrder,
  EMERGENCY_SIGNS,
  HELD_TEXT,
  SIGN_LABEL,
  SIGNS,
  STATE_LABEL,
  type AllergenId,
  type AllergenState,
} from '@nibblecue/core/nibble';
import {
  Body,
  BodySm,
  BodyStrong,
  BottomSheet,
  Button,
  Card,
  Disclosure,
  Row,
  Rows,
  useTheme,
} from '@nibblecue/ui';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../app/Screen';
import { useCanLog } from '../../household/useCanLog';
import { useNibble } from '../../nibble/useNibble';
import { useNibbleWrites } from '../../nibble/useNibbleWrites';
import { useConfirm } from '../../ui/confirm';
import { ALLERGENS_PAGE, PROFILE } from './copy';
import { NotMedical } from './parts';
import { dayLabel } from './dates';

export function allergenDetail(a: AllergenState): string {
  const parts: string[] = [STATE_LABEL[a.kind]];
  if (a.times > 0) parts.push(ALLERGENS_PAGE.times(a.times));
  if (a.kind === 'introduced' || a.kind === 'keeping_going' || a.kind === 'established')
    parts.push(ALLERGENS_PAGE.week(a.lastSevenDays, a.target));
  return parts.join(' · ');
}

export function AllergensScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const canLog = useCanLog();
  const v = useNibble();
  const writes = useNibbleWrites();
  const confirm = useConfirm('allergens.confirm');
  const [open, setOpen] = useState<AllergenId | null>(null);
  const order = allergenOrder(v.profile?.allergenOrder ?? []);
  const nuts = order.filter(a => ALLERGENS[a].group === 'tree_nut');
  const others = order.filter(a => ALLERGENS[a].group !== 'tree_nut');
  const mode = v.profile?.allergenMode ?? 'early';

  const row = (id: AllergenId) => {
    const a = v.allergens[id];
    return (
      <Row
        key={id}
        title={ALLERGENS[id].name}
        detail={allergenDetail(a)}
        {...(a.kind === 'held' || a.kind === 'excluded'
          ? { badge: { label: STATE_LABEL[a.kind], tone: 'warn' as const } }
          : a.due
            ? { badge: { label: 'Due', tone: 'accent' as const } }
            : {})}
        onPress={() => setOpen(id)}
        testID={`allergens.${id}`}
      />
    );
  };

  const update = (change: (p: NonNullable<typeof v.profile>) => NonNullable<typeof v.profile>) => {
    if (v.childId === null || v.profile === null || v.profileRecord === null) return;
    void writes.saveProfile(v.childId, v.profileRecord.id, change(v.profile), PROFILE.saved);
    setOpen(null);
  };

  const state = open ? v.allergens[open] : null;
  const paused = open !== null && (v.profile?.paused.includes(open) ?? false);
  const approved = open !== null && (v.profile?.approved.some(x => x.allergen === open) ?? false);

  return (
    <Screen title={ALLERGENS_PAGE.title} testID="allergens">
      <View style={{ gap: t.space.md }}>
        <Body>{ALLERGENS_PAGE.lede}</Body>
        <BodySm testID="allergens.mode">
          {mode === 'early'
            ? ALLERGENS_PAGE.modeEarly
            : mode === 'pediatrician'
              ? ALLERGENS_PAGE.modePediatrician
              : ALLERGENS_PAGE.modeNone}
        </BodySm>
        <Rows testID="allergens.list">{others.map(row)}</Rows>
        <Disclosure summary={ALLERGENS_PAGE.nuts} testID="allergens.nuts">
          <Rows>{nuts.map(row)}</Rows>
        </Disclosure>
        <Disclosure summary={ALLERGENS_PAGE.reaction} testID="allergens.reaction">
          <View style={{ gap: t.space.xs }}>
            {SIGNS.filter(s => s !== 'other').map(s => (
              <BodySm key={s} ink={EMERGENCY_SIGNS.includes(s) ? 'crit' : 'text2'}>
                {SIGN_LABEL[s]}
              </BodySm>
            ))}
          </View>
        </Disclosure>
        <NotMedical />
      </View>

      <BottomSheet
        visible={open !== null}
        title={open ? ALLERGENS[open].name : ''}
        onClose={() => setOpen(null)}
        bottomInset={insets.bottom}
        testID="allergen"
      >
        {open && state ? (
          <View style={{ gap: t.space.md }}>
            <Card>
              <View style={{ gap: t.space.xs }}>
                <BodyStrong>{STATE_LABEL[state.kind]}</BodyStrong>
                <BodySm>{allergenDetail(state)}</BodySm>
                {state.firstDay ? (
                  <BodySm>{ALLERGENS_PAGE.first(dayLabel(state.firstDay))}</BodySm>
                ) : null}
                {state.hold === 'noticed' ? <BodySm ink="warn">{HELD_TEXT}</BodySm> : null}
              </View>
            </Card>
            {canLog && v.profile ? (
              <View style={{ gap: t.space.sm }}>
                {state.hold === 'noticed' ? (
                  <Button
                    label={ALLERGENS_PAGE.resume}
                    variant="secondary"
                    onPress={() => {
                      const id = open;
                      void confirm
                        .ask({
                          title: ALLERGENS_PAGE.resume,
                          body: ALLERGENS_PAGE.resumeConfirm,
                          action: ALLERGENS_PAGE.resume,
                        })
                        .then(ok => {
                          if (ok)
                            update(p => ({
                              ...p,
                              cleared: [
                                ...p.cleared.filter(c => c.allergen !== id),
                                { allergen: id, on: v.today },
                              ],
                            }));
                        });
                    }}
                    testID="allergen.clear"
                  />
                ) : state.kind !== 'excluded' ? (
                  <Button
                    label={paused ? ALLERGENS_PAGE.resume : ALLERGENS_PAGE.pause}
                    variant="secondary"
                    onPress={() =>
                      update(p => ({
                        ...p,
                        paused: paused ? p.paused.filter(x => x !== open) : [...p.paused, open],
                      }))
                    }
                    testID="allergen.pause"
                  />
                ) : null}
                {(state.kind === 'not_planned' || state.kind === 'ask_first') && !approved ? (
                  <Row
                    title={ALLERGENS_PAGE.approve}
                    detail={ALLERGENS_PAGE.approveDetail}
                    icon="check"
                    onPress={() =>
                      update(p => ({
                        ...p,
                        approved: [...p.approved, { allergen: open, from: v.today }],
                      }))
                    }
                    testID="allergen.approve"
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
        {/* asked from this sheet, so mounted in it: iOS presents a Modal from the sheet it sits in */}
        {confirm.element}
      </BottomSheet>
    </Screen>
  );
}
