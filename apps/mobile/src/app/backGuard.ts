/**
 * NO BACK WHILE A PAGE IS STILL SLIDING (the owner, 2026-10-01, on Android in Expo Go: *"i change the
 * theme to night, then went to more, clicked family and close with my back button, then screen just
 * went black. i had to close expo and reopen"*; and once in Dark, *"the theme changes, but the tab
 * page just goes blank"*).
 *
 * WHAT THE BLACK WAS. Nothing drew black: it was the theme's own paper, the ground under every page
 * (`App.tsx`), with no page attached over it. On Android the native stack takes every page under
 * the new one OUT of the window when it pushes (react-native-screens `ScreenStack.onUpdate`), the
 * tabs among them, and puts the tabs back when the pushed page is popped. A Back that lands while
 * the push is still sliding (450 ms on Android 13 and later) pops a page that has not finished
 * arriving, and the library's own code carries a workaround for exactly that fast back-and-forth
 * (`ScreensCoordinatorLayout.clearAnimation`). When the race is lost the tabs, or the page inside
 * them, are never put back, and nothing asks again: the navigation state already says the tabs
 * are showing. It does not happen every time because the Back has to land inside half a second, a
 * window a theme change widens, since the whole app repaints under it and Expo Go runs the
 * slower development build of the JavaScript.
 *
 * SO A BACK WAITS FOR THE SLIDE. Every page the root stack moves says when its transition starts
 * and ends (`screenListeners` in `navigation.tsx`). While one is moving, Android's Back is taken
 * and dropped, and so is a tap on a page's own back arrow (`Screen.tsx`). The hold lets go when
 * the last transition ends, or after `BACK_HOLD_MS` whatever happens, so a missed event can never
 * leave Back dead. A second press after the slide does what the first one asked.
 *
 * ITS LISTENER IS ADDED WHEN A SLIDE STARTS, never at launch: Android asks the most recently added
 * listener first, and React Navigation adds its own when the app mounts, so only a listener added
 * later is asked before it. On iPhone there is no Back button to hold, and the arrow's guard is all
 * there is.
 */
import { BackHandler, Platform } from 'react-native';
import { createBackHold } from './backHold';

const guard = createBackHold({
  // true is "handled": the press goes no further, to React Navigation or to the system
  listen: held =>
    Platform.OS === 'android' ? BackHandler.addEventListener('hardwareBackPress', held) : null,
  schedule: (run, ms) => setTimeout(run, ms),
  cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
});

/** A page of the root stack began to slide in or out (`navigation.tsx`'s `screenListeners`). */
export const holdBack = (): void => guard.hold();
/** A page of the root stack finished its slide. */
export const endHold = (): void => guard.end();
/** Whether a Back now would land on a page still sliding: a page's own back arrow asks this. */
export const backHeld = (): boolean => guard.held();
