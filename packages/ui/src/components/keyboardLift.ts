/**
 * HOW FAR A FULL SCREEN MODAL MUST RISE FOR THE KEYBOARD, as a number (the owner, 2026-09-28, on
 * setup's brands step: "when the click to add is clicked, the screen feels like something were
 * about to show up but didnt, but the keyboard shows up and there is an overlay on the screen. if i
 * type random things from the keyboard that shows up and click enter, the page is then seen"; on
 * an iPhone). Pure, so node can walk every case; `KeyboardLift.tsx` hands it the phone's numbers.
 *
 * WHY NOT REACT NATIVE'S KeyboardAvoidingView. It works the lift out from where the keyboard's top
 * edge is (`screenY`), and there are two phones on which that edge is not where it says:
 *
 *  - AN iPHONE CAN REPORT THE KEYBOARD'S TOP AS 0; one that prefers cross-fade transitions
 *    (Settings, Accessibility, Motion, which comes on with Reduce Motion) does. React Native's view
 *    then either gives up and leaves the sheet under the keyboard, or, where its own check for the
 *    setting does not answer yes, pads the sheet by the whole height of the screen and pushes it off
 *    the top. The second is what the owner saw: a scrim and a keyboard, no sheet, and the sheet
 *    back the moment Enter put the keyboard away. A modal's root fills the screen and the keyboard
 *    stands on its bottom edge, so on iOS the keyboard's HEIGHT is the lift, and the edge is not
 *    read at all; a report with no height is not a keyboard (`KeyboardLift.tsx` waits for the
 *    next one).
 *  - ANDROID DRAWS EVERY MODAL EDGE TO EDGE since React Native 0.86 and never resizes it for the
 *    keyboard, so there the lift is how far the keyboard's top reaches into this full screen root,
 *    which comes out as nothing on a phone whose window did shrink instead.
 *
 * NEVER MORE THAN MOST OF THE SCREEN (`MAX_LIFT_SHARE`): a number that would lift a sheet past the
 * top of the window is a wrong number, and a sheet still half under a keyboard can be scrolled
 * where one pushed off the screen cannot be reached at all.
 */

/** The two numbers of a keyboard event this needs: where its top is, and how tall it is. */
export interface KeyboardFrame {
  screenY: number;
  height: number;
}

/** The most of the root's height a keyboard may take: past this the numbers are not believed. */
export const MAX_LIFT_SHARE = 0.75;

/**
 * The padding under a full screen root that clears the keyboard, in points; 0 with no keyboard.
 * `rootHeight` is the root's own measured height, or null before its first layout.
 */
export function keyboardLift(
  keyboard: KeyboardFrame | null,
  platform: string,
  rootHeight: number | null,
): number {
  if (keyboard === null || !(keyboard.height > 0)) return 0;
  let lift: number;
  if (platform === 'ios' || rootHeight === null) {
    // the root fills the screen, so the keyboard's own height is its overlap; its top edge is not
    // trusted (0 when the phone prefers cross-fade transitions)
    lift = keyboard.height;
  } else {
    // how far the keyboard's top reaches into this root: nothing when the window was resized for
    // it; a top reported as 0 is read as the height, as on iOS
    const top = keyboard.screenY > 0 ? keyboard.screenY : rootHeight - keyboard.height;
    lift = rootHeight - top;
  }
  const most = rootHeight === null ? lift : rootHeight * MAX_LIFT_SHARE;
  return Math.max(0, Math.round(Math.min(lift, most)));
}
