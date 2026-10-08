/**
 * MovingView: a view moved on the native driver that React never draws again while it moves
 * (docs/DESIGN_SYSTEM.md §7.1 rule 6). Setup's page turns on one, and the welcome's card rises on
 * one (the owner, 2026-09-29, on an iPhone: "between step 3 transitioning to 4, the text don't match
 * what it should and didn't auto next to the next step (step 4) making it confusing").
 *
 * WHY IT EXISTS. On iOS, React Native 0.86 puts a view's opacity and transform back to what React's
 * props say whenever the view's layout changes, and it does not skip the keys Animated owns
 * (`RCTViewComponentView`: `updateLayoutMetrics` resets the transform when the SIZE changes, and
 * marks the layer so `invalidateLayer` resets the opacity when the frame changes at all). React's
 * props for a value on the native driver are only what JavaScript last knew: while a move runs,
 * its START, because the native side reports back only when it ends (`createAnimatedPropsHook`
 * syncs on completion). A moving view drawn again mid-move, which happens whenever its parent
 * renders, gets that start written into its props. If its layout then changes after the move's
 * last frame, iOS puts it back at the start, and nothing moves it again: the sync at the end
 * writes only keys Animated owns, which the view skips. Setup's "How often?" page stood there at
 * nothing, 24 pt to the right, under a track that said step 4. The page writes its starting
 * points as it opens, which draws the page again and changes its height mid-turn.
 *
 * WHAT IT DOES. The view that moves is memoized on its style and nothing else, and what is in it
 * arrives through context: a parent that renders again renders the content, never the moving
 * view. React's props for it keep what it was first drawn with, the native side keeps the view's
 * own record current on every frame, and a change of layout puts back where the move really is.
 *
 * WHAT THE CALLER OWES IT. The style must stay the same object for as long as a move runs (a
 * `useMemo` on the move); a new style draws the view again at whatever JavaScript knows. And a
 * move is let finish rather than cut short by `setValue` or `stop`: a stopped run reports where it
 * stood back to JavaScript afterward, and the view is drawn again there. A value made for each
 * move, as setup's page turn does, is never stopped by the next one.
 *
 * To everything but the eye it is a plain view: no name, no role, no touch of its own.
 */
import { createContext, memo, useContext, type ReactNode } from 'react';
import { Animated } from 'react-native';
import type { AnimatedStyle } from './PictureToggle';

export interface MovingViewProps {
  /** The moving style: the same object for as long as the move runs (memoize it on the move). */
  style: AnimatedStyle;
  children: ReactNode;
}

/** What is in the moving view, handed past it. A nested MovingView hands its own. */
const Held = createContext<ReactNode>(null);

/** The content, read from `Held`: the one part that draws again while the view moves. */
function HeldContent() {
  return <>{useContext(Held)}</>;
}

/** The view that moves: drawn again only for a new style, never for new content. */
const Mover = memo(function Mover({ style }: { style: AnimatedStyle }) {
  return (
    <Animated.View style={style}>
      <HeldContent />
    </Animated.View>
  );
});

export function MovingView({ style, children }: MovingViewProps) {
  return (
    <Held.Provider value={children}>
      <Mover style={style} />
    </Held.Provider>
  );
}
