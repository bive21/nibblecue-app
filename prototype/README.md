# NibbleCue click-through prototype

`ui-prototype.html` is one self-contained file: no build, no network, no fonts or scripts
from anywhere else. Open it in any browser, or on a phone, where it fills the screen.

- **Look:** CuddleCue's Paper ground, white cards, floating tab bar and bottom sheets, painted
  in CuddleCue's Sunny scheme (`packages/ui/src/theme/design-tokens.json`, `colorScheme.sunny`).
  Light and dark follow the system; More, Appearance switches them by hand.
- **Data:** about 30 real foods, their 6 to 8 month serving text, choking notes and allergens,
  12 guidance cards and their sources, copied from `packages/core/src/nibble/foods.data.ts`,
  `guidance.data.ts` and `sources.ts`. Every label and reason line is `copy.ts` verbatim.
- **Demo only:** Ada, her history, the plan and the CuddleCue bottle counts are sample data.
  More, Demo controls switches Free and Plus and starts the ten-question setup. Nothing is saved;
  a reload starts over.
- **What to try:** Served, then Loved it, then Save (Undo in the toast). Tap a food. Swap.
  Something you noticed, then Trouble breathing (the emergency card). Plan, day 3 and on
  (locked in Free). Foods, Add your own food. Shopping, Add this week's foods.
- **Safety:** the Call 911 button only shows a toast. Prices read "Price from the App Store".

The data block inside the file was generated from the TypeScript data files; to refresh it,
re-export `FOOD_DATA`, `GUIDANCE_DATA` and `SOURCES` and replace `const DATA = {...}`.
