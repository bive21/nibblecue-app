/**
 * The whole store listing, references resolved: the App Store and Play drafts, the website's and
 * the emails', and the app's own strings. Generated into the consoles by a human at release time.
 *
 * NOT EXPORTED FROM THE PACKAGE ROOT, on purpose (2026-09-26). The app imports `@nibblecue/brand`,
 * Metro bundles an imported JSON file whole, and the app renders one block of this one — `inApp`,
 * which `index.ts` reads from its generated copy (`inApp.generated.ts`, `tools/gen-app-slices.mjs`).
 * Whatever needs the rest imports this file by its path.
 */
import listing from '../store-listing.json';
import { resolveBrandRefs } from './index';

export const STORE_LISTING = resolveBrandRefs(listing);
