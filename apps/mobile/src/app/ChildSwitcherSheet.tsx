/**
 * The child switcher (docs/DESIGN_SYSTEM.md §14; the prototype's SHEETS.children and its
 * "at once" row for multiples): one tap from the chip at the top of every screen. With two or
 * more children the first row is "Both at once" / "All n at once" — one screen, every baby
 * side by side — then a row per child with the age and the birth date. The current choice
 * shows a check AND an "On" badge, never a tint alone (nothing by color alone, MOBILE.md §9).
 *
 * "Add a child" opens the sheet in `sheets/household/AddChildSheet.tsx` (docs/MULTIPLES.md §8).
 * It was a DISABLED row saying "not in this build" from 2026-09-15 until 2026-09-17 — kept
 * visible rather than removed, because a control that appears to do nothing is the defect
 * PREFLIGHT.md lists first, and a missing one is a parent of twins concluding the app cannot.
 *
 * THIS IS THE DOOR NOW, for one child as for three (the owner, 2026-09-26: *"it should be when
 * clicking the baby's name and there is an option to add a child, remove it from the profile"*).
 * The chip opens this sheet whatever the count (`Screen.tsx` hands it `openChildSwitcher` with no
 * condition), so a household with one baby taps the name and finds that baby.
 * The menu behind the profile picture lost its copy of the row the same day.
 *
 * THE BAR IS THE EDITOR (the owner, 2026-10-03). Name, date of birth and photo are one sheet,
 * the same one Family's children row opens. The bar that already shows the name, the age and
 * the date opens it. Another baby still switches, which is what this sheet is for.
 *
 * WHO SEES THE ROW is who the server lets through (RLS `children_write`, `app.can_admin`): an
 * owner or a parent, the people Family offers its button to. The rule came here with the row from
 * the profile menu; a caregiver's tap would open a sheet only to be refused, which teaches
 * nothing (docs/MULTIPLES.md §8: "A caregiver does not see the door").
 */
import { BodySm, BottomSheet, haptic, Row, Rows, useTheme } from '@nibblecue/ui';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { ALL_CHILDREN, useChild, type ChildSelectionId } from '../household/ChildContext';
import { useShell } from './shell';
import { atOnceLabel, childDetail, childLine } from './childSwitcher';

/**
 * ASK MODE (docs/NFC_TAGS.md §3): the same list, borrowed to answer one question — which baby is
 * this CueCoin for. Three things change, and each is the difference between a right row and a
 * wrong one:
 *
 *   · NO "BOTH" ROW. The chip's "Both" is a way of LOOKING at two babies; as a logging answer it
 *     would write one diaper change twice, for a change that happened once.
 *   · the sheet says what it is asking about, because it arrived unbidden after a tap on a wall.
 *   · picking also switches the app to that baby, which is what a parent who just tapped the
 *     coin on her crib expects to see behind the sheet.
 */
export interface ChildAsk {
  /** The coin's name, for the line that explains why this appeared. */
  subject: string;
  onPick: (childId: string) => void;
}

export interface ChildSwitcherSheetProps {
  visible: boolean;
  onClose: () => void;
  ask?: ChildAsk | null;
}

export function ChildSwitcherSheet({ visible, onClose, ask = null }: ChildSwitcherSheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { children, expecting, selectedId, isAll, select, photoOf } = useChild();
  const shell = useShell();
  const { account } = useAuth();
  const role = account?.memberships[0]?.role;
  const canAddChild = role === 'OWNER' || role === 'PARENT';
  const tint = { fg: t.color.accent2, soft: t.color.accentSoft };
  const now = Date.now();

  const choose = (id: ChildSelectionId) => {
    // a choice that changes something is felt, as a chip chosen is ('tap'; feedback/haptics.ts);
    // the chip then splits into the pair or merges back once this sheet has gone (ChildChip.tsx)
    if (id !== selectedId) haptic('tap');
    select(id);
    onClose();
    // the answer goes out after the close, so the sheet is gone before the next one arrives
    if (ask !== null && id !== ALL_CHILDREN) ask.onPick(id);
  };

  /** Name, date and photo, together. This sheet closes first so two modals are not up. */
  const openDetails = (id: string) => {
    onClose();
    shell.openChildPhoto(id);
  };

  return (
    <BottomSheet
      visible={visible}
      title={ask === null ? 'Children' : 'Which baby?'}
      onClose={onClose}
      bottomInset={insets.bottom}
      testID="childswitcher"
    >
      <View style={{ gap: t.space.lg }}>
        {ask === null ? null : (
          <BodySm testID="childswitcher.ask">{`${ask.subject} · we’ll remember your answer until you close the app`}</BodySm>
        )}
        <Rows>
          {children.length > 1 && ask === null ? (
            <Row
              title={atOnceLabel(children.length)}
              detail="One screen, every baby side by side"
              icon="users"
              tint={tint}
              selected={isAll}
              {...(isAll ? { badge: { label: 'On', tone: 'accent' as const } } : {})}
              right="none"
              onPress={() => choose(ALL_CHILDREN)}
              testID="childswitcher.both"
            />
          ) : null}
          {children.map(c => {
            const on = selectedId === c.id;
            const photoUri = photoOf(c.id);
            // the baby in view (or the only baby) opens the sheet. Another baby still switches.
            // A coin's question only switches: it is asking which baby, not offering an edit.
            const edits = ask === null && (children.length === 1 || on);
            return (
              <Row
                key={c.id}
                title={c.name}
                detail={childDetail(c.birth_date, now)}
                /* THE BABY'S OWN FACE (docs/MEDIA.md; 2026-09-20), which is most of the point
                   of a switcher in a household with two: two names and two identical glyphs is
                   a list you have to read, and two faces is one you recognise. Without a photo
                   it is the generated circle — the default, not a placeholder. */
                avatar={{ name: c.name, ...(photoUri !== null ? { photoUri } : {}) }}
                selected={on}
                {...(on ? { badge: { label: 'On', tone: 'accent' as const } } : {})}
                {...(edits
                  ? {
                      right: 'chevron' as const,
                      accessibilityHint: 'Name, date of birth and photo',
                    }
                  : { right: 'none' as const })}
                onPress={() => (edits ? openDetails(c.id) : choose(c.id))}
                testID={`childswitcher.${c.id}`}
              />
            );
          })}
          {/* A BABY ON THE WAY (migration 0150): named, with its due date, and nothing to switch to
              until the birth, which Today's card records. Never a row to answer a coin with. */}
          {ask === null
            ? expecting.map(c => {
                const photoUri = photoOf(c.id);
                return (
                  <Row
                    key={c.id}
                    title={c.name}
                    detail={childLine(c, now)}
                    avatar={{ name: c.name, ...(photoUri !== null ? { photoUri } : {}) }}
                    right="chevron"
                    accessibilityHint="Name, date of birth and photo"
                    onPress={() => openDetails(c.id)}
                    testID={`childswitcher.${c.id}`}
                  />
                );
              })
            : null}
        </Rows>
        {/* no empty card: a caregiver in a household with no child yet has neither row.
            The name, the date and the photo are the bar above, not a row each. */}
        {ask !== null || !canAddChild ? null : (
          <Rows>
            <Row
              icon="plus"
              title="Add a child"
              detail="A twin, or a new baby in the house"
              tint={tint}
              right="chevron"
              onPress={() => {
                onClose();
                shell.openAddChild();
              }}
              testID="childswitcher.add"
            />
          </Rows>
        )}
        {ask !== null ? null : (
          <BodySm>
            Twins, triplets and multiples each keep their own log, schedule, vaccines and widgets.
            Switching is one tap from the top of every screen.
          </BodySm>
        )}
      </View>
    </BottomSheet>
  );
}
