/**
 * THE BOOT WAIT: what the parent sees between the splash and the first screen, while the session is
 * read off the phone (`phase === 'booting'`, auth/AuthContext.tsx). Usually a few frames — the splash
 * hands over, the ground is the app's own, the session is there — and then it is only that ground.
 * If the app is still waiting after `LOADER_DELAY_MS`, the loader fades in: the mark travelling its
 * ∞ in the middle of the screen (the owner, 2026-09-26: *"if there is [a page where it's loading],
 * our loading icon shuold be our logo spinning non stop in an infinity shape"*; docs/BRANDING.md §2,
 * "Waiting").
 *
 * THE DELAY IS THE POINT. A loader that shows for a tenth of a second is a flicker, and a flicker
 * on every launch reads as something going wrong; a quick launch never shows one at all
 * (`logoLoader.ts` has the number and why).
 *
 * The view keeps its id (`booting`) and its ground (`app`): the first frame after the splash is
 * this ground, whatever else changes. The loader is the full-color mark, untinted — this is a
 * screen of its own, not a control with an ink — and one `progressbar` named "Loading" to a screen
 * reader. The fade is opacity on the native driver; under reduce motion and in the amber night it
 * is not played, and the loader is simply there, breathing in (`loaderMotion`).
 */
import { LOADER_DELAY_MS, LOADER_FADE_MS, LogoLoader, loaderMotion, useTheme } from '@nibblecue/ui';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

export function BootWait() {
  const t = useTheme();
  const still = loaderMotion(t.reduceMotion, t.theme) === 'breathe';
  // nothing but the ground until the wait has lasted long enough to be worth saying so
  const [waited, setWaited] = useState(false);
  const shown = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), LOADER_DELAY_MS);
    // a session read in time unmounts this first, and the loader is never drawn
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!waited || still) return;
    const run = Animated.timing(shown, {
      toValue: 1,
      duration: LOADER_FADE_MS,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [waited, still, shown]);

  return (
    <View style={[styles.fill, { backgroundColor: t.color.app }]} testID="booting">
      {waited ? (
        <Animated.View style={still ? null : { opacity: shown }}>
          <LogoLoader variant="large" testID="booting.loader" />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
