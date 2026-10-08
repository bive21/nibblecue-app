/**
 * The milk stash's pure half (docs/MILK_STASH.md): guidance dates from the versioned profile,
 * the §6b ranking with its reasons, the use-first net, the split arithmetic, the weekly
 * balance and the dashboard buckets. No clock, no database, no React — the app's data layer
 * and the admin console call the same functions and cannot disagree.
 */
export * from './constants';
export * from './guidance';
export * from './format';
export * from './ranking';
export * from './overview';
export * from './split';
export * from './balance';
export * from './defaults';
export * from './outlook';
export * from './legend';
export * from './notify';
