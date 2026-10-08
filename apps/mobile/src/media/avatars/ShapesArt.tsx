/**
 * A DRAWING'S SHAPES, drawn with react-native-svg one to one — the babies' (`BabyAvatarArt`) and
 * the grown-ups' (`AdultAvatarArt`), so what node checks (`art.ts`, `adults.ts`, `raster.ts`) is
 * shape for shape what the phone shows.
 *
 * ONLY FOR THE SCREEN. A picture that is kept or sent is drawn by the app's own rasterizer, never
 * read back off this view (`render.ts` says what that cost on an iPhone).
 */
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import type { ArtShape } from './art';

export interface ShapesArtProps {
  shapes: readonly ArtShape[];
  size: number;
}

export function ShapesArt({ shapes, size }: ShapesArtProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      // a picture, not a control: whatever holds it carries the label
      accessible={false}
    >
      {shapes.map((s, i) => {
        switch (s.kind) {
          case 'rect':
            return (
              <Rect
                key={i}
                x={s.x}
                y={s.y}
                width={s.width}
                height={s.height}
                {...(s.rx === undefined ? {} : { rx: s.rx })}
                fill={s.fill}
              />
            );
          case 'circle':
            return (
              <Circle
                key={i}
                cx={s.cx}
                cy={s.cy}
                r={s.r}
                fill={s.fill}
                {...(s.opacity === undefined ? {} : { opacity: s.opacity })}
              />
            );
          case 'ellipse':
            return (
              <Ellipse
                key={i}
                cx={s.cx}
                cy={s.cy}
                rx={s.rx}
                ry={s.ry}
                fill={s.fill}
                {...(s.opacity === undefined ? {} : { opacity: s.opacity })}
              />
            );
          case 'path':
            return (
              <Path
                key={i}
                d={s.d}
                fill={s.fill ?? 'none'}
                {...(s.stroke === undefined
                  ? {}
                  : {
                      stroke: s.stroke,
                      strokeWidth: s.strokeWidth ?? 1,
                      strokeLinecap: 'round' as const,
                      strokeLinejoin: 'round' as const,
                    })}
                {...(s.opacity === undefined ? {} : { opacity: s.opacity })}
              />
            );
        }
      })}
    </Svg>
  );
}
