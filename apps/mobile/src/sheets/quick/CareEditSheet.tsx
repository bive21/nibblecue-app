/**
 * WHICH BABY CARE CELLS SHOW ON TODAY (the owner, 2026-09-18: "instead of being able to unhide
 * 'baby care', just have users be able to select which module is shown instead. bath will always,
 * just like in quick log 'edit->'").
 *
 * IT REPLACED A CROSSED-OUT EYE. The strip was all-or-nothing: hide the whole thing, and a heading
 * with "Show" on it to bring it back. That answered "I do not track this" and had no answer at all
 * for "I do two of these three" — which is what a household that baths and gives a vitamin but
 * does not do tummy time actually wants. The section is now exactly as wide as what is chosen:
 * three cells is a 1×3 row, two is 1×2, one fills the surface, none draws nothing (`careShown` in
 * core, and `CareTable` on Today).
 *
 * BATH'S SWITCH IS ON AND CANNOT MOVE, which the row says in words rather than only by being
 * disabled: "always on" beside it. A control that looks like the other two and silently refuses
 * is worse than one that explains itself. It also means the strip can never be emptied by
 * accident into a section a parent will report as missing.
 *
 * Switching a cell off changes what TODAY DRAWS and nothing else — the rhythms, the reminders and
 * the reports for that module carry on exactly as they were, and the footer says so. That was true
 * of the old eye too and is the one thing about it worth keeping.
 */
import { CARE_ALWAYS, CARE_MODULES, MODULE_BY_ID, type ModuleId } from '@nibblecue/core';
import { BodySm, BottomSheet, Meta, Row, Rows, useTheme, type IconName } from '@nibblecue/ui';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useModuleLabels } from '../../modules/useModuleLabels';

const CARE_EDIT_COPY = {
  title: 'What shows in Baby care',
  lede: 'Pick the ones you want on Today. The strip sizes itself to what you choose.',
  always: 'always on',
  footer:
    'This is only what Today shows. Reminders, rhythms and reports for anything you switch off carry on, and nothing you logged changes.',
  count: (n: number): string =>
    n === 0 ? 'Nothing on the strip, so it will be hidden' : `${n} on the strip`,
} as const;

export function CareEditSheet({
  visible,
  onClose,
  available,
  hidden,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  /** The care modules this household has on at all — the rest are not offered. */
  available: readonly (typeof CARE_MODULES)[number][];
  hidden: readonly ModuleId[];
  onChange: (next: readonly ModuleId[]) => void;
}) {
  const labels = useModuleLabels();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const rows = CARE_MODULES.filter(m => available.includes(m));
  const off = new Set(hidden);
  const shownCount = rows.filter(m => m === CARE_ALWAYS || !off.has(m)).length;

  return (
    <BottomSheet
      visible={visible}
      title={CARE_EDIT_COPY.title}
      onClose={onClose}
      bottomInset={insets.bottom}
      testID="care.edit"
    >
      <View style={{ gap: t.space.lg }}>
        <BodySm>{CARE_EDIT_COPY.lede}</BodySm>
        <Meta>{CARE_EDIT_COPY.count(shownCount)}</Meta>
        <Rows>
          {rows.map(id => {
            const pinned = id === CARE_ALWAYS;
            const on = pinned || !off.has(id);
            return (
              <Row
                key={id}
                title={labels.label(id)}
                icon={MODULE_BY_ID[id]?.icon as IconName}
                {...(pinned ? { detail: CARE_EDIT_COPY.always } : {})}
                {...(pinned ? {} : { switchValue: on })}
                {...(pinned
                  ? // NO `onSwitch` AT ALL, which is how `Row` decides whether it is a switch:
                    // bath draws as a plain row saying "always on" rather than as a control that
                    // looks identical to the other two and then refuses. The reason is read, not
                    // guessed at, and there is nothing to tap that does nothing.
                    { right: 'none' as const }
                  : {
                      onSwitch: (next: boolean) =>
                        onChange(
                          next
                            ? hidden.filter(h => h !== id)
                            : [...hidden.filter(h => h !== id), id],
                        ),
                    })}
                testID={`care.edit.${id}`}
              />
            );
          })}
        </Rows>
        <BodySm ink="text2">{CARE_EDIT_COPY.footer}</BodySm>
      </View>
    </BottomSheet>
  );
}
