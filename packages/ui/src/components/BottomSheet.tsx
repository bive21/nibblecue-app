/**
 * BottomSheet (docs/DESIGN_SYSTEM.md §5, §7, §8; docs/MOBILE.md §4, §8, §9): the primary surface
 * for every Quick Entry. A drag handle, a title row with Close, a scrolling body, an optional
 * footer that stays put (Save lives in the thumb zone, MOBILE.md §8), 90% of the window at most.
 *
 * Choices that are not obvious:
 *  - The material is a `Surface kind="sheet"` — the skin's hardest frost, opaque where the
 *    platform cannot blur (skins.ts) — painted BEHIND the column as an absolute layer
 *    rather than around it: Surface sizes to its content, and the `large` detent needs a body
 *    that fills a fixed height. The layer extends one `radius.xl` below the window so the
 *    material's own rounded bottom corners (which every skin draws on all four corners) sit
 *    off-screen — square bottom corners without a per-corner prop on the material.
 *  - The header is the title, then Close — in the tree and on the screen, as the prototype's
 *    `.shead` draws it (h3, then the X pushed right). DESIGN_SYSTEM.md §8 also says "the close
 *    button is reachable first", and that sentence cannot be honored with the X on the right:
 *    VoiceOver and TalkBack both walk siblings in on-screen order (top-left to bottom-right),
 *    React Native has no cross-platform traversal-order API, and §8's own first clause ("focus
 *    order follows visual order") plus MOBILE.md §9 say the same. An earlier draft put Close
 *    first in the tree under `row-reverse`; that changes nothing a screen reader hears and was
 *    removed. The prototype wins (CLAUDE.md §1) and the §8 sentence is FLAGGED as the document
 *    bug — it should read "the close button is the first control after the title". What the
 *    sheet does guarantee: the title is announced as the sheet's name on entry, Close is the
 *    very next stop, and nothing in the body comes before it.
 *  - `accessibilityViewIsModal` on the sheet, not on the modal root: it tells VoiceOver to
 *    ignore the scrim and everything under it, which is what "sheets trap focus" means here.
 *  - Motion is one Animated value in px (the sheet's offset from rest) so the drag-to-close
 *    gesture and the 220 ms slide share it. It starts a full window height down rather than the
 *    sheet's own height because the height is not known until the first layout, and a sheet
 *    that flashes at rest before sliding is worse than one that travels a little further.
 *    The values ALWAYS start at the hidden position and `wasVisible` starts false, so a sheet
 *    that mounts already visible (a sheet stack mounting one component per entry) slides in
 *    like one that was toggled — the effect sees a change on its first run either way.
 *  - Reduce motion sets the value directly: content appears and disappears, nothing moves.
 *  - THE SLIDE MOVES A FULL SCREEN VIEW THAT NEVER CHANGES SIZE, and the sheet stands inside it
 *    (2026-09-29, the owner's brands step on an iPhone: a scrim and a keyboard, no sheet, and the
 *    sheet back only when the keyboard went away). On iOS, React Native 0.86 re-applies a view's
 *    transform from React's props whenever the view's SIZE changes (`RCTViewComponentView`,
 *    `updateLayoutMetrics`), and React's props hold a native-driven value's STARTING point until
 *    its animation ends: a full window height down. A field that takes the focus as its sheet
 *    opens brings the keyboard up mid-slide, the keyboard makes the sheet shorter, and the sheet
 *    was put back below the screen, where it stayed until its size changed again. The view the
 *    slide moves is now the size of the modal from start to finish, so nothing re-applies it;
 *    the sheet inside grows, shrinks and rises for the keyboard with no transform of its own.
 *  - THE FOOT CAN BE FILLED FROM INSIDE THE BODY (`SheetFooter`; the owner, 2026-09-25: "Sticky
 *    'Save sleep' button"). The `footer` prop is the owner's — whoever opens the sheet — and a
 *    Quick Entry's Save is written deep inside a module's form, which cannot reach it. So the
 *    sheet hands its body a slot through context, and whatever a `SheetFooter` holds is drawn
 *    here, under the scroller, above the `footer` prop's own content (a slot's Skip is secondary
 *    to the Save, and secondary goes beneath). The node is re-sent on every render of the form
 *    that holds it, so its closures are always the form's latest; the sheet's own re-render does
 *    not re-render the body — `children` is the same element — so nothing loops. It is drawn out
 *    here, outside the body's providers, so it carries the one a log button reads — the module's
 *    tint — with it (2026-09-26; `SheetFooter` says why).
 *  - The column may SHRINK (`flexShrink: 1`): with the keyboard up, the sheet is padded up by the
 *    keyboard's height, and a sheet as tall as its content used to run off the top of the window
 *    taking its title with it. Shrinking, it is the scroller that gives way, and the title and the
 *    pinned Save stay on screen with the keyboard.
 *  - THE KEYBOARD LIFTS THE SHEET, ON BOTH PLATFORMS, BY THE SHEET'S OWN ARITHMETIC (the owner,
 *    2026-09-28, on setup's brands step: "when the click to add is clicked, the screen feels like
 *    something were about to show up but didnt, but the keyboard shows up and there is an overlay
 *    on the screen"). React Native's KeyboardAvoidingView works the lift out from where the
 *    keyboard's top edge is said to be, and an iPhone can say 0 (one that prefers cross-fade
 *    transitions does): that view then leaves the sheet under the keyboard, or pads it by the
 *    height of the whole screen. On Android, React Native 0.86 draws every Modal edge to edge and
 *    never resizes it for the keyboard. So the sheet stands in `KeyboardLift`, which lifts it by the
 *    keyboard's height on iOS and by how far the keyboard's top reaches into this full screen view
 *    on Android (`keyboardLift.ts` has every case), never past most of the screen. The foot's own
 *    inset (`bottomInset`) comes off the lift: with the keyboard up, the phone's buttons are under
 *    it.
 */
import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  PanResponder,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { IconButton } from './IconButton';
import { KeyboardLift } from './KeyboardLift';
import { ModuleTheme, useModuleTint } from './ModuleTint';
import { Scrim } from './Scrim';
import { noteSheetUp, SheetToastContext, useFrontSheet } from './sheetsUp';
import { Surface } from './Surface';
import { H2 } from './Text';
import { useModalGate } from './useModalGate';

export type SheetDetent = 'content' | 'large';

export interface BottomSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  /**
   * The system Back (Android's back button and gesture) when it is not a close: a second page of
   * one form goes back to its first page with the draft (the pump's page 2, 2026-10-06). Absent,
   * Back closes, as it always has.
   */
  onBack?: () => void;
  /** `content`: as tall as its content, up to 90%; `large`: 90% of the window. */
  detent?: SheetDetent;
  /** Stays below the scrolling body: the Save button, never a form field. */
  footer?: ReactNode;
  /**
   * Pinned between the title and the scrolling body — the Appearance sheet's live preview
   * (§17.2: sticky, the options scroll under it). Never a control the body depends on.
   */
  header?: ReactNode;
  /**
   * A small picture before the title, inside the title row: the pump's own glyph in its category
   * disc (the owner's pumping redesign, 2026-10-05). Decorative; the title still names the sheet.
   */
  titleIcon?: ReactNode;
  children?: ReactNode;
  /** The safe-area bottom inset in px; the app's safe-area provider knows it, this package does not. */
  bottomInset?: number;
  /**
   * AN UPWARD DRAG ON THE HANDLE, past `SHEET_EXPAND_DRAG_PX`. The sheet itself never grows on
   * it — its height is its content's, up to the detent — so this is a request to whoever owns
   * the body to show more: the tummy-time sheet opens the day's entries (the owner, 2026-09-19:
   * "it can be dragged up again if user decides they want to see today's history record").
   * Without it an upward drag is nothing, exactly as before.
   */
  onExpand?: () => void;
  /**
   * DRAWN OVER THE WHOLE SHEET AND ITS SCRIM, inside the sheet's own window, and it takes no touch
   * (2026-09-28): a moment that plays over the sheet — the stash's milk dropping into its place
   * (`DropCelebration`). It used to be a Modal of its own that swallowed every tap and Back for its
   * 1.44 s; drawn here it is a layer the parent can see and reach straight through, and Back, the
   * scrim and Close still close the sheet (the moment goes with it). Never a control: it is
   * `pointerEvents="none"` from its root down.
   */
  overlay?: ReactNode;
  testID?: string;
}

export const SHEET_DURATION_MS = 220;
export const SHEET_MAX_HEIGHT_RATIO = 0.9;
/** A downward drag past this on the handle or header closes the sheet. */
export const SHEET_DISMISS_DRAG_PX = 60;
/** An upward drag past this on the handle asks the sheet's owner for more (`onExpand`). */
export const SHEET_EXPAND_DRAG_PX = 40;
/** The air under a sheet's content, ON TOP of the caller's safe-area inset. */
const SHEET_FOOT_GUTTER = (t: { space: { xxl: number } }): number => t.space.xxl;
const SCRIM_FADE_MS = 180;
const SETTLE_MS = 120;
const HANDLE_WIDTH = 36;
const HANDLE_HEIGHT = 4;

/** cubic-bezier(.22,.8,.28,1) — §7. */
export const sheetEasing = Easing.bezier(0.22, 0.8, 0.28, 1);

/**
 * ONE SHEET HANDING OVER TO THE NEXT (2026-10-06, the owner: "changing from session only to store
 * milk/log feed feels like a glitch … make it as smooth as possible"). The pump's page 1 and page 2
 * are two sheets, and the shell opens the second only once the first has gone (`afterLeaving`), so
 * between them the dim went and Today showed through, bare, for a beat — at night, under Calm
 * motion, with no slide to cover it at all (the owner's recording of 2026-10-06).
 *
 * A caller swapping one sheet for the next calls `handOffSheet()` first. Then:
 *   * THE SHEET LEAVING keeps its dim, fades its page out where it stands (at once, under reduce
 *     motion: a fade is not a movement, but there is nothing to wait for), and stays up — dim and
 *     empty — until the next sheet says it has arrived (`arrived`), or `HAND_OFF_HOLD_MS` at most;
 *   * THE SHEET ARRIVING opens on the dim already there and brings its page in: rising softly from
 *     the bottom, or, under reduce motion, fading in where it will rest, with no movement.
 * One steady dim from the first page to the second, and never a bare screen between them.
 */
let handOffUntil = 0;
/** How long a hand-off waits for the next sheet: past the shell's own wait for the first to go. */
const HAND_OFF_WINDOW_MS = 1200;
/** The longest a leaving sheet holds its dim for the next one, should it never come. */
const HAND_OFF_HOLD_MS = 900;
/** The page that leaves fades; the page that comes rises, a little slower than a plain open. */
export const HAND_OFF_FADE_MS = 220;
export const HAND_OFF_RISE_MS = 340;
/** How long the arriving sheet is given to be on screen before the one under it goes. */
const HAND_OFF_SHOWN_MS = 300;
/** The leaving sheets waiting for the next one to show. */
const waitingForArrival = new Set<() => void>();
/** Their dims, which give way as the next sheet's comes up, so two dims never stack. */
const yieldingDim = new Set<() => void>();
/** How long a leaving dim takes to give way to the arriving one. */
const DIM_YIELD_MS = 200;

/**
 * The next sheet to close and the next to open are one sheet handing over to the other.
 *
 * NOT ON iOS (the owner's iPhone, 2026-10-06: "tried saving a finished pump session, and the screen
 * freezes, can't scroll, can't do nothing … after closing and reopening it works"). Every sheet is a
 * native modal, and the hand-off presents the next one while the last is still up, then dismisses
 * the last. On iOS the next modal is presented FROM the last one, and dismissing a view controller
 * dismisses everything it presented: UIKit took page 2 down with page 1 while React still held it
 * open, and the save that closed page 2 then dismissed a modal already gone — leaving its empty,
 * transparent window over the whole app, taking every touch. Android draws each modal as a dialog
 * of its own and has never minded. So on iOS a hand-off is the ordinary close, then open: the
 * shell waits out the first sheet's exit, and one modal is never dismissed from under another.
 */
export function handOffSheet(): void {
  if (Platform.OS === 'ios') return;
  handOffUntil = Date.now() + HAND_OFF_WINDOW_MS;
}

const handingOff = (): boolean => Date.now() < handOffUntil;

/**
 * Whether a sheet is handing over to the next right now (`handOffSheet`): the shell opens the next
 * one AT ONCE rather than waiting out the first's exit, which is what left a beat of bare dim
 * between the pump's two pages (the owner, 2026-10-06: "still doesn't feel soft or uninterrupted").
 */
export const sheetHandingOff = handingOff;

/** The arriving sheet is on screen: every sheet holding its dim for it may go. */
function arrived(): void {
  handOffUntil = 0;
  yieldingDim.clear();
  const leaving = [...waitingForArrival];
  waitingForArrival.clear();
  leaving.forEach(go => go());
}

/** The sheet's foot, as its body sees it: put a node there under an id, take it away again. */
interface FooterSlot {
  put(id: string, node: ReactNode): void;
  drop(id: string): void;
}

const FooterSlotContext = createContext<FooterSlot | null>(null);

export interface SheetFooterProps {
  /** A form's primary action — its Save, the error line over it, anything secondary beneath. */
  children: ReactNode;
}

/**
 * PINNED TO THE FOOT OF THE SHEET IT IS DRAWN IN, visible without scrolling and — with the sheet
 * padded up by the keyboard — above the keyboard while a note is typed (the owner, 2026-09-25:
 * "Sticky 'Save sleep' button").
 *
 * Drawn in place when there is no sheet around it, so a form that is sometimes hosted elsewhere
 * still has its Save. Only a form's ACTION belongs here, never a field (`footer`'s own rule): the
 * foot does not scroll, and a field in it would be a field the keyboard can cover.
 *
 * IT TAKES THE LOG SHEET'S COLOR WITH IT (the owner, 2026-09-26: *"breastfeed already finish still
 * at the theme color … sleeping alreayd finish also still follow theme color"*). The node is made
 * here, inside the body, and DRAWN by the sheet, under the scroller — outside every provider the
 * body sits in. A log sheet's body is inside `ModuleTint`, which is how its Save wears the module's
 * color; the pinned Save of every "Already finished" form (feed, sleep, pump, tummy time) was the
 * one primary button that could not hear it, and drew the scheme's gradient. So the tint is read
 * HERE, where the node is made, and put back round it on its way to the foot (`ModuleTint.tsx`), and with it the module's whole palette (`ModuleTheme`, 2026-10-06).
 */
export function SheetFooter({ children }: SheetFooterProps) {
  const slot = useContext(FooterSlotContext);
  const id = useId();
  // the module the form logs, read where the node is made: the foot is outside the body's tint
  const tint = useModuleTint();
  // every render: the sheet draws the form's latest node, with its latest closures
  useLayoutEffect(() => {
    slot?.put(id, tint === null ? children : <ModuleTheme module={tint}>{children}</ModuleTheme>);
  });
  useLayoutEffect(() => () => slot?.drop(id), [slot, id]);
  return slot === null ? <>{children}</> : null;
}

export function BottomSheet({
  visible: asked,
  title,
  onClose,
  onBack,
  detent = 'content',
  footer,
  header,
  titleIcon,
  children,
  bottomInset = 0,
  onExpand,
  overlay,
  testID,
}: BottomSheetProps) {
  // on an iPhone, never presented while another modal is still going (`modalGate.ts`)
  const visible = useModalGate(asked, SHEET_DURATION_MS);
  const t = useTheme();
  const win = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  // hidden until the effect runs, whatever `visible` is on the first render (see the header note)
  const offset = useRef(new Animated.Value(win.height)).current;
  const scrim = useRef(new Animated.Value(0)).current;
  // the page itself, faded only when it hands over to the next sheet (`handOffSheet`)
  const fade = useRef(new Animated.Value(1)).current;
  // a leaving sheet's hold on its dim for the next one (`handOffSheet`), let go if it comes back
  const releaseHold = useRef<(() => void) | null>(null);
  const wasVisible = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onExpandRef = useRef(onExpand);
  onExpandRef.current = onExpand;
  const reduceMotionRef = useRef(t.reduceMotion);
  reduceMotionRef.current = t.reduceMotion;
  const winHeightRef = useRef(win.height);
  winHeightRef.current = win.height;
  // what the body has pinned to the foot (`SheetFooter`), in the order it was pinned
  const [pinned, setPinned] = useState<ReadonlyMap<string, ReactNode>>(() => new Map());
  const slot = useMemo<FooterSlot>(
    () => ({
      put: (id, node) => setPinned(prev => new Map(prev).set(id, node)),
      drop: id =>
        setPinned(prev => {
          if (!prev.has(id)) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        }),
    }),
    [],
  );

  // counted while it is meant to be up, so what must never rise over a sheet knows it is here
  // (`sheetsUp.ts`: the shell's own sheets and every screen's alike)
  // …and by a key of its own, so the one in front can draw the toast over itself (`SheetToastContext`)
  const sheetKey = useRef({}).current;
  useEffect(() => (visible ? noteSheetUp(sheetKey) : undefined), [visible, sheetKey]);
  const inFront = useFrontSheet() === sheetKey;
  const sheetToast = useContext(SheetToastContext);

  useEffect(() => {
    if (visible === wasVisible.current) return;
    wasVisible.current = visible;
    offset.stopAnimation();
    scrim.stopAnimation();
    fade.stopAnimation();
    releaseHold.current?.();
    const handOff = handingOff();
    if (visible) {
      setMounted(true);
      if (handOff) {
        // THE DIM IS ALREADY THERE (the sheet leaving holds it): only the page comes in
        scrim.setValue(1);
        if (reduceMotionRef.current) {
          // UNDER CALM MOTION THE PAGE IS SIMPLY THERE, at full strength, over the dim it inherits.
          // It used to fade in from 0 on the native driver, started before this sheet's views were
          // mounted; on Android a fade that ends before its view exists can leave the view at the
          // value it began at — an invisible page 2 (the owner, 2026-10-06: under Calm motion the
          // pump's next page did not show). No movement and no fade: nothing to lose
          offset.setValue(0);
          fade.setValue(1);
        } else {
          fade.setValue(1);
          offset.setValue(winHeightRef.current);
          Animated.timing(offset, {
            toValue: 0,
            duration: HAND_OFF_RISE_MS,
            easing: sheetEasing,
            useNativeDriver: true,
          }).start();
        }
        // the dim under this one gives way as this one's comes up: one dim, never two stacked
        [...yieldingDim].forEach(give => give());
        // time for this window to be presented before the one under it is dismissed: a dialog
        // dismissed while the next is still coming up can take the next one with it on Android
        const id = setTimeout(arrived, HAND_OFF_SHOWN_MS);
        return () => clearTimeout(id);
      }
      fade.setValue(1);
      if (reduceMotionRef.current) {
        offset.setValue(0);
        scrim.setValue(1);
        return undefined;
      }
      offset.setValue(winHeightRef.current);
      scrim.setValue(0);
      Animated.parallel([
        Animated.timing(offset, {
          toValue: 0,
          duration: SHEET_DURATION_MS,
          easing: sheetEasing,
          useNativeDriver: true,
        }),
        Animated.timing(scrim, { toValue: 1, duration: SCRIM_FADE_MS, useNativeDriver: true }),
      ]).start();
      return undefined;
    }
    if (handOff) {
      // THIS PAGE FADES WHERE IT STANDS, AND ITS DIM STAYS for the next sheet (see above)
      if (reduceMotionRef.current) fade.setValue(0);
      else
        Animated.timing(fade, {
          toValue: 0,
          duration: HAND_OFF_FADE_MS,
          useNativeDriver: true,
        }).start();
      let done = false;
      const go = () => {
        if (done) return;
        done = true;
        clearTimeout(fallback);
        waitingForArrival.delete(go);
        yieldingDim.delete(give);
        releaseHold.current = null;
        if (!wasVisible.current) setMounted(false);
      };
      const give = () => {
        yieldingDim.delete(give);
        Animated.timing(scrim, {
          toValue: 0,
          duration: DIM_YIELD_MS,
          useNativeDriver: true,
        }).start();
      };
      const fallback = setTimeout(go, HAND_OFF_HOLD_MS);
      waitingForArrival.add(go);
      yieldingDim.add(give);
      releaseHold.current = () => {
        done = true;
        clearTimeout(fallback);
        waitingForArrival.delete(go);
        yieldingDim.delete(give);
        releaseHold.current = null;
      };
      return undefined;
    }
    if (reduceMotionRef.current) {
      setMounted(false);
      return undefined;
    }
    Animated.parallel([
      Animated.timing(offset, {
        toValue: winHeightRef.current,
        duration: SHEET_DURATION_MS,
        easing: sheetEasing,
        useNativeDriver: true,
      }),
      Animated.timing(scrim, { toValue: 0, duration: SCRIM_FADE_MS, useNativeDriver: true }),
    ]).start(({ finished }) => {
      /*
        GONE MEANS GONE. An exit cut short is normally a reopen (the next effect has already
        set `wasVisible` back to true, and unmounting then would hide a sheet on its way in) —
        but an exit cut short while the sheet is still meant to be hidden must unmount all the
        same. Left mounted, a closed sheet kept its body alive under nothing, and a body that
        holds state for as long as it lives — a pump's stop, a half-typed form — outlived the
        sheet the parent had closed (2026-09-24).
      */
      if (finished || !wasVisible.current) setMounted(false);
    });
    return undefined;
  }, [visible, offset, scrim, fade]);

  // the responder is created once; it reads the latest callbacks through refs
  const pan = useRef(
    PanResponder.create({
      // a downward drag always; an upward one only when somebody is listening for it
      onMoveShouldSetPanResponder: (_e, g) =>
        (g.dy > 6 || (g.dy < -6 && onExpandRef.current !== undefined)) &&
        Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        // following the finger is direct manipulation, not an animation; reduce-motion still
        // gets the close on release, just without the sheet trailing the thumb. Upward, the
        // sheet holds still: it cannot grow past its content, and a sheet that lifts and
        // snaps back would promise a height it does not have
        if (!reduceMotionRef.current) offset.setValue(Math.max(0, g.dy));
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > SHEET_DISMISS_DRAG_PX) {
          onCloseRef.current();
          return;
        }
        if (g.dy < -SHEET_EXPAND_DRAG_PX) onExpandRef.current?.();
        settle();
      },
      onPanResponderTerminate: () => settle(),
    }),
  ).current;

  function settle() {
    if (reduceMotionRef.current) {
      offset.setValue(0);
      return;
    }
    Animated.timing(offset, { toValue: 0, duration: SETTLE_MS, useNativeDriver: true }).start();
  }

  if (!mounted) return null;

  const maxHeight = Math.round(win.height * SHEET_MAX_HEIGHT_RATIO);
  const gutter = t.space.xxl;
  const pins = [...pinned.entries()];
  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={onBack ?? onClose}
      {...(testID ? { testID } : {})}
    >
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: scrim }]}>
          <Scrim onPress={onClose} {...(testID ? { testID: `${testID}-scrim` } : {})} />
        </Animated.View>
        {/* the slide: a full screen view that never changes size (see the header note) */}
        <Animated.View
          pointerEvents="box-none"
          style={[StyleSheet.absoluteFill, { opacity: fade, transform: [{ translateY: offset }] }]}
        >
          <KeyboardLift inset={bottomInset} pointerEvents="box-none" style={styles.kav}>
            <View
              accessibilityViewIsModal
              accessibilityLabel={title}
              style={[styles.sheet, detent === 'large' ? { height: maxHeight } : { maxHeight }]}
              {...(testID ? { testID: `${testID}-sheet` } : {})}
            >
              <Surface
                kind="sheet"
                radius="xl"
                style={[StyleSheet.absoluteFill, { bottom: -t.radius.xl, pointerEvents: 'none' }]}
              />
              <View {...pan.panHandlers} style={styles.grabArea}>
                <View
                  style={[
                    styles.handle,
                    {
                      backgroundColor: t.color.line2,
                      borderRadius: t.radius.pill,
                      marginTop: t.space.md,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.header,
                    {
                      gap: t.space.lg,
                      paddingHorizontal: gutter,
                      paddingTop: t.space.sm,
                      paddingBottom: t.space.md,
                    },
                  ]}
                >
                  {titleIcon ? (
                    <View
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      style={{ marginRight: -t.space.sm }}
                    >
                      {titleIcon}
                    </View>
                  ) : null}
                  <H2 numberOfLines={2} style={styles.title}>
                    {title}
                  </H2>
                  <IconButton
                    icon="x"
                    accessibilityLabel="Close"
                    onPress={onClose}
                    {...(testID ? { testID: `${testID}-close` } : {})}
                  />
                </View>
              </View>
              {header ? (
                <View style={{ paddingHorizontal: gutter, paddingBottom: t.space.md }}>
                  {header}
                </View>
              ) : null}
              <ScrollView
                keyboardShouldPersistTaps="handled"
                style={detent === 'large' ? styles.bodyFill : styles.bodyHug}
                contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: t.space.xxl }}
                {...(testID ? { testID: `${testID}-body` } : {})}
              >
                <FooterSlotContext.Provider value={slot}>{children}</FooterSlotContext.Provider>
              </ScrollView>
              {pins.length > 0 || footer ? (
                <View
                  style={{ paddingHorizontal: gutter, paddingTop: t.space.md, gap: t.space.md }}
                  {...(testID ? { testID: `${testID}-foot` } : {})}
                >
                  {pins.map(([id, node]) => (
                    <Fragment key={id}>{node}</Fragment>
                  ))}
                  {footer}
                </View>
              ) : null}
              {/*
              THE FOOT OF THE SHEET CLEARS THE PHONE'S OWN BUTTONS (the owner, 2026-09-20, on a
              sheet whose last line ran under Android's navigation bar: *"make it a little
              higher to adjust for the phone buttons if there are any"*).

              Two things make that: the caller's `bottomInset`, which is the only number the app
              knows and this package does not — every `<BottomSheet>` in the app passes it, and
              `sheets.test.ts` fails the build if one forgets — and `SHEET_FOOT_GUTTER` over the
              top of it, which is the air the content needs whether or not the phone has a bar
              at all. It went from `space.lg` to `space.xxl` in the same pass: on a gesture-bar
              phone the inset is a few points and 11 more was not enough to read as a margin.
            */}
              <View style={{ height: bottomInset + SHEET_FOOT_GUTTER(t) }} />
            </View>
          </KeyboardLift>
        </Animated.View>
        {/* last, so it draws over the sheet; touch-transparent, so it never stands in the way */}
        {overlay ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {overlay}
          </View>
        ) : null}
        {/* THE TOAST, over the sheet in front (`SheetToastContext`): at the top of the screen, over
            the dim, so it never covers the sheet's own buttons */}
        {inFront && sheetToast !== null ? (
          <View
            pointerEvents="box-none"
            style={[styles.sheetToast, { paddingHorizontal: t.space.xxl }]}
          >
            {sheetToast}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // under the status bar, across the screen, centered like the app's own toast host
  sheetToast: { position: 'absolute', top: 56, left: 0, right: 0, alignItems: 'center' },
  root: { flex: 1 },
  kav: { flex: 1, justifyContent: 'flex-end' },
  // shrinks — the scroller giving way — rather than running off the top with the keyboard up
  sheet: { width: '100%', flexDirection: 'column', flexShrink: 1 },
  grabArea: { alignSelf: 'stretch' },
  handle: { width: HANDLE_WIDTH, height: HANDLE_HEIGHT, alignSelf: 'center' },
  // title then Close, as the prototype draws it; tree order IS reading order (see the header note)
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
  bodyFill: { flexGrow: 1, flexShrink: 1 },
  bodyHug: { flexGrow: 0, flexShrink: 1 },
});
