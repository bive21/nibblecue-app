/**
 * @nibblecue/ui — the design system (docs/DESIGN_SYSTEM.md). Tokens and the three themes,
 * the six schemes and the three skins as one resolver; the icon set at explicit sizes; the
 * component inventory reading tokens through useTheme(). No component contains a hex
 * literal (eslint enforces it); a token change repaints the whole app.
 */
export * from './theme/theme';
export * from './theme/skins';
export * from './theme/appearance';
export * from './theme/contrast';
export * from './theme/places';
export * from './theme/accent';
export * from './theme/useAccent';
export * from './theme/ground';
export * from './theme/glow';
export * from './theme/artInk';
export * from './theme/sky';
export * from './theme/napOutlookMarks';
export * from './theme/bottle';
export * from './theme/bath';
export * from './theme/diaper';
export * from './theme/stool';
export * from './theme/diaperKinds';
export * from './theme/timerMotion';
export * from './theme/ruler';
export * from './theme/typedBox';
export * from './theme/moduleButton';
export * from './theme/moduleAccent';
export * from './theme/milkContainers';
export * from './theme/ThemeProvider';
export * from './feedback/haptics';
// the one rule for how choosing one of a few feels, for a choice the app draws itself (setup's role)
export * from './feedback/choice';
export * from './icons/paths';
export * from './icons/illustrated';
export * from './icons/Icon';
export * from './components/core';
export * from './components/today';
export * from './components/overlays';
export * from './components/chrome';
/*
  `design-tokens.json` IS NOT RE-EXPORTED HERE (2026-09-26, the owner: "remove any unused assets
  from the app"). Nothing read `designTokens`, and every screen imports this index, so the JSON
  rode into the bundle on the export alone: Metro bundles what a module requires, read or not.
  `theme.ts` is the runtime copy. The JSON stays for its test and the contrast gate, and a caller
  that ever needs it imports `@nibblecue/ui/design-tokens.json` (package.json exports it).
*/
