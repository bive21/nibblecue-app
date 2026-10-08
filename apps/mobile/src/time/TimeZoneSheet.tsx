/**
 * THE PHONE'S CLOCK, WHILE AWAY — the sheet behind More's "Time zone" row (the owner, 2026-09-23:
 * "use the phone's time zone while traveling").
 *
 * Two choices and the reason for each. Following the phone is the default and the rule; home time
 * is for the one case the rule gets wrong — a parent away from a baby who stayed home, whose 7 a.m.
 * bottle is still 7 a.m. at home. The choice is this phone's and this trip's (`zoneStore.ts`), and
 * the sheet says so, because a parent who picks it in March should not find it still picked in
 * July.
 *
 * A SETTING THAT CHANGES WHAT EVERY SCREEN SHOWS IS SHOWN CHANGING (docs/DESIGN_SYSTEM.md §17): the
 * sheet stays open on the pick, with the tick moved and a toast naming the clock now in use, so the
 * parent sees the change land rather than trusting it did.
 */
import { BodySm, BottomSheet, Row, Rows, useTheme } from '@nibblecue/ui';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../ui/toast';
import { ZONE_COPY } from './copy';
import { useMakeHome, useZones } from './useZone';

export interface TimeZoneSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function TimeZoneSheet({ visible, onClose }: TimeZoneSheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const zones = useZones();
  const home = zones.home;
  const { account } = useAuth();
  const isOwner = account?.memberships[0]?.role === 'OWNER';
  const makeHome = useMakeHome();
  const [moving, setMoving] = useState(false);

  /*
    MOVED FOR GOOD. The owner only, and only while away — the one case where "home" is simply out of
    date. It acts at once and offers Undo, like every other household change here: the server keeps
    the old answer until it is told otherwise, and telling it again is the whole of undoing it.
  */
  const moveHome = async () => {
    if (home === null || moving) return;
    const was = home;
    const to = zones.device;
    setMoving(true);
    const r = await makeHome(to);
    setMoving(false);
    if (!r.ok) {
      toast.show(
        r.status === 403
          ? ZONE_COPY.notOwner
          : r.status === 422
            ? ZONE_COPY.unknownZone
            : ZONE_COPY.offline,
      );
      return;
    }
    onClose();
    toast.show(ZONE_COPY.madeHome(to), {
      // an undo that did not reach the server must say so, or home silently stays moved
      undo: () =>
        void makeHome(was).then(back => {
          if (!back.ok) toast.show(ZONE_COPY.offline);
        }),
    });
  };

  const choose = (keep: boolean) => {
    if (keep === zones.keepingHome || home === null) return;
    zones.setKeepHome(keep);
    toast.show(keep ? ZONE_COPY.keptToast(home) : ZONE_COPY.followToast(zones.device));
  };

  return (
    <BottomSheet
      visible={visible}
      title={ZONE_COPY.sheetTitle}
      onClose={onClose}
      detent="content"
      bottomInset={insets.bottom}
      testID="timezone"
    >
      <View style={{ gap: t.space.lg }}>
        <Rows testID="timezone.choices">
          <Row
            title={ZONE_COPY.phone}
            detail={ZONE_COPY.phoneDetail(zones.device)}
            icon="clock"
            selected={!zones.keepingHome}
            onPress={() => choose(false)}
            testID="timezone.phone"
          />
          {home !== null && zones.away ? (
            <Row
              title={ZONE_COPY.home}
              detail={ZONE_COPY.homeDetail(home)}
              icon="home"
              selected={zones.keepingHome}
              onPress={() => choose(true)}
              testID="timezone.home"
            />
          ) : null}
        </Rows>
        <View style={{ paddingHorizontal: t.space.xs }}>
          <BodySm>{ZONE_COPY.footnote}</BodySm>
        </View>
        {isOwner && home !== null && zones.away ? (
          <View style={{ gap: t.space.sm }}>
            <View style={{ paddingHorizontal: t.space.xs }}>
              <BodySm>{ZONE_COPY.moved}</BodySm>
            </View>
            <Rows testID="timezone.move">
              <Row
                title={ZONE_COPY.makeHome(zones.device)}
                detail={ZONE_COPY.makeHomeDetail}
                icon="home"
                onPress={() => void moveHome()}
                testID="timezone.make_home"
              />
            </Rows>
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}
