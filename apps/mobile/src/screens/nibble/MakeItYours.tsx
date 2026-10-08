/**
 * "MAKE THE PLAN YOURS" (docs/research/MARKET_AND_SETUP.md §2.7): the answers taken out of the setup
 * so it stays short, each one tap away, on the Plan tab once the plan has begun. Each row opens the
 * page where that answer lives; the card leaves when every row has been opened or it is put away.
 * Which rows were opened is kept on this phone only: it is a reminder, not a record.
 */
import { Row, Rows, Card, Label, Button, useTheme } from '@nibblecue/ui';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { BACK_TO_TABS } from '../../app/backToTabs';
import type { RootParams } from '../../app/types';
import { prefsStore } from '../../prefs/async-storage';
import { MAKE_YOURS } from './copy';
import { styles } from './parts';

type Nav = NativeStackNavigationProp<RootParams>;
type Key = 'cuisines' | 'never' | 'caregivers' | 'meals';
const KEYS: readonly Key[] = ['cuisines', 'never', 'caregivers', 'meals'];
const PREF = (childId: string): string => `nibble_make_yours:${childId}`;

export function MakeItYours({ childId, name }: { childId: string; name: string }) {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const [seen, setSeen] = useState<readonly string[] | null>(null);

  useEffect(() => {
    let live = true;
    void prefsStore
      .get(PREF(childId))
      .then(raw => {
        if (!live) return;
        try {
          setSeen(raw ? (JSON.parse(raw) as string[]) : []);
        } catch {
          setSeen([]);
        }
      })
      .catch(() => live && setSeen([]));
    return () => {
      live = false;
    };
  }, [childId]);

  if (seen === null || seen.includes('dismissed') || KEYS.every(k => seen.includes(k))) return null;
  const mark = (k: string) => {
    const next = [...new Set([...seen, k])];
    setSeen(next);
    void prefsStore.set(PREF(childId), JSON.stringify(next)).catch(() => undefined);
  };
  const open: Record<Key, () => void> = {
    cuisines: () => nav.navigate('FoodProfile'),
    never: () => nav.navigate('Tabs', { screen: 'Foods' }, BACK_TO_TABS),
    caregivers: () => nav.navigate('Caregiver'),
    meals: () => nav.navigate('FoodProfile'),
  };

  return (
    <Card testID="plantab.yours">
      <View style={{ gap: t.space.sm }}>
        <Label>{MAKE_YOURS.title}</Label>
        <Rows>
          {KEYS.filter(k => !seen.includes(k)).map(k => (
            <Row
              key={k}
              title={k === 'caregivers' ? MAKE_YOURS.caregivers(name) : MAKE_YOURS.rows[k]}
              detail={MAKE_YOURS.details[k]}
              onPress={() => {
                mark(k);
                open[k]();
              }}
              testID={`plantab.yours.${k}`}
            />
          ))}
        </Rows>
        <Button
          label={MAKE_YOURS.dismiss}
          variant="ghost"
          size="sm"
          onPress={() => mark('dismissed')}
          style={styles.start}
          testID="plantab.yours.dismiss"
        />
      </View>
    </Card>
  );
}
