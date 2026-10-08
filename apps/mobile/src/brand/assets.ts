/**
 * NibbleCue's artwork, read from the brand package: the mark for the top bar's center and About,
 * the wordmark for sign-in, About and the More footer. Both are PLACEHOLDERS drawn by
 * `tools/brand/placeholder-art.py` until the owner's designs arrive (the owner, 2026-10-08:
 * "you can generate simple tepmorary icons that i will redesign later"); a swap is a change here
 * and in the brand package, and nothing else in the app references an image of the brand.
 */
import mark from '@nibblecue/brand/brand/mark-placeholder.png';
import wordmark from '@nibblecue/brand/brand/wordmark-placeholder.png';
import type { ImageSourcePropType } from 'react-native';

export const MARK_SOURCE: ImageSourcePropType = mark;
/** The placeholder's own 512 × 512 (width / height), so a height picks the width. */
export const MARK_ASPECT = 512 / 512;
export const WORDMARK_SOURCE: ImageSourcePropType = wordmark;
/** The placeholder's own 768 × 192 (width / height), so a height picks the width. */
export const WORDMARK_ASPECT = 768 / 192;
