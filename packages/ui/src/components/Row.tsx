/**
 * Row and Rows (docs/DESIGN_SYSTEM.md §5, §6, §16.4; docs/MOBILE.md §4): a list row is 54pt
 * (`hit.primary`) with a 32pt icon chip painted from a category, a title in the bold face, a
 * detail line in `text2`, and on the right a mono value, a chevron, a switch, a check or a node
 * the caller brings. Every line is a BLOCK, never an inline span (§6: "Nap · 1h 51mMia · Emma"
 * was a real bug), and the badge sits on the title line so it wraps under the title at 200%
 * rather than clipping. The whole row is ONE focus stop with one composed name (row-label.ts),
 * and when it carries a switch the whole row is the toggle and the row itself is the switch for
 * assistive technology — the platform control inside is hidden from it. The one exception is a
 * node the caller brings in `right`: it may be a control of its own (an icon button, a stepper),
 * so the row is then split — the text side is the focus stop and the pressable, and the node
 * stays a separate element a screen reader can reach (§8). Selected shows a check glyph and the
 * a11y state, never a tint alone. The icon chip's category tint is painted on its own layer, at
 * FULL strength rather than the skin's `tintAlpha` — §13 rule 4 ("under glass the lit ground
 * reads through every soft tint") is a statement about a panel with a blur behind it, and this
 * 32pt square has none on any platform (skins.ts `tintAlphaFor`); the neutral chip is `surface2`,
 * which the skin does not frost. `Rows` groups rows on one Surface — a SURFACE holding content,
 * radius `m` — with hairlines between them; the clip lives on an inner view so the skin's shadow
 * is not cut off with it.
 *
 * A CHECKLIST row (`checked` + `onCheck`) is the other split: the tick is a control at the HEAD
 * of the row and the row's own press still opens what the row opens. A switch could not do this
 * job — a switch is a setting that stays on, a tick is an act you perform and undo, and a row
 * that is entirely a switch has nowhere to put "edit this one".
 *
 * ITS STRIKE IS DRAWN ACROSS (the owner, 2026-09-26, of the household checklist: *"when a task is
 * checklist, animation striking through the text, instead of instant no animation like now"*): the
 * title is the shopping list's `StrikeText`, so a tick draws the line left to right as the check
 * draws itself, and an untick runs it back. At rest it is the platform's own line-through, exactly
 * as before; only a change this row sees is drawn, and under reduce motion and in the amber Night
 * the line is simply there or not.
 *
 * AN ADD row (`added` + `onAdd`) is the third: a rounded-square plus at the TAIL that fills with
 * the brand gradient once the thing is on. The two live on opposite ends of the row on purpose
 * and the side is the meaning — the HEAD is where you tick something OFF a list you are working
 * through, the TAIL is where you put something ON one. A round tick doing both jobs is what the
 * owner read as the catalog asking to be ticked off (2026-09-16: "the supplies list needs a +
 * button instead of a checkmark … the checkmark should be for the to-do daily checklist").
 *
 * A LOCKED row (`locked`, 2026-10-01) is sold, and says so before the tap: a lock glyph at the tail,
 * or just before its switch, inside the row's one pressable, and `lockedHint` after its name. It is
 * still the whole target and still reports its press, felt as a `warning`, so the caller opens the
 * gate; the Appearance sheet's Shape and Log row are its first callers.
 *
 * A MUTED row (`tone="muted"`, 2026-10-03) is a settings or navigation action sitting in a list of
 * selectable items — the medicine sheet's "Manage medicine & creams". It rests on `surface2` so it
 * reads as chrome rather than another item to tick, and presses to `surface3`. Tokens only; never a
 * hex. Default tone keeps the transparent rest / `surface2` press of every other row.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { feelChoice } from '../feedback/choice';
import { haptic } from '../feedback/haptics';
import { Icon, type IconProps } from '../icons/Icon';
import { composite } from '../theme/contrast';
import { tintAlphaFor } from '../theme/skins';
import { useTheme } from '../theme/ThemeProvider';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { BellSwitch, type BellMapping } from './BellSwitch';
import type { BadgeTone } from './badge-tone';
import { Divider } from './Divider';
import { PourSwitch } from './PourSwitch';
import { rowLabel } from './row-label';
import { StrikeText } from './StrikeSweep';
import { Surface } from './Surface';
import { Switch } from './Switch';
import { BodySm, BodyStrong, Meta, Numeric } from './Text';
import { TickMark } from './TickMark';

export type RowRight = 'chevron' | 'none' | ReactNode;

export interface RowProps {
  title: string;
  /**
   * A SMALL LINE ABOVE THE TITLE, where the title is an ANSWER and the eyebrow is the question.
   *
   * Setup's supplies list, where a row with a brand is "Diapers" over "Pampers Swaddlers", and an
   * in-app message's kind over its headline (`NotificationsSheet`). Putting the category in
   * `detail` would have read as a footnote to the brand. An EMPTY supply row has no answer to put
   * under it, so it is the category alone as the title, with a `hint` (2026-09-24).
   */
  eyebrow?: string;
  detail?: string;
  /**
   * SOMETHING THIS ROW USED TO SAY, struck through in front of the detail.
   *
   * One caller and one reason: a schedule slot that a logged session has moved (the owner,
   * 2026-09-18: *"it should show 5.30PM strikethroughed 6.13PM"*). It is a `Text` of its own
   * rather than markup inside `detail` because a line-through has to be a style, and because a
   * screen reader should hear "was 5:30 PM" rather than a time that is no longer true.
   */
  strike?: string;
  icon?: IconProps['name'];
  /**
   * A DRAWING IN THE CHIP'S PLACE (the storage places the owner drew, 2026-09-19). The 32 pt
   * chip and its category tint stay; only the glyph inside it is replaced, so a list of places
   * lines up with every other list in the app.
   */
  iconNode?: ReactNode;
  /**
   * A FACE IN THE CHIP'S PLACE (the baby's picture, 2026-09-20; docs/MEDIA.md).
   *
   * A row ABOUT A PERSON shows the person, and the 32 pt tinted square is the wrong holder for
   * one: a photo inside a category chip reads as an icon of a category rather than as a face.
   * So the whole slot is replaced by the design system's own `Avatar` at 31 — the size the top
   * bar's chip already uses, so the same baby is the same circle in the bar and in a list.
   *
   * Without a `photoUri` it is the generated gradient-and-initial, which is a first-class
   * default and not a placeholder (docs/MEDIA.md §1): most households never set a photo and
   * none of these lists may look unfinished. `icon` is ignored when this is set.
   */
  avatar?: { name: string; photoUri?: string };
  /**
   * WHAT A TAP DOES, on a row that holds nothing yet — "Tap to add", just before the chevron.
   *
   * The slot both platforms' settings lists use for a row's current value ("Not set", "Off"),
   * which is exactly what an empty answer is. Drawn soft: the regular face at `bodySm` in `text2`,
   * never the title's bold — the owner, 2026-09-24, of a placeholder drawn as a bold title on
   * every empty supply row: *"dont make the font in bold black"*. `text2` still passes 4.5:1
   * (`text3` would not — the design review forbade it as text). It replaced `titleMuted`, which
   * drew the prompt IN the title slot and so made seven rows of one grey sentence the biggest
   * words on the page, over the category names a parent was scanning for.
   */
  hint?: string;
  /**
   * The 32pt icon chip's category: `soft` fills it, `fg` inks the glyph. Neutral without it.
   *
   * `disc` is the owner's reference swatch (`useCategory`), and it WINS over `soft` when it is
   * there: a whole `useCategory(…)` can be spread in and the row paints the sheet's own hex
   * rather than a tint composited toward it. Null in night, where the composite is right.
   */
  tint?: { fg: string; soft: string; disc?: string | null };
  onPress?: () => void;
  /** The right slot: a chevron (default when pressable), nothing, or a node the caller brings. */
  right?: RowRight;
  /** With `onSwitch`, a switch on the right and the whole row is the toggle. */
  switchValue?: boolean;
  onSwitch?: (value: boolean) => void;
  /**
   * THE SWITCH DRAWN AS A BELL (`BellSwitch`; the owner, 2026-09-25): with `onSwitch`, the platform
   * switch is replaced by the bell, awake or asleep by this mapping — for a row that turns a
   * reminder, a notification or quiet hours on and off. Nothing else about the row changes: it is
   * still ONE switch, the whole row is the toggle, and the bell is drawn display only in the same
   * hidden, untouchable wrapper the platform switch sits in.
   */
  switchBell?: BellMapping;
  /**
   * THE SWITCH DRAWN AS A POUR (`PourSwitch`; the owner, 2026-09-27, of setup's "Feeding and
   * milk"): with `onSwitch`, the platform switch is replaced by a track that fills with this color
   * like milk poured into a bottle when the row is turned on, and drains when it is turned off. The
   * color is the module's own ink (`categoryColors(...).fg`). An opt-in, like `switchBell`: nothing
   * else about the row changes, it is still ONE switch and the whole row is the toggle, and the
   * drawing sits display only in the same hidden, untouchable wrapper the platform switch does.
   * `switchBell` wins if a caller ever passes both.
   */
  switchPour?: string;
  /**
   * A CHECKLIST row: a tick circle at the head of the row, and `onPress` still opens whatever
   * the row opens. This is the shape a list of things to do or to buy wants, and a switch is
   * not — a switch is a setting that stays on, a tick is an act you perform and undo, and a
   * row that is entirely a switch has nowhere left to put "edit this one" (the owner,
   * 2026-09-15: "checklist needs to actually be a checklist rather than a toggle, and users
   * must be able to edit existing tasks").
   */
  checked?: boolean;
  onCheck?: (value: boolean) => void;
  /** What the tick's own control is called, e.g. "Wash the bottles, done". */
  checkLabel?: string;
  /**
   * THIS TICK FINISHES ITS LIST: the next time it is ticked, the sparkle plays round it as the
   * check draws itself (`TickMark`; the owner, 2026-09-25). The caller decides — it knows which
   * tick is the last open one, and whether the tap was the parent's own.
   */
  checkBurst?: boolean;
  /**
   * AN ADD row: the prototype's rounded-square plus at the tail (`.pickrow .plus`), outlined
   * while the thing is off the list and filled with the brand gradient, showing a check, once it
   * is on. `onPress` still opens the row, so one row does both jobs without either being hidden.
   */
  added?: boolean;
  onAdd?: (next: boolean) => void;
  /** What the plus is called, e.g. "Pampers Swaddlers, add to the shopping list". */
  addLabel?: string;
  /** A mono value on the right ("48 oz", "8:04 PM"). */
  value?: string;
  badge?: { label: string; tone?: BadgeTone };
  /** The current choice in a picker list: a check glyph replaces the chevron. */
  selected?: boolean;
  /**
   * A row that OPENS IN PLACE rather than going anywhere: the chevron turns a quarter, the way
   * `Disclosure`'s does, and assistive tech is told the row is expandable and whether it is
   * open. The row's own press is the toggle, so the whole 54pt is the target. Use it where a
   * list of choices would otherwise be a stack of cards (setup's `HeardFrom`).
   */
  expanded?: boolean;
  /**
   * SOLD, AND SAID SO BEFORE THE TAP (CLAUDE.md §4; 2026-10-01, for the Appearance sheet's Shape and
   * Log row, which the owner made Plus: *"make shapes other than pebble also a plus feature, same
   * with horizontal slider"*). The row's own lock, the way a locked `Swatch` or `SkinTile` carries
   * one: a lock glyph at the tail, where the chevron would be, and on a switch row beside the
   * switch, which stays drawn at the value the caller gives so the parent sees what is behind the
   * lock. `lockedHint` is read after the name. The press is still reported, a switch row's as the
   * flip it asks for, so the caller can open the gate; it is felt as a `warning`, the rule for every
   * locked option (`feedback/choice.ts`), and the row moves nothing itself. Not `disabled`: a
   * locked row is the way to the gate, so it stays a full-strength, tappable target.
   */
  locked?: boolean;
  /** What a locked row says after its name to a screen reader ("Included with …"). */
  lockedHint?: string;
  /**
   * HOW THE ROW SITS ON THE LIST. `muted` paints `surface2` at rest so a settings or navigation
   * action (Manage medicine & creams) does not read as another selectable item. Default keeps the
   * transparent rest every list row has always used.
   */
  tone?: 'default' | 'muted';
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const ICON_CHIP = 32;
const TICK = 26;
const ADD = 34;

export function Row({
  title,
  eyebrow,
  detail,
  strike,
  icon,
  iconNode,
  hint,
  avatar,
  tint,
  onPress,
  right,
  switchValue = false,
  onSwitch,
  switchBell,
  switchPour,
  checked = false,
  onCheck,
  checkLabel,
  checkBurst = false,
  added = false,
  onAdd,
  addLabel,
  value,
  badge,
  selected,
  expanded,
  locked = false,
  lockedHint,
  tone = 'default',
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: RowProps) {
  const t = useTheme();
  const isSwitch = onSwitch !== undefined;
  const isCheck = onCheck !== undefined;
  const isAdd = onAdd !== undefined;
  const interactive = isSwitch || onPress !== undefined;
  const muted = tone === 'muted';
  const chip = tint ?? { fg: t.color.text2, soft: t.color.surface2, disc: null };
  /** Rest and press fills: muted chrome sits on `surface2`; a plain row only fills when pressed. */
  const rowFill = (pressed: boolean): string =>
    muted
      ? pressed && interactive
        ? t.color.surface3
        : t.color.surface2
      : pressed && interactive
        ? t.color.surface2
        : 'transparent';
  // THE ROW IS THE SWITCH, SO IT IS FELT AS ONE (the owner, 2026-09-25): a `tap` as it flips,
  // exactly as `Switch.tsx` does in its own handler — the platform control inside is display only
  // and never fires, so this is the one place a row's flip can be felt, and it is felt after the
  // flip is handed on for the reason `Switch.tsx` gives. A row that only opens something is
  // navigation, and navigation is never felt.
  //
  // A LOCKED ROW IS FELT AS A LOCKED OPTION IS (2026-10-01): a `warning` in place of the flip's
  // `tap`, before the press is reported, and the press still reported (a switch row's as the flip it
  // asks for) so the caller, which drew the lock, can open the gate. One feel per tap, either way.
  const handlePress = locked
    ? () => {
        feelChoice({ locked, current: selected === true, kind: 'tap' });
        if (isSwitch) onSwitch(!switchValue);
        else onPress?.();
      }
    : isSwitch
      ? () => {
          onSwitch(!switchValue);
          haptic('tap');
        }
      : onPress;
  const lockGlyph = <Icon name="lock" size={16} color={t.color.text2} />;
  const label =
    accessibilityLabel ??
    rowLabel({
      title,
      ...(badge ? { badge: badge.label } : {}),
      ...(detail !== undefined ? { detail } : {}),
      ...(value !== undefined ? { value } : {}),
      ...(hint !== undefined ? { hint } : {}),
    });
  // a node the caller brings (not a keyword, not empty) may be a control: keep it reachable. A
  // locked row draws its own lock instead, inside its one pressable, so nothing is reached past it
  const customRight =
    !selected &&
    !isSwitch &&
    expanded === undefined &&
    (isAdd ||
      (!locked &&
        right !== undefined &&
        right !== null &&
        right !== false &&
        right !== 'chevron' &&
        right !== 'none'));
  const rightNode: ReactNode = selected ? (
    <Icon name="check" size={16} color={t.color.accent2} />
  ) : isAdd ? (
    // Its own control beside the row, never inside it: the row opens the item and the plus puts
    // it on the list. A 34pt square reaches 44 through hitSlop, and the state is carried by the
    // GLYPH (plus vs check) as well as by the fill, so it survives a color-vision difference.
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: added, disabled }}
      accessibilityLabel={addLabel ?? title}
      disabled={disabled}
      hitSlop={t.space.sm}
      onPress={() => onAdd(!added)}
      style={({ pressed }) => [
        styles.tick,
        {
          width: ADD,
          height: ADD,
          borderRadius: t.shape === 'pebble' ? ADD / 2 : t.radius.s,
          borderWidth: 1,
          borderColor: added ? 'transparent' : t.color.line2,
          backgroundColor: added ? t.color.accent : t.color.surface2,
          overflow: 'hidden',
          opacity: pressed ? 0.8 : 1,
        },
      ]}
      testID={testID === undefined ? undefined : `${testID}.add`}
    >
      {added ? (
        <LinearGradient
          colors={[...t.gradient.brand]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <Icon
        name={added ? 'check' : 'plus'}
        size={16}
        color={added ? t.onGradient : t.color.accent2}
      />
    </Pressable>
  ) : isSwitch ? (
    // Display only. The row IS the switch: its Pressable carries the role, the checked state
    // and the one press handler. A live control here would take the touch for itself on its
    // own bounds and leave the row's handler to fire on the rest, and on the New Architecture
    // both can fire for one tap, which toggles twice and looks like a switch that does not
    // move. Switch.tsx's own header records the same trap one level down. A locked switch row
    // wears its lock just before the switch, inside the same one target (`locked`).
    <>
      {locked ? lockGlyph : null}
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {switchBell !== undefined ? (
          <BellSwitch
            value={switchValue}
            onValueChange={onSwitch}
            bell={switchBell}
            accessibilityLabel={title}
            disabled={disabled}
          />
        ) : switchPour !== undefined ? (
          <PourSwitch
            value={switchValue}
            onValueChange={onSwitch}
            milk={switchPour}
            accessibilityLabel={title}
            disabled={disabled}
          />
        ) : (
          <Switch
            value={switchValue}
            onValueChange={onSwitch}
            accessibilityLabel={title}
            disabled={disabled}
          />
        )}
      </View>
    </>
  ) : locked ? (
    // where the chevron would be, inside the row's one pressable: the lock before the tap
    lockGlyph
  ) : right === 'none' ? null : expanded !== undefined ? (
    // opens in place, so the glyph is the one Disclosure uses: a chevron that turns
    <Icon name={expanded ? 'up' : 'down'} size={15} color={t.color.text3} />
  ) : right === 'chevron' || (right === undefined && onPress) ? (
    <Icon name="chev" size={15} color={t.color.text3} />
  ) : (
    (right ?? null)
  );
  const a11y = {
    accessible: true,
    ...(isSwitch
      ? { accessibilityRole: 'switch' as const }
      : onPress
        ? { accessibilityRole: 'button' as const }
        : {}),
    accessibilityLabel: label,
    // a locked row says what unlocks it after its name, as a locked swatch or design tile does
    ...(accessibilityHint
      ? { accessibilityHint }
      : locked && lockedHint
        ? { accessibilityHint: lockedHint }
        : {}),
    accessibilityState: {
      disabled,
      ...(selected !== undefined ? { selected } : {}),
      ...(expanded !== undefined ? { expanded } : {}),
      ...(isSwitch ? { checked: switchValue } : {}),
    },
  };
  const press = {
    disabled: disabled || !interactive,
    ...(handlePress ? { onPress: handlePress } : {}),
  };
  const rowStyle = (pressed: boolean): ViewStyle => ({
    minHeight: t.hit.primary,
    paddingHorizontal: t.space.xl,
    paddingVertical: t.space.lg,
    gap: t.space.lg,
    backgroundColor: rowFill(pressed),
    opacity: disabled ? 0.5 : 1,
  });
  const content = (
    <>
      {isCheck ? (
        // Its own control, not a second target on the row's: the row opens the editor and the
        // tick ticks, which is two jobs a list row really does have. 44pt of hit area around a
        // 26pt circle, so the tick is reachable without the row's own press catching it.
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked, disabled }}
          accessibilityLabel={checkLabel ?? title}
          disabled={disabled}
          hitSlop={t.space.sm}
          onPress={() => onCheck(!checked)}
          style={({ pressed }) => [
            styles.tick,
            {
              width: TICK,
              height: TICK,
              borderRadius: TICK / 2,
              borderWidth: 2,
              borderColor: checked ? 'transparent' : t.color.line2,
              backgroundColor: checked ? t.color.accent : 'transparent',
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          testID={testID === undefined ? undefined : `${testID}.tick`}
        >
          {/* THE TICK DRAWS ITSELF (the owner, 2026-09-25): the same glyph, the pen seen moving */}
          <TickMark
            checked={checked}
            size={15}
            color={t.color.onAccent}
            ring={TICK / 2}
            burst={checkBurst}
            burstColor={t.color.accent}
          />
        </Pressable>
      ) : null}
      {avatar ? (
        <Avatar
          name={avatar.name}
          size={31}
          {...(avatar.photoUri ? { photoUri: avatar.photoUri } : {})}
          // the row already says the name in its title; the circle is presentation
          accessibilityLabel=""
        />
      ) : null}
      {icon && !avatar ? (
        <View
          style={[
            styles.chip,
            {
              width: ICON_CHIP,
              height: ICON_CHIP,
              // Pebble rounds every icon holder to a circle (§16.2); the others keep the input radius
              borderRadius: t.shape === 'pebble' ? ICON_CHIP / 2 : t.radius.s,
              // the tint is the holder's OWN background, composited to an opaque color: one plain
              // view, nothing under the glyph for a layout pass to size wrong. The holder throws
              // no shadow, so an rgba fill would be sound too (shadows.ts: the polygon a
              // translucent fill draws needs an elevation under it); opaque is simply one fewer
              // thing to be wrong.
              //
              // At FULL tint (`tintAlphaFor(…, false)`), because this 32pt square carries no
              // BlurView on any platform and glass's 55% is a promise about a blur, not a shade
              // of the hue (skins.ts). Diluted it made every category chip in every list a paler
              // version of a color the household had already chosen.
              backgroundColor:
                chip.disc ??
                (tint
                  ? composite(t.color.app, chip.soft, tintAlphaFor(t.skinTokens, false))
                  : chip.soft),
            },
          ]}
        >
          {iconNode ?? <Icon name={icon} size={16} color={chip.fg} />}
        </View>
      ) : null}
      <View style={styles.body}>
        {/* The field name, over the answer — see `eyebrow` on the props for why it is not a detail. */}
        {eyebrow === undefined ? null : <Meta ink="text2">{eyebrow}</Meta>}
        <View style={[styles.titleLine, { gap: t.space.sm }]}>
          {/* A TICKED THING IS STRUCK THROUGH (the owner, 2026-09-16: "when an activity is
              checkmark, do the strikethrough to the activity text"). It is what a paper list
              does, it is the one cue that survives being read at arm's length, and it is not
              carried by color alone — the tick, the ink and the line all say the same thing. */}
          {isCheck ? (
            /* AND ON A CHECKLIST ROW THE LINE IS DRAWN ACROSS (2026-09-26; the header): the words
               are the shopping list's `StrikeText`, which rests on the same platform line-through
               this row always drew, so nothing changes but the moment of the tick. Its box takes
               the title's own give in the line, so a long chore still wraps before the badge. */
            <View style={styles.title}>
              <StrikeText
                variant="bodyStrong"
                ink={disabled || checked ? 'text2' : 'text'}
                struck={checked}
              >
                {title}
              </StrikeText>
            </View>
          ) : (
            <BodyStrong ink={disabled ? 'text2' : 'text'} style={styles.title}>
              {title}
            </BodyStrong>
          )}
          {badge ? (
            <Badge label={badge.label} {...(badge.tone ? { tone: badge.tone } : {})} />
          ) : null}
        </View>
        {detail || strike ? (
          <BodySm>
            {strike ? (
              <BodySm ink="text2" style={styles.struck} accessibilityLabel={`was ${strike}`}>
                {`${strike} `}
              </BodySm>
            ) : null}
            {detail}
          </BodySm>
        ) : null}
      </View>
      {value !== undefined ? (
        <Numeric variant="bodySm" ink="text2" align="right">
          {value}
        </Numeric>
      ) : null}
      {hint === undefined ? null : (
        <BodySm ink="text2" numberOfLines={1} style={styles.hint}>
          {hint}
        </BodySm>
      )}
    </>
  );
  if (customRight) {
    // the text side is the row's element and pressable; the caller's node stands beside it.
    // The vertical padding moves onto the pressable so it spans the full 54pt row.
    return (
      <View
        style={[styles.row, rowStyle(false), { paddingVertical: 0 }, style]}
        {...(testID ? { testID } : {})}
      >
        <Pressable
          {...a11y}
          {...press}
          style={({ pressed }) => [
            styles.row,
            styles.main,
            {
              paddingVertical: t.space.lg,
              gap: t.space.lg,
              borderRadius: t.radius.s,
              backgroundColor: rowFill(pressed),
            },
          ]}
        >
          {content}
        </Pressable>
        {rightNode}
      </View>
    );
  }
  return (
    <Pressable
      {...a11y}
      {...press}
      style={({ pressed }) => [styles.row, rowStyle(pressed), style]}
      {...(testID ? { testID } : {})}
    >
      {content}
      {rightNode}
    </Pressable>
  );
}

/**
 * `Rows` NO LONGER SCROLLS, and the box that did is a story worth keeping (2026-09-20).
 *
 * It held a fixed number of rows and scrolled for the rest, for one caller: Today's Up next.
 * Four versions of that box each fixed a different half of the same problem — a scroller inside
 * a scroller is one gesture that two things want — and every one of them was a workaround:
 * `nestedScrollEnabled={false}` so the page did not jump when the list hit its end; a capture
 * handler on a wrapper so the hold armed from anywhere in the box; a native-driven float so the
 * page did not steal the first eight points of the drag. The last of those worked, and left the
 * problem underneath: *"you slide in it accidentally when you just want to slide the page"*
 * (the owner, 2026-09-20).
 *
 * So Up next has two arrow buttons now (`screens/today/NextList.tsx`) and no scroller at all,
 * and this component is a plain list again. If a list ever needs a bounded, scrolling box
 * inside a page: it does not. Page it, or let it be as long as it is.
 */
export interface RowsProps {
  children: ReactNode;
  /** Start each divider at the text edge (past the icon chip) rather than the surface edge. */
  inset?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Rows({ children, inset = false, style, testID }: RowsProps) {
  const t = useTheme();
  const items = Children.toArray(children).filter(isValidElement);
  const left = inset ? t.space.xl + ICON_CHIP + t.space.lg : 0;
  return (
    <Surface radius="m" style={style} {...(testID ? { testID } : {})}>
      <View
        accessibilityRole="list"
        style={{ borderRadius: t.radius.m, overflow: 'hidden' as const }}
      >
        {items.map((child, i) => (
          <Fragment key={child.key ?? i}>
            {i > 0 ? <Divider inset={left} /> : null}
            {child}
          </Fragment>
        ))}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  main: { flex: 1, minWidth: 0, alignSelf: 'stretch' },
  chip: { alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },
  tick: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  body: { flex: 1, minWidth: 0 },
  titleLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  title: { flexShrink: 1 },
  // the title gives way first: a long category name wraps, the two words before the chevron don't
  hint: { flexShrink: 0 },
  struck: { textDecorationLine: 'line-through' },
});
