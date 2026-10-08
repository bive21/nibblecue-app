/**
 * Content deep links: resolved by `linking.ts` into an intent and acted on here, by landing on a
 * tab or opening a page. It renders nothing and sits inside the NavigationContainer beside the root
 * stack (CuddleCue's `LinkRouter`, without its coins, widgets and timers, none of which NibbleCue
 * has).
 *
 * Auth and invite links are not this file's: AuthContext subscribes to Linking for them and acts
 * on them. They are recognized and dropped, never held.
 *
 * A link that lands before the phase is `ready` (during boot, sign-in or setup) is held as the raw
 * URL and replayed exactly once when the phase turns ready, a tick later so the ready-phase routes
 * exist in the navigator before it navigates.
 */
import { BRAND } from '@nibblecue/brand';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { isAuthLink, resolveLink, type LinkIntent } from './linking';
import { onOwnLink } from './ownLinks';
import type { RootParams } from './types';
import { BACK_TO_TABS } from './backToTabs';

const ctx = {
  scheme: BRAND.urlScheme,
  host: BRAND.universalLinkHost,
  knownChildIds: [] as readonly string[],
};

export function LinkRouter() {
  const { phase } = useAuth();
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const ready = phase === 'ready';
  const held = useRef<string | null>(null);
  const replay = useRef<ReturnType<typeof setTimeout> | null>(null);

  const act = useCallback(
    (url: string) => {
      const intent: LinkIntent = resolveLink(url, ctx);
      switch (intent.kind) {
        case 'auth':
        case 'invite':
          return;
        case 'today':
          nav.navigate('Tabs', { screen: 'Today' }, BACK_TO_TABS);
          return;
        case 'plan':
          nav.navigate(
            'Tabs',
            {
              screen: 'PlanTab',
              params: intent.day === undefined ? undefined : { day: intent.day },
            },
            BACK_TO_TABS,
          );
          return;
        case 'foods':
          nav.navigate('Tabs', { screen: 'Foods' }, BACK_TO_TABS);
          return;
        case 'shopping':
          nav.navigate('Tabs', { screen: 'Shopping' }, BACK_TO_TABS);
          return;
        case 'food':
          nav.navigate('Food', { foodId: intent.foodId });
          return;
        case 'allergens':
          nav.navigate('Allergens');
          return;
        case 'noticed':
          nav.navigate('Noticed');
          return;
        case 'emergency':
          nav.navigate('Emergency');
          return;
        case 'subscription':
          nav.navigate('Plan');
          return;
      }
    },
    [nav],
  );

  const actRef = useRef(act);
  actRef.current = act;
  const readyRef = useRef(ready);
  readyRef.current = ready;

  const handle = useCallback((url: string) => {
    if (isAuthLink(url)) return;
    const kind = resolveLink(url, ctx).kind;
    if (kind === 'auth' || kind === 'invite') return;
    if (!readyRef.current) {
      held.current = url;
      return;
    }
    actRef.current(url);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Linking.getInitialURL().then(url => {
      if (url && !cancelled) handle(url);
    });
    const sub = Linking.addEventListener('url', e => handle(e.url));
    const own = onOwnLink(handle);
    return () => {
      cancelled = true;
      sub.remove();
      own();
    };
  }, [handle]);

  useEffect(() => {
    if (!ready || held.current === null) return;
    const url = held.current;
    held.current = null;
    replay.current = setTimeout(() => {
      replay.current = null;
      actRef.current(url);
    }, 0);
    return () => {
      if (replay.current) {
        clearTimeout(replay.current);
        replay.current = null;
      }
    };
  }, [ready]);

  return null;
}
