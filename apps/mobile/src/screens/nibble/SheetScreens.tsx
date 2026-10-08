/**
 * THE CAREGIVER SHEET AND THE PEDIATRICIAN SUMMARY (NibbleCue Plus): the sections `nibble/sheets.ts`
 * builds from the log, drawn as cards and shared as plain text through the platform's own sheet.
 */
import type { FeatureKey } from '@nibblecue/core';
import { Body, BodySm, BodyStrong, Button, Card, useTheme } from '@nibblecue/ui';
import { Share, View } from 'react-native';
import { Screen } from '../../app/Screen';
import { useShell } from '../../app/shell';
import {
  caregiverSections,
  sheetText,
  summarySections,
  type SheetInput,
  type SheetSection,
} from '../../nibble/sheets';
import { useNibble, type NibbleView } from '../../nibble/useNibble';
import { usePlan } from '../../plan/PlanProvider';
import { SHEETS } from './copy';
import { PlusLock } from './parts';
import { dayLabel } from './TodayScreen';

const inputOf = (v: NibbleView): SheetInput => ({
  childName: v.childName,
  months: v.months,
  band: v.band,
  profile: v.profile,
  foods: v.foods,
  foodById: v.foodById,
  statuses: v.statuses,
  allergens: v.allergens,
  noticed: v.noticedRecords,
});

function SheetPage({
  title,
  lede,
  heading,
  sections,
  feature,
  locked,
  testID,
}: {
  title: string;
  lede: string;
  heading: string;
  sections: SheetSection[];
  feature: FeatureKey;
  locked: string;
  testID: string;
}) {
  const t = useTheme();
  const plan = usePlan();
  const shell = useShell();
  const open = plan.can(feature);
  return (
    <Screen title={title} testID={testID}>
      <View style={{ gap: t.space.md }}>
        <Body>{lede}</Body>
        {!open ? (
          <PlusLock
            title={title}
            body={locked}
            onOpen={() => shell.openGate(feature)}
            testID={`${testID}.locked`}
          />
        ) : (
          <>
            <BodyStrong>{heading}</BodyStrong>
            {sections.map((s, i) => (
              <Card key={`${s.title}:${i}`}>
                <View style={{ gap: t.space.xs }}>
                  {s.title ? <BodyStrong>{s.title}</BodyStrong> : null}
                  {s.lines.map(l => (
                    <BodySm key={l}>{l}</BodySm>
                  ))}
                </View>
              </Card>
            ))}
            <Button
              label={SHEETS.share}
              icon="share"
              onPress={() => void Share.share({ message: sheetText(heading, sections) })}
              testID={`${testID}.share`}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

export function CaregiverScreen() {
  const v = useNibble();
  return (
    <SheetPage
      title={SHEETS.caregiverTitle}
      lede={SHEETS.caregiverLede}
      heading={SHEETS.caregiverHeading(v.childName)}
      sections={caregiverSections(inputOf(v), SHEETS)}
      feature="caregiverSheet"
      locked={SHEETS.caregiverLocked}
      testID="caregiver"
    />
  );
}

export function SummaryScreen() {
  const v = useNibble();
  return (
    <SheetPage
      title={SHEETS.summaryTitle}
      lede={SHEETS.summaryLede}
      heading={SHEETS.summaryHeading(v.childName, v.months)}
      sections={summarySections(inputOf(v), SHEETS, dayLabel)}
      feature="pediatricianSummary"
      locked={SHEETS.summaryLocked}
      testID="summary"
    />
  );
}
