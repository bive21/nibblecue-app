/**
 * A PICTURE THAT WOULD NOT DRAW, IN THE BOOT LOG (2026-09-29; `photoCrumb.ts`): the line the next
 * report carries, and that the app installs it before anything can draw a picture.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { photoTroubleLine } from './photoCrumb';

const here = dirname(fileURLToPath(import.meta.url));

describe('the boot log’s line for a picture that would not draw', () => {
  it('names the component, where the picture lives and what the phone said', () => {
    expect(
      photoTroubleLine({
        where: 'ChildChip',
        place: 'file: …/cuddlecue/child-photos',
        error: 'Error decoding image data',
      }),
    ).toBe(
      'photo: ChildChip could not draw the picture at file: …/cuddlecue/child-photos — Error decoding image data; the initial stands in',
    );
  });

  it('is installed as the bundle evaluates, beside the loader’s mark, not in an effect', () => {
    const app = readFileSync(join(here, '..', '..', 'App.tsx'), 'utf8');
    expect(app).toContain("import { crumbPhotoTrouble } from './src/media/photoCrumb';");
    const line = app.indexOf('\nsetPhotoTroubleReporter(crumbPhotoTrouble);');
    expect(line).toBeGreaterThan(-1);
    // at the top level, before the root component is even declared
    expect(line).toBeLessThan(app.indexOf('export default function App()'));
    expect(app.match(/setPhotoTroubleReporter\(/g)).toHaveLength(1);
  });
});
