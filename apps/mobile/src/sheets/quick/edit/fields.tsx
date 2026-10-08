/**
 * THE CORRECTION A CAPTURE SHEET DOES NOT ASK FOR, drawn only while it is correcting an entry
 * (`binding.ts`). Everything else an edit changes is the sheet's own control; this one exists
 * because the sheet decides the value itself when it logs, and a correction has to be able to say
 * otherwise. (A sleep's Nap or Night was the second, until the sleep's own forms drew the switch on
 * both a new sleep and a saved one: Option 2, 2026-10-05, `SleepSheet.tsx`.)
 *
 *   * A MEDICINE'S NAME AS LOGGED AND THE AMOUNT AS GIVEN. The medicine sheet names an entry by the
 *     row ticked and gives it the row's usual amount; an entry is corrected as the parent's own text
 *     (the solids audit, H7). No placeholder on the amount: a suggested amount is a suggested dose
 *     (CLAUDE.md rule 4), and nothing reads a number out of either field.
 */
import { Input } from '@nibblecue/ui';
import { CARE_COPY } from '../../care/copy';

export interface MedText {
  name: string;
  amount: string;
}

export function MedEditFields({
  value,
  onChange,
}: {
  value: MedText;
  onChange: (next: MedText) => void;
}) {
  return (
    <>
      <Input
        label={CARE_COPY.name}
        value={value.name}
        onChangeText={name => onChange({ ...value, name })}
        maxLength={200}
        testID="quick.med.name"
      />
      <Input
        label={CARE_COPY.amountAsGiven}
        value={value.amount}
        onChangeText={amount => onChange({ ...value, amount })}
        maxLength={200}
        testID="quick.med.amountAsGiven"
      />
    </>
  );
}
