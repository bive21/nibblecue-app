/**
 * The schedule engine (docs/SCHEDULE_LOGIC.md — the authority on slot state; NOTIFICATIONS.md
 * §2–§5 for anchors and materialisation). Pure: no clock, no database, no React. The app, the
 * admin console and the materialise function all call these, so a slot can never be DUE on one
 * and MISSED on another. Never re-implement a predicate here in SQL.
 */
export * from './types';
export * from './time';
export * from './repeat';
export * from './sessions';
export * from './start';
export * from './interval';
export * from './fixed';
export * from './cadence';
export * from './today';
export * from './ahead';
export * from './adherence';
// the finished days, counted: the Schedule tab's History page (the owner, 2026-09-30)
export * from './history';
export * from './labels';
// solids at set times as four meals, each a named FIXED rule (2026-09-28)
export * from './meals';
export * from './validate';
export * from './foresight';
export * from './foresight.copy';
export * from './naps';
export * from './napWindow';
export * from './naps.copy';
export * from './napFace';
export * from './naps.local';
export * from './fromLog';
export * from './fromLog.copy';
export * from './longRun';
export * from './wheel';
export * from './duty';
export * from './reminderCopy';
export * from './reminderIdentity';
