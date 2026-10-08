/**
 * MORE (docs/PRODUCT.md §More): CuddleCue's More page, with NibbleCue's rows. Three groups, by
 * who the row is about: the baby's food (the allergen tracker, what was noticed, milk, the two
 * sheets, the food profile), the family (members and invites, supplies), and the app (NibbleCue
 * Plus, the phone's clock while away, help). A Plus row carries CuddleCue's lock and still opens
 * its page, which shows what is behind it (the rows are never a trap).
 *
 * The footer is CuddleCue's: the version and the line about who made it, opening About.
 */
import { BRAND, IN_APP_STRINGS } from '@nibblecue/brand';
import { roleLabel } from '@nibblecue/core';
import { Meta, Numeric, Row, Rows, SectionHeader, useTheme } from '@nibblecue/ui';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Screen } from '../../app/Screen';
import { useShell } from '../../app/shell';
import type { RootParams } from '../../app/types';
import { useAuth } from '../../auth/AuthContext';
import { cancelAllScheduledNotifications } from '../../auth/bindings';
import { openLocalDb } from '../../db';
import { LOCAL_ONLY_TABLES, LOCAL_SCHEMA_VERSION, MIRRORED_TABLES } from '../../db/schema';
import { resetDevice } from '../../dev/reset';
import { usePlan } from '../../plan/PlanProvider';
import { HELP, HelpSheet } from '../../sheets/HelpSheet';
import { ZONE_COPY } from '../../time/copy';
import { TimeZoneSheet } from '../../time/TimeZoneSheet';
import { useZones } from '../../time/useZone';
import { useToast } from '../../ui/toast';
import { MORE, NOTICED, SHEETS, MILK, ALLERGENS_PAGE } from '../nibble/copy';

const LOCAL_TABLES = [...MIRRORED_TABLES, ...LOCAL_ONLY_TABLES].slice().sort();

export function MoreScreen() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const shell = useShell();
  const plan = usePlan();
  const [helpOpen, setHelpOpen] = useState(false);
  const [zoneOpen, setZoneOpen] = useState(false);
  const zones = useZones();
  const { account, session, mock, env } = useAuth();
  const toast = useToast();
  const household = account?.memberships[0];
  const version = Constants.expoConfig?.version ?? '0.0.0';
  const lock = (key: Parameters<typeof plan.can>[0]) =>
    plan.can(key) ? {} : { locked: true, lockedHint: `Included with ${BRAND.plusTierName}` };

  const reportLocalDb = async () => {
    try {
      const db = await openLocalDb();
      const counts = await Promise.all(
        LOCAL_TABLES.map(async name => {
          const row = await db.get<{ n: number }>(`select count(*) as n from ${name}`);
          return { name, n: row?.n ?? 0 };
        }),
      );
      const total = counts.reduce((sum, c) => sum + c.n, 0);
      for (const c of counts) console.log(`local db  ${c.name.padEnd(30)} ${c.n}`);
      toast.show(`schema v${LOCAL_SCHEMA_VERSION} · ${LOCAL_TABLES.length} tables · ${total} rows`);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'the local database did not open');
    }
  };

  const startFresh = async () => {
    try {
      await resetDevice({
        mock: mock ?? null,
        cancelNotifications: cancelAllScheduledNotifications,
      });
      toast.show('Wiped. Close the app completely and reopen it.', { queue: false });
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'the reset did not finish');
    }
  };

  return (
    <Screen testID="more">
      <SectionHeader title={MORE.title} variant="tab" style={styles.flush} />

      <SectionHeader title={MORE.food} style={styles.flush} />
      <Rows testID="more.food">
        <Row
          title={ALLERGENS_PAGE.title}
          detail={MORE.allergensDetail}
          icon="shield"
          onPress={() => nav.navigate('Allergens')}
          testID="more.allergens"
        />
        <Row
          title={NOTICED.history}
          detail={MORE.noticedDetail}
          icon="note"
          onPress={() => nav.navigate('NoticedHistory')}
          testID="more.noticed"
        />
        <Row
          title={MILK.title}
          detail={MORE.milkDetail}
          icon="bottle"
          {...lock('milk')}
          onPress={() => nav.navigate('Milk')}
          testID="more.milk"
        />
        <Row
          title={SHEETS.caregiverTitle}
          detail={MORE.caregiverDetail}
          icon="users"
          {...lock('caregiverSheet')}
          onPress={() => nav.navigate('Caregiver')}
          testID="more.caregiver_sheet"
        />
        <Row
          title={SHEETS.summaryTitle}
          detail={MORE.summaryDetail}
          icon="chart"
          {...lock('pediatricianSummary')}
          onPress={() => nav.navigate('Summary')}
          testID="more.pediatrician_summary"
        />
        <Row
          title={MORE.profileTitle}
          detail={MORE.profileDetail}
          icon="sliders"
          onPress={() => nav.navigate('FoodProfile')}
          testID="more.profile"
        />
      </Rows>

      <SectionHeader title={MORE.family} />
      <Rows testID="more.household">
        <Row
          title="Family & caregivers"
          detail={
            household
              ? `${household.household_name} · ${roleLabel(household.role)}`
              : MORE.familyDetail
          }
          icon="users"
          onPress={() => nav.navigate('Family')}
          testID="more.family"
        />
        <Row
          title={MORE.suppliesTitle}
          detail={MORE.suppliesDetail}
          icon="box"
          onPress={() => nav.navigate('Supplies')}
          testID="more.supplies"
        />
      </Rows>

      <SectionHeader title={MORE.app} />
      <Rows testID="more.app">
        <Row
          title={MORE.plusTitle}
          detail={MORE.plusDetail}
          icon="star"
          onPress={() => nav.navigate('Plan')}
          testID="more.plus"
        />
        {zones.away ? (
          <Row
            title={ZONE_COPY.rowTitle}
            detail={ZONE_COPY.rowDetail(zones)}
            icon="clock"
            onPress={() => setZoneOpen(true)}
            testID="more.timezone"
          />
        ) : null}
        <Row
          title={HELP.rowTitle}
          detail={HELP.rowDetail}
          icon="info"
          onPress={() => setHelpOpen(true)}
          testID="more.help"
        />
      </Rows>

      {mock && env.stage !== 'production' && session ? (
        <Rows>
          <Row
            title="Dev: revoke this session on the server"
            detail="The next refresh forces a sign-out"
            onPress={() => mock.revokeSessions(session.user.id)}
            testID="more.dev.revoke_session"
          />
          <Row
            title="Dev: local database"
            detail={`Schema v${LOCAL_SCHEMA_VERSION} and a row count per table`}
            onPress={() => void reportLocalDb()}
            testID="more.dev.local_db"
          />
          <Row
            title="Dev: start fresh"
            detail="Wipe everything, like the app was just installed. Then close and reopen it."
            onPress={() => void startFresh()}
            testID="more.dev.start_fresh"
          />
          <Row
            title="Dev: Sync inspector"
            detail="The outbox, the cursors, and the dev writes"
            onPress={shell.openSyncInspector}
            testID="more.dev.sync_inspector"
          />
        </Rows>
      ) : null}

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`About ${BRAND.appDisplayName}, version ${version}. ${IN_APP_STRINGS.footerLine}`}
          onPress={shell.openAbout}
          style={({ pressed }) => [
            styles.about,
            {
              gap: t.space.xs,
              paddingHorizontal: t.space.xl,
              minHeight: t.hit.min,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
          testID="more.about"
        >
          <Numeric variant="meta" ink="text2" testID="more.version">
            {`${BRAND.appDisplayName} ${version}`}
          </Numeric>
          <Meta ink="text2" align="center" testID="more.madeby">
            {IN_APP_STRINGS.footerLine}
          </Meta>
        </Pressable>
      </View>
      <HelpSheet visible={helpOpen} onClose={() => setHelpOpen(false)} />
      <TimeZoneSheet visible={zoneOpen} onClose={() => setZoneOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flush: { marginTop: 0 },
  footer: { marginTop: 'auto', alignItems: 'center', width: '100%' },
  about: { alignItems: 'center', justifyContent: 'center' },
});
