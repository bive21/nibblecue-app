/**
 * THE KEYBOARD LIFTS EVERY MODAL THAT HOLDS A FIELD, ON BOTH PLATFORMS (the owner, 2026-09-28, on
 * setup's brands step, on an iPhone: "when the click to add is clicked, the screen feels like
 * something were about to show up but didnt, but the keyboard shows up and there is an overlay on
 * the screen").
 *
 * React Native's KeyboardAvoidingView reads where the keyboard's top edge is, and an iPhone can
 * say 0: the sheet was then pushed off the top of the screen, leaving the scrim and the keyboard.
 * On Android every Modal is drawn edge to edge and never resized for the keyboard. So the two
 * Modals in the design system that hold a field stand in `KeyboardLift`, whose arithmetic
 * (`keyboardLift.ts`) is walked here case by case. A third Modal that adds a field belongs in
 * `FIELD_MODALS`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { keyboardLift, MAX_LIFT_SHARE } from './keyboardLift';

// an iPhone 15's screen and keyboard, in points; a Pixel's, in dp
const IPHONE = { root: 852, keyboard: 336 };
const PIXEL = { root: 915, keyboard: 290 };

describe('keyboardLift on iOS: the keyboard stands on the bottom edge, so its height is the lift', () => {
  it('a keyboard reported the usual way lifts by its height', () => {
    const frame = { screenY: IPHONE.root - IPHONE.keyboard, height: IPHONE.keyboard };
    expect(keyboardLift(frame, 'ios', IPHONE.root)).toBe(IPHONE.keyboard);
  });

  it('a keyboard whose top is reported as 0 still lifts by its height, never by the screen', () => {
    // what React Native's view turned into a lift of the whole screen
    expect(keyboardLift({ screenY: 0, height: IPHONE.keyboard }, 'ios', IPHONE.root)).toBe(
      IPHONE.keyboard,
    );
  });

  it('before the root has been measured, the height is still the lift', () => {
    expect(keyboardLift({ screenY: 0, height: IPHONE.keyboard }, 'ios', null)).toBe(
      IPHONE.keyboard,
    );
  });

  it('a height past most of the screen is not believed: the sheet stays on it', () => {
    const lift = keyboardLift({ screenY: 0, height: IPHONE.root }, 'ios', IPHONE.root);
    expect(lift).toBe(Math.round(IPHONE.root * MAX_LIFT_SHARE));
    expect(lift).toBeLessThan(IPHONE.root);
  });
});

describe('keyboardLift on Android: how far the keyboard reaches into the edge to edge root', () => {
  it('an edge to edge root, not resized: the overlap is the lift', () => {
    const frame = { screenY: PIXEL.root - PIXEL.keyboard, height: PIXEL.keyboard };
    expect(keyboardLift(frame, 'android', PIXEL.root)).toBe(PIXEL.keyboard);
  });

  it('a window that did shrink for the keyboard: the keyboard starts below the root, so nothing', () => {
    const shrunk = PIXEL.root - PIXEL.keyboard;
    expect(keyboardLift({ screenY: shrunk, height: PIXEL.keyboard }, 'android', shrunk)).toBe(0);
  });

  it('a top reported as 0 is read from the height, as on iOS', () => {
    expect(keyboardLift({ screenY: 0, height: PIXEL.keyboard }, 'android', PIXEL.root)).toBe(
      PIXEL.keyboard,
    );
  });

  it('before the root has been measured, the height is the lift', () => {
    expect(
      keyboardLift(
        { screenY: PIXEL.root - PIXEL.keyboard, height: PIXEL.keyboard },
        'android',
        null,
      ),
    ).toBe(PIXEL.keyboard);
  });
});

describe('keyboardLift with no keyboard', () => {
  it.each([
    ['no keyboard', null],
    ['a keyboard of no height', { screenY: 0, height: 0 }],
    ['a height that is not a number', { screenY: 500, height: Number.NaN }],
  ])('%s lifts nothing', (_name, frame) => {
    expect(keyboardLift(frame, 'ios', IPHONE.root)).toBe(0);
    expect(keyboardLift(frame, 'android', PIXEL.root)).toBe(0);
  });
});

const here = dirname(fileURLToPath(import.meta.url));
const flat = (file: string): string =>
  readFileSync(join(here, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

const FIELD_MODALS = ['BottomSheet.tsx', 'StepperEntry.tsx'] as const;

describe('a Modal with a field in it stands in KeyboardLift', () => {
  it.each(FIELD_MODALS)('%s rises for the keyboard by the design system’s own lift', file => {
    const code = flat(file);
    expect(code).toContain('<KeyboardLift');
    // React Native's view is the one that read the keyboard's top edge
    expect(code).not.toContain('KeyboardAvoidingView');
  });

  it('the sheet takes its foot’s inset off the lift, and still shrinks rather than running off the top', () => {
    const code = flat('BottomSheet.tsx');
    expect(code).toContain('<KeyboardLift inset={bottomInset}');
    expect(code).toContain("sheet: { width: '100%', flexDirection: 'column', flexShrink: 1 }");
  });

  it('the slide moves a full screen view, and the sheet inside it has no transform of its own', () => {
    // iOS re-applies a view's transform from React's props when its SIZE changes, and those props
    // hold the slide's starting point (a window height down) until the slide ends: a sheet the
    // keyboard shortened mid-slide was put back below the screen (the header note)
    const code = flat('BottomSheet.tsx');
    expect(code).toContain(
      'style={[StyleSheet.absoluteFill, { opacity: fade, transform: [{ translateY: offset }] }]}',
    );
    expect(code).toContain(
      "style={[styles.sheet, detent === 'large' ? { height: maxHeight } : { maxHeight }]}",
    );
    expect(code.match(/translateY: offset/g)).toHaveLength(1);
  });

  it('iOS reads the frame once the keyboard is up as well as before it moves', () => {
    const code = flat('KeyboardLift.tsx');
    expect(code).toContain("['keyboardWillShow', 'keyboardDidShow']");
    // a report with no height never replaces one that had it
    expect(code).toContain('if (!(height > 0)) return;');
  });
});
