/**
 * NibbleCue's emails, as far as this package owns them: the `email` block of store-listing.json.
 *
 * CuddleCue's version of this file tested tools/email/auth-emails.mjs, which makes the six emails
 * Supabase Auth sends (confirm sign up, reset password and the rest) and pushes them to a
 * project. NibbleCue has no server of its own: it signs in to CuddleCue's Supabase projects
 * (docs/SERVER.md), one project has one set of those templates, and the tool that makes them
 * lives in the CuddleCue repository. So those tests stay there, and the question of whose name the
 * shared sign-in mail carries is recorded for the owner in `email.$authNote`.
 *
 * What is held here: every brand value an email uses comes from brand.json, the sender is the
 * studio's decided address, the templates are only ones NibbleCue could send (no trial mail,
 * because NibbleCue has no welcome trial), and the words follow the app's voice (no dashes, US
 * English, nothing about a baby's health).
 */
import { describe, expect, it } from 'vitest';
import brand from '../brand.json';
import listing from '../store-listing.json';
import { BRAND } from './index';
import { STORE_LISTING } from './listing';

const D = brand.decided;
const email = STORE_LISTING.email;
/** The lines a reader sees: every value that is not a `$` note. */
const words = [email.fromName, email.headerWordmark, email.footerLine];

describe('the email block', () => {
  it('names NibbleCue, read from brand.json, and never CuddleCue', () => {
    expect(email.fromName).toBe(D.appDisplayName);
    expect(email.headerWordmark).toBe(D.appDisplayName);
    expect(email.footerLine).toContain(D.appDisplayName);
    for (const line of words) expect(line).not.toMatch(/CuddleCue/);
  });

  it('sends from the studio’s decided address, on the decided host', () => {
    // the sending address is decided (the studio's, shared with CuddleCue); it is never typed in
    // the listing, which names only the from NAME
    expect(D.transactionalFromAddress.endsWith(`@${D.universalLinkHost}`)).toBe(true);
    expect(JSON.stringify(listing)).not.toContain(D.transactionalFromAddress);
  });

  it('lists only mail NibbleCue could send: no trial mail, no sign-in mail', () => {
    expect(email.templates.length).toBeGreaterThan(0);
    expect(new Set(email.templates).size).toBe(email.templates.length);
    for (const t of email.templates) {
      expect(t).toMatch(/^[a-z]+(-[a-z]+)*$/);
      // NibbleCue has no welcome trial (2026-10-08)
      expect(t).not.toMatch(/trial/);
    }
    // the sign-in mail is the shared server's (CuddleCue's tool), not a NibbleCue template
    for (const shared of ['verify-email', 'reset-password', 'caregiver-invite'])
      expect(email.templates).not.toContain(shared);
  });

  it('records, for the owner, whose name the shared sign-in mail carries', () => {
    expect(listing.email.$authNote).toMatch(/^OWNER QUESTION\./);
    expect(listing.email.$authNote).toContain('Supabase');
  });

  it('carries no address, URL or legal name typed in its words', () => {
    for (const line of words) {
      expect(line).not.toContain(BRAND.universalLinkHost);
      expect(line).not.toContain(BRAND.legalEntity);
      expect(line).not.toMatch(/https?:|@/);
    }
  });
});

describe('the words', () => {
  it('have no dashes and no " - " between words, as the app’s copy does not', () => {
    for (const line of words) {
      expect(line).not.toMatch(/[‒–—―]/);
      expect(line).not.toMatch(/ - /);
    }
  });

  it('are US English', () => {
    const british = /\b(colour|favourite|cancelled|organis|recognis|licence|centre|grey)\b/i;
    for (const line of words) expect(line).not.toMatch(british);
  });

  it('never give advice or claims about a baby: these are account emails only', () => {
    for (const line of words)
      expect(line).not.toMatch(/\b(feed|sleep|diaper|health|doctor|medical|allerg\w*|reaction)\b/i);
  });
});
