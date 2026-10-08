/**
 * Input (docs/DESIGN_SYSTEM.md §5, §15.3, §16.4; docs/MOBILE.md §4): a text field is square-ish
 * — radius `s` — because an INPUT is the one shape that is neither a value nor a surface. The
 * fill is the solid surface (a field is never frosted), the edge is `line2` rather than `line`
 * because the prototype draws it so and a 15% edge on a white fill is not an edge a parent can
 * find at 3 a.m.; it turns `accent` while focused and `crit` on error. The error line has the
 * alert role and a live region so it is announced when it appears; the label sits above in the
 * mono `label` role and doubles as the field's accessible name. `secure` adds a Show/Hide
 * toggle — a password a parent cannot check is a password typed twice.
 */
import { useState, type Ref } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Icon, type IconProps } from '../icons/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { AppText, BodySm, Label } from './Text';

export interface InputProps extends Omit<
  TextInputProps,
  | 'style'
  | 'value'
  | 'onChangeText'
  | 'placeholder'
  | 'secureTextEntry'
  | 'editable'
  | 'accessibilityLabel'
> {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  /** What went wrong, in words; shown under the field and announced. */
  error?: string;
  /** Help under the field when there is no error. */
  hint?: string;
  /** A password field, with a Show/Hide toggle. */
  secure?: boolean;
  disabled?: boolean;
  /** A leading glyph inside the field. */
  leading?: IconProps['name'];
  /**
   * Keep the label for a screen reader and do not draw it.
   *
   * For the one field whose PLACEHOLDER is already its label and whose purpose is obvious from
   * its glyph — a search box with a magnifier in it. Everywhere else the label stays visible:
   * a placeholder that vanishes as you type is not a label (DESIGN_SYSTEM §9), and a form of
   * fields identified only by grey text is a form nobody can check before saving.
   */
  labelHidden?: boolean;
  /**
   * 40 tall with less air beside the words, for a row of fields in a list (the solids food list,
   * the owner's option 3, 2026-10-06). Still reached at 44 by the row it sits in.
   */
  dense?: boolean;
  /** The whole block: label, field, message. */
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  /** The field itself, so a caller can focus it. */
  inputRef?: Ref<TextInput>;
  /** A clear control inside the field while it has text. */
  onClear?: () => void;
}

const MULTILINE_MIN_HEIGHT = 66;
/** A `dense` field's height. */
const DENSE_HEIGHT = 40;

export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  hint,
  secure = false,
  disabled = false,
  leading,
  labelHidden = false,
  dense = false,
  style,
  inputStyle,
  inputRef,
  onClear,
  onFocus,
  onBlur,
  multiline,
  ...rest
}: InputProps) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  const edge = error ? t.color.crit : focused ? t.color.accent : t.color.line2;
  const message = error ?? hint;
  return (
    <View style={[{ gap: t.space.sm }, style]}>
      {labelHidden ? null : <Label>{label}</Label>}
      <View
        style={[
          styles.field,
          {
            minHeight: dense ? DENSE_HEIGHT : t.hit.min,
            borderRadius: t.radius.s,
            borderColor: edge,
            backgroundColor: t.color.surfaceSolid,
            paddingHorizontal: dense ? t.space.md : t.space.lg,
            gap: t.space.md,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        {leading ? <Icon name={leading} size={16} color={t.color.text2} /> : null}
        <TextInput
          ref={inputRef}
          {...rest}
          {...(multiline !== undefined ? { multiline } : {})}
          value={value}
          onChangeText={onChangeText}
          {...(placeholder !== undefined ? { placeholder } : {})}
          placeholderTextColor={t.color.text3}
          secureTextEntry={secure && !shown}
          editable={!disabled}
          accessibilityLabel={label}
          {...(message ? { accessibilityHint: message } : {})}
          accessibilityState={{ disabled }}
          onFocus={e => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={e => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            {
              color: t.color.text,
              fontSize: t.type.body.fontSize,
              paddingVertical: dense ? t.space.xs : t.space.md,
              ...(t.fontsReady ? { fontFamily: t.type.body.fontFamily } : {}),
              ...(multiline ? { minHeight: MULTILINE_MIN_HEIGHT, textAlignVertical: 'top' } : {}),
            },
            inputStyle,
          ]}
        />
        {onClear && value.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={onClear}
            hitSlop={t.space.xs}
            style={({ pressed }) => [
              styles.reveal,
              {
                width: t.hit.min,
                alignItems: 'center',
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            testID="input.clear"
          >
            <Icon name="x" size={16} color={t.color.text2} />
          </Pressable>
        ) : null}
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={shown ? 'Hide password' : 'Show password'}
            onPress={() => setShown(s => !s)}
            hitSlop={t.space.md}
            style={({ pressed }) => [
              styles.reveal,
              { paddingHorizontal: t.space.xs, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <AppText
              variant="bodyStrong"
              ink="accent2"
              style={{ fontSize: t.type.bodySm.fontSize }}
            >
              {shown ? 'Hide' : 'Show'}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {/* ONE LINE UNDER THE FIELD, in the hint role whichever it says (docs/DESIGN_SYSTEM.md §4.1,
          2026-09-30): the help was `Meta`, a size under the error that replaced it, so the line
          jumped a point when a field went wrong, and a form's field help was smaller than every
          other hint on the same sheet */}
      {error ? (
        <BodySm ink="crit" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </BodySm>
      ) : hint ? (
        <BodySm>{hint}</BodySm>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  input: { flex: 1, minWidth: 0 },
  reveal: { alignSelf: 'stretch', justifyContent: 'center' },
});
