# Food photos

The owner asked on 2026-10-08 for a photo of every food in the library ("generated but looks like
real images"). Everything except the photos themselves is in place. The research behind the style
is `docs/research/MARKET_AND_SETUP.md` §5.

## What is already built

- **One prompt per food**, all in the same style: `tools/foods/food-image-prompts.csv` (178 rows:
  `id`, `name`, `prompt`). Each prompt is written from the food's own serving text for the first
  age band (`foods.data.ts`), so the photo shows the food the way the plan serves it. The prompts
  come from `packages/core/src/nibble/foodImages.ts`, and its test fails if the CSV and the
  library ever disagree. To write the CSV again after a food changes:
  `UPDATE_FOOD_PROMPTS=1 pnpm vitest run packages/core/src/nibble/foodImages.test.ts`.
- **The importer**: `python3 tools/foods/import-food-images.py <folder>`. It takes photos named
  by food id (`sweet-potato.png`, `avocado.jpg`…), crops each to a square, saves it as a 512 px
  JPEG (about 40 to 60 KB) in `apps/mobile/assets/foods/`, and writes the app's map
  (`apps/mobile/src/nibble/foodImages.generated.ts`). A file whose name is not a food id is skipped
  and reported. It needs Python 3 and Pillow (`pip install pillow`).
- **The app shows a photo wherever there is one**: the Foods list, a food's page, every plan item,
  the setup's "Which foods has Ada had?" grid and the plan preview (`FoodThumb.tsx`). A food with
  no photo yet shows its category glyph on the green tint, never a broken box.

## Why the photos are not in the repository yet

The development environment has no image model, and its network refuses image sources, so the
photos could not be made or downloaded here. Nothing was faked: no stock photos, no placeholder
pictures under a food's name.

## How to make them

1. Open `tools/foods/food-image-prompts.csv` in a spreadsheet.
2. For each row, paste the `prompt` into an image tool (for example ChatGPT's image generation,
   Midjourney, or Adobe Firefly) and save the picture as `<id>.png`, using the `id` column exactly.
   Doing ten at a time and keeping one chat or style reference keeps the set consistent.
3. **Check each one against the food's page in the app** before importing: the shape and size
   must match how it is served (grapes quartered lengthwise, no whole nuts, no coin-shaped
   carrots, nut butter thinned, never a spoonful). A photo is a serving instruction, so a wrong
   one is a safety problem, not a style problem. Remake any that are wrong.
4. Put all the checked photos in one folder and run
   `python3 tools/foods/import-food-images.py <that folder>`.
5. Run `pnpm gate`, then commit.

## Things to decide

- **Generated or photographed.** Generated photos are quick and cheap, and image models often get
  sizes and counts wrong, so every one needs the check in step 3. A photo shoot of the 60 foods
  most planned in the first weeks is the most trustworthy; the rest can be generated. If photos are
  generated, the store listing should not suggest they are photographs of real servings.
- **Bundled or downloaded.** 178 photos at about 50 KB is about 9 MB in the app. That is fine for
  now; if the library grows or a second photo per age band is added, the larger ones can move to
  the server and be cached on the phone.
