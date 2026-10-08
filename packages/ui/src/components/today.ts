/**
 * The Today cards (docs/DESIGN_SYSTEM.md §5, §16, §20, §23.2): the running timer and its stop
 * button, the stat cells, the Quick row in its four shapes, the NEXT card, the timeline row and
 * the report chart — plus the pure helpers behind them.
 *
 */
export * from './timeFormat';
export * from './chartLayout';
export * from './StopButton';
export * from './TimerCard';
// the running timers as one stack: the card, then "Also running" (the owner, 2026-09-26)
export * from './timerStack';
export * from './AlsoRunning';
export * from './ModuleDisc';
export * from './StatCard';
export * from './StatTable';
// the table's arithmetic: every line one line, drawn smaller rather than wrapped (2026-09-26)
export * from './statTable';
export * from './SummaryRow';
export * from './QuickAction';
// the tile's count that rolls when it rises; its numbers stay in `countRoll.ts`
export * from './RollingCount';
export * from './quickLine';
export * from './QuickRow';
export * from './quickScale';
export * from './TimerArt';
export * from './TimerMotion';
export * from './NextCard';
export * from './TimelineItem';
export * from './NameTag';
export * from './Chart';
export * from './DayBars';
// Reports' first look: bars that rise and figures that count up, once a session per card
export * from './reportReveal';
export * from './useRevealProgress';
export * from './CountUp';
// Reports' lead cards (2026-09-26): a day as a strip, a small bar with its number written on it,
// and the big number's own width — each with its arithmetic in a pure file beside it
export * from './DayStrip';
export * from './NumberBars';
export * from './leadFigure';
export * from './wheelGeometry';
export * from './ScheduleWheel';
// today's ring only: the clock hand at now
export * from './wheelHand';
export * from './WheelHand';
// the Schedule's day (2026-09-26): the line at now, the next slot's breathing dot, a slot turning done
export * from './scheduleMotion';
export * from './NowLine';
export * from './SoonDot';
