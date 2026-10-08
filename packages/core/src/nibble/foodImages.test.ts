import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bannedIn } from './copy.banned';
import { foodImagePrompt, foodImagePromptsCsv } from './foodImages';
import { FOODS } from './foods';

const CSV = fileURLToPath(
  new URL('../../../../tools/foods/food-image-prompts.csv', import.meta.url),
);

describe('the food photo prompts', () => {
  it('cover every food, once, in the one style, describing the first serving it is planned in', () => {
    const prompts = FOODS.map(foodImagePrompt);
    expect(new Set(prompts).size).toBe(FOODS.length);
    for (const [i, p] of prompts.entries()) {
      expect(p, FOODS[i]!.id).toContain('directly above');
      expect(p.toLowerCase(), FOODS[i]!.id).toContain(FOODS[i]!.name.toLowerCase());
      expect(bannedIn(p), FOODS[i]!.id).toEqual([]);
    }
  });

  it('are the committed prompt list (UPDATE_FOOD_PROMPTS=1 rewrites it)', () => {
    const want = foodImagePromptsCsv(FOODS);
    if (process.env.UPDATE_FOOD_PROMPTS === '1') writeFileSync(CSV, want);
    expect(readFileSync(CSV, 'utf8')).toBe(want);
  });
});
