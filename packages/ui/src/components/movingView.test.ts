/**
 * A VIEW MOVED ON THE NATIVE DRIVER IS NEVER DRAWN AGAIN MID-MOVE (docs/DESIGN_SYSTEM.md §7.1 rule
 * 6; the owner, 2026-09-29, on an iPhone, of setup's step 4: "the text don't match what it should
 * and didn't auto next to the next step"). On iOS, React Native 0.86 puts a moving view back to
 * React's props when its layout changes, and those props hold the move's start until it ends.
 * `MovingView` keeps React from drawing the moving view again while it moves, so no start is ever
 * written into its props to be put back. This suite has no renderer (`interaction.test.ts` says
 * why), so it holds the parts of it over the source, with the step track's own guard beside them.
 * Setup's use of it, one style per move and no move cut short, is held in `setupMotion.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const flat = (file: string): string =>
  readFileSync(join(here, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

describe('MovingView: the view that moves is drawn again only for a new style', () => {
  const src = flat('MovingView.tsx');

  it('memoizes the moving view on its style alone', () => {
    expect(src).toContain(
      'const Mover = memo(function Mover({ style }: { style: AnimatedStyle }) {',
    );
  });

  it('hands the content past it through context, so new content draws only the content', () => {
    expect(src).toContain(
      '<Held.Provider value={children}> <Mover style={style} /> </Held.Provider>',
    );
    expect(src).toContain('<Animated.View style={style}> <HeldContent /> </Animated.View>');
    expect(src).toContain('return <>{useContext(Held)}</>;');
    // the children reach the moving view by no other road
    expect(src.match(/\{children\}/g) ?? []).toHaveLength(1);
  });

  it('is exported with the rest of the design system', () => {
    expect(flat('core.ts')).toContain("export * from './MovingView';");
  });
});

describe('the step track is drawn again only for its own step', () => {
  it('is memoized on its three plain props, so a render of setup never reaches it mid-hop', () => {
    expect(flat('StepTrack.tsx')).toContain(
      'export const StepTrack = memo(function StepTrack({ current, total, testID }: StepTrackProps) {',
    );
  });
});
