/**
 * Whether a screen reader is on now, kept current as it is turned on and off. For the moments that
 * are pictures and nothing else (`DropCelebration`): to VoiceOver or TalkBack a picture of milk
 * landing is a second of nothing between a tap and the toast that says what was added, so it does
 * not play for them. Starts false — a moment the phone has not yet answered for is a moment shown.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useScreenReaderOn(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then(v => {
        if (live) setOn(v);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', v => setOn(v));
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return on;
}
