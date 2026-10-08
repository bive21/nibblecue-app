/**
 * One pre-made grown-up, drawn with react-native-svg from `adults.ts` (`ShapesArt` does the
 * drawing): the chooser's faces and the picture sheet's big preview. Every smaller circle draws the
 * kept file instead (`adultFile.ts`), through the design system's own fallback.
 */
import { useMemo } from 'react';
import { adultShapes, type AdultAvatarDef } from './adults';
import { ShapesArt } from './ShapesArt';

export interface AdultAvatarArtProps {
  def: AdultAvatarDef;
  size: number;
}

export function AdultAvatarArt({ def, size }: AdultAvatarArtProps) {
  const shapes = useMemo(() => adultShapes(def), [def]);
  return <ShapesArt shapes={shapes} size={size} />;
}
