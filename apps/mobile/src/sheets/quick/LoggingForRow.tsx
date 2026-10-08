/**
 * THE LOGGING-FOR ROW (docs/MULTIPLES.md §2): one chip per child plus Both / All n — and, while
 * Both / All n is the choice, who that is, in words, under it (`eachOwnEntry`).
 *
 * One component, drawn in two places. Inside the Quick Entry form, under its time row (QuickEntry;
 * PRODUCT_SPEC §5.2). And at the TOP of the three timer sheets — sleep, breastfeed, tummy time —
 * above their two path cards, because there one row answers for both paths and for a running
 * timer's panel: "Start sleeping" writes for the baby the row names exactly as "Already finished"
 * does. It used to live only inside the "Already finished" form, which was harmless while a sheet
 * on Both started on Both; since a sheet on Both starts on ONE baby (the owner, 2026-09-25;
 * `loggingForStart.ts`), a start card with no row above it would start a timer for a baby the
 * parent never saw chosen — tummy time's card starts on the tap.
 *
 * Nothing at all for a household with one child or a household-scoped module: the hook returns no
 * options, and a row with nothing to choose is noise.
 */
import { BodySm, Chip, Label, useTheme } from '@nibblecue/ui';
import { StyleSheet, View } from 'react-native';
import { eachOwnEntry, LOGGING_FOR } from './copy';
import { ALL, type LoggingForOption } from './save';

export interface LoggingForRowProps {
  options: readonly LoggingForOption[];
  value: string;
  onChange: (value: string) => void;
  /**
   * Whether the line under the row says who Both is. False only where the sheet names the babies
   * itself, and more exactly than this line could: the tandem feed says which baby is on which
   * side.
   */
  sayWhoOnAll?: boolean;
}

export function LoggingForRow({
  options,
  value,
  onChange,
  sayWhoOnAll = true,
}: LoggingForRowProps) {
  const t = useTheme();
  if (options.length === 0) return null;
  const names = options.filter(o => o.value !== ALL).map(o => o.label);
  return (
    <View style={{ gap: t.space.sm }} testID="quick.logging_for">
      <Label>{LOGGING_FOR}</Label>
      <View style={[styles.chips, { gap: t.space.sm }]}>
        {options.map(o => (
          <Chip
            key={o.value}
            label={o.label}
            selected={value === o.value}
            onPress={() => onChange(o.value)}
            testID={`quick.logging_for.${o.value}`}
          />
        ))}
      </View>
      {value === ALL && sayWhoOnAll ? (
        <BodySm ink="text2" testID="quick.logging_for.all">
          {eachOwnEntry(names)}
        </BodySm>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
});
