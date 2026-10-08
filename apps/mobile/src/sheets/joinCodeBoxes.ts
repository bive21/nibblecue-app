/**
 * THE CODE'S BOXES, MEASURED (`JoinCodeSheet`): six boxes in two threes, as a code is read out
 * ("WDJ-BMA", migration 0144), sized to the phone so all six always fit, and a letter in each that
 * grows with the phone's text size as far as its box has room. Plain numbers, so
 * `joinCodeBoxes.test.ts` walks every phone width and text size against the face the app ships.
 */
import { INVITE_CODE_LENGTH } from '@nibblecue/core';

/** The widest a box grows; below it the six share the phone's width. */
export const BOX_MAX = 46;
/** The least a box shrinks to. Six never reach it on a phone the app supports (320 pt: 38). */
export const BOX_MIN = 28;
/** The box's edge, drawn inside its width. */
export const BOX_EDGE = 1.5;
/**
 * How wide the mono face (`statValue`, IBM Plex Mono SemiBold) sets a capital, in em. The face is
 * monospaced; the test reads the advance out of the TTF the app ships.
 */
export const LETTER_EM = 0.6;

/** The theme's spacing the row is laid out with (`t.space`). */
export interface BoxSpace {
  sm: number;
  md: number;
  xl: number;
  xxl: number;
}

/**
 * One box's width on a phone `width` wide: the sheet's gutter either side (`xxl`) and a margin
 * (`md`), the gaps inside the two threes (`sm`) and the one between them (`xl`), shared six ways.
 */
export function boxWidthFor(width: number, space: BoxSpace): number {
  const gaps = (INVITE_CODE_LENGTH - 2) * space.sm + space.xl;
  const share = Math.floor((width - 2 * space.xxl - 2 * space.md - gaps) / INVITE_CODE_LENGTH);
  return Math.max(BOX_MIN, Math.min(BOX_MAX, share));
}

/** The whole row: six boxes, the gaps inside the threes and the one between them. */
export function rowWidthFor(boxWidth: number, space: BoxSpace): number {
  return INVITE_CODE_LENGTH * boxWidth + (INVITE_CODE_LENGTH - 2) * space.sm + space.xl;
}

/**
 * HOW FAR A LETTER MAY GROW WITH THE PHONE'S TEXT SIZE and stay inside its box (the box's width
 * less its two edges). On every phone from 360 pt it is past the largest size either platform
 * offers, so it changes nothing there; on a 320 pt phone it holds a letter to its box at the very
 * largest, where it would otherwise cross the box's edge.
 */
export function letterScaleCap(boxWidth: number, fontSize: number): number {
  return (boxWidth - 2 * BOX_EDGE) / (fontSize * LETTER_EM);
}
