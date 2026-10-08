/**
 * Edit → on the Log section (the prototype's `quick-move` controls, which the owner asked for on
 * the device): WHICH TILES THE LOG SECTION SHOWS, and in what order. Everything a household can
 * quick-log is listed; a switch puts one on the section or takes it off, and the arrows move it.
 *
 * IT IS NOT MODULE SETTINGS, and the sheet now says so in its own title and lede. It read as if
 * it were, because Today capped the row at five whatever this sheet was told — so switching a
 * sixth module ON did nothing visible and the only honest conclusion was that the switches meant
 * something else (the owner, 2026-09-16: "the edit button needs to be … what you want to be shown
 * in the log menu. You should be able to have more than 6 boxes and it would just create a new
 * row"). The cap is gone (`todayQuickTiles`), the count is on screen, and a switch here changes
 * the grid behind the sheet. Turning a module OFF ALTOGETHER is a different screen and stays one:
 * nothing is deleted here, a module off the section is still one tap away in the Log sheet, and
 * what it logged is untouched.
 *
 * THE LIST DOES NOT REORDER ITSELF UNDER YOUR FINGER, and that is the second half of the bug the
 * owner kept reporting as "the toggle does not work" (2026-09-16, twice). Rows were drawn as
 * `[...shown, ...off]`, recomputed every render — so switching one off moved that row to the
 * BOTTOM of the list the instant it was tapped. The row vanished from where the finger was, a
 * different module's switch slid into its place still reading ON, and nothing about that is
 * distinguishable from a control that did nothing. The order is now frozen when the sheet opens
 * (`listed`): a switch changes a row's STATE, only an arrow changes its POSITION.
 *
 * The order is written the moment an arrow is tapped, because a sheet with a Save button is a
 * sheet you can lose work in, and there is nothing here that a second tap cannot undo.
 *
 * WHAT IT SHOWS IS WHAT TODAY DRAWS, from the same function — and that is the whole fix for the
 * bug it shipped with (the owner, 2026-09-16: "the log is now showing every module turned on, and
 * the toggle to disable it does not work"). The sheet used to derive its own list as "everything
 * quick-loggable minus `hidden`", which for a household that had never edited is ALL of them,
 * while Today drew the first five. So the two disagreed, and the first switch persisted the
 * sheet's view: turning one module off turned four others ON. Every write now stores the exact
 * membership the sheet is showing — `hidden` is always the complement of `shown` — so a switch
 * changes one thing and the grid behind the sheet matches it.
 */
import {
  MODULE_BY_ID,
  logRow,
  quickRowFrom,
  todayQuickTiles,
  type ModuleId,
  type QuickRowPrefs,
} from '@nibblecue/core';
import {
  AppText,
  BodySm,
  BottomSheet,
  Button,
  Chip,
  Icon,
  IconButton,
  Label,
  Meta,
  MODULE_ICON,
  Switch,
  useTheme,
} from '@nibblecue/ui';
import { useEffect, useRef, useState } from 'react';
import { useModuleLabels } from '../../modules/useModuleLabels';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { offModules, QUICK_EDIT_COPY } from './editCopy';

export { QUICK_EDIT_COPY };

export interface QuickEditSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Every module the household has on. */
  enabled: readonly ModuleId[];
  prefs: QuickRowPrefs;
  onChange: (next: QuickRowPrefs) => void;
  /** Opens What you track, where a module is turned on or off altogether. */
  onOpenModules: () => void;
}

export function QuickEditSheet({
  visible,
  onClose,
  enabled,
  prefs,
  onChange,
  onOpenModules,
}: QuickEditSheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const labels = useModuleLabels();
  // every module the LOG section can draw, and the ones Today is drawing right now — both from
  // core, so the sheet cannot show a different row from the screen. `logRow`, not `quickRow`:
  // bath, tummy time, medicine and temperature are the Care strip's, not a Log tile's, and a
  // switch for one here would be a switch for a tile that duplicates the cell under it.
  const available = logRow(enabled);
  const shown = todayQuickTiles(enabled, prefs);
  const off = offModules(enabled);

  // The ROW ORDER, frozen while the sheet is open. Re-seeded on each open so it reflects whatever
  // the household arranged last time, and nudged by the arrows — never by a switch.
  const [listed, setListed] = useState<readonly ModuleId[]>([]);
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      const on = todayQuickTiles(enabled, prefs);
      setListed([...on, ...logRow(enabled).filter(id => !on.includes(id))]);
    }
    wasVisible.current = visible;
  }, [visible, enabled, prefs]);
  // anything the frozen order does not know about (a module enabled while the sheet was open)
  // still gets a row rather than disappearing
  const rows = [
    ...listed.filter(id => available.includes(id)),
    ...available.filter(id => !listed.includes(id)),
  ];

  /** One write, one complete membership AND the whole list's order (`quickRowFrom` says why). */
  const commit = (next: readonly ModuleId[], order: readonly ModuleId[] = rows) =>
    onChange(quickRowFrom(available, next, order));

  /**
   * An arrow moves a row within the WHOLE list, whether it is on or off.
   *
   * It used to reorder `shown` alone, so every switched-off row had both arrows disabled — and a
   * dimmed row with two dead arrows is indistinguishable from a row that is disabled outright,
   * which is exactly what the owner reported (2026-09-16: "the toggle for other than the first 5
   * is disabled, cannot sort"). A row's position is now its own property; being off only means
   * it is not drawn on Today.
   */
  const move = (id: ModuleId, by: -1 | 1) => {
    const at = rows.indexOf(id);
    const to = at + by;
    if (at < 0 || to < 0 || to >= rows.length) return;
    const other = rows[to];
    if (other === undefined) return;
    const order = [...rows];
    order[to] = id;
    order[at] = other;
    setListed(order);
    commit(shown, order);
  };

  const toggle = (id: ModuleId, on: boolean) =>
    // ON keeps the row exactly where it is in the list — it appears on Today in that position,
    // never bumped to the end, because the list is the order and the switch is not.
    commit(on ? rows.filter(x => x === id || shown.includes(x)) : shown.filter(x => x !== id));

  return (
    <BottomSheet
      visible={visible}
      title={QUICK_EDIT_COPY.title}
      onClose={onClose}
      bottomInset={insets.bottom}
      testID="quick.edit"
    >
      <View style={{ gap: t.space.lg }}>
        <BodySm>{QUICK_EDIT_COPY.lede}</BodySm>
        <Meta>{QUICK_EDIT_COPY.count(shown.length)}</Meta>
        <View style={{ gap: t.space.sm }}>
          {rows.map(id => {
            const label = labels.label(id);
            const on = shown.includes(id);
            return (
              <View
                key={id}
                style={[
                  styles.row,
                  {
                    gap: t.space.md,
                    minHeight: t.hit.min,
                    paddingHorizontal: t.space.lg,
                    borderRadius: t.radius.m,
                    backgroundColor: t.color.surface2,
                  },
                ]}
                testID={`quick.edit.${id}`}
              >
                {/* THE CONTROLS ARE NEVER DIMMED. The row used to carry `opacity: 0.6` when the
                    module was off, which faded the switch and the arrows along with the label —
                    and a faded control reads as a disabled one. Only the NAME dims now, which is
                    the part that is actually saying "not on Today". */}
                <View style={[styles.name, { gap: t.space.md, opacity: on ? 1 : 0.55 }]}>
                  <Icon
                    name={MODULE_ICON[MODULE_BY_ID[id].icon] ?? 'note'}
                    size={18}
                    color={t.color.text2}
                  />
                  <AppText variant="bodyStrong" style={styles.grow}>
                    {label}
                  </AppText>
                </View>
                <IconButton
                  icon="up"
                  accessibilityLabel={QUICK_EDIT_COPY.moveUp(label)}
                  onPress={() => move(id, -1)}
                  disabled={rows.indexOf(id) <= 0}
                  testID={`quick.edit.${id}.up`}
                />
                <IconButton
                  icon="down"
                  accessibilityLabel={QUICK_EDIT_COPY.moveDown(label)}
                  onPress={() => move(id, 1)}
                  disabled={rows.indexOf(id) >= rows.length - 1}
                  testID={`quick.edit.${id}.down`}
                />
                <Switch
                  value={on}
                  onValueChange={v => toggle(id, v)}
                  accessibilityLabel={QUICK_EDIT_COPY.shown(label)}
                  testID={`quick.edit.${id}.switch`}
                />
              </View>
            );
          })}
        </View>
        <BodySm ink="text2">{QUICK_EDIT_COPY.footer}</BodySm>
        <BodySm ink="text2" testID="quick.edit.care">
          {QUICK_EDIT_COPY.careNote}
        </BodySm>

        {/* AND WHAT IS NOT TRACKED AT ALL, at the foot. A module that is off has no row above
            — there is nothing here to switch — so a parent looking for breastfeed after they
            turned it off found only its absence. Now it is named, greyed, with one way to the
            screen that owns it (`editCopy.ts` says why this replaced a sentence). */}
        <View style={{ gap: t.space.sm }} testID="quick.edit.off">
          <Label>{QUICK_EDIT_COPY.offHeader}</Label>
          {off.length === 0 ? (
            <BodySm ink="text2">{QUICK_EDIT_COPY.offNone}</BodySm>
          ) : (
            <>
              <BodySm ink="text2">{QUICK_EDIT_COPY.offNote}</BodySm>
              <View style={[styles.offWrap, { gap: t.space.sm }]}>
                {off.map(id => (
                  <Chip
                    key={id}
                    label={labels.label(id)}
                    small
                    icon={MODULE_ICON[MODULE_BY_ID[id].icon] ?? 'note'}
                    onPress={onOpenModules}
                    testID={`quick.edit.off.${id}`}
                  />
                ))}
              </View>
            </>
          )}
          <Button
            label={QUICK_EDIT_COPY.offCta}
            variant="secondary"
            size="sm"
            icon="sliders"
            onPress={onOpenModules}
            testID="quick.edit.off.cta"
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  offWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center' },
  name: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  grow: { flex: 1, minWidth: 0 },
});
