import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Tripwires over the source, because the defects they guard cannot be caught any other way
 * here: they are React Native touch, clipping and layout behaviors, and this package's tests
 * run in node with no renderer. Every one was found on a device rather than in CI, and each
 * looks like "the control does nothing", "there is a box that should not be there" or "that
 * is not where it should be" rather than a crash.
 *
 * A tripwire is the honest instrument when the real check is impossible. The alternative here
 * was worse than nothing: topBarLayout.test.ts asserted the mark was centered by computing
 * `markLeft(w) + markSize(w) / 2` and comparing it to `w / 2`, which is an identity for any
 * mark size and was green for the whole time the mark drew off center on a phone.
 */
const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');

/** Block and line comments removed, so a comment may quote the defect it records. */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('Row: the row is the switch', () => {
  const src = read('Row.tsx');

  /**
   * THE WRAPPER'S WHOLE CONTENT, not a window of characters after it: since 2026-09-27 a switch row
   * can draw its switch three ways (the platform's, the bell, setup's pour), and every one of them
   * must sit inside the one untouchable, hidden wrapper. The drawings are self-closing elements, so
   * the wrapper's content runs to its own `</View>`.
   */
  const wrapper =
    /<View\s+pointerEvents="none"\s+importantForAccessibility="no-hide-descendants"\s+accessibilityElementsHidden\s*>([\s\S]*?)<\/View>/.exec(
      src,
    );
  const inside = wrapper?.[1] ?? '';

  it('renders the switch display-only, so one tap is one toggle', () => {
    // The row's own Pressable carries the role, the checked state and the press handler. A live
    // Switch inside it is a second Pressable running the same toggle: on its own bounds it takes
    // the touch, and on the New Architecture both can fire for a single tap. Two toggles look
    // exactly like a switch that will not move, which is how this shipped in WP3.
    expect(wrapper, 'the Switch inside a Row must sit in a pointerEvents="none" wrapper').not.toBe(
      null,
    );
    for (const drawing of ['<Switch', '<BellSwitch', '<PourSwitch'])
      expect(inside, `${drawing} outside the untouchable wrapper`).toContain(drawing);
  });

  it('keeps the switch out of the accessibility tree so a reader meets one element', () => {
    // the same wrapper is hidden from assistive technology, whichever drawing is inside it
    expect(inside).toContain('<Switch');
    expect(src).toMatch(/accessibilityRole: 'switch' as const/);
  });
});

describe('Row: the plus is its own control, at the other end from the tick', () => {
  const src = read('Row.tsx');

  it('splits the row when it carries an add control, so the text side still opens the item', () => {
    // `customRight` is what puts the caller's node beside the row rather than inside its
    // Pressable. Without `isAdd` in it the plus would be swallowed by the row's own press and
    // tapping it would open the editor — which is exactly how the edit chevron went missing
    // from a task row in WP6c.
    // `expanded` is excluded from it on purpose: a row that opens IN PLACE draws a turning
    // chevron, not a control, and the whole 54pt has to stay one target for the toggle.
    expect(withoutComments(src)).toMatch(
      /const customRight =\s*!selected &&\s*!isSwitch &&\s*expanded === undefined &&\s*\(isAdd \|\|/,
    );
  });

  it('says which state it is in with a GLYPH, not only with a fill', () => {
    // A parent with a color-vision difference, or a phone dimmed at 3 a.m., sees the shape.
    expect(src).toMatch(/name=\{added \? 'check' : 'plus'\}/);
    expect(src).toMatch(/accessibilityRole="button"[\s\S]{0,300}?accessibilityLabel=\{addLabel/);
  });

  it('keeps the tick at the head and the plus at the tail — the side IS the meaning', () => {
    const code = withoutComments(src);
    // The tick is the first thing inside `content`, which is the row's text side; the plus is
    // the right node, and both return branches draw `content` before it. Swapping them would
    // make a catalog look like a checklist, which is the defect the owner reported on the
    // picker sheet (2026-09-16).
    const content = code.slice(
      code.indexOf('const content = ('),
      code.indexOf('if (customRight) {'),
    );
    // THE HEAD SLOT GAINED A THIRD OCCUPANT on 2026-09-20 — `avatar`, the baby's picture
    // (docs/MEDIA.md) — and the order still has to be tick, then the circle or the chip, then
    // the words. The avatar REPLACES the icon chip rather than sitting beside it: a row about a
    // person shows the person, and a face inside a category chip reads as a category.
    expect(content.indexOf('{isCheck ?')).toBeLessThan(content.indexOf('{avatar ?'));
    expect(content.indexOf('{avatar ?')).toBeLessThan(content.indexOf('{icon && !avatar ?'));
    expect(content).not.toContain('isAdd');
    const body = code.slice(
      code.indexOf('if (customRight) {'),
      code.indexOf('export interface RowsProps'),
    );
    const cut = body.indexOf('\n  return (');
    for (const branch of [body.slice(0, cut), body.slice(cut)]) {
      expect(
        branch.indexOf('{content}'),
        'the text side is drawn before the right node',
      ).toBeLessThan(branch.indexOf('{rightNode}'));
    }
    expect(code).toMatch(/const rightNode: ReactNode = selected \? \([\s\S]{0,200}?\) : isAdd \?/);
  });
});

describe('Row: a row that opens in place says so, and stays one target', () => {
  const src = read('Row.tsx');

  it('turns the chevron rather than pointing it onward', () => {
    // The glyph is the state, the way Disclosure's is: `chev` means "this goes somewhere" and
    // was the whole affordance an Activities row would have had for "this opens under you".
    expect(src).toMatch(/name=\{expanded \? 'up' : 'down'\}/);
  });

  it('tells assistive tech the row is expandable and whether it is open', () => {
    expect(withoutComments(src)).toMatch(/expanded !== undefined \? \{ expanded \} : \{\}/);
  });
});

/**
 * A LOCKED ROW (2026-10-01): the Appearance sheet's Shape rows and its Log row switch, sold since
 * the owner's *"make shapes other than pebble also a plus feature, same with horizontal slider"*.
 * CLAUDE.md §4 asks for the lock BEFORE the tap and for no dead end after it, so the lock is drawn
 * inside the row's one pressable, where a tap on it opens the gate like a tap anywhere else.
 */
describe('Row: a locked row wears its lock before the tap, and stays one target', () => {
  const src = withoutComments(read('Row.tsx')).replace(/\s+/g, ' ');

  it('draws the lock inside its one pressable: at the tail, or just before its switch', () => {
    expect(src).toContain(
      'const lockGlyph = <Icon name="lock" size={16} color={t.color.text2} />;',
    );
    expect(src).toContain('<> {locked ? lockGlyph : null} <View pointerEvents="none"');
    expect(src).toContain(") : locked ? ( lockGlyph ) : right === 'none' ? null");
    // never as a caller's node beside the row, which splits it and leaves the lock outside the target
    expect(src).toContain('(isAdd || (!locked && right !== undefined &&');
  });

  it('says what unlocks it after its name, unless the caller has words of its own', () => {
    expect(src).toContain(
      '...(accessibilityHint ? { accessibilityHint } : locked && lockedHint ? { accessibilityHint: lockedHint } : {}),',
    );
  });

  it('is never drawn as disabled: the locked row is the way to the gate', () => {
    expect(src).toContain('disabled: disabled || !interactive,');
    expect(src).toContain('opacity: disabled ? 0.5 : 1,');
  });
});

describe('ProgressLine: a bar that repeats a number it does not carry', () => {
  const src = read('ProgressLine.tsx');

  it('is hidden from assistive technology, because the card above it says the same thing', () => {
    expect(src).toContain('accessibilityElementsHidden');
    expect(src).toContain('importantForAccessibility="no-hide-descendants"');
  });

  it('clamps rather than trusting the caller, so a divide by zero cannot draw a bar', () => {
    expect(withoutComments(src)).toMatch(/Math\.min\(1, Math\.max\(0, Number\.isFinite\(value\)/);
  });
});

describe('Surface: decoration is clipped and inert', () => {
  const src = read('Surface.tsx');
  const code = withoutComments(src);

  it('clips every decoration layer to the radius', () => {
    // The box keeps overflow visible so an iOS shadow can draw outside it, and a child with only
    // a borderRadius is not clipped by its parent. Unclipped, the specular wash paints a square
    // of light across a rounded tile, which is what the glass skin showed on a device.
    expect(src).toMatch(/overflow: 'visible'/);
    const layer =
      /<View\s+pointerEvents="none"\s+style=\{\[coverBorderBox\(bw, r\), \{ overflow: 'hidden' \}\]\}/;
    expect(layer.test(src), 'the blur, tint and specular layers share one clipping wrapper').toBe(
      true,
    );
  });

  it('puts alpha in the COLOR of every decoration, never in an opacity prop', () => {
    // One fill composited in place, no layer over the subtree, and a color a test can read.
    const deco = code.slice(
      code.indexOf('{decorated ? ('),
      code.indexOf('<View style={[styles.content'),
    );
    expect(deco).not.toMatch(/\bopacity:/);
    expect(deco).toMatch(/withAlpha\(base, alpha\)/);
    // the top light is white at the skin's number, fading to the same white at zero
    expect(deco).toMatch(/withAlpha\(t\.color\.surfaceSolid, SPECULAR_ALPHA\)/);
    expect(deco).toMatch(/withAlpha\(t\.color\.surfaceSolid, 0\)/);
  });

  it('lights a panel along its top edge, not with a diagonal wash, and never a pill', () => {
    // THE DEFECT THIS GUARDS (the owner, 2026-09-29: "too shiny metallic"): a flat 28% of white
    // over the top-left 42% of a diagonal with a hard shoulder — the glare band of brushed steel.
    // The top light is a vertical fade over a fixed depth in points (skins.ts SPECULAR_DEPTH).
    const deco = code.slice(
      code.indexOf('{decorated ? ('),
      code.indexOf('<View style={[styles.content'),
    );
    expect(deco).toMatch(/start=\{\{ x: 0, y: 0 \}\}\s*end=\{\{ x: 0, y: 1 \}\}/);
    expect(deco).toMatch(/height: SPECULAR_DEPTH/);
    expect(deco).not.toMatch(/locations=/);
    // …and on a Log tile with Android's glass, the tile's own sheen lights it in its place
    // (theme/tileGlass.ts); `glazed` is null on the iPhone and on Paper, so there it is as it was
    expect(code).toMatch(/const specular = material\.specular && radius !== 'pill' && !glazed;/);
  });

  it('draws the edge above the glass, in the caller’s color where it asked for one', () => {
    // THE DEFECT THIS GUARDS: React Native paints a non-clipping view's border BEHIND its children,
    // and the wrapper covers the border box — so on the iPhone the blur sampled the rim and smeared
    // it into a glow inside the panel, and hid a tile's category edge and an alert ring with it.
    // The box keeps its border width (layout) and paints nothing; the edge is the wrapper's LAST
    // layer, after the blur, the fill and the top light.
    expect(code).toMatch(/decorated \? styles\.edgeDrawnAbove : null/);
    expect(code).toMatch(/edgeDrawnAbove: \{ borderColor: 'transparent' \}/);
    expect(code).toMatch(
      /const edgeColor = typeof askedEdge === 'string' \? askedEdge : borderColor;/,
    );
    const deco = code.slice(
      code.indexOf('{decorated ? ('),
      code.indexOf('<View style={[styles.content'),
    );
    const edge = deco.indexOf('borderColor: edgeColor');
    expect(edge).toBeGreaterThan(deco.indexOf('<BlurView'));
    expect(edge).toBeGreaterThan(deco.indexOf('withAlpha(base, alpha)'));
    expect(edge).toBeGreaterThan(deco.indexOf('<LinearGradient'));
    // the light edge is a hairline of white at the skin's alpha, never a full point of it
    expect(code).toMatch(/withAlpha\(t\.color\.surfaceSolid, GLASS_EDGE_ALPHA\)/);
    expect(code).toMatch(/lightLine \? StyleSheet\.hairlineWidth : bw/);
    expect(code).toMatch(/const lightLine = lightEdge && typeof askedEdge !== 'string';/);
  });

  it('never puts a native shadow under a translucent fill, on either platform', () => {
    // THE DEFECT THIS GUARDS, twice. On Android: the pale box inside every glass card, and the
    // octagon inside every Quick bubble — an elevation shadow is a tessellated ring straddling the
    // outline and a translucent fill shows the inner half of it through. On iOS (2026-09-29): a
    // box with no opaque background gets no shadowPath, so the lift was drawn from the panel's own
    // pixels UNDER the glass, seen through it and saturated by the blur — the colored bevel the
    // owner called "shiny metallic". So a translucent box takes a box-shadow (painted outside the
    // box only) on both, and an opaque one keeps the native shadow — shadows.ts. The fork is
    // asserted as the literal line, and it may not name a platform.
    expect(code).toMatch(
      /alpha < 1\s*\?\s*boxShadowFor\(material, hueColor, t\.isNight, shadowInk\)\s*:\s*shadowFor\(material, hueColor, t\.isNight\)/,
    );
    expect(code).not.toMatch(/android && alpha < 1\s*\?\s*boxShadowFor/);
    // and its neutral layers are a shadow in dark too: the text ink is light there, a glow
    expect(code).toMatch(
      /const shadowInk = t\.theme === 'light' \? t\.color\.text : t\.color\.page;/,
    );
    // on Android the translucent fill is the box's OWN background: one plain view, nothing
    // absolute under the content for a layout pass to size to the text
    expect(code).toMatch(/android\s*\?\s*withAlpha\(base, alpha\)\s*:\s*undefined/);
    expect(code).toMatch(/const translucent = alpha < 1 && !android;/);
    // and expo-blur stays off Android: without a blurTarget it paints a flat tint and no blur
    expect(code).toMatch(/const blur = material\.blur > 0 && !solid && !android;/);
    // no other elevation is written in this file — the table in shadows.ts is the only source
    expect(code).not.toMatch(/elevation:/);
  });

  it('gives no decoration layer its own absolute fill outside that wrapper', () => {
    // Anything absolutely filling the box outside the inert wrapper can swallow a press meant
    // for the content, which reads to a parent as a control that does nothing.
    const afterContent = code.slice(code.indexOf('const blur ='));
    const fills = afterContent.match(/StyleSheet\.absoluteFill/g) ?? [];
    // blur + tint + edge, and nothing else (the top light is a strip of its own depth)
    expect(fills.length).toBeLessThanOrEqual(3);
  });
});

/**
 * A LOG TILE'S LIQUID GLASS ON ANDROID (the owner, 2026-10-01: "make the liquid glass effect inside
 * each the border of the quick log modules"; theme/tileGlass.ts). Its numbers, its geometry and the
 * contrast of every word over it are tested in node (tileGlass.test.ts); what only a device could
 * show — where it is mounted, what it may never touch, and that the iPhone and Paper paint what they
 * painted — is held here, on the source.
 */
describe('Surface and QuickAction: a Log tile’s glass, inside its edge, on Android alone', () => {
  const surface = withoutComments(read('Surface.tsx'));
  const tile = withoutComments(read('QuickAction.tsx'));
  const glass = withoutComments(read('TileGlass.tsx'));

  it('changes nothing where there is no glass: the iPhone and Paper take the tint’s alpha as before', () => {
    // `glass` is null there (tileGlass returns null off Android's Glass), so `glazed` is null, the
    // tint takes `tintAlphaFor` exactly as it did, and `decorated` is what it was
    expect(surface).toContain('const glazed = tint && glass && !solid ? glass : null;');
    expect(surface).toContain(
      'const tintAlpha = glazed ? glazed.body : tintAlphaFor(t.skinTokens, !android);',
    );
    expect(surface).toContain(
      'const alpha = solid || opaqueSheet ? 1 : tint ? tintAlpha : contentAlpha;',
    );
    expect(surface).toContain(
      'const decorated = blur || translucent || specular || lightEdge || glazed !== null;',
    );
    // the Android fill is still the box's own background — the glass adds layers, not a second body
    expect(surface).toMatch(/android\s*\?\s*withAlpha\(base, alpha\)\s*:\s*undefined/);
  });

  it('draws the glass inside the clipping wrapper, after the fill and the top light and before the edge', () => {
    const deco = surface.slice(
      surface.indexOf('{decorated ? ('),
      surface.indexOf('<View style={[styles.content'),
    );
    const at = deco.indexOf('<TileGlass');
    expect(at).toBeGreaterThan(deco.indexOf('<LinearGradient'));
    expect(at).toBeGreaterThan(deco.indexOf('withAlpha(base, alpha)'));
    expect(deco.indexOf('borderColor: edgeColor')).toBeGreaterThan(at);
    // on the wrapper's own curve, inside the edge's drawn width, its shade in the caller's padding
    expect(deco).toMatch(
      /<TileGlass\s+glass=\{glazed\}\s+radius=\{coverBorderBox\(bw, r\)\.borderRadius \?\? r\}\s+edge=\{edgeWidth\}\s+foot=\{foot\}\s*\/>/,
    );
    expect(surface).toMatch(/const foot =\s*points\(split\.content\.paddingBottom\)/);
  });

  it('hands the glass to a pebble and a capsule, and draws it inside a bubble’s ring over its opaque disc', () => {
    expect(tile.match(/glass=\{glassOf\(cat\.soft\)\}/g)).toHaveLength(1);
    // a capsule's sheen is held above where its second line can begin: under its name's first line
    expect(tile).toContain('glass={glassOf(cat.soft, t.space.sm + nameFit.lineHeight)}');
    const bubble = tile.slice(
      tile.indexOf("resolvedShape === 'bubble'"),
      tile.indexOf("resolvedShape === 'pebble'"),
    );
    // the disc is the same opaque color it always was, and the glass is its child, before the picture
    expect(bubble).toContain(
      'const disc = cat.disc ?? composite(t.color.app, cat.soft, tintAlphaFor(t.skinTokens, false));',
    );
    expect(bubble).toContain('backgroundColor: disc,');
    expect(bubble).toContain('const band = (QUICK_BUBBLE - 2 * ring - QUICK_BUBBLE_GLYPH) / 2;');
    const glassAt = bubble.indexOf(
      '<TileGlass glass={glass} radius={QUICK_BUBBLE / 2} edge={0} foot={band} />',
    );
    expect(glassAt).toBeGreaterThan(bubble.indexOf('backgroundColor: disc,'));
    expect(bubble.indexOf('<Icon name={icon} size={QUICK_BUBBLE_GLYPH}')).toBeGreaterThan(glassAt);
    // the platform is read once, where the spec is made, and nothing else in the tile forks on it
    expect(tile.match(/Platform\.OS/g)).toHaveLength(1);
    expect(tile).toContain('platform: Platform.OS,');
  });

  it('is decoration: inert, hidden from a screen reader, its alpha in its colors, and still', () => {
    expect(glass).toMatch(
      /<View\s+pointerEvents="none"\s+importantForAccessibility="no-hide-descendants"\s+accessibilityElementsHidden/,
    );
    expect(glass).not.toMatch(/\bopacity[:=]/);
    expect(glass).toContain('withAlpha(density.color, s.alpha)');
    expect(glass).toContain('stopOpacity={st.alpha}');
    // no motion of any kind, and redrawn only when the drawing changes
    expect(glass).not.toMatch(/Animated|useEffect|requestAnimationFrame|setInterval/);
    expect(glass).toContain('export const TileGlass = memo(TileGlassBase, sameGlass);');
    // the one SVG is drawn at the size the tile measured, in its own points
    expect(glass).toContain('gradientUnits="userSpaceOnUse"');
    expect(glass).toMatch(/<Svg width=\{size\.w\} height=\{size\.h\}/);
  });
});

describe('TopBar: the mark is centered by symmetric anchoring, not by a percentage', () => {
  const src = read('TopBar.tsx');

  it('pins the mark slot to both side edges', () => {
    // The slot spans the bar and centers the mark inside itself. Because the bar's horizontal
    // padding is equal on both sides, a slot pinned to both edges is symmetric about the bar's
    // center whichever box Yoga measures an absolute child against.
    const slot = /styles\.markSlot,\s*\{[^}]*left: 0[^}]*right: 0[^}]*\}/;
    expect(slot.test(src), 'the mark slot sets both left: 0 and right: 0').toBe(true);
  });

  it('positions no part of the bar with a percentage offset', () => {
    // A percentage offset on an absolutely positioned child is measured from the containing
    // block Yoga picks — the padding box under Yoga 3's CSS-compliant absolute layout, the
    // content box under the older behavior — and the two disagree by the bar's horizontal
    // padding. That is how the mark came to draw off center.
    //
    // Comments are stripped first, exactly as the brand scan does it: the comment in TopBar.tsx
    // that records this defect has to be free to quote the offset that caused it, or the
    // tripwire fires on its own explanation.
    expect(withoutComments(src)).not.toMatch(/'\d+%'/);
  });

  it('centers the mark inside that slot rather than sizing the slot to the mark', () => {
    expect(src).toMatch(/markSlot: \{ position: 'absolute', alignItems: 'center'/);
    // a slot sized to the mark has to be offset to be centered, which is the trap above
    expect(src).not.toMatch(/markSlot[^;]*marginLeft/);
  });
});

/**
 * THE MARK GIVES WAY RATHER THAN DRAWING OVER A CHIP (the owner's screenshots, 2026-09-28: on an
 * Android phone 1080 px wide the heart covered the first letters of "5 queued" and "Not synced").
 * The decision is `markFits`, tested as arithmetic in topBarLayout.test.ts; what only a device can
 * show (the edges it is handed, the state it keeps, what the hidden mark still does) is held here.
 */
describe('TopBar: the mark steps aside when a chip needs its room', () => {
  const code = withoutComments(read('TopBar.tsx')).replace(/\s+/g, ' ');

  it('decides from the bar, the left group and the right group as onLayout measured them', () => {
    expect(code).toContain('edges.current.barWidth = e.nativeEvent.layout.width;');
    expect(code).toContain('edges.current.rightStart = e.nativeEvent.layout.x;');
    expect(code).toContain('const fits = markFits(barWidth, leftEnd, rightStart, size);');
    // the chip goes through the host's wrapper, which may nest it in a view of its own, so the
    // left edge is read from a box that is the bar's own child, in the bar's coordinates
    expect(code).toContain(
      '<View style={styles.left} onLayout={e => { const { x, width: w } = e.nativeEvent.layout; edges.current.leftEnd = x + w; placeMark(); }} > {child ? wrapped( wrapChild, <ChildChip',
    );
  });

  it('keeps the layouts in a ref and re-renders only when the answer changes', () => {
    expect(code).toContain('const edges = useRef<BarEdges>(');
    expect(code).toContain('if (fits === shown.current) return; shown.current = fits;');
    expect(code.match(/setMarkShown\(/g) ?? []).toHaveLength(1);
  });

  it('takes no touch and leaves the accessibility tree while it is away', () => {
    // the night light door goes with it: there is no other way in (TopBar.tsx says so)
    expect(code).toContain("pointerEvents={markShown && markDoor ? 'box-none' : 'none'}");
    expect(code).toContain(
      "{...(markShown ? {} : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const, })}",
    );
    expect(code).toContain(
      'styles.markSlot, { top: paddingTop, bottom: t.space.md, left: 0, right: 0 }, { opacity: markFade },',
    );
  });

  it('fades on the native driver, and simply hides or shows under reduce motion and in Night', () => {
    expect(code).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    // the first answer is the bar's first frame, drawn at once rather than faded
    expect(code).toContain('if (first || still) { markFade.setValue(to); }');
    expect(code).toContain(
      'Animated.timing(markFade, { toValue: to, duration: MARK_FADE_MS, useNativeDriver: true, }).start();',
    );
  });
});

describe('Surface: padding never reaches the view the decoration fills', () => {
  const src = withoutComments(read('Surface.tsx'));

  it('sends the caller style through splitPadding and puts only the box half on the box', () => {
    // The caller's padding lays out the children, not the box: the decoration wrapper is a
    // sibling of the content view, and the box is the one place the border and the fill live.
    // (Yoga does NOT inset an absolutely positioned child by its parent's padding, whatever an
    // earlier version of this note said — surfacePadding.ts has the source; the split is kept
    // for the structure.) So this asserts the mechanism, not a symptom.
    expect(src).toMatch(/const split = splitPadding\(/);
    // and the decoration must cover the BORDER box too: absoluteFill stops at the border, which
    // leaves a hairline of untinted ground at the edge. The RADIUS travels with the box:
    // coverBorderBox(bw, r), never coverBorderBox(bw) beside a separate borderRadius, which
    // would leave the radius describing the box's OLD size
    expect(src).toMatch(/coverBorderBox\(bw, r\)/);
    expect(src).not.toMatch(/coverBorderBox\(bw\)\s*,\s*\{\s*borderRadius/);
    expect(src).not.toMatch(/StyleSheet\.absoluteFill, \{ borderRadius: r/);
    expect(src).toMatch(/shadow,\s*split\.box,/);
    expect(src).toMatch(/styles\.content, split\.content/);
  });

  it('does not put the raw caller style on the box', () => {
    // the exact line that caused it: `shadow,` followed by a bare `style,`
    expect(src).not.toMatch(/shadow,\s*style,/);
  });
});

describe('QuickAction: the bubble is one opaque view under its elevation', () => {
  const src = withoutComments(read('QuickAction.tsx'));
  const bubble = src.slice(
    src.indexOf("resolvedShape === 'bubble'"),
    src.indexOf("resolvedShape === 'pebble'"),
  );

  it("paints the tint as the circle's own background, composited to an opaque color", () => {
    // The bubble keeps a native `elevation`, and an elevation shadow shows through anything
    // translucent above it as a tessellated band — the octagon on the owner's phone. Opaque is
    // the condition the shadow needs (shadows.ts); a disc over the flat ground loses nothing.
    //
    // At FULL tint, not the skin's `tintAlpha`: this view carries no BlurView on any platform,
    // and glass's 55% is a promise about a blur (skins.ts tintAlphaFor). Diluted, the disc was
    // 55% of a soft token over a lit ground made of the same four tokens — "too similar to the
    // background" (the owner, 2026-09-18), and the shape where it showed worst.
    //
    // AND SINCE 2026-09-22 THE COMPOSITE IS ONLY THE FALLBACK. The owner's color reference gives
    // each module a disc hex, which is painted as-is; the composite is what a night-mode disc
    // (where `disc` is null, because the amber screen may not show seven saturated circles) and
    // the neutral More tile still take. Both branches are opaque, which is what this test guards.
    expect(bubble).toMatch(
      /cat\.disc \?\?\s*composite\(t\.color\.app, cat\.soft, tintAlphaFor\(t\.skinTokens, false\)\)/,
    );
  });

  it('has no child fill layer under the icon — nothing translucent for the shadow to show through', () => {
    // Android's Glass draws the disc's liquid glass (`<TileGlass>`) as a CHILD of this opaque view:
    // over its fill, inside its ring — never a fill of its own, so the shadow under the disc still
    // meets one opaque circle (the describe below holds where it is mounted)
    expect(bubble).not.toMatch(/coverBorderBox\(/);
    expect(bubble).not.toMatch(/StyleSheet\.absoluteFill/);
    expect(bubble).not.toMatch(/\bopacity:/);
    expect(bubble).not.toMatch(/withAlpha\(/);
  });
});

/**
 * THE THREE SHAPES, AND WHICH ONE SLIDES.
 *
 * `cards` is gone entirely (the owner, 2026-09-16: "remove cards module completely, it does not
 * work at all") and a capsule never slides: two wide bars already fill the row, so a slider of
 * them hides most of the household's own selection behind a swipe for nothing ("for capsule
 * shape design, it should not be a slider. only for capsule you can show everything you
 * selected that comes in 2 columns (left and right)").
 *
 * Tripwires, because both are layout decisions a node test cannot render.
 */
describe('QuickRow: the shape decides the layout', () => {
  const src = read('QuickRow.tsx');
  const action = read('QuickAction.tsx');

  it('has no card shape left anywhere — not a branch, not a grid, not a constant', () => {
    // comments stripped, so the two files may still record WHY the shape went
    for (const file of [withoutComments(src), withoutComments(action)]) {
      expect(file).not.toMatch(/'cards'/);
      expect(file).not.toMatch(/\bcardShape\b/);
      expect(file).not.toMatch(/QUICK_CARD_/);
      expect(file).not.toMatch(/cardRamp/);
    }
  });

  it('sends a capsule to the wrapping grid however the caller asks', () => {
    expect(src).toContain("const wraps = resolvedShape === 'capsule'");
    // the slider is refused for it, so `scroll` from Today changes nothing about a capsule row
    expect(src).toContain('if (scroll && !wraps) {');
    // and the grid it falls through to is two columns wide
    expect(src).toMatch(/gridCols =[\s\S]{0,80}wraps \? 2/);
    expect(src).toContain('width: `${100 / cols}%`');
  });
});

describe('Row: a ticked thing is struck through', () => {
  const src = read('Row.tsx');

  it('strikes the title and softens its ink, so the state is never color alone', () => {
    // the owner, 2026-09-16: "when an activity is checkmark, do the strikethrough to the
    // activity text". The tick, the ink and the line all say the same thing, which is what
    // keeps it readable for anyone who cannot tell the two inks apart.
    const flat = src.replace(/\s+/g, ' ');
    expect(flat).toContain(
      "<StrikeText variant=\"bodyStrong\" ink={disabled || checked ? 'text2' : 'text'} struck={checked} >",
    );
    // only a CHECKLIST row: a plain row with no tick is never struck by a stray `checked`
    expect(flat).toContain('{isCheck ? (');
    expect(flat).toContain(
      "<BodyStrong ink={disabled ? 'text2' : 'text'} style={styles.title}> {title} </BodyStrong>",
    );
  });

  it('draws the strike across on a tick and runs it back on an untick (the owner, 2026-09-26)', () => {
    // "when a task is checklist, animation striking through the text, instead of instant no
    // animation like now": the title is the shopping list's `StrikeText`, whose line rests on the
    // platform's own line-through and is drawn only for a change it sees — instant under reduce
    // motion and in the amber Night (`rowMotion.test.ts` holds StrikeText to both)
    expect(src).toContain("import { StrikeText } from './StrikeSweep';");
    const strike = read('StrikeSweep.tsx');
    expect(strike).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    expect(strike).toContain('duration: struck ? STRIKE_MS : UNSTRIKE_MS,');
    // the box keeps the title's own give in the line, so a long chore still wraps before the badge
    expect(src.replace(/\s+/g, ' ')).toContain('<View style={styles.title}> <StrikeText');
  });
});

describe('Button: a filled button can never draw as an empty box', () => {
  const src = withoutComments(read('Button.tsx')).replace(/\s+/g, ' ');

  it('gives primary a solid fill of its own, under the gradient', () => {
    // The white-on-white failure: `primary` painted only through <LinearGradient>, so a frame
    // where the gradient drew nothing left a transparent box with a white label on it — on the
    // owner's phone, in the tour bubble, 2026-09-17. Both tokens were correct, so no contrast
    // check could have seen it; the fill under the gradient is what removes the failure mode.
    expect(src).toContain('{ backgroundColor: t.color.accent }');
  });

  it('inks primary and danger for the gradient, and nothing else does', () => {
    // If this ever stops being true, the fill above has to be revisited with it: the label color
    // and the fill under it are one decision and must not drift apart.
    expect(src).toContain("variant === 'primary' ? t.onGradient");
  });
});

describe('SectionHeader: two controls, and one of them is plainly the lesser', () => {
  const src = withoutComments(read('SectionHeader.tsx')).replace(/\s+/g, ' ');

  it('draws a glyph secondary as the same 34pt circle the top bar uses, never as a second link', () => {
    // Three equal-weight things in a row read as a toolbar. The section head is a heading with a
    // link on it; the eye beside "Schedule ›" has to read as chrome, the smaller of the two,
    // before it is read — a word there looked like a typo (the owner, 2026-09-17).
    expect(src).toContain('secondaryAction && isIconAction(secondaryAction) ? ( <IconButton');
    expect(src).toContain(
      "const isIconAction = (a: SectionAction | SectionIconAction): a is SectionIconAction => 'icon' in a",
    );
  });

  it('draws a label secondary exactly like the action beside it — accent2 and a chevron', () => {
    // It used to be `text2` with no arrow, on the reasoning that a heading keeps one obvious
    // link. On Today's Baby care strip that made the one control a parent needs the faintest
    // thing in the row (the owner, 2026-09-18: "'Edit' should be right next to schedule, make
    // it shown like 'Edit>'"), so the two now match and sit together.
    const label = /: secondaryAction \? \( <Pressable([^]*?)<\/Pressable>/.exec(src);
    expect(label?.[1]).toBeDefined();
    expect(label?.[1]).toContain('ink="accent2"');
    expect(label?.[1]).toContain('<Icon name="chev"');
  });

  it('keeps the two right-hand controls in one cluster, so neither strands in the middle', () => {
    // `space-between` on the row put the title at the start, the action at the end and a
    // secondary BETWEEN them — a third of the way across, belonging to neither.
    expect(src).toContain('style={[styles.cluster, { gap: t.space.md }]}');
    expect(src).toContain("cluster: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 }");
  });

  it('keeps the 44pt target on both, like the action beside them', () => {
    expect(src).toMatch(/: secondaryAction \? \( <Pressable[^]*minHeight: t\.hit\.min/);
    // the circle is 34; IconButton's own hitSlop makes up the 44
    expect(withoutComments(read('IconButton.tsx'))).toContain('hitSlop={slop}');
  });
});

describe('Rows no longer scrolls, and that is the fix rather than a loss', () => {
  const src = withoutComments(read('Row.tsx'));

  /**
   * THE BOX IS GONE (the owner, 2026-09-20: "instead of sliders for the up next window, try an
   * arrow up and arrow button instead on the left side. The problem is you slide in it
   * accidentally when you just want to slide the page").
   *
   * `Rows` held a fixed number of rows and scrolled for the rest, for exactly one caller —
   * Today's Up next — and four successive versions of that box each fixed a different half of
   * one problem: a scroller inside a scroller is a gesture two things want. The last of them
   * worked and still left the report above. Up next pages with two buttons now
   * (`screens/today/NextList.tsx`), so every part of the machinery below it goes with it.
   *
   * This test is the tripwire that keeps it gone. A nested scroller is not a thing to reach for
   * again in this component, and an assertion is a cheaper reminder than the four rounds were.
   */
  it('has no ScrollView, no nested-scroll plumbing and no drag signal left in it', () => {
    for (const gone of [
      'ScrollView',
      'nestedScrollEnabled',
      'onStartShouldSetResponderCapture',
      'onDragging',
      'overScrollMode',
      'RowsScroll',
      'scroll?',
    ]) {
      expect(src, gone).not.toContain(gone);
    }
  });

  it('is a plain list of rows with a divider between them, under the surface\u2019s own clip', () => {
    expect(src).toContain('accessibilityRole="list"');
    expect(src).toContain('{i > 0 ? <Divider inset={left} /> : null}');
    expect(src).toContain("borderRadius: t.radius.m, overflow: 'hidden' as const");
  });
});

/**
 * A STATUS WORD ON A CONTROL THAT IS NOT A ROW (2026-09-28): the app's quiet "Plus" tag during the
 * 14-day preview rides three more design-system controls a Row's `badge` could not reach — Reports'
 * "See the charts" (`Disclosure`), the sold palettes (`Swatch`) and Liquid Glass (`SkinTile`). Each
 * draws it with the one `Badge`, only when handed one, and speaks it after its own name, so the eye
 * and a screen reader are told the same thing and the control is still one target.
 */
describe('a status word rides a control, drawn by Badge and spoken after the name', () => {
  for (const file of ['Disclosure.tsx', 'Swatch.tsx', 'SkinTile.tsx']) {
    it(`${file} draws the badge only when it is handed one`, () => {
      const src = withoutComments(read(file)).replace(/\s+/g, ' ');
      expect(src).toContain("import { Badge } from './Badge';");
      expect(src).toMatch(
        /\{(caption && badge|badge|status) \? \( (<View[^>]*> [\s\S]{0,200})?<Badge/,
      );
      // never a second target: the badge is inside the one pressable, with no press of its own
      expect(src).not.toMatch(/<Badge[^>]*onPress/);
    });
  }

  it('Disclosure speaks the badge after its summary, and only when there is one', () => {
    const src = withoutComments(read('Disclosure.tsx')).replace(/\s+/g, ' ');
    expect(src).toContain(
      '{...(badge ? { accessibilityLabel: `${summary}, ${badge.label}` } : {})}',
    );
  });
});
