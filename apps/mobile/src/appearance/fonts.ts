/**
 * The two faces (docs/DESIGN_SYSTEM.md §4, §19): Hanken Grotesk for every word — small-caps labels
 * and badges too, since 2026-09-26 — and IBM Plex Mono for numbers that line up. Registered under
 * the exact family names the token
 * table uses (theme.ts `type.*.fontFamily`), so a token change and a font change are one
 * edit. Loaded before the first frame; until then the Text roles keep the weight hierarchy
 * in the system face (Text.tsx `weightFallback`).
 *
 * EACH FACE FROM ITS OWN WEIGHT FOLDER, NEVER FROM THE PACKAGE INDEX (2026-09-26, the owner:
 * "remove any unused assets from the app"). A package's index `require`s every weight it
 * publishes, and Metro bundles every file a module requires, read or not: this build does not
 * tree-shake (`EXPO_UNSTABLE_TREE_SHAKING` is off). Named imports from the two indexes shipped
 * all thirty-two TTFs, 3.2 MB, to register six, 0.6 MB; five since the labels left the mono face.
 * `fonts.test.ts` holds the imports to the weight folders and the set to the faces the app names.
 */
import { HankenGrotesk_400Regular } from '@expo-google-fonts/hanken-grotesk/400Regular';
import { HankenGrotesk_700Bold } from '@expo-google-fonts/hanken-grotesk/700Bold';
import { HankenGrotesk_800ExtraBold } from '@expo-google-fonts/hanken-grotesk/800ExtraBold';
import { loadAsync, useFonts } from 'expo-font';
/*
  THE MONO FACES, CUT TO THE LATIN SET (the owner, 2026-10-08: "keep the build as light as
  possible, in case if user has slower or older phones"). The same IBM Plex Mono with the same
  widths, minus the Cyrillic, Greek and box drawing no number here is set in and the hinting only
  Windows reads: 48 KB a face where the package's file is 135 KB. `tools/ui/subset-mono-fonts.py`
  makes them from the package's own files and says what stays.
*/
import IBMPlexMono_400Regular from '../../assets/fonts/IBMPlexMono_400Regular.ttf';
import IBMPlexMono_600SemiBold from '../../assets/fonts/IBMPlexMono_600SemiBold.ttf';

const APP_FONTS = {
  'HankenGrotesk-Regular': HankenGrotesk_400Regular,
  'HankenGrotesk-Bold': HankenGrotesk_700Bold,
  'HankenGrotesk-ExtraBold': HankenGrotesk_800ExtraBold,
  'IBMPlexMono-Regular': IBMPlexMono_400Regular,
  'IBMPlexMono-SemiBold': IBMPlexMono_600SemiBold,
} as const;

/**
 * THE FACES, ASKED FOR AS THE BUNDLE EVALUATES (2026-09-28; the owner: *"app needs to run as smooth
 * as fast and as light as possible"*). `AppearanceProvider` paints nothing until they are in, and
 * it mounts only once the accounts provider has built its clients — so the five files were not even
 * asked for until then, and the first frame waited for the launch's reads and THEN for the fonts.
 * Asked for here (`App.tsx`, beside the loader's mark), they load while the launch reads the
 * session, and `useFonts` finds them registered, or on their way, when the provider mounts:
 * expo-font answers `isLoaded` from its own cache and hands a second `loadAsync` of a face the
 * first one's promise. A failure is swallowed here and met again, and handled, by the hook.
 */
let asked: Promise<void> | null = null;
export function preloadAppFonts(): Promise<void> {
  asked ??= loadAsync(APP_FONTS).catch(() => undefined);
  return asked;
}

/** True once every face is registered; an error still resolves (system face), never a blank app. */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(APP_FONTS);
  return loaded || !!error;
}
