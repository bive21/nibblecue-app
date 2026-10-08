/**
 * HELP: the guidance cards for this baby's age, each opened in place with its points and its
 * sources, and the studio's address. Every card is published guidance with its source, never
 * generated (core's `guidance.data.ts`).
 */
import { BRAND } from '@nibblecue/brand';
import { cardsFor, SOURCE_BY_ID, type GuidanceCard } from '@nibblecue/core/nibble';
import {
  BodySm,
  BottomSheet,
  Caption,
  Disclosure,
  Label,
  Row,
  Rows,
  useTheme,
} from '@nibblecue/ui';
import { Linking, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNibble } from '../nibble/useNibble';
import { HELP } from './helpCopy';

export { HELP };

export interface HelpSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function HelpSheet({ visible, onClose }: HelpSheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const v = useNibble();
  const region = v.profile?.region ?? 'US';
  const cards: GuidanceCard[] = cardsFor(v.months, region);
  return (
    <BottomSheet
      visible={visible}
      title={HELP.title}
      onClose={onClose}
      detent="large"
      bottomInset={insets.bottom}
      testID="help"
    >
      <View style={{ gap: t.space.md }}>
        <Label>{HELP.guides}</Label>
        {cards.map(c => (
          <Disclosure key={c.id} summary={c.title} testID={`help.card.${c.id}`}>
            <View style={{ gap: t.space.xs }}>
              <BodySm>{c.body}</BodySm>
              {c.points.map(p => (
                <BodySm key={p}>{p}</BodySm>
              ))}
              <Caption>
                {c.sources.map(s => SOURCE_BY_ID.get(s)?.publisher ?? s).join(' · ')}
              </Caption>
            </View>
          </Disclosure>
        ))}
        <Rows>
          <Row
            title={HELP.contact}
            detail={HELP.contactDetail}
            icon="chat"
            onPress={() => void Linking.openURL(`mailto:${BRAND.supportEmail}`)}
            testID="help.contact"
          />
        </Rows>
        <Caption>{HELP.notMedical}</Caption>
      </View>
    </BottomSheet>
  );
}
