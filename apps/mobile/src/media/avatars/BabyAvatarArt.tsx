/**
 * One pre-made baby, drawn with react-native-svg from `art.ts` — shape for shape the drawing node
 * checks, so what the tests hold is what the phone shows (`ShapesArt` does the drawing, for the
 * grown-ups' set as well).
 *
 * ONLY FOR THE SCREEN. The picture a chosen baby becomes is drawn from the same shapes by the app
 * itself (`raster.ts`, via `render.ts`), never read back off this view: react-native-svg's
 * `toDataURL` draws an iPhone's copy at this view's own size in the corner of the canvas asked for,
 * which is how every baby chosen on an iPhone became an empty circle (2026-09-28).
 */
import { useMemo } from 'react';
import { babyShapes, type BabyAvatarDef } from './art';
import { ShapesArt } from './ShapesArt';

export interface BabyAvatarArtProps {
  def: BabyAvatarDef;
  size: number;
}

export function BabyAvatarArt({ def, size }: BabyAvatarArtProps) {
  const shapes = useMemo(() => babyShapes(def), [def]);
  return <ShapesArt shapes={shapes} size={size} />;
}
