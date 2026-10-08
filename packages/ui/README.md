# @nibblecue/ui

The design system. At WP0 it is the token layer only:

| Path | What | Origin |
|---|---|---|
| `src/theme/design-tokens.json` | the palette, type scale, radii, spacing, category colors, the six schemes | copied from `assets/design-tokens.json` at WP0; this copy is the live one and has moved on since. The assets copy stays as the admin console's token source (`docs/REMAINING.md`, the handoff mirrors) |
| `src/theme/theme.ts` | the same tokens as a React Native theme: light / dark / night, the six scheme overlays, `resolvePalette()` | copied from `assets/theme.ts` at WP0; the assets copy was retired on 2026-09-27 (`docs/REMAINING.md`, the handoff mirrors) |

`src/theme/theme.test.ts` keeps the two in step until the generator (`pnpm tokens:build`,
WP3) exists, and pins the behaviour that matters: an unknown scheme falls back to the default
(`ocean` since 2026-09-27) rather than rendering unstyled, and night mode takes only the accents
from a scheme — its grounds are non-negotiable, because night mode exists to be safe in a dark
room.

WP3 adds the component inventory, the three skins (`soft`, `glass`, `paper`) as a
token-and-material layer, the top-bar chrome and the Appearance picker
(`docs/DESIGN_SYSTEM.md`). Rules that already apply: no component hardcodes a hex value;
this package may import `@nibblecue/core` and `@nibblecue/brand`, never `@nibblecue/db` or
an app; `tools/contrast-check.mjs` (`pnpm test:contrast-tokens`) runs against the tokens here.
