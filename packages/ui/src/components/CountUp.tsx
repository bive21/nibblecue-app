/**
 * CountUp — a headline figure that counts up from zero the first time its card is seen
 * (`reportReveal.ts` has the numbers and the rules; the owner's delight list, 2026-09-26).
 *
 * FRAME BY FRAME. Holding (the card not yet on screen), it reads the figure's own zero — "0m",
 * "0 oz", "0.0". When the card plays it counts for 600 ms on an ease-out, each frame written by
 * the figure's own formatter from a value cut to the figure's own step, and the last frame is
 * `format(value)` itself. A new value while counting is taken in stride: the count lands on it.
 * A new value at any other time is simply shown.
 *
 * A SCREEN READER HEARS THE FINAL VALUE, ALWAYS. The label is `format(value)` from the first frame,
 * whatever the digits are doing, so a figure read out mid-count is never read out wrong.
 *
 * The count is a Text's content, so it cannot ride the native driver: it is one `requestAnimation
 * Frame` loop per figure, and a frame whose words did not change does not re-render (React keeps
 * an equal state). Tabular mono digits (`numeric`) keep the figure from shimmering as it counts.
 * Reduce motion and the amber Night write the value at once (`motionStill`).
 */
import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { countText, REVEAL, type Reveal } from './reportReveal';
import { statValueRuns } from './statTable';
import { AppText, type AppTextProps } from './Text';
import { motionStill } from './tickDraw';

export interface CountUpProps extends Omit<AppTextProps, 'children' | 'accessibilityLabel'> {
  /** The figure's value, in the unit its formatter reads (minutes, millilitres, a count). */
  value: number;
  /** The figure's own words for a value — the same function that writes it at rest. */
  format: (n: number) => string;
  /** The figure's own precision: 1 for a count or whole minutes, 0.1 for "4.5 a day". */
  step?: number | undefined;
  /** Where the card is in its entrance (`Reveal`); at rest when absent. */
  reveal?: Reveal | undefined;
  /**
   * THE FIGURE'S LETTERS SMALL BESIDE ITS DIGITS — "13h 20m" with the hours and minutes at the
   * figure's size and the `h` and `m` at `meta` in the quiet ink, as `StatTable` draws a length
   * (Reports' lead cards, 2026-09-26; `leadFigure.ts` measures it). Every frame of the count is
   * split the same way, so a figure in flight looks like the figure it lands on.
   */
  smallUnits?: boolean | undefined;
}

/** Waiting to be seen, counting, or simply the figure — and it only ever moves forward. */
type Phase = 'waiting' | 'counting' | 'done';

export function CountUp({
  value,
  format,
  step,
  reveal = 'rest',
  smallUnits = false,
  ...text
}: CountUpProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  const final = format(value);
  const phase = useRef<Phase>(reveal !== 'rest' && !still ? 'waiting' : 'done');
  const [shown, setShown] = useState(() =>
    reveal !== 'rest' && !still ? countText(value, 0, format, step) : final,
  );
  // what the count lands on, read every frame, so a refresh mid-count is followed rather than lost
  const target = useRef({ value, format, step });
  target.current = { value, format, step };
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (still) {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      phase.current = 'done';
      setShown(target.current.format(target.current.value));
      return;
    }
    if (phase.current !== 'waiting' || reveal === 'hold') return;
    if (reveal === 'rest') {
      phase.current = 'done';
      setShown(target.current.format(target.current.value));
      return;
    }
    phase.current = 'counting';
    const start = Date.now();
    const tick = () => {
      const u = (Date.now() - start) / REVEAL.countMs;
      const now = target.current;
      if (u >= 1) {
        frame.current = null;
        phase.current = 'done';
        setShown(now.format(now.value));
        return;
      }
      setShown(countText(now.value, u, now.format, now.step));
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [reveal, still]);

  // a value that changes while the figure is not counting is simply the figure (or its zero)
  useEffect(() => {
    if (phase.current === 'done') setShown(final);
    else if (phase.current === 'waiting') {
      const now = target.current;
      setShown(countText(now.value, 0, now.format, now.step));
    }
  }, [final]);

  // the figure going away stops its count; nothing else does. A count cut short goes back to
  // waiting, so a remount of the same figure (React's development double-mount) counts again
  // instead of standing at zero
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      if (phase.current === 'counting') phase.current = 'waiting';
    },
    [],
  );

  return (
    <AppText numeric {...text} accessibilityLabel={final}>
      {smallUnits
        ? statValueRuns(shown).map((run, i) =>
            run.kind === 'big' ? (
              <Text key={i}>{run.text}</Text>
            ) : (
              <Text
                key={i}
                style={{ fontSize: t.type.meta.fontSize, letterSpacing: 0, color: t.color.text2 }}
              >
                {run.text}
              </Text>
            ),
          )
        : shown}
    </AppText>
  );
}
