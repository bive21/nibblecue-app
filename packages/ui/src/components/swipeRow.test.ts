/**
 * THE APP'S ONE SWIPE (2026-09-29): the shopping list's Remove and the log's Delete slide through
 * the same row (`SwipeRow`). The rules are pure (`swipeRow.ts`) and run here — when a move is the
 * swipe, where the row stands under the finger, where it goes when let go, and the one row out at a
 * time, walked on a clock turned by hand. What only a phone can show is held by tripwires over the
 * source, because this package's tests have no renderer (`interaction.test.ts` says why that is the
 * honest instrument): the gesture never claims a touch it should not, the layer that moves holds its
 * size while it moves (docs/DESIGN_SYSTEM.md §7.1 rule 6), and a screen reader never needs it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  PLUS_APPEARANCE,
  resolveAppearance,
  SCHEME_NAMES,
} from '../theme/appearance';
import { AA_TEXT, contrastRatio } from '../theme/contrast';
import { SKIN_NAMES } from '../theme/skins';
import { hit, themeNames } from '../theme/theme';
import { ROW_AWAY_MS } from './rowMotion';
import {
  createSwipeRegistry,
  SWIPE_BACK_MS,
  SWIPE_CLAIM,
  SWIPE_FLING,
  SWIPE_OPEN,
  SWIPE_REMOVE_SHARE,
  SWIPE_SETTLE_MS,
  swipeClaims,
  swipeFollow,
  swipeRelease,
} from './swipeRow';

const W = 340;

describe('when a move on a row is the swipe', () => {
  it('never on a touch that has barely moved', () => {
    expect(swipeClaims(0, 0)).toBe(false);
    expect(swipeClaims(-SWIPE_CLAIM, 0)).toBe(false);
    expect(swipeClaims(-(SWIPE_CLAIM + 1), 0)).toBe(true);
  });

  it('never on a scroll: sideways by half as much again as up or down, or it is the page’s', () => {
    expect(swipeClaims(-30, 25)).toBe(false);
    expect(swipeClaims(-30, 20)).toBe(false);
    expect(swipeClaims(-30, 19)).toBe(true);
    expect(swipeClaims(-5, 80)).toBe(false);
  });

  it('either way sideways: a row out is swiped back to the right', () => {
    expect(swipeClaims(SWIPE_CLAIM + 1, 0)).toBe(true);
  });
});

describe('where the row stands under the finger', () => {
  it('follows the finger to the left, never to the right of home, and never past its own width', () => {
    expect(swipeFollow(0, -40, W)).toBe(-40);
    expect(swipeFollow(0, 60, W)).toBe(0);
    expect(swipeFollow(0, -900, W)).toBe(-W);
  });

  it('starts from where it rests: a row open on its action moves from there', () => {
    expect(swipeFollow(-SWIPE_OPEN, 30, W)).toBe(-SWIPE_OPEN + 30);
    expect(swipeFollow(-SWIPE_OPEN, 200, W)).toBe(0);
  });

  it('goes no further than its action before it has been measured', () => {
    expect(swipeFollow(0, -900, 0)).toBe(-SWIPE_OPEN);
  });
});

describe('where a row goes when it is let go', () => {
  it('a row that asks first (the log) never takes its action on a swipe: the furthest only opens it', () => {
    expect(swipeRelease(-W * 0.9, 0, W, SWIPE_OPEN, false)).toBe('open');
    expect(swipeRelease(-SWIPE_OPEN - 10, -SWIPE_FLING, W, SWIPE_OPEN, false)).toBe('open');
    expect(swipeRelease(-500, -2, 0, SWIPE_OPEN, false)).toBe('open');
    for (const at of [0, -10, -40, -SWIPE_OPEN, -W / 2, -W])
      for (const vx of [-3, -SWIPE_FLING, -0.1, 0, 0.1, SWIPE_FLING, 3])
        expect(swipeRelease(at, vx, W, SWIPE_OPEN, false), `${at} ${vx}`).not.toBe('remove');
  });

  it('a row whose swipe takes its action (the shopping list) takes it past half its width', () => {
    expect(swipeRelease(-W / 2, 0, W, SWIPE_OPEN)).toBe('remove');
    expect(swipeRelease(-W / 2, 0, W, SWIPE_OPEN, true)).toBe('remove');
  });

  it('stops open on its action past half of it, and goes home short of that', () => {
    for (const removes of [true, false]) {
      expect(swipeRelease(-SWIPE_OPEN / 2 - 1, 0, W, SWIPE_OPEN, removes)).toBe('open');
      expect(swipeRelease(-SWIPE_OPEN / 2 + 1, 0, W, SWIPE_OPEN, removes)).toBe('rest');
      // a flick left that never showed the action takes nothing, and opens nothing it did not reach
      expect(swipeRelease(-40, -2, W, SWIPE_OPEN, removes)).toBe('rest');
    }
  });

  it('shuts on a flick back to the right, however far out it was', () => {
    for (const removes of [true, false]) {
      expect(swipeRelease(-W * 0.9, SWIPE_FLING, W, SWIPE_OPEN, removes)).toBe('rest');
      expect(swipeRelease(-SWIPE_OPEN, 1.5, W, SWIPE_OPEN, removes)).toBe('rest');
    }
  });
});

describe('the numbers', () => {
  it('draws the action a target and more: as wide as two, as tall as the row, never under 44', () => {
    expect(SWIPE_OPEN).toBe(88);
    expect(SWIPE_OPEN).toBeGreaterThanOrEqual(2 * hit.min);
    // half a phone's row is always further than the action, so opening is never taking it
    expect(320 * SWIPE_REMOVE_SHARE).toBeGreaterThan(SWIPE_OPEN);
  });

  it('settles in a blink, and a row let go into its action waits out its screen’s going first', () => {
    expect(SWIPE_SETTLE_MS).toBe(140);
    expect(SWIPE_BACK_MS).toBe(ROW_AWAY_MS + 300);
  });
});

describe('the action’s word is read on its fill, in every look', () => {
  const looks = SKIN_NAMES.flatMap(skin =>
    SCHEME_NAMES.flatMap(scheme =>
      themeNames.map(theme => ({
        name: `${skin} ${scheme} ${theme}`,
        r: resolveAppearance(
          { ...DEFAULT_APPEARANCE, theme, scheme, skin },
          'light',
          PLUS_APPEARANCE,
        ),
      })),
    ),
  );

  it('draws the word white on the danger fill, 4.5:1 in 3 skins × 6 schemes × 3 themes', () => {
    const low = looks
      .map(l => ({ l, ratio: contrastRatio(l.r.onGradient, l.r.palette.dangerFill) }))
      .filter(x => x.ratio < AA_TEXT)
      .map(x => `${x.l.name} ${x.ratio.toFixed(2)}`);
    expect(low).toEqual([]);
  });

  it('and never in the flat accent’s ink, which is white only in light (the old shopping Remove)', () => {
    const dark = looks.filter(l => l.name.endsWith(' dark'));
    expect(dark.length).toBeGreaterThan(0);
    expect(
      dark.some(l => contrastRatio(l.r.palette.onAccent, l.r.palette.dangerFill) < AA_TEXT),
    ).toBe(true);
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'SwipeRow.tsx'), 'utf8');
    expect(src).toContain(
      '<AppText variant="bodySm" color={t.onGradient} style={styles.semibold}>',
    );
    expect(src).not.toContain('ink="onAccent"');
  });
});

/* ------------------------------------------------------------------ one row out at a time */

/** A registry on a queue turned by hand: `flush` is the moment the touch in hand has been dispatched. */
function registry() {
  const queue: (() => void)[] = [];
  const r = createSwipeRegistry(run => void queue.push(run));
  const flush = () => {
    while (queue.length > 0) queue.shift()?.();
  };
  const rows = new Map<number, (boolean | undefined)[]>();
  const row = () => {
    const id = r.nextId();
    const shut: (boolean | undefined)[] = [];
    rows.set(id, shut);
    return { id, shut, fn: (animated: boolean) => void shut.push(animated) };
  };
  return { r, flush, row };
}

describe('one row out at a time, anywhere in the app', () => {
  it('sends the row out home when another comes out, sliding', () => {
    const { r, row } = registry();
    const a = row();
    const b = row();
    r.out(a.id, a.fn);
    r.out(b.id, b.fn);
    expect(a.shut).toEqual([true]);
    expect(b.shut).toEqual([]);
    expect(r.current()).toBe(b.id);
  });

  it('forgets a row that is home, and a row that comes out again is still the one out', () => {
    const { r, row } = registry();
    const a = row();
    r.out(a.id, a.fn);
    r.out(a.id, a.fn);
    expect(a.shut).toEqual([]);
    r.home(a.id);
    expect(r.current()).toBeNull();
  });

  it('spends a touch on another row sending the one out home — the tap does nothing else', () => {
    const { r, row } = registry();
    const a = row();
    const b = row();
    r.out(a.id, a.fn);
    expect(r.touchRow(b.id)).toBe(true);
    expect(a.shut).toEqual([true]);
    expect(r.current()).toBeNull();
    // with nothing out, a touch on a row is that row's
    expect(r.touchRow(b.id)).toBe(false);
  });

  it('leaves a touch on the row out to that row: its Delete, or a drag back home', () => {
    const { r, row, flush } = registry();
    const a = row();
    r.out(a.id, a.fn);
    r.touchArea();
    expect(r.touchRow(a.id)).toBe(false);
    flush();
    expect(a.shut).toEqual([]);
    expect(r.current()).toBe(a.id);
  });

  it('sends it home at a touch anywhere else in an area that says so, once the touch is dispatched', () => {
    const { r, row, flush } = registry();
    const a = row();
    r.out(a.id, a.fn);
    r.touchArea();
    // not before: every row the touch landed on has yet to say so
    expect(a.shut).toEqual([]);
    flush();
    expect(a.shut).toEqual([true]);
  });

  it('checks once per touch, however many areas it passed through', () => {
    const { r, row, flush } = registry();
    const a = row();
    r.out(a.id, a.fn);
    r.touchArea();
    r.touchArea();
    flush();
    expect(a.shut).toEqual([true]);
  });

  it('checks nothing at all while no row is out: a touch on the page costs nothing', () => {
    let queued = 0;
    const r = createSwipeRegistry(() => void (queued += 1));
    r.touchArea();
    r.touchArea();
    expect(queued).toBe(0);
  });

  it('sends every row home when the page scrolls or goes, and says whether to slide', () => {
    const { r, row } = registry();
    const a = row();
    r.out(a.id, a.fn);
    r.shutAll(false);
    expect(a.shut).toEqual([false]);
    r.shutAll();
    expect(a.shut).toEqual([false]);
  });
});

/* ------------------------------------------------------------------ tripwires over the source */

const here = dirname(fileURLToPath(import.meta.url));
/** Comments out, whitespace flattened: a scan reads the code, never the explanation of it. */
const code = (f: string): string =>
  readFileSync(join(here, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

describe('SwipeRow, wired', () => {
  const src = code('SwipeRow.tsx');

  it('uses React Native’s own responder and the native driver, and no gesture library', () => {
    expect(src).toContain('PanResponder.create({');
    expect(src).not.toMatch(/['"]react-native-(gesture-handler|reanimated)['"]/);
    expect(src).toContain('useNativeDriver: true');
    expect(src).not.toContain('useNativeDriver: false');
  });

  it('never claims a touch where it lands, and claims a move only when it is the swipe', () => {
    expect(src).toContain('onStartShouldSetPanResponder: () => false,');
    expect(src).toContain('onMoveShouldSetPanResponder: (_e, g) => swipeClaims(g.dx, g.dy),');
  });

  it('§7.1 rule 6: the layer that moves holds its size from the moment a finger takes it until it is home', () => {
    // pinned as the finger takes it, at the size it had
    expect(src).toContain(
      'onPanResponderGrant: () => { held.current = true; swipes.out(id, shutRow); moves.current?.leave(); },',
    );
    expect(src).toContain(
      'leave: () => { if (isOut.current) return; isOut.current = true; setOut({ ...size.current }); },',
    );
    // on the very layer the transform moves
    const layer = src.slice(src.indexOf('<Animated.View'), src.indexOf('</Animated.View>'));
    expect(layer).toContain('enabled ? { transform: [{ translateX: x }] } : null,');
    expect(layer).toContain(
      'out !== null && out.width > 0 && out.height > 0 ? { width: out.width, height: out.height } : null,',
    );
    // and let go only once it is home: a slide home that FINISHED, or a row set home at once
    expect(src.match(/setOut\(null\)/g) ?? []).toHaveLength(1);
    expect(src).toContain('if (finished && to === 0) moves.current?.rest();');
    expect(src).toContain('x.setValue(to); if (to === 0) moves.current?.rest(); return;');
  });

  it('takes its action on a swipe only where the row says so, and is felt once, there', () => {
    expect(src).toContain(
      'const end = swipeRelease(at, g.vx, width.current, SWIPE_OPEN, removesNow.current);',
    );
    expect(src).toContain('removes = false,');
    expect(src.match(/haptic\(/g) ?? []).toHaveLength(1);
    const letGo = src.slice(src.indexOf("if (end !== 'remove')"));
    expect(letGo.indexOf("haptic('tap');")).toBeGreaterThan(letGo.indexOf('return;'));
  });

  it('draws the action as a labeled button of 88 × the row, a finger’s whole target, dimmed on a press', () => {
    const behind = src.slice(src.indexOf('styles.behind'), src.indexOf('</Pressable>'));
    expect(behind).toContain(
      'accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={() => act.current(handle)}',
    );
    expect(behind).toContain("{ width: SWIPE_OPEN, height: '100%', opacity: pressed ? 0.8 : 1 },");
    expect(behind).toContain('testID={actionTestID}');
    expect(behind).toContain('backgroundColor: t.color.dangerFill');
  });

  it('draws the action behind a log row only while the row is out, so nothing hides under it', () => {
    expect(src).toContain("const behind = enabled && (backing === 'always' || out !== null);");
    expect(src).toContain('style={behind ? styles.clip : undefined}');
    expect(src).toContain('behind ? { backgroundColor: t.color.surfaceSolid } : null,');
  });

  it('keeps one row out: a touch on another row, a tap on its own words, its page going', () => {
    expect(src).toContain('onStartShouldSetResponderCapture={() => swipes.touchRow(id)}');
    expect(src).toContain(
      '{out !== null ? ( <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} onResponderRelease={() => shutRow(true)} /> ) : null}',
    );
    expect(src).toContain('if (!inFront) shutRow(false);');
    // a row a finger still has goes where the finger lets it go, and nowhere before
    expect(src).toContain('settle: (to, animated = true) => { if (held.current) return;');
  });

  it('keeps its tree whatever it is doing, so what is inside stays mounted (ListRow’s tick)', () => {
    // one outer view, the backing's slot, then the one layer that slides, children first in it
    expect(src).toContain('{behind ? ( <View style={[styles.behind');
    expect(src).toMatch(/<Animated\.View \{\.\.\.\(enabled \? pan\.panHandlers : \{\}\)\}/);
    const layer = src.slice(src.indexOf('<Animated.View'), src.indexOf('</Animated.View>'));
    expect(layer.indexOf('{children}')).toBeGreaterThan(-1);
    expect(layer.indexOf('{children}')).toBeLessThan(layer.indexOf('{out !== null ? ('));
    expect(src).not.toMatch(/if \(!enabled\) return/);
  });

  it('moves the same in every theme: the row follows the finger, and there is no flourish to hold', () => {
    expect(src).not.toMatch(/reduceMotion|motionStill|useMotionActive/);
  });
});

describe('TimelineItem, with and without a swipe', () => {
  const src = code('TimelineItem.tsx');

  it('is the row it always was without one', () => {
    expect(src).toContain('if (swipe === undefined) return row;');
  });

  it('wraps the row in the one swipe with its action drawn only while out', () => {
    expect(src).toContain(
      '<SwipeRow ref={swiped} label={swipe.label} accessibilityLabel={swipe.accessibilityLabel} onAction={swipe.onAction} backing="out" actionTestID={swipe.testID} >',
    );
    // the row's own id stays on the row the flows tap; the swipe's outer view has none of its own
    expect(src).not.toMatch(/<SwipeRow[^>]* testID=/);
  });

  it('gives a screen reader the same action on the row itself, by its word', () => {
    expect(src).toContain(
      'accessibilityActions: [{ name: TIMELINE_SWIPE_ACTION, label: swipe.label }], onAccessibilityAction: onSwipeAction,',
    );
    expect(src).toContain(
      'if (swipe !== undefined && e.nativeEvent.actionName === TIMELINE_SWIPE_ACTION) swipe.onAction(swiped.current ?? HOME);',
    );
  });
});
