import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * THE WORDMARK'S HIDDEN CREDITS, WIRED (the owner, 2026-09-25, of the "that's cool" list). The
 * tap counting and the sky are tested in packages/ui (`starfield.test.ts`); what is held here is
 * the About sheet's half — a source tripwire, because there is no renderer in this suite: the
 * wordmark counts its taps through the design system's counter, is felt through the one haptic
 * call, opens the starfield on the seventh, and hands it names READ from the brand package.
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'AboutSheet.tsx'), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('seven taps on the wordmark open the credits', () => {
  it('counts every tap on the wordmark with countTap, and opens the sky only when it fires', () => {
    expect(code).toContain('const tap = countTap(taps.current, Date.now());');
    expect(code).toContain('taps.current = tap.run;');
    expect(code).toContain('if (tap.fired) setStars(true);');
    expect(code).toMatch(/onPress=\{onWordmark\}/);
  });

  it('is felt through the design system’s one haptic call', () => {
    expect(code).toContain('const feel = tapFeel(tap);');
    expect(code).toContain('if (feel !== null) haptic(feel);');
    expect(code).not.toContain('expo-haptics');
  });

  it('keeps the wordmark an image to a screen reader, named as before, and its old testID', () => {
    const press = code.slice(code.indexOf('<Pressable'), code.indexOf('</Pressable>'));
    expect(press).toContain('accessibilityRole="image"');
    expect(press).toContain('accessibilityLabel={BRAND.appDisplayName}');
    expect(press).toContain('testID="about.wordmark"');
    expect(press).toContain('testID="about.egg"');
    // a 44 pt target round a 28 pt picture
    expect(press).toContain('hitSlop={Math.ceil((t.hit.min - WORDMARK_HEIGHT) / 2)}');
  });

  it('reads every name from the brand package and types none', () => {
    const credits = code.slice(code.indexOf('<StarfieldCredits'));
    expect(credits).toContain('title={BRAND.appDisplayName}');
    // the family line rides the credits too (the owner, 2026-09-27; docs/BRANDING.md §2c)
    expect(credits).toContain(
      'lines={[`Made by ${BRAND.developerName}`, IN_APP_STRINGS.familyLine, THANKS]}',
    );
    expect(credits).toContain('onClose={() => setStars(false)}');
  });

  it('thanks the parent, and says nothing about the baby', () => {
    const thanks = /const THANKS = '([^']+)';/.exec(code)?.[1] ?? '';
    expect(thanks).toMatch(/^Thank you/);
    expect(thanks).not.toMatch(/baby|feed|sleep|well done|great job|amazing/i);
  });
});
