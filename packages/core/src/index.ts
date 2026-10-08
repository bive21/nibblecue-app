/**
 * @nibblecue/core — the domain types, the module registry, the plan matrix and the
 * versioned guidance data. Pure TypeScript: no React, no React Native, no Supabase client,
 * nothing from apps/. The schedule engine (WP7) and the stash ledger (WP6) land here and
 * must stay runnable in node, in the admin console and in a worker (CLAUDE.md §5).
 * `src/boundaries.test.ts` fails the build on a forbidden import.
 */
export * from './domain/domain-types';
export * from './modules/module-registry';
export * from './modules/variants';
export * from './plan/entitlements';
export * from './plan/packages';
export * from './plan/plan-status';
export * from './guidance';
export * from './accounts/setup';
export * from './accounts/onboarding';
export * from './accounts/children';
export * from './accounts/invite-code';
export * from './accounts/seats';
export * from './accounts/inviteCard';
export * from './accounts/standing';
export * from './accounts/leave';
export * from './accounts/households';
export * from './tags/tags';
export * from './plan/welcome';
export * from './children/age';
export * from './children/expecting';
export * from './media/childPhoto';
export * from './media/entryPhoto';
export * from './media/memberPicture';
export * from './messages';
export * from './accounts/roles';
export * from './sync';
export * from './today';
export * from './entry';
export * from './solids';
// the Health note (2026-10-08): its words, its look back and its rows on the pediatrician sheet
export * from './wellbeing';
export * from './stash';
export * from './coach';
export * from './search';
export * from './schedule';
export * from './vaccines';
export * from './lists';
export * from './supplies';
export * from './reports';
export * from './import';
// the Huckleberry reader builds on the importer's own module, so it is exported beside it rather
// than from it (the same reason as the keepsake below)
export * from './import/huckleberry';
export * from './patterns';
export * from './tour/steps';
export * from './tour/line';
export * from './tour/decision';
export * from './tour/opening';
export * from './tour/trialList';
export * from './tour/trialEntry';
export * from './celebrations';
// the year's keepsake imports the celebrations module, so it is exported beside it rather than from it
export * from './celebrations/keepsake';
export * from './celebrations/weekReport';
export * from './growth';
export * from './stool';
export * from './widgets';
// what a crash report keeps, and everything taken out of it first (docs/CRASH_REPORTS.md)
export * from './crash';
