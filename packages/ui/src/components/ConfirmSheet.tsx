/**
 * ConfirmSheet — THE ONE WAY THE APP ASKS BEFORE IT DOES SOMETHING (the owner, 2026-09-29: *"the
 * confirmation box is not in our ordinary design, im from android, and it look like an old text box
 * that android has. why does this not follow our design?"*; docs/DESIGN_SYSTEM.md §5.1).
 *
 * A `BottomSheet` like every other surface a parent meets: the handle, the question as its title
 * with Close beside it, one short line, then the action as a full-width button and Cancel under it
 * as a ghost (`confirmButtons`). So it wears the theme — Light, Dark, the amber Night — the scheme
 * and the skin, as everything else does, reads the phone's text size like every `Body`, and is
 * dismissed the ways every sheet is: Close, the scrim, a drag down and Android's Back are all
 * Cancel. A destructive action is the `danger` fill with white words, as Delete, Discard and Leave
 * household are drawn; any other action is the plain `primary`.
 *
 * NEVER A LOG SHEET'S COLOR. Asked from inside a capture sheet (ending a sleep for tummy time), the
 * question would inherit that sheet's `ModuleTint` and draw its action in the module's ink, as if
 * it logged something. It does not: the tint is put back to none round it.
 *
 * WHAT IT SAID STAYS WHILE IT LEAVES. The request goes to null the instant it is answered, and the
 * sheet then slides away for 220 ms; the last question is kept for those frames so the words do not
 * vanish from a sheet still on its way down.
 *
 * Controlled: `request` null is closed. The app's `useConfirm` (a question asked from a screen or a
 * sheet) and the shell (one asked from nowhere in particular) drive it through `confirmQueue`.
 */
import { useRef } from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { confirmButtons, type ConfirmRequest } from './confirm';
import { ModuleTint } from './ModuleTint';
import { Body } from './Text';

export interface ConfirmSheetProps {
  /** The question on the screen, or null for none. */
  request: ConfirmRequest | null;
  /** True for the action; false for Cancel, Close, the scrim, a drag down and Back. */
  onAnswer: (ok: boolean) => void;
  /** The safe-area bottom inset: the app knows it, this package does not (`BottomSheet`). */
  bottomInset: number;
  /** The sheet's id; its buttons are `<testID>.action` and `<testID>.cancel`. */
  testID?: string;
}

export function ConfirmSheet({
  request,
  onAnswer,
  bottomInset,
  testID = 'confirm',
}: ConfirmSheetProps) {
  const t = useTheme();
  // the question last asked, drawn while the sheet slides away after its answer (see the header)
  const shown = useRef<ConfirmRequest | null>(request);
  if (request !== null) shown.current = request;
  const q = shown.current;
  const [action, cancel] = q === null ? [null, null] : confirmButtons(q);
  return (
    <ModuleTint module={null}>
      <BottomSheet
        visible={request !== null}
        title={q?.title ?? ''}
        onClose={() => onAnswer(false)}
        bottomInset={bottomInset}
        footer={
          action === null || cancel === null ? undefined : (
            <View style={{ gap: t.space.xs }}>
              <Button
                label={action.label}
                variant={action.variant}
                size="lg"
                onPress={() => onAnswer(action.answer)}
                testID={`${testID}.${action.role}`}
              />
              <Button
                label={cancel.label}
                variant={cancel.variant}
                onPress={() => onAnswer(cancel.answer)}
                testID={`${testID}.${cancel.role}`}
              />
            </View>
          )
        }
        testID={testID}
      >
        {q === null ? null : (
          // the text ink, not the quiet one: this line is often the thing being asked about
          // ("Bottle, 4 oz at 3:15 PM"), and it is read once, in a hurry
          <Body testID={`${testID}.body`}>{q.body}</Body>
        )}
      </BottomSheet>
    </ModuleTint>
  );
}
