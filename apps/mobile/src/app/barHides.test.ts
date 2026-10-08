/**
 * THE TOP BAR STEPS OUT OF THE PAGE'S WAY (the owner, 2026-09-27: *"when scrolling through the
 * page, the header stays or frozen"*, then, of the three ways offered, *"Hide on scroll down"*),
 * AND THE PAGE NEVER MOVES WHILE IT DOES (2026-09-28: *"its like its shaking a little bit, making it
 * look blurry … app wide"*; their screen recording showed the content stepping +13, −5, +15, −5 px
 * a frame while the finger was down, because the first version slid the scroller itself).
 *
 * The movement is an Animated graph on the native side (`Screen.tsx` `barShift`), which node cannot
 * run, so these hold the rules it is built from — the same rules the prototype plays in the browser
 * (`prototype/ui-prototype.html`, `appbarFollow`).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const screen = readFileSync(join(here, 'Screen.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  .replace(/\s+/g, ' ');

describe('the top bar hides on a scroll down and comes back on a scroll up', () => {
  it('does it on every page with the top bar, and never on a pushed page’s Back', () => {
    expect(screen).toContain(
      "const hides = chrome && title === undefined && scroll && !(pulls && Platform.OS === 'ios');",
    );
    expect(screen).toContain('const row = hides ? Math.max(0, barHeight - insets.top) : 0;');
  });

  it('follows the finger both ways, and is all there at the top of a page', () => {
    // one point of bar for one point of page, in either direction, within the bar's row
    expect(screen).toContain('const moved = Animated.diffClamp(y, 0, row);');
    // never hidden by more than the page has scrolled: min(moved, y)
    expect(screen).toContain(
      'Animated.multiply(Animated.subtract(Animated.add(moved, y), gap), 0.5)',
    );
    // a pull past the top reads as the top
    expect(screen).toContain(
      "offsetValue.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolateLeft: 'clamp', })",
    );
  });

  /**
   * THE FIX FOR THE SHAKE, held as the one thing that must not come back: nothing between the
   * screen and the scroller moves on the screen. The frame the page is shown through moves its top
   * edge with the bar, and the scroller inside it is moved back by exactly as much, so what is under
   * the finger stays where it is. A scroller moved under the finger reads its own movement as the
   * finger's, and answers it.
   */
  it('never moves the scroller: the frame and the page inside it move by opposite amounts', () => {
    expect(screen).toContain('const clipTop = Animated.add(bar, padTop);');
    expect(screen).toContain('return { bar, clipTop, counter: Animated.multiply(clipTop, -1) };');
    expect(screen).toContain(
      'styles.clip, barShift ? { transform: [{ translateY: barShift.clipTop }] } : { top: padTop }, ]} > <Animated.View style={[ styles.screen, barShift ? { transform: [{ translateY: barShift.counter }] } : { marginTop: -padTop }, ]} > {scrollView} {overlayLayer} </Animated.View>',
    );
    // no transform anywhere that is not one of those two, the bar's, or its picture's
    const moves = screen.match(/translateY: [\w.]+/g) ?? [];
    expect(new Set(moves)).toEqual(
      new Set([
        'translateY: barShift.clipTop',
        'translateY: barShift.counter',
        'translateY: barShift.bar',
      ]),
    );
    // the page is laid under the status bar, absolutely, so the bar's measure never shifts it
    expect(screen).toContain('<View style={[styles.page, { top: insets.top }]}>');
    // and its content starts one bar lower, the spinner with it
    expect(screen).toContain(
      'contentContainerStyle={[styles.scroll, hides ? { paddingTop: padTop } : null]}',
    );
    expect(screen).toContain('{...(hides ? { progressViewOffset: padTop } : {})}');
  });

  it('slides the bar under the status bar, clipped there, and never over the clock', () => {
    expect(screen).toContain(
      '<View pointerEvents="box-none" style={[styles.barClip, { top: insets.top, height: row }]} >',
    );
    expect(screen).toContain(
      "barClip: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },",
    );
    // the row is drawn from the screen's top inside the clip, so its inset is where it always was
    expect(screen).toContain(
      'style={[ styles.barRow, { top: -insets.top }, barShift ? { transform: [{ translateY: barShift.bar }] } : null, ]} > {bar} </Animated.View>',
    );
  });

  it('stays put while a tour or a tip is up, while a screen reader is on, and under a banner', () => {
    expect(screen).toContain(
      "const held = (tour !== null && tour.phase !== 'off') || screenReader || bannerUp;",
    );
    expect(screen).toContain('letGo.setValue(held ? 0 : 1);');
    // the banner sits right under the bar, and the page starts under it
    expect(screen).toContain('const padTop = row + (hides && bannerUp ? bannerHeight : 0);');
    expect(screen).toContain('<View style={[styles.underBar, { top: row }]}');
  });

  it('is driven on the native side, on the frame the page moves', () => {
    expect(screen).toContain(
      'const nativeY = scrollY ?? (heartMoves || hides ? heart.offset : undefined);',
    );
    expect(screen).toContain('const offsetValue = scrollY ?? heart.offset;');
  });
});
