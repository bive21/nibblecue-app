# @nibblecue/brand

The one place NibbleCue's name lives. `brand.json` (decided names, the developer's proposed
identifiers, unconfirmed placeholders, store limits, artwork inventory) and `store-listing.json`
(the two store drafts and the only brand strings the app renders); `src/index.ts` is the typed
accessor.

```ts
import { BRAND, IN_APP_STRINGS, PROPOSED_KEYS, required, unconfirmed } from '@nibblecue/brand';

BRAND.appDisplayName        // the home-screen name, the name in every in-app sentence
IN_APP_STRINGS.signInTagline
PROPOSED_KEYS               // values a dev build runs on that the owner has not confirmed
required('appStoreId')      // throws while it is still {{NIBBLECUE_APP_STORE_ID}}
unconfirmed('appStoreId')   // the raw placeholder, for a dev build to show on screen
```

`IN_APP_STRINGS` is read from `src/inApp.generated.ts`, the listing's `inApp` block copied
verbatim by `tools/gen-app-slices.mjs` (`src/index.test.ts` holds it to the JSON): the app imports
this package, and an imported JSON file is bundled whole, store drafts and all. Edit
`store-listing.json`, then run `node tools/gen-app-slices.mjs --only packages/brand`. The whole
listing, references resolved, is `STORE_LISTING` in `src/listing.ts`, imported by path and never
from the package root.

`brand.test.ts` is the gate (`pnpm test:brand`): the store title fits 30 characters with one to
spare, "Baby Tracker" is never the positioning line, no domain or identifier is typed outside
brand.json, and a proposed value reaches the listing only as a reference that `$meta.waitingOnOwner`
names. `src/index.test.ts` covers the accessor; `src/legal.test.ts` the Terms and the Privacy
Policy; `src/placement.test.ts` and `src/story.test.ts` where the app shows the name.

The store listing is a DRAFT for the owner: see its `$meta`, and each section's `$draft` note.

This package reads nothing else and imports nothing else. It does **not** read, generate or
rewrite bundle ids, application ids, app groups, signing config, OAuth clients or product
ids: those are written once, by a human.
