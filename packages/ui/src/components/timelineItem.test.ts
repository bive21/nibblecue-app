/**
 * THE BABY'S NAME IS A LABEL BESIDE THE MODULE'S (the owner, 2026-09-30, of Today's log on Both:
 * "The baby name should be a label next to the module name (diaper, bottle). Makes it easier to see
 * and save the row space"). This package's tests have no renderer (`interaction.test.ts` says why),
 * so these hold the row's source to it: the name is a pill on the title's line, the last line is
 * who logged it and nothing else, and a screen reader hears whose entry it is before the time.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  PLUS_APPEARANCE,
  resolveAppearance,
  SCHEME_NAMES,
} from '../theme/appearance';
import { AA_TEXT, contrastRatio } from '../theme/contrast';
import { SKIN_NAMES } from '../theme/skins';
import { themeNames } from '../theme/theme';
import { badgeColors } from './badge-tone';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'TimelineItem.tsx'), 'utf8').replace(/\s+/g, ' ');
const tagSrc = readFileSync(join(here, 'NameTag.tsx'), 'utf8').replace(/\s+/g, ' ');

describe('a log row names the baby beside the module, not under the detail', () => {
  it('draws the name as a pill on the title line', () => {
    const title = src.indexOf('<BodyStrong style={styles.title}>{title}</BodyStrong>');
    const tag = src.indexOf('{childName ? ( <NameTag name={childName}');
    const detail = src.indexOf('{detail ? <BodySm>{detail}</BodySm> : null}');
    expect(title).toBeGreaterThan(0);
    // after the title and before the detail: on the title's own line
    expect(tag).toBeGreaterThan(title);
    expect(tag).toBeLessThan(detail);
    // in sentence case, the name as written: a name, never the badge's capitals
    expect(tagSrc).toContain('<Meta color={tag.ink} numberOfLines={1}> {name} </Meta>');
    expect(tagSrc).toContain("const tag = badgeColors(t.color, 'neutral');");
  });

  it('keeps the last line for who logged it, and nothing else', () => {
    expect(src).toContain('const who = byName ?? byInitials;');
    expect(src).not.toContain('[byName ?? byInitials, childName]');
  });

  it('says whose entry it is before the time, never "by" the baby', () => {
    expect(src).toContain('childName ? `${title} for ${childName}` : title');
  });

  it('reads on its fill, 4.5:1 in 3 skins × 6 schemes × 3 themes', () => {
    const low = SKIN_NAMES.flatMap(skin =>
      SCHEME_NAMES.flatMap(scheme =>
        themeNames.map(theme => {
          const r = resolveAppearance(
            { ...DEFAULT_APPEARANCE, theme, scheme, skin },
            'light',
            PLUS_APPEARANCE,
          );
          const pair = badgeColors(r.palette, 'neutral');
          return { name: `${skin} ${scheme} ${theme}`, ratio: contrastRatio(pair.ink, pair.fill) };
        }),
      ),
    )
      .filter(x => x.ratio < AA_TEXT)
      .map(x => `${x.name} ${x.ratio.toFixed(2)}`);
    expect(low).toEqual([]);
  });
});
