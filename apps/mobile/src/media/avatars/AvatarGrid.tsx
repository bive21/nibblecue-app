/**
 * THE PRE-MADE BABIES, AS A ROW OF CHOICES (the owner, 2026-09-24: *"a few pregenerated baby
 * pictures, of all race"*). Drawn by the photo sheet and by setup's "Add a photo" ask: a tap turns
 * the drawing into the same JPEG a photo becomes (`render.ts`) and hands the bytes to the caller,
 * which does with them exactly what it does with a picked photo — upload now, or park until the
 * child exists. The picture is drawn from the baby's shapes, not read off the face on the screen
 * (`render.ts` says why: on an iPhone that read gave an empty circle), so the faces here are only
 * what the parent chooses between.
 *
 * Each baby is a 64 pt target (the minimum is 44), labeled girl or boy, with the skin tone in the
 * words the Unicode skin-tone modifiers use and with the hair, the hat or the bow, so a parent using
 * a screen reader chooses the same way a sighted parent does. The twenty wrap: four across on most
 * phones, three on the narrowest, never a sideways scroll that hides half the set — both sheets
 * that draw it scroll.
 */
import { AppText, useTheme } from '@nibblecue/ui';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { crumb } from '../../app/boot';
import { CHILD_PHOTO_COPY } from '../../sheets/household/childPhotoCopy';
import { BABY_AVATARS, type BabyAvatarDef } from './art';
import { BabyAvatarArt } from './BabyAvatarArt';
import { avatarJpeg } from './render';

/** A face worth choosing between, and well over the 44 pt minimum target. */
export const AVATAR_CHOICE_SIZE = 64 as const;

export interface AvatarGridProps {
  /** The prepared JPEG of the chosen baby; resolve when the caller is done with it. */
  onPicked: (bytes: Uint8Array, def: BabyAvatarDef) => Promise<void> | void;
  /** Drawing the picture failed — the caller says so where its other errors go. */
  onFailed: (message: string) => void;
  disabled?: boolean;
  testID?: string;
}

export function AvatarGrid({ onPicked, onFailed, disabled = false, testID }: AvatarGridProps) {
  const t = useTheme();
  const [working, setWorking] = useState<string | null>(null);

  const pick = async (def: BabyAvatarDef) => {
    if (disabled || working !== null) return;
    setWorking(def.id);
    try {
      let bytes: Uint8Array;
      try {
        bytes = await avatarJpeg(def);
      } catch (err: unknown) {
        crumb(`avatar: render failed — ${err instanceof Error ? err.message : ''}`);
        onFailed(CHILD_PHOTO_COPY.illustrationFailed);
        return;
      }
      await onPicked(bytes, def);
    } finally {
      setWorking(null);
    }
  };

  return (
    <View style={{ gap: t.space.sm }} testID={testID}>
      <AppText variant="caption" ink="text2">
        {CHILD_PHOTO_COPY.illustrations}
      </AppText>
      <View style={[styles.grid, { gap: t.space.md }]}>
        {BABY_AVATARS.map(def => {
          const busy = working === def.id;
          const off = disabled || (working !== null && !busy);
          return (
            <Pressable
              key={def.id}
              accessibilityRole="button"
              accessibilityLabel={CHILD_PHOTO_COPY.illustration(def.gender, def.tone, def.look)}
              accessibilityState={{ disabled: off, busy }}
              disabled={off}
              onPress={() => void pick(def)}
              style={({ pressed }) => [
                styles.choice,
                {
                  borderRadius: t.radius.pill,
                  borderColor: busy ? t.color.accent : 'transparent',
                  opacity: off ? 0.45 : pressed ? 0.8 : 1,
                },
              ]}
              testID={`avatar.${def.id}`}
            >
              <View style={[styles.clip, { borderRadius: t.radius.pill }]}>
                <BabyAvatarArt def={def} size={AVATAR_CHOICE_SIZE} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The ring a chosen baby wears while it is being saved, outside the 64 pt face. */
const RING = 3 as const;

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  choice: { padding: RING, borderWidth: RING },
  clip: { width: AVATAR_CHOICE_SIZE, height: AVATAR_CHOICE_SIZE, overflow: 'hidden' },
});
