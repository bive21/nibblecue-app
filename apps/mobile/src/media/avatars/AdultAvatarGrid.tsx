/**
 * THE PRE-MADE GROWN-UPS, AS A ROW OF CHOICES (the owner, 2026-09-30; `adults.ts`), drawn by the
 * picture sheet on Account & privacy. A tap hands the chosen drawing to the caller, which keeps its
 * id as the person's picture: nothing is drawn into a file here and nothing is uploaded, because a
 * drawing is only an id on the server and every phone draws it from the same shapes.
 *
 * Each is a 64 pt target (the minimum is 44), labeled woman or man, with the skin tone in the words
 * the Unicode skin-tone modifiers use and with the hair, so a person using a screen reader chooses
 * the same way a sighted person does. The one chosen now wears a ring and says so (`selected`), in
 * the state and not in the ring alone.
 *
 * TWELVE IN FULL ROWS (the owner, 2026-10-01: *"add 2 more avatar to make it full on a 3x4
 * options"*). They wrap, never a sideways scroll: three across on a phone under 364 pt, four on a
 * wider one, and the grid is never wider than four, so a tablet does not leave a short row of two.
 */
import { AppText, useTheme } from '@nibblecue/ui';
import { Pressable, StyleSheet, View } from 'react-native';
import { MEMBER_PICTURE_COPY } from '../../sheets/account/pictureCopy';
import { AdultAvatarArt } from './AdultAvatarArt';
import { ADULT_AVATARS, type AdultAvatarDef } from './adults';

/** A face worth choosing between, and well over the 44 pt minimum target. */
export const ADULT_CHOICE_SIZE = 64 as const;

/** The most faces a row holds: twelve make three full rows of four, or four of three. */
export const ADULT_MOST_ACROSS = 4 as const;

export interface AdultAvatarGridProps {
  /** The drawing chosen now, by id, or null when the picture is a photo or the initial. */
  chosen: string | null;
  onPicked: (def: AdultAvatarDef) => void;
  disabled?: boolean;
  testID?: string;
}

export function AdultAvatarGrid({
  chosen,
  onPicked,
  disabled = false,
  testID,
}: AdultAvatarGridProps) {
  const t = useTheme();
  return (
    <View style={{ gap: t.space.sm }} {...(testID ? { testID } : {})}>
      <AppText variant="caption" ink="text2">
        {MEMBER_PICTURE_COPY.drawings}
      </AppText>
      <View
        style={[
          styles.grid,
          {
            gap: t.space.md,
            maxWidth: ADULT_MOST_ACROSS * CELL + (ADULT_MOST_ACROSS - 1) * t.space.md,
          },
        ]}
      >
        {ADULT_AVATARS.map(def => {
          const selected = chosen === def.id;
          return (
            <Pressable
              key={def.id}
              accessibilityRole="button"
              accessibilityLabel={MEMBER_PICTURE_COPY.drawing(def.gender, def.tone, def.look)}
              accessibilityState={{ disabled, selected }}
              disabled={disabled}
              onPress={() => onPicked(def)}
              style={({ pressed }) => [
                styles.choice,
                {
                  borderRadius: t.radius.pill,
                  borderColor: selected ? t.color.accent : 'transparent',
                  opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
                },
              ]}
              testID={`picture.drawing.${def.id}`}
            >
              <View style={[styles.clip, { borderRadius: t.radius.pill }]}>
                <AdultAvatarArt def={def} size={ADULT_CHOICE_SIZE} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The ring the chosen drawing wears, outside the 64 pt face. */
const RING = 3 as const;
/** One choice across: the face, its padding and its ring on either side. */
const CELL = ADULT_CHOICE_SIZE + 4 * RING;

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  choice: { padding: RING, borderWidth: RING },
  clip: { width: ADULT_CHOICE_SIZE, height: ADULT_CHOICE_SIZE, overflow: 'hidden' },
});
