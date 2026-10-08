/**
 * Every word about the phone's clock while traveling (the owner, 2026-09-23), in one place: the
 * card on Today the first time the phone is somewhere else, the row on More while it is, and the
 * sheet behind the row.
 *
 * A PARENT WHO JUST LANDED IS THE READER. What they need is what moved — the clock, not the log —
 * and the one way to keep home's clock, for the case this rule gets wrong: a parent away from a
 * baby who stayed home. The card is one body line because it shares the banner slot's budget
 * (`screens/today/layout.ts`), so the reassurance is the line and the rest is on the sheet.
 */
import { zoneCity } from '@nibblecue/core';

export const ZONE_COPY = {
  cardTitle: (device: string): string => `${zoneCity(device)} time on this phone`,
  cardBody: 'Your log hasn’t moved. Only the clock has.',
  keepHome: (home: string): string => `Keep ${zoneCity(home)} time`,
  dismiss: 'Dismiss',
  keptToast: (home: string): string => `Showing ${zoneCity(home)} time on this phone`,
  followToast: (device: string): string => `Showing ${zoneCity(device)} time on this phone`,

  rowTitle: 'Time zone',
  rowDetail: (v: { device: string; home: string | null; keepingHome: boolean }): string =>
    v.home === null
      ? `${zoneCity(v.device)} time`
      : v.keepingHome
        ? `${zoneCity(v.home)} time while you’re in ${zoneCity(v.device)}`
        : `${zoneCity(v.device)} time on this phone · home is ${zoneCity(v.home)}`,

  sheetTitle: 'Time zone',
  phone: 'This phone’s time',
  phoneDetail: (device: string): string =>
    `${zoneCity(device)}: times and today’s totals follow the clock where you are`,
  home: 'Home time',
  homeDetail: (home: string): string => `${zoneCity(home)}: for a trip where the baby stayed home`,
  footnote:
    'Only this phone, and only for this trip: at home or on the next trip it follows the phone ' +
    'again. Every entry keeps the moment it happened, and each phone shows it on its own clock.',

  /* The owner, for a family that has MOVED (migration 0107). */
  moved: 'Moved for good?',
  makeHome: (device: string): string => `Make ${zoneCity(device)} home`,
  makeHomeDetail:
    'For everyone in the household: the travel card stops, and reminders from the server follow this clock',
  madeHome: (device: string): string => `${zoneCity(device)} is home now`,
  notOwner: 'Only the household’s owner can change where home is.',
  offline: 'Could not reach the server. Try again when you’re online.',
  unknownZone: 'The server does not know this phone’s time zone, so home stayed where it was.',
} as const;
