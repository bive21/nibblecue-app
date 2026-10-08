/**
 * THE TWO STEPPERS' WIRING, read off the source (node cannot mount a React Native control; the
 * arithmetic under it is `stepperMath.test.ts`).
 *
 * The owner, 2026-09-25: "Make 35 min tappable so users can enter an exact duration. Holding + or
 * – should change it continuously." Each half has a way to be quietly undone by a later edit — a
 * hold that no longer stops on release, a typed number a screen reader cannot reach, a dialog that
 * commits what it cannot read — and these are the lines that hold each one in place.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { typedA11yHint, typedHint } from './stepperMath';

const here = dirname(fileURLToPath(import.meta.url));
/** A component's source with comments taken out and whitespace flattened. */
const code = (f: string): string =>
  readFileSync(join(here, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s+/g, ' ');

const number = code('NumberStepper.tsx');
const round = code('RoundStepper.tsx');
const entry = code('StepperEntry.tsx');
const ruler = code('NumberRuler.tsx');

describe('press and hold, on both steppers', () => {
  it('runs on the pure repeater, which dies with the stepper', () => {
    expect(number).toContain('createStepRepeater({');
    expect(number).toContain('useEffect(() => repeater.stop, [repeater]);');
    // one implementation, shared: the round stepper does not keep a second copy of the loop
    expect(round).toContain("import { useStepFire, useStepRepeat } from './NumberStepper';");
    expect(round).not.toContain('setTimeout');
  });

  it('starts on the long press, stops on release, and still steps once on a plain tap', () => {
    // the round stepper taps by its `tapStep` (a pump's half ounce) and falls back to its step
    for (const [name, src, by] of [
      ['NumberStepper', number, 'step'],
      ['RoundStepper', round, 'tap'],
    ] as const) {
      expect(src, name).toContain('onLongPress={onHold}');
      expect(src, name).toContain('onPressOut={onRelease}');
      expect(src, name).toContain('onPress={onPress}');
      expect(src, name).toContain(`onHold={() => repeat.start(${by})}`);
      expect(src, name).toContain(`onHold={() => repeat.start(-${by})}`);
      expect(src, name).toContain('onRelease={repeat.stop}');
      expect(src, name).toContain(`onPress={() => fire(${by})}`);
      expect(src, name).toContain(
        'const fire = useStepFire({ value, min, max, places, disabled, onChange });',
      );
    }
    expect(round).toContain('const tap = tapStep ?? step;');
    // a screen reader's swipe moves as far as a tap does
    expect(round).toContain("if (e.nativeEvent.actionName === 'increment') fire(tap);");
    expect(round).toContain("else if (e.nativeEvent.actionName === 'decrement') fire(-tap);");
    // and a typed number still lands on the grid, `step`, not on the tap
    expect(round).toContain('disabled, onChange, step, ...(testID ? { testID } : {}), });');
  });

  it('steps from the number it last set, so a slow redraw cannot stall a hold', () => {
    expect(number).toContain('const from = latest.current;');
    expect(number).toContain('latest.current = next;');
    expect(number).toContain('latest.current = value;');
  });
});

describe('tap the number to type it', () => {
  it('is a labelled button with a hint, on both steppers, only when asked for', () => {
    for (const [name, src] of [
      ['NumberStepper', number],
      ['RoundStepper', round],
    ] as const) {
      // (NumberStepper builds it once, as `readout`, for both of its layouts)
      expect(src, name).toContain('entry.open && typeHint ? (');
      expect(src, name).toContain('accessibilityLabel={`${accessibilityLabel}, ${spoken}`}');
      expect(src, name).toContain('accessibilityHint={typeHint}');
      expect(src, name).toContain('onPress={entry.open}');
      // and the adjustable element takes a screen reader's double tap for the same thing
      expect(src, name).toContain("...(typeHint ? [{ name: 'activate', label: typeHint }] : []),");
      expect(src, name).toContain(
        "else if (e.nativeEvent.actionName === 'activate') entry.open?.();",
      );
      expect(src, name).toContain('{entry.element}');
    }
  });

  it('commits only what typedValue can read, and only on Set or Done', () => {
    expect(entry).toContain('typedValue(draft, entry.kind, min, max, decimals, step)');
    // and nothing that is not a number is ever in the field to be read (the owner, 2026-09-26)
    expect(entry).toContain(
      'setDraft(sanitizeTyped(text, entry.kind, decimals, wholeDigits(max)));',
    );
    expect(entry).toContain('onChangeText={type}');
    expect(entry).toContain('keyboardType={typedKeyboard(entry.kind, decimals)}');
    expect(entry).toContain('if (next === null) return;');
    expect(entry).toContain('disabled={next === null}');
    expect(entry).toContain('onSubmitEditing={commit}');
    // Cancel, the scrim and Back all close without a change
    expect(entry.match(/onPress=\{close\}/g)).toHaveLength(2);
    expect(entry).toContain('onRequestClose={close}');
    // no iOS-only prompt: it has to work in Expo Go on Android as well
    expect(entry).not.toContain('Alert.prompt');
  });

  it('says what a double tap does, and what may be typed, before anything is typed', () => {
    expect(typedA11yHint('minutes')).toBe('Double tap to type an exact length');
    expect(typedA11yHint('amount')).toBe('Double tap to type an exact amount');
    // numbers only since 2026-09-26, so a length is said in minutes and nothing else
    expect(typedHint('minutes', 0, 960, 0, 'min')).toBe('In minutes. Up to 16h.');
    expect(typedHint('minutes', 5, 120, 0, 'min')).toBe('In minutes. From 5m to 2h.');
    expect(typedHint('amount', 0, 12, 1, 'oz')).toBe('Up to 12 oz.');
  });
});

/**
 * THE COMPACT ROW IS THE SAME STEPPER (the owner, 2026-09-26: *"(-) x oz (+) all in one row, and
 * smaller than current"*). What must not come apart is everything above: one hold, one tick, one
 * typed number and one adjustable element, shared by both layouts rather than copied into a second.
 */
describe('the compact row', () => {
  it('shares the one adjustable element, and both layouts spread it', () => {
    expect(number).toContain('const adjustable: ViewProps = {');
    expect(number).toContain("accessibilityRole: 'adjustable',");
    expect(number).toContain('accessibilityValue: { text: said },');
    expect(number).toContain("{ name: 'increment' }, { name: 'decrement' },");
    expect(number).toContain('onAccessibilityAction: onAction,');
    expect(number.match(/\{\.\.\.adjustable\}/g)).toHaveLength(2);
    // the same two buttons in both: the hold, the release and the tap are theirs
    expect(number.match(/\{minus\} \{shown\} \{plus\}/g)).toHaveLength(2);
    expect(number.match(/<StepButton /g)).toHaveLength(2);
  });

  it('is the whole row to a screen reader, with its name on the screen and its ids kept', () => {
    const compact = number.slice(number.indexOf('if (compact) return ('));
    expect(compact).toContain('{...adjustable}');
    expect(compact).toContain('{...(testID ? { testID } : {})}');
    // its name in the text's own ink, at the hint's size (docs/DESIGN_SYSTEM.md §4.1)
    expect(compact).toContain(
      '<BodySm ink="text" {...(testID ? { testID: `${testID}.caption` } : {})}> {caption} </BodySm>',
    );
    // never shorter than a target, so no target reaches past the row
    expect(compact).toContain('minHeight: t.hit.min');
    expect(compact).toContain('{entry.element}');
  });

  it('draws its detail under the caption, and says it with the value', () => {
    const compact = number.slice(number.indexOf('if (compact) return ('));
    // a row's line, as a Row draws it: the hint, one size with the name over it (§4.1, 2026-09-30)
    expect(compact).toContain(
      '<BodySm {...(testID ? { testID: `${testID}.detail` } : {})}>{detail}</BodySm>',
    );
    expect(number).not.toContain('<Meta');
    // the row is one element, so the detail is heard with the number, never lost
    expect(number).toContain('const said = compact && detail ? `${spoken}. ${detail}` : spoken;');
  });

  it('draws each circle inside a whole 44 pt target, not a slop past the row’s edge', () => {
    expect(number).toContain('const target = Math.max(circle, t.hit.min);');
    expect(number).toContain('style={[styles.button, { width: target, height: target }]}');
    expect(number).toContain('width: circle, height: circle, borderRadius: circle / 2,');
    expect(number).toContain('backgroundColor: t.color.accentSoft,');
    expect(number).toContain('<StepGlyph kind={kind} box={circle} color={t.color.accent2} />');
    // the typed number's slop reaches up and down only, never over a − or a +
    expect(number).toContain(
      'hitSlop={compact ? { top: t.space.md, bottom: t.space.md } : t.space.md}',
    );
    // and the press moves nothing under reduce motion
    expect(number).toContain('pressed && enabled && !t.reduceMotion ? 0.93 : 1');
  });

  it('keeps the number box as wide as the widest number, scaled as its text is', () => {
    expect(number).toContain(
      'compactValueWidth(min, max, places, unitLabel, kind) * t.fontScale.chrome + (boxed ? typedBoxExtra() : 0),',
    );
    expect(number).toContain("variant={compact ? 'statValue' : 'display'}");
  });
});

/**
 * THE TYPED BOX AND THE READOUT (the owner, 2026-09-26: *"why is the finish logging time and oz have
 * underline on the number?"* and *"1h20m is easier to read"*). One cue and one readout, shared by
 * every stepper rather than drawn four ways: these are the lines that keep it that way.
 */
describe('the typed box and the readout', () => {
  const readout = code('StepReadout.tsx');

  it('has no underline anywhere any more', () => {
    for (const [name, src] of [
      ['NumberStepper', number],
      ['RoundStepper', round],
      ['NumberRuler', ruler],
      ['StepReadout', readout],
    ] as const) {
      expect(src, name).not.toContain('textDecorationLine');
      expect(src, name).not.toContain('typedCue');
    }
  });

  it('boxes a typeable number on every stepper, from the one style', () => {
    expect(number).toContain('typedBoxStyle(t, stepperBoxShape(circle)),');
    expect(round).toContain('typedBoxStyle(t, stepperBoxShape(circle)),');
    // the ruler's box, and the same box lit as a field while its number is typed
    expect(ruler).toContain('boxed ? typedBoxStyle(t, boxShape) : styles.plain,');
    expect(ruler).toContain('typedBoxStyle(t, boxShape, true)');
    expect(readout).toContain('const paint = typedBoxPaint(t.color);');
  });

  it('reads every number through stepReadout, and says it through spokenReadout', () => {
    for (const [name, src] of [
      ['NumberStepper', number],
      ['RoundStepper', round],
      ['NumberRuler', ruler],
    ] as const) {
      expect(src, name).toMatch(
        /const readout = stepReadout\((value|shown), places, unitLabel, kind\);/,
      );
      expect(src, name).toContain('spokenReadout(readout, kind)');
      expect(src, name).toContain('<StepReadout');
    }
    // the round pair never shrinks its number: Android blanked it on every change (2026-10-06);
    // its box reserves the widest readout instead
    expect(round).not.toContain('fit={');
    expect(round).toContain('widestReadoutWidth(min, max, places, unitLabel, kind, valueSize)');
    expect(readout).toContain('adjustsFontSizeToFit: true, minimumFontScale: fit');
  });

  it('puts the ruler’s number on its caption’s row, at the right, with the id its caption had', () => {
    expect(ruler).toContain(
      '<Body style={inline ? styles.inlineCaption : styles.caption} {...(testID ? { testID: `${testID}.caption` } : {})} >',
    );
    expect(ruler).toContain("boxEnd: { marginLeft: 'auto' },");
    expect(ruler).toContain(
      "header: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },",
    );
    // no card round it: the strip is its own track
    expect(ruler).not.toContain('<Surface');
  });
});

/**
 * THE RULER (the owner, 2026-09-26: entering an ounce or a minute was "very repetitive"). The
 * arithmetic is `rulerMath.test.ts`; these are the lines that make it the same stepper — its hold,
 * its tick, its ids — with a scale to drag and a number typed where it stands.
 */
describe('the ruler', () => {
  it('is the stepper’s own layout: the same step, the same − and +, the same ids', () => {
    expect(number).toContain('const asRuler = ruler && !compact && rulerFits(min, max, step);');
    expect(number).toContain('if (asRuler) return ( <NumberRuler');
    expect(number).toContain('minus={minus} plus={plus} fire={fire}');
    // its buttons are the compact row's circles, each inside a whole target
    expect(number).toContain(
      'const circle = compact || asRuler ? COMPACT_STEPPER.circle : BIG_STEPPER.circle;',
    );
    expect(number.match(/circle=\{circle\}/g)).toHaveLength(2);
    // the dialog is not opened for a ruler: it types in place
    expect(number).toContain('entry: asRuler ? undefined : typed,');
  });

  it('snaps to a step with the platform’s own scroll, and has no momentum under reduce motion', () => {
    // a step's distance is the scale's: ten points, or a count's wider tick (`rulerTickFor`)
    expect(ruler).toContain('snapToInterval={tick}');
    expect(ruler).toContain('const tick = rulerTickFor(min, max, step);');
    expect(ruler).toContain("decelerationRate={t.reduceMotion ? 'fast' : 'normal'}");
    expect(ruler).toContain('disableIntervalMomentum={t.reduceMotion}');
    expect(ruler).toContain('follow(!t.reduceMotion);');
    // and it never rubber-bands past its ends
    expect(ruler).toContain('bounces={false}');
    expect(ruler).toContain('overScrollMode="never"');
  });

  it('is one adjustable element — a swipe is a step, a double tap types — until it is being typed', () => {
    expect(ruler).toContain('const adjustable: ViewProps = typing ? {} : {');
    expect(ruler).toContain("accessibilityRole: 'adjustable',");
    expect(ruler).toContain('accessibilityValue: { text: spoken },');
    expect(ruler).toContain("if (e.nativeEvent.actionName === 'increment') fire(step);");
    expect(ruler).toContain("else if (e.nativeEvent.actionName === 'decrement') fire(-step);");
    expect(ruler).toContain("else if (e.nativeEvent.actionName === 'activate') startTyping();");
    // the strip is drawn for the eye; the adjustable element is what a screen reader moves
    expect(ruler).toContain(
      'importantForAccessibility="no-hide-descendants" accessibilityElementsHidden',
    );
  });

  it('types in place: numbers only, the sheet has them as they are typed, Escape puts it back', () => {
    expect(ruler).toContain(
      'const kept = sanitizeTyped(text, typed.kind, places, wholeDigits(max));',
    );
    expect(ruler).toContain(
      'if (next !== null && next !== valueRef.current) onChangeRef.current(next);',
    );
    expect(ruler).toContain("keyboardType={typedKeyboard(typed?.kind ?? 'amount', places)}");
    expect(ruler).toContain('onSubmitEditing={commit}');
    expect(ruler).toContain('onBlur={() => finish(true)}');
    expect(ruler).toContain("if (e.nativeEvent.key === 'Escape') cancel();");
    // an empty field let go of is "never mind"
    expect(ruler).toContain(
      'if (next === null && valueRef.current !== original.current) onChangeRef.current(original.current);',
    );
    // a − or + or a drag while typing lets go of the field first
    // the strip, and the − and + on the two rows — and again beside the strip (`beside`, 2026-10-06)
    expect(ruler.match(/onTouchStart=\{endTyping\}/g)).toHaveLength(5);
  });

  it('draws a count as a number line, heard in its own words (2026-09-30)', () => {
    expect(ruler).toContain('const counts = rulerCounts(min, max, step);');
    // every place a drag, a follow or a tick is placed uses the scale's own distance
    expect(ruler.match(/rulerIndexAt\(shownOffset\.current, count, tick\)/g)).toHaveLength(3);
    expect(ruler).toContain('const x = rulerOffsetOf(valueRef.current, min, step, count, tick);');
    expect(ruler).toContain('const marks = rulerMarksFor(step, hours, counts);');
    expect(ruler).toContain('const x = rulerTickX(strip, i, tick);');
    expect(ruler).toContain('width: rulerContentWidth(strip, count, tick)');
    // the caller's words for the value, on the ruler and on every other layout
    expect(ruler).toContain('const spoken = say ? say(shown) : spokenReadout(readout, kind);');
    expect(number).toContain('const spoken = say ? say(value) : spokenReadout(readout, kind);');
    expect(number).toContain('say={say}');
    // no unit, no unit drawn beside the typed digits, and none in the field's name
    expect(ruler).toContain(
      '{unitLabel ? <Label style={unitCaseStyle(unitLabel)}>{unitLabel}</Label> : null}',
    );
  });

  /**
   * AND ALL OF IT IN VIEW (the owner, 2026-09-30, of "How many bottles": *"The slider with the
   * empty space on the left don't look very nice"*). A count that fits its strip is a line: its
   * numbers end to end, the needle moving to the chosen one, taken by a tap or a sideways drag.
   */
  it('draws a count that fits as a line with a moving needle, a tap or a sideways drag its own', () => {
    expect(ruler).toContain('const line = counts && countLineFits(strip, min, max, scale);');
    expect(ruler).toContain('const stripEl = line ? (');
    // the needle moves, on the native driver, and jumps rather than glides under Reduce motion
    expect(ruler).toContain('transform: [{ translateX: needleX }]');
    expect(ruler).toContain('if (t.reduceMotion) needleX.setValue(x);');
    expect(ruler).toContain('useNativeDriver: true,');
    // never taken on contact, so the sheet's scroll and a tap stay theirs; sideways past a claim
    expect(ruler).toContain('onStartShouldSetPanResponder: () => false,');
    expect(ruler).toContain('countLineClaims(gs.dx, gs.dy),');
    // a drag that turns into a scroll is handed back, and one taken away settles all the same
    expect(ruler).toContain(
      'onPanResponderTerminationRequest: (_e, gs) => Math.abs(gs.dy) > Math.abs(gs.dx),',
    );
    expect(ruler).toContain('onPanResponderTerminate: () => lineSettleRef.current(),');
    // a tap is a touch that ended where it began, and a touch the scroll took chooses nothing
    expect(ruler).toContain(
      'if (!countLineTapped(pageX - touch.pageX, pageY - touch.pageY)) return;',
    );
    expect(ruler).toContain('onTouchCancel={onLineTouchCancel}');
    // a tap onto a new number is a one-step drag let go at once: felt as the ruler's one `tick`
    expect(ruler).toContain("phase.current = 'drag'; cross(index); lineSettle(); };");
    // a touch on the line lets go of a number being typed first, as the ruler's does
    expect(ruler).toContain(
      'const onLineTouchStart = (e: GestureResponderEvent): void => { endTyping();',
    );
    // nothing on the line takes a touch of its own, so the strip's locationX is the strip's
    expect(ruler).toContain('<View pointerEvents="none" style={[styles.line, { height }]}>');
    expect(ruler).toContain('<Animated.View pointerEvents="none"');
    // the chosen number reads in the page's full ink, never by the needle's hue alone
    expect(ruler).toContain('color={i === chosen ? paint.chosen : paint.label}');
    expect(ruler).toContain('chosen={countLineIndexOf(shown, min, count)}');
  });

  it('says what may be typed in the hint style, under the number being typed (§4.1)', () => {
    expect(ruler).toContain(
      '<BodySm style={styles.grow} {...(testID ? { testID: `${testID}-hint` } : {})}> {hint} </BodySm>',
    );
    expect(ruler).not.toContain('<Meta');
  });

  it('keeps the stepper’s ids and adds its own', () => {
    for (const id of ['-type', '-value', '-field', '-done', '-ruler', '-hint'])
      expect(ruler, id).toContain('testID: `${testID}' + id + '`');
    expect(ruler).toContain('{...(testID ? { testID } : {})}');
  });
});

/**
 * ONE FAMILY, DRAWN (the owner, 2026-09-30: *"the icon plus and minus is not exactly on the aligned
 * in the middle of the border. This is very bad and need fixing."*, and of the box: *"Did the grey
 * highlight box look okay to you?"*). The geometry is `stepperMath.test.ts`; these are the lines that
 * draw it, on all three steppers and the ruler that borrows the compact row's buttons.
 */
describe('the − and + are shapes, and the box is the circles’ height', () => {
  const raw = (f: string): string => readFileSync(join(here, f), 'utf8');

  it('sets no "+" or "−" as text inside any stepper’s button', () => {
    for (const [name, src] of [
      ['NumberStepper', number],
      ['RoundStepper', round],
      ['NumberRuler', ruler],
    ] as const) {
      for (const glyph of ["'−'", '"−"', "'+'", '"+"', '>−<', '>+<', '{glyph}'])
        expect(src, `${name} ${glyph}`).not.toContain(glyph);
      expect(src, name).not.toMatch(/<AppText[^>]*>\s*[−+-]\s*</);
    }
    // each button draws its mark with StepGlyph, in the accent ink, on the circle it sits in
    expect(number).toContain('<StepGlyph kind={kind} box={circle} color={t.color.accent2} />');
    expect(round).toContain('<StepGlyph kind={kind} box={size} color={t.color.accent2} />');
    for (const src of [number, round]) {
      expect(src).toContain('kind="minus"');
      expect(src).toContain('kind="plus"');
    }
  });

  it('draws the glyph by arithmetic on a layer the circle’s own size, seen by nobody else', () => {
    const glyph = code('StepGlyph.tsx');
    expect(glyph).toContain('const g = stepGlyph(box);');
    expect(glyph).toContain("layer: { position: 'absolute', left: 0, top: 0 },");
    expect(glyph).toContain('style={[styles.layer, { width: box, height: box }]}');
    expect(glyph).toContain('g.bar, { width: g.length, height: g.thickness }');
    expect(glyph).toContain('g.post, { width: g.thickness, height: g.length }');
    expect(glyph).toContain('pointerEvents="none" accessibilityElementsHidden');
  });

  it('makes the box exactly the circles’ height, a pill, the number centered in it', () => {
    const readout = code('StepReadout.tsx');
    expect(readout).toContain('minHeight: shape.height,');
    expect(readout).toContain('borderRadius: shape.radius ?? t.radius.pill,');
    expect(readout).toContain("alignItems: 'center', justifyContent: 'center',");
    // the number and its unit on one baseline inside it, on every stepper
    for (const src of [number, round, ruler]) expect(src).toContain('readoutRow(t.space.xs)');
    // the ruler's box is the strip's height on the strip's corner
    expect(ruler).toContain('const boxShape = { height, radius: t.radius.m };');
  });

  it('keeps no card round a stepper’s row: the circles and the box are the control', () => {
    expect(raw('RoundStepper.tsx')).not.toContain('<Surface');
    expect(raw('NumberStepper.tsx')).not.toContain('<Surface');
    for (const src of [number, round])
      expect(src).toContain(
        'style={[styles.row, { gap: t.space.xs, opacity: disabled ? 0.5 : 1 }]}',
      );
  });
});

/**
 * THE RULER IN ITS ROW'S GAP (the owner, 2026-09-30: *"Would it make sense to you if the slider is
 * inside the red circle I made instead? We don't need a very long slider for this."*). The rule is
 * `rulerMath.test.ts` and the app's captions are measured in the app's own test; these are the lines
 * that draw it: one row of caption, strip and box, the − and + only in the two rows, and the
 * adjustable element and every id kept in both.
 */
describe('the ruler in its row’s gap', () => {
  it('decides from the caption and the row as drawn, guessing long before they are measured', () => {
    expect(ruler).toContain(
      'const inline = rulerInline( row > 0 ? row : win.width - 2 * t.space.xxl, caption ? (captionWidth ?? rulerCaptionGuess(caption, t.fontScale.body)) : 0, boxWidth, );',
    );
    // the caption measured on one line, out of the layout, unseen and unheard
    expect(ruler).toContain('<Body numberOfLines={1} onLayout={e => {');
    expect(ruler).toContain("measure: { position: 'absolute', left: 0, top: 0, opacity: 0 },");
  });

  it('draws one row of caption, strip and box, and the − and + only on the two rows', () => {
    const at = ruler.indexOf(') : inline ? (');
    const one = ruler.slice(at, ruler.indexOf(') : (', at));
    expect(one).toContain('{captionEl} {stripEl} {number}');
    expect(one).not.toContain('{minus}');
    const two = ruler.slice(ruler.indexOf('{inline || beside ? null : ('));
    expect(two).toContain('<View onTouchStart={endTyping}>{minus}</View> {stripEl}');
    // the caption keeps its words whole in the row: the strip gives way
    expect(ruler).toContain('inlineCaption: { flexShrink: 0 },');
  });

  it('places the strip afresh when it moves between the layouts, unseen until it is', () => {
    expect(ruler).toContain("const layout = beside ? 'beside' : inline ? 'inline' : 'rows';");
    expect(ruler).toContain('if (ready.current === layout) return;');
    expect(ruler).toContain('style={{ opacity: placed === layout ? 1 : 0 }}');
    expect(ruler).toContain('key={layout}');
  });

  it('keeps the one adjustable element and every id in both layouts', () => {
    expect(ruler.match(/\{\.\.\.adjustable\}/g)).toHaveLength(1);
    for (const id of ['-type', '-value', '-field', '-done', '-ruler', '-hint', '.caption'])
      expect(ruler, id).toContain('testID: `${testID}' + id + '`');
  });
});

/**
 * THE ROUND STEPPER'S NUMBER NEVER COLLAPSES (2026-10-06, the owner's screenshots: Add stored milk,
 * a breastfeed side, page 2's bottles — − and + with nothing between them). A flexing box (`flex: 1`,
 * then a flex basis) inside the content-sized rows its callers use was laid out at no width on
 * Android, at rest or after a tap. The box is the compact NumberStepper's: a `minWidth` of the
 * widest readout, never a flex, and a number that never shrinks.
 */
describe('the round stepper keeps its number', () => {
  const round = readFileSync(join(__dirname, 'RoundStepper.tsx'), 'utf8');
  const code = round.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  it('reserves the widest readout as a minimum width, on both the typed box and the plain one', () => {
    expect(code.split('minWidth: room').length - 1).toBe(2);
    expect(code).not.toContain('flexBasis');
    expect(code).not.toMatch(/value:\s*\{\s*flex/);
    expect(code).not.toContain('adjustsFontSizeToFit');
    expect(code).not.toContain('fit={');
  });
});
