/**
 * A FULL SCREEN VIEW THAT RISES FOR THE KEYBOARD, in place of React Native's KeyboardAvoidingView
 * (`keyboardLift.ts` has the arithmetic and why that view is not used). The two Modals in the
 * design system that hold a field stand their content in one: `BottomSheet` and the stepper's
 * typed number (`StepperEntry`).
 *
 * THE KEYBOARD'S STATE LIVES IN THIS VIEW, NOT IN THE MODAL THAT HOLDS IT. A field that takes the
 * focus as its sheet opens brings the keyboard up while the sheet is still sliding in, and a
 * keyboard event then re-renders this view alone: its children are the same elements, so the
 * sheet's animated view is not rendered again mid-flight, which is how React Native's own view
 * kept it.
 *
 * WHICH EVENTS. iOS says where the keyboard is going before it moves (`keyboardWillShow`), and
 * that is the one to follow; but an iPhone that prefers cross-fade transitions can send it with
 * nothing in it, so the frame it reports once it is up (`keyboardDidShow`) is read as well, and a
 * report with no height never replaces one that had it. Android reports only once the keyboard is
 * up. A keyboard that was ALREADY up when the view mounted is read at once (`Keyboard.metrics`):
 * waiting for its next move would leave the sheet under it until the parent typed something.
 *
 * On iOS the lift follows the keyboard's own curve, as React Native's view did (a layout animation
 * over the event's duration); under reduce motion it simply lands. Android has no curve to follow.
 *
 * `inset` is the part of the content's own bottom padding the keyboard covers anyway: a sheet's
 * foot clears the phone's home indicator or buttons, and with the keyboard up those are under the
 * keyboard, so that much of the lift is already there.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  LayoutAnimation,
  Platform,
  View,
  type KeyboardEvent,
  type LayoutChangeEvent,
  type ViewProps,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { keyboardLift, type KeyboardFrame } from './keyboardLift';

const IOS = Platform.OS === 'ios';
const SHOWN = IOS
  ? (['keyboardWillShow', 'keyboardDidShow'] as const)
  : (['keyboardDidShow'] as const);
const HIDDEN = IOS ? 'keyboardWillHide' : 'keyboardDidHide';

export interface KeyboardLiftProps extends ViewProps {
  /** Bottom padding the content already has that the keyboard would cover; 0 by default. */
  inset?: number;
}

export function KeyboardLift({ inset = 0, style, onLayout, children, ...rest }: KeyboardLiftProps) {
  const reduceMotion = useTheme().reduceMotion;
  const [keyboard, setKeyboard] = useState<KeyboardFrame | null>(null);
  const [rootHeight, setRootHeight] = useState<number | null>(null);
  // the frame last taken, read synchronously so a report that changes nothing changes nothing
  const taken = useRef<KeyboardFrame | null>(null);

  useEffect(() => {
    // the next layout follows the keyboard's own curve: only for a report that moves something,
    // because a layout animation applies to whatever the next commit happens to be
    const take = (next: KeyboardFrame | null, e?: KeyboardEvent) => {
      const prev = taken.current;
      const same =
        prev === next ||
        (prev !== null &&
          next !== null &&
          prev.screenY === next.screenY &&
          prev.height === next.height);
      if (same) return;
      taken.current = next;
      if (IOS && !reduceMotion && e !== undefined && e.duration > 0) {
        const duration = Math.max(e.duration, 10);
        LayoutAnimation.configureNext({
          duration,
          update: { duration, type: LayoutAnimation.Types.keyboard },
        });
      }
      setKeyboard(next);
    };
    const shown = SHOWN.map(name =>
      Keyboard.addListener(name, e => {
        const { screenY, height } = e.endCoordinates;
        // a report with no height says nothing about where the keyboard is (cross-fade on iOS)
        if (!(height > 0)) return;
        take({ screenY, height }, e);
      }),
    );
    const hidden = Keyboard.addListener(HIDDEN, e => take(null, e));
    const up = Keyboard.isVisible() ? Keyboard.metrics() : undefined;
    if (up !== undefined && up.height > 0) take({ screenY: up.screenY, height: up.height });
    return () => {
      shown.forEach(s => s.remove());
      hidden.remove();
    };
  }, [reduceMotion]);

  const measure = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setRootHeight(prev => (prev === h ? prev : h));
    onLayout?.(e);
  };

  const lift = keyboardLift(keyboard, Platform.OS, rootHeight);
  const paddingBottom = lift > 0 ? Math.max(0, lift - inset) : 0;
  return (
    <View {...rest} style={[style, { paddingBottom }]} onLayout={measure}>
      {children}
    </View>
  );
}
