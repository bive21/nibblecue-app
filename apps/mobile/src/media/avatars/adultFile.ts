/**
 * A DRAWN GROWN-UP AS A FILE A CIRCLE CAN SHOW (2026-09-30; `adultPicture.ts` says why a file):
 * drawn once per drawing (`adultDrawingKey`) under `Paths.cache/cuddlecue`, the directory sign-out
 * sweeps, so it works with no network and costs its drawing once. Null when it could not be made:
 * the initial stands in.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { crumb } from '../../app/boot';
import type { AdultAvatarDef } from './adults';
import { adultDrawingKey, adultPng } from './adultPicture';

/** One write per file, whoever asks: two surfaces asking for one drawing share the drawing. */
const keeping = new Map<string, Promise<string | null>>();

/**
 * ONE FRAME FIRST, as `render.ts` lets one through: drawing holds the JavaScript thread for a moment,
 * and whatever asked (a tap on a drawing, a row appearing) should reach the screen before the wait.
 */
const aFrame = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 16));

export function drawnAdultFile(def: AdultAvatarDef): Promise<string | null> {
  const key = adultDrawingKey(def);
  let kept = keeping.get(key);
  if (kept === undefined) {
    kept = keep(def, key).finally(() => keeping.delete(key));
    keeping.set(key, kept);
  }
  return kept;
}

async function keep(def: AdultAvatarDef, key: string): Promise<string | null> {
  try {
    const dir = new Directory(Paths.cache, 'cuddlecue', 'avatar-drawn');
    if (!dir.exists) dir.create({ intermediates: true });
    const file = new File(dir, `${key}.png`);
    if (file.exists) return file.uri;
    await aFrame();
    const png = adultPng(def);
    try {
      file.create();
      file.write(png);
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
