/**
 * The Appearance sheet (docs/DESIGN_SYSTEM.md §17, §11, §13, §23.1, §23.2; PRODUCT_SPEC Addendum
 * L4; the prototype's `SHEETS.appearance`): one screen, in one order — preview · Theme · Automatic
 * night mode · Color · Shape · Log row · Vibration · Calm motion · Design. (Vibration is
 * `HapticsRow`, the haptics' own switch, under the Log row because both are how the app feels to
 * use on this phone; Calm motion, `CalmMotionRow`, is the third answer of that kind, 2026-09-28.)
 *
 * THEME FIRST SINCE 2026-09-25 (the owner: *"make theme (rolling day night dark) to be the first
 * option to change, on top of color"*). The rolling sky is the control people reach for — light,
 * night or dark is the change that makes the most difference to a screen at the hour it is being
 * looked at — so it is the first thing under the preview. Color used to lead, as "the change
 * people come for"; it is directly under the theme's two answers now.
 *
 * AUTOMATIC NIGHT MODE STAYS DIRECTLY UNDER THEME, and that is not an accident of the move: it is
 * a second answer to the question Theme asks (2026-09-20). A parent reading "Theme: Light" needs
 * the next thing on the page to tell them it will not be light at eleven tonight, so the two travel
 * together wherever the section goes. (Called Automatic dark until 2026-09-25.)
 *
 * COLOR IS ONE ROW (the owner, 2026-09-25: *"color is taking too much space, make it fit into a 1
 * row 4/5 options, remove the description text below the color name"*): six named swatches across
 * the body when each can have a 44 pt cell and its name, otherwise a sideways row that shows four
 * and a half so the fifth is plainly cut (`swatchRowLayout`). The line describing each palette is
 * gone; the swatch is the description. Shape stays directly under Color because the two are judged
 * together, and Log row under Shape because it is the same tiles laid out differently.
 *
 * DESIGN IS TWO PICTURES (the owner, 2026-09-25: *"instead of showing just like liquid glass and
 * paper, separate it into 2 sections options, left and right; and then has a 'preview' of what it
 * is"*): Paper on the left, the default and the free one, and Liquid Glass on the right, each a
 * small live sample of the app drawn in that design (`SkinTile`, `DesignSample`). Two choices read
 * faster as two pictures than as two rows of words, and the pictures are the real material over
 * the real ground, so they change as Color and Theme are tapped above them. The pinned preview
 * still shows the whole look; the tiles show the one thing the design decides. It is last because
 * it is the choice made least often, and the two pictures are best judged once everything they are
 * drawn in has been chosen.
 *
 * THREE MORE SECTIONS WENT ON 2026-09-18, all for one reason: a settings page is where you
 * change something, not where the app describes itself.
 *
 *  - **Tab labels.** Every tab is labeled now and there is nothing to choose ("all labels 0 tab
 *    labels"). `parseAppearance` forces it, so a household stored on "Icons only" is not left
 *    on an unlabeled bar with the control gone.
 *  - **Accessibility.** Four rows that could not be tapped, stating facts about the app —
 *    dynamic type, screen-reader labels, 44 pt targets. Every one is either true everywhere or
 *    a defect; a list of promises is not a setting, and a row that does nothing on a page of
 *    rows that do something reads as broken.
 *  - **Soft**, from Design, because the skin itself is gone (`skins.ts` says what that cost).
 *
 * THERE WAS A "WHAT A COLOR NEVER CHANGES" SECTION and it is gone (the owner, 2026-09-18: "in
 * appearance, the 'what a color never changes' is not needed. it can instead be a step in the
 * onboarding tutorial that red means miss, and amber due"). It listed three reassurances — that
 * status stays green/amber/red, that module hues are fixed, that every palette is contrast
 * checked — which is a promise about the app, told on the one screen where a parent is busy
 * comparing looks. The status half becomes a tutorial step, where it is taught rather than
 * asserted; the other two are facts the screen demonstrates by working. What is NOT lost is the
 * rule under it: status is never carried by color alone. A Badge always prints its word
 * (Badge.tsx, badge-tone.ts), a Quick tile prints "due now" or "over 4h" beside its amber or red
 * ink and says "due"/"late" in its accessible name, and a ticked row is struck through as well as
 * dimmed.
 *
 * The preview is the sheet's pinned `header` (the BottomSheet keeps it between the title and
 * the scrolling body), built from the real components, so nothing has to be closed to be seen.
 * Every control is a `set(...)` — a token swap — and the preview re-renders by construction;
 * there is no "refresh the preview" call to forget. A locked option (docs/PRICING.md §6) looks
 * locked before the tap and the tap opens the gate OVER this sheet without closing it: the
 * parent came here to compare looks and should land back in the comparison, not on Today.
 * Light and dark are never locked, and the sheet says so under the theme control when night is.
 *
 * Every control shows what is PAINTED as chosen (`themeStop` over `shownTheme`,
 * `resolved.scheme`, `resolved.skin`, and since 2026-10-01 `resolved.shape` and
 * `resolved.logSlider`), never the stored choice the plan took back: a theme toggle
 * resting on a Night the plan took back would draw the amber picture over a screen painted dark,
 * cover the lock that says Night is sold, and tell a screen reader Night is on. (The segmented
 * control it replaced on 2026-09-25 was worse still: it ignored a tap on its checked option, so a
 * checked, locked "Night" could never open the gate at all.)
 *
 * SHAPE AND LOG ROW ARE SOLD TOO SINCE 2026-10-01 (the owner: *"make shapes other than pebble also a
 * plus feature, same with horizontal slider"*): Bubble, Capsule and the sideways swipe are `themes`,
 * locked and tagged as the colors and Liquid Glass are, and Pebble and the wrapping grid are free.
 *
 * AND NEVER THE DAY'S CHOICE UNDER THE EVENING'S LOOK (the owner, 2026-09-29). While automatic
 * night mode decides what is painted, the Theme toggle and Match phone show that look and are
 * held, with one line above them saying until when and what to do instead (`themeHold` in
 * options.ts has the rule and the account of the decision it reverses). Nothing else on the
 * sheet is held, because everything else still shows its change.
 */
import { IN_APP_STRINGS } from '@nibblecue/brand';
import {
  autoDarkWindow,
  BodySm,
  BottomSheet,
  CHROME_FONT_CAP,
  Label,
  Row,
  Rows,
  schemes,
  SkinTile,
  skinTilePair,
  Swatch,
  swatchRowLayout,
  ThemeSkyToggle,
  useTheme,
  type AppearancePrefs,
  type IconName,
  type QuickShape,
} from '@nibblecue/ui';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShell } from '../app/shell';
import { HapticsRow } from '../feedback/HapticsRow';
import { deviceClock24 } from '../sheets/quick/prefs';
import { AppearancePreview } from './AppearancePreview';
import { useAppearance } from './AppearanceProvider';
import { AutoDarkControls } from './AutoDarkControls';
import { CalmMotionRow } from './CalmMotionRow';
import { DesignSample } from './DesignSample';
import { useDimBedtime } from './useAutoDark';
import {
  DESIGN_OPTIONS,
  gateFor,
  isLocked,
  isPlusLook,
  logRowOf,
  MATCH_PHONE,
  SCHEME_OPTIONS,
  SHAPE_OPTIONS,
  THEME_STOP_LABELS,
  themeHold,
  type OptionKind,
} from './options';
import { PREVIEW_TAG } from '../plan/gate';
import { PlusTag, usePlusTag } from '../plan/PlusTag';

export interface AppearanceSheetProps {
  visible: boolean;
  onClose: () => void;
}

const SHAPE_ICON: Record<QuickShape, IconName> = {
  bubble: 'star',
  pebble: 'grid',
  capsule: 'more',
};

export function AppearanceSheet({ visible, onClose }: AppearanceSheetProps) {
  const t = useTheme();
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { prefs, resolved, entitled, system, set } = useAppearance();
  const shell = useShell();
  const plusName = IN_APP_STRINGS.paywallTitle;
  const hint = `Included with ${plusName}`;
  // the sheet's own gutter: its body and header are padded by space.xxl on each side, so this is
  // the width of both — the preview's, and the room the theme toggle has
  const bodyWidth = Math.max(0, win.width - 2 * t.space.xxl);
  const pair = resolved.theme === 'light' ? 'light' : 'dark';
  const nightLocked = isLocked('theme', 'night', entitled);
  // THE PLUS LOOKS SAY SO DURING THE PREVIEW (2026-09-28): the quiet tag, never counted here; a
  // look is counted where it is painted (`plan/PlusUsageWatch.tsx`), not where it is chosen.
  // `themes` tags the sold colors and Liquid Glass, and since 2026-10-01 Bubble, Capsule and the
  // sideways log row, which the recap does not count: it names the colors and Glass alone
  const nightTagged = usePlusTag('nightTheme', null, visible);
  const looksTagged = usePlusTag('themes', null, visible);
  // the SAME read the resolver runs on, so the sheet cannot name two times the app is not using
  const bedtime = useDimBedtime(prefs.autoDark.mode === 'bedtime');
  /*
    THE THEME, HELD WHILE THE EVENING DECIDES (the owner, 2026-09-29: "i moved to night / dark,
    but the screen didnt change because the night mode was on … perhaps users arent able to play
    with theme when automatic night mode is on, rather than letting them change but nothing
    happens"). While the window is open and its look is on the screen, the toggle shows that look,
    Match phone reads off, both are held, and one line above them says until when and what to do
    instead. The window's end is read from the pair the app is running on: the resolver's own
    `autoDarkWindow` over the same bed time read. Turning automatic night mode off, or the window
    closing on its own, repaints the provider, and everything here lets go in that same render.
  */
  const hold = themeHold({
    stored: prefs.theme,
    resolved,
    phone: system,
    entitled,
    dimWindow: autoDarkWindow(prefs.autoDark, bedtime),
    clock24: deviceClock24(),
  });
  const accentChip = { fg: t.color.accent2, soft: t.color.accentSoft };
  // the colors' row at the phone's text size, as the names' own role caps it (`meta`, a chrome
  // role): one row across the body, or a sideways row that runs out to the sheet's edge
  const colorRow = swatchRowLayout({
    width: bodyWidth,
    bleed: t.space.xxl,
    names: SCHEME_OPTIONS.map(o => o.label),
    fontScale: Math.min(win.fontScale, CHROME_FONT_CAP),
  });
  const tiles = skinTilePair(bodyWidth);

  /** A locked choice opens the gate over this sheet; everything else is a token swap. */
  const pick = (kind: OptionKind, value: string, patch: Partial<AppearancePrefs>) => {
    if (isLocked(kind, value, entitled)) {
      const feature = gateFor(kind);
      if (feature) shell.openGate(feature);
      return;
    }
    set(patch);
  };

  const swatches = SCHEME_OPTIONS.map(o => (
    <Swatch
      key={o.value}
      g1={schemes[o.value][pair].g1}
      g2={schemes[o.value][pair].g2}
      name={o.label}
      caption
      width={colorRow.cell}
      selected={resolved.scheme === o.value}
      locked={isLocked('scheme', o.value, entitled)}
      {...(looksTagged && isPlusLook('scheme', o.value) ? { badge: PREVIEW_TAG } : {})}
      onPress={() => pick('scheme', o.value, { scheme: o.value })}
      testID={`appearance.sheet.scheme.${o.value}`}
    />
  ));

  return (
    <BottomSheet
      visible={visible}
      title="Appearance"
      onClose={onClose}
      detent="large"
      header={<AppearancePreview width={bodyWidth} />}
      bottomInset={insets.bottom}
      testID="appearance.sheet"
    >
      <View style={{ gap: t.space.xl }}>
        {/*
          THE THEME IS A PICTURE NOW (the owner, 2026-09-25: "from the theme animation to switch
          to dark in onboarding, create one more with enough spacing to fit the text (Light,
          Night, or Dark) depending on which one being selected on the theme page instead of the
          boring text selection it has now. Make 3 a 3 way toggle: left day, middle night, right
          dark"). Setup's sun-and-moon switch one stop wider, with the chosen look's word written
          on the sky beside the knob (`ThemeSkyToggle`). Every tap goes through `pick`, so Night on
          a free plan opens the gate over this sheet and moves nothing; the toggle draws a lock
          beside Night's crescent before the tap, from the same `isLocked` answer. And it is the
          FIRST control on the sheet, since the same day (the header says why).

          It rests on what is on the screen (`themeHold`'s stop): the parent's own choice as the
          plan paints it — never a stored Night the plan took back — and, while the look follows
          the phone, the light or dark the phone is using.

          WHILE AUTOMATIC NIGHT MODE DECIDES THE LOOK, IT RESTS ON THAT LOOK AND IS HELD
          (2026-09-29). It used to stay on the stored choice under an evening window, with a line
          under Match phone saying why the knob and the screen disagreed, and a tap on it changed
          the stored choice and nothing that could be seen: the owner, at 11 p.m., took it for
          broken. Now it is dimmed and untappable, its stops say why to a screen reader, and the
          line saying until when and what to do instead sits ABOVE it, where the eye is before the
          thumb arrives. The stored choice is not touched, and the knob rolls back to it as the
          window lets go.

          "MATCH PHONE" IS THE SWITCH UNDER IT, NOT A FOURTH STOP. Following the phone is a
          platform expectation (CLAUDE.md §4) and it is not a look — it is whether the look
          follows the phone at all, and a toggle of three skies has no picture for "whichever".
          So it is a row of its own, in the Log row's pattern below. Turning it off keeps the look
          the phone is showing, so nothing on the screen moves; tapping any stop chooses that look
          outright and so turns it off — the stop the knob already rests on included, which is
          why the toggle reports a tap on its checked stop instead of ignoring it.
        */}
        <View style={{ gap: t.space.sm }}>
          <Label>Theme</Label>
          {/* that automatic night mode is on, until when, and what to do instead: only while the
              two controls under it are held, and in the words a screen reader hears on them */}
          {hold.line !== null ? (
            <BodySm ink="text" testID="appearance.sheet.auto_now">
              {hold.line}
            </BodySm>
          ) : null}
          <ThemeSkyToggle
            label="Theme"
            labels={THEME_STOP_LABELS}
            value={hold.stop}
            onChange={v => pick('theme', v, { theme: v })}
            locked={{ night: nightLocked }}
            lockedHint={hint}
            disabled={hold.held}
            {...(hold.line !== null ? { disabledHint: hold.line } : {})}
            {...(nightTagged ? { badges: { night: PREVIEW_TAG.label } } : {})}
            width={bodyWidth}
            testID="appearance.sheet.theme"
          />
          {/* centered, so under the middle stop, Night; its stop says "Plus" to a screen reader */}
          {nightTagged ? <PlusTag spoken={false} testID="appearance.sheet.theme.plus" /> : null}
          <Rows>
            {/* held with the toggle, and off while held: the look is not following the phone */}
            <Row
              title={MATCH_PHONE.label}
              detail={MATCH_PHONE.note}
              switchValue={hold.matchPhone}
              onSwitch={on => set({ theme: on ? 'system' : system })}
              disabled={hold.held}
              {...(hold.line !== null ? { accessibilityHint: hold.line } : {})}
              testID="appearance.sheet.theme.system"
            />
          </Rows>
          {/* "NIGHT", NOT "NIGHT MODE" (2026-09-25). The control directly under this line is
              headed "Automatic night mode" now, and it is free; "Night mode is part of Plus" one
              line above it read as that control being sold. The sold thing is the look the
              toggle above calls "Night", so the line calls it that. */}
          {nightLocked ? (
            <BodySm testID="appearance.sheet.night_note">
              {`Night is part of ${plusName}. Light and dark are free on every plan and always will be.`}
            </BodySm>
          ) : null}
        </View>

        {/*
          AUTOMATIC DARK, DIRECTLY UNDER THEME (the owner, 2026-09-20: "Add the option to turn on
          automatic dark mode at certain times (night) or follow Chiara's bed time"). It belongs
          here and nowhere else on the page: it is a second answer to the question the control
          above it asks, and a parent reading "Theme: Light" needs the next line to tell them it
          will not be light at eleven tonight. When Theme moved to the top of the sheet
          (2026-09-25) this moved with it, for the same reason.

          The control itself is shared with onboarding step 4 (`AutoDarkControls`), so the
          question setup asks and the one they come back to are one control. The preview above
          repaints the moment the window is open, because `set(...)` is a token swap and the
          resolver has already decided — there is nothing to close to see it (§17). When the
          window opens or closes ON ITS OWN while the app is on screen, the repaint is a slow
          fade rather than a snap (`AppearanceProvider`, `sunset.ts`); a tap here never is.
        */}
        <AutoDarkControls
          value={prefs.autoDark}
          onChange={autoDark => set({ autoDark })}
          bedtime={bedtime}
          entitled={entitled}
          onLocked={() => shell.openGate('nightTheme')}
          plusName={plusName}
          onNow={resolved.autoDark.open}
          tookBack={resolved.autoDark.tookBack}
          width={bodyWidth}
          testID="appearance.sheet.auto_dark"
        />

        {/*
          THE COLORS, IN ONE ROW (the owner, 2026-09-25: "color is taking too much space, make it
          fit into a 1 row 4/5 options, remove the description text below the color name"). Each
          swatch is its disc and its name, one target and one focus stop, as wide as the row
          gives it. When six cells of 44 pt and the longest name at this text size do not fit the
          body, the row scrolls sideways and runs out to the sheet's edge, sized so four and a half
          show and the half one says there is more (`swatchRowLayout`).
        */}
        <View style={{ gap: t.space.sm }}>
          <Label>Color</Label>
          {colorRow.scroll ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -t.space.xxl }}
              contentContainerStyle={{ paddingHorizontal: t.space.xxl }}
            >
              {swatches}
            </ScrollView>
          ) : (
            <View style={styles.row}>{swatches}</View>
          )}
        </View>

        {/*
          THE SHAPES, SOLD BUT PEBBLE (the owner, 2026-10-01: "make shapes other than pebble also a
          plus feature, same with horizontal slider"). Each row is locked the way a sold color or
          design is on this sheet: `isLocked` draws the lock before the tap, the hint is read after
          the name, and the tap goes through `pick`, so the gate opens over this sheet and nothing
          moves. During the preview Bubble and Capsule wear the quiet tag instead.

          THE CHOSEN ROW IS CHECKED, where it wore an "On" badge until the same day: the badge is
          the tag's place now, and a Bubble chosen during the preview has to say both. It is the
          shape that is PAINTED, so a Bubble the plan took back shows Pebble as chosen and Bubble
          locked, and the stored Bubble comes back with Plus.
        */}
        <View style={{ gap: t.space.sm }}>
          <Label>Shape</Label>
          <Rows>
            {SHAPE_OPTIONS.map(o => (
              <Row
                key={o.value}
                title={o.label}
                detail={o.note}
                icon={SHAPE_ICON[o.value]}
                tint={accentChip}
                selected={resolved.shape === o.value}
                locked={isLocked('shape', o.value, entitled)}
                lockedHint={hint}
                {...(looksTagged && isPlusLook('shape', o.value) ? { badge: PREVIEW_TAG } : {})}
                onPress={() => pick('shape', o.value, { shape: o.value })}
                right="none"
                testID={`appearance.sheet.shape.${o.value}`}
              />
            ))}
          </Rows>
        </View>

        {/*
          THE LOG ROW, under Shape because it is the same tiles laid out differently. Off is the
          wrapping grid — every module the household chose on the page at once, three across and
          as many rows as it takes — and on is the sideways swipe (the owner, 2026-09-18: "keep
          the slider optional if user wants to have the slider on, on the theme page").

          It is NOT called a slider. "Slider" is the word the owner read as confusing, and it
          means a different control on every other screen in the app (a value you drag). The row
          says what the gesture is and what turning it off gets you.

          PART OF PLUS SINCE 2026-10-01 (the owner: "make shapes other than pebble also a plus
          feature, same with horizontal slider"). Until then this said it was free on every plan, a
          layout preference and not one of the color schemes or the paid design; it is sold with
          them now, under `themes`. Off, the grid, is the default and stays free, so what the owner
          fixed on 2026-09-18 is still everyone's. On a plan without it the switch rests on what is
          painted, off, with the lock beside it before the tap, and the tap goes through `pick`
          (`logRowOf`): the gate opens over this sheet and the switch does not move. During the
          preview it wears the quiet tag.

          It is a switch rather than a two-option picker because there is a plain default and one
          departure from it, which is what a switch is for.
        */}
        <View style={{ gap: t.space.sm }}>
          <Label>Log row</Label>
          <Rows>
            <Row
              title="Swipe the log row sideways"
              detail="Off, every tile is on the page at once"
              // `move`, the four-way arrow: the row is about a gesture, and `grid` and `more` are
              // already the Shape rows' glyphs directly above it
              icon="move"
              tint={accentChip}
              switchValue={resolved.logSlider}
              onSwitch={on => pick('logRow', logRowOf(on), { logSlider: on })}
              locked={isLocked('logRow', 'swipe', entitled)}
              lockedHint={hint}
              {...(looksTagged && isPlusLook('logRow', 'swipe') ? { badge: PREVIEW_TAG } : {})}
              testID="appearance.sheet.logSlider"
            />
          </Rows>
        </View>
        <HapticsRow />
        {/* how the app MOVES on this phone, beside how it feels (`CalmMotionRow`, 2026-09-28) */}
        <CalmMotionRow />

        {/*
          THE DESIGN, AS TWO PICTURES (the owner, 2026-09-25: "separate it into 2 sections options,
          left and right; and then has a 'preview' of what it is"). Paper on the left — the
          default, the free one, the one the parent most likely has — and Liquid Glass on the
          right (`DESIGN_OPTIONS`). Each is a live sample drawn in its own design over its own
          ground: the real card and the real Quick tiles, in this theme and this color, so both
          repaint as the controls above are tapped. On an Android phone the Glass picture is the
          no-blur material that phone really paints, because it is made by the same Surface.

          The chosen one is ringed and checked, and `selected` to a screen reader, where the row
          used to carry an "On" badge. A sold design carries its lock on the picture before the
          tap, and the tap goes through `pick` like every other: the gate opens over this sheet,
          and the picture stays whole, because it is what is being sold.

          IT IS NOT HELD WHILE AUTOMATIC NIGHT MODE IS ON (2026-09-29), unlike the theme: its change
          still shows. Under Dark each design keeps its own material; under Night the material is
          flattened for both, but each keeps its own corners and rules, on this sheet and in the
          preview. The two pictures looking nearly alike at night is the truth at 3 a.m.
        */}
        <View style={{ gap: t.space.sm }}>
          <Label>Design</Label>
          <View style={[styles.row, styles.tiles, { gap: tiles.gap }]}>
            {DESIGN_OPTIONS.map(o => (
              <SkinTile
                key={o.value}
                skin={o.value}
                label={o.label}
                description={o.note}
                // the painted design is the one that is on: a taken-back skin shows Paper as on
                selected={resolved.skin === o.value}
                locked={isLocked('skin', o.value, entitled)}
                lockedHint={hint}
                {...(looksTagged && isPlusLook('skin', o.value) ? { badge: PREVIEW_TAG } : {})}
                onPress={() => pick('skin', o.value, { skin: o.value })}
                width={tiles.tile}
                testID={`appearance.sheet.skin.${o.value}`}
              >
                <DesignSample />
              </SkinTile>
            ))}
          </View>
        </View>

        {/* "Night keeps its own dim amber", not "Night mode": the same reason as the note under
            Theme — on this sheet "night mode" is now the free automatic control's name. In the
            sheet's own order since 2026-09-25: the look first, then the palette. */}
        <BodySm>
          Everything above changes the preview as you tap it. Theme and color are separate: pick
          light, dark or night, then a palette. Night keeps its own dim amber whichever color is
          chosen.
        </BodySm>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  // the pair stops growing past a large phone's body, and then sits in the middle of it
  tiles: { alignSelf: 'center', alignItems: 'flex-start' },
});
