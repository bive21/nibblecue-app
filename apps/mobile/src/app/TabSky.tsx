/**
 * THE SAME SKY BEHIND EVERY TAB'S BAR (the owner, 2026-10-06: "look at the headers, why does it look
 * different on today's page and every other page? Pick one and make it uniform"). Today's sky was
 * the one header with a picture behind it; every other tab drew its bar straight on the ground, so
 * the top of the app changed as a parent moved between tabs. The sky is the one picked: it follows
 * the household's color scheme (`liveSkyFor`) and the hour, it fades into the page under the bar
 * (`SKY_FOOT`), and every word in the bar is measured over it (`theme/liveSky.test.ts`). `Screen`
 * draws it behind any tab's bar that brings no picture of its own.
 */
import { LiveSky } from '@nibblecue/ui';
import { useTimeZone } from '../sheets/quick/prefs';
import { useSkyPhase } from './useSkyPhase';

export function TabSky() {
  const phase = useSkyPhase(useTimeZone());
  return <LiveSky phase={phase} testID="screen.sky" />;
}
