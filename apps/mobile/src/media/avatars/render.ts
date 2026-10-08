/**
 * A PRE-MADE BABY, AS THE CHILD'S PHOTO. The chosen picture goes through the ordinary photo
 * pipeline rather than a column of its own, and that is the whole design:
 *
 *   - it reaches the other parent's phone the way a photo does (`setChildPhoto`, the private
 *     bucket, the signed URL, the cache keyed on the stamp) — "saved to everyone in household"
 *     was the promise the photo feature made, and a picture that stayed on one phone would break it;
 *   - setup can hold it before the child exists exactly as it holds a photo (`stashSetupPhoto`);
 *   - nothing on the server, the database or the sync changes, so there is no migration to get
 *     wrong and nothing to undo if the owner replaces the drawings later.
 *
 * THE PICTURE IS DRAWN FROM `art.ts`'s SHAPES BY THE APP ITSELF (`raster.ts`), at the pipeline's
 * own size (`CHILD_PHOTO_SIDE`), written to a scratch file as a PNG (`png.ts`) and handed to
 * `prepareChildPhoto`, so it leaves as the same 512 px JPEG every photo does. The drawing's ground
 * is opaque (the first shape in `art.ts` is a full square), which is what makes JPEG, with no
 * alpha, safe.
 *
 * IT USED TO BE THE CHOOSER'S OWN SVG, and that is the bug this replaced (2026-09-29). The picture
 * came from react-native-svg's `toDataURL` on the 64 pt face in the chooser, asked for at 512, on
 * the belief — written here — that "both platforms scale the drawing to the size asked for". Only
 * Android does. iOS makes the 512 canvas and draws the baby in the view's own 64 pt bounds, in its
 * top-left corner, and leaves the rest empty (`raster.ts` quotes both native sources); the round
 * avatar shows the square's inscribed circle, which that corner lies wholly outside, so every baby
 * chosen on an iPhone was an empty circle, on setup's plate, in the top bar and on every phone in
 * the household (the owner, 2026-09-28: "the bling showed but the background is just empty white
 * ish, with no avatar"). Drawn here, the picture is the same bytes on every phone, whatever size the
 * chooser draws its faces at, and `raster.test.ts` holds them.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { crumb } from '../../app/boot';
import { prepareChildPhoto } from '../childPhoto';
import type { BabyAvatarDef } from './art';
import { avatarPng, drawingKey } from './picture';

/**
 * ONE FRAME FIRST: drawing the picture holds the JavaScript thread for a moment (in node with its
 * compiler switched off, a stand-in for Hermes, about 0.15 s to draw and write the PNG), and the
 * chooser has just been asked to ring the tapped face. Letting a frame through first is what puts
 * that ring on the screen before the wait rather than after it.
 */
const aFrame = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 16));

/**
 * A scratch name of its own for every drawing: a pick and a redrawn empty picture (`drawnBabyFile`)
 * can be drawn at the same moment, and one name would have one write over the other's file.
 */
let scratch = 0;

/** The picture on screen, as the JPEG bytes `setChildPhoto` and `stashSetupPhoto` take. */
export async function avatarJpeg(def: BabyAvatarDef): Promise<Uint8Array> {
  await aFrame();
  const png = avatarPng(def);
  // under `Paths.cache/cuddlecue`, the directory sign-out sweeps (media/childPhoto.ts)
  const dir = new Directory(Paths.cache, 'cuddlecue', 'avatar-render');
  if (!dir.exists) dir.create({ intermediates: true });
  scratch += 1;
  const file = new File(dir, `${def.id}-${scratch}.png`);
  if (file.exists) file.delete();
  file.create();
  file.write(png);
  try {
    const jpeg = await prepareChildPhoto(file.uri);
    // the next report names what was made, not only that something was (development builds only)
    crumb(`avatar: ${def.id} drawn, ${png.length} B PNG → ${jpeg.length} B JPEG`);
    return jpeg;
  } finally {
    try {
      file.delete();
    } catch {
      // it goes with the directory at sign-out
    }
  }
}

/** The drawings being kept right now, by `drawingKey`: one write per file, whoever asks. */
const keeping = new Map<string, Promise<string | null>>();

/**
 * A DRAWN BABY AS A FILE AN AVATAR CAN SHOW (2026-09-29): what stands in for a stored picture whose
 * circle is empty — the one a drawn baby picked on an iPhone before the fix above became — until the
 * picture itself is mended (`photoMend.ts`). The very JPEG a pick of that baby makes, kept per
 * drawing (`drawingKey`) under `Paths.cache/cuddlecue`, so it is drawn once, works with no network,
 * and goes at sign-out with the photo cache. Null when it could not be made: the initial stands in.
 */
export function drawnBabyFile(def: BabyAvatarDef): Promise<string | null> {
  const key = drawingKey(def);
  // two passes asking for one baby at once share one drawing, rather than each writing the file
  let kept = keeping.get(key);
  if (kept === undefined) {
    kept = keepDrawing(def, key).finally(() => keeping.delete(key));
    keeping.set(key, kept);
  }
  return kept;
}

async function keepDrawing(def: BabyAvatarDef, key: string): Promise<string | null> {
  try {
    const dir = new Directory(Paths.cache, 'cuddlecue', 'avatar-drawn');
    if (!dir.exists) dir.create({ intermediates: true });
    const file = new File(dir, `${key}.jpg`);
    if (file.exists) return file.uri;
    const jpeg = await avatarJpeg(def);
    try {
      file.create();
      file.write(jpeg);
    } catch (err: unknown) {
      // half a file would be drawn as a broken picture next time: none is drawn afresh
      if (file.exists) file.delete();
      throw err;
    }
    return file.uri;
  } catch (err: unknown) {
    crumb(`avatar: ${def.id} could not be kept — ${err instanceof Error ? err.message : ''}`);
    return null;
  }
}
