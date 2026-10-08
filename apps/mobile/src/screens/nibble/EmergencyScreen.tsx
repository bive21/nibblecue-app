/**
 * THE EMERGENCY CARD (spec §6.4, hard rule 18): the region's number in one tap, and what choking
 * looks like. Plain words, no lookup and no network: it works offline, and it is the first thing a
 * parent sees after ticking a sign that needs help now.
 */
import { EMERGENCY_NUMBER } from '@nibblecue/core/nibble';
import { Body, BodyStrong, Button, Card, H1, useTheme } from '@nibblecue/ui';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Linking, View } from 'react-native';
import { Screen } from '../../app/Screen';
import type { RootParams } from '../../app/types';
import { useNibble } from '../../nibble/useNibble';
import { EMERGENCY } from './copy';

type Nav = NativeStackNavigationProp<RootParams>;

export function EmergencyScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const then = useRoute<RouteProp<RootParams, 'Emergency'>>().params?.then;
  const v = useNibble();
  const number = EMERGENCY_NUMBER[v.profile?.region ?? 'US'];
  return (
    <Screen title={EMERGENCY.title} testID="emergency">
      <View style={{ gap: t.space.lg }}>
        <H1>{EMERGENCY.title}</H1>
        <Body>{EMERGENCY.body}</Body>
        <Button
          label={EMERGENCY.call(number)}
          variant="danger"
          size="lg"
          icon="alarm"
          onPress={() => void Linking.openURL(`tel:${number}`)}
          testID="emergency.call"
        />
        <Card>
          <BodyStrong>{EMERGENCY.choking}</BodyStrong>
        </Card>
        <Button
          label={then === 'noticed' ? EMERGENCY.back : EMERGENCY.done}
          variant="secondary"
          onPress={() => nav.goBack()}
          testID="emergency.back"
        />
      </View>
    </Screen>
  );
}
