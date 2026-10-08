/**
 * The growth prompts' app half. The engine is tested in core; what is tested here is the wiring
 * that could let a prompt through when it should not — the guards on the platform module, the
 * append-only log, the rating ask's own rules and the card's, read as source.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { memoryStore } from '../prefs';
import { GROWTH_COPY } from './copy';
import {
  growthRecord,
  GROWTH_ERROR_KEY,
  GROWTH_KEY,
  loadErrorSeen,
  loadGrowthEvents,
  recordErrorSeen,
  recordGrowthEvent,
} from './store';
import { requestReview, resetReviewModuleForTests, reviewAvailable } from './storeReview';
import { GROWTH_SWITCHES } from './switches';
import { arrivedMs, celebrationEarned } from './arrived';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string): string => readFileSync(join(here, p), 'utf8');

/**
 * A scan for a forbidden word has to read the CODE, not the paragraph explaining why the word is
 * forbidden. Every file in this folder says in its header that it never draws a star and never
 * asks "do you like the app?" first, and a scan that counted those sentences would fail on the
 * documentation of its own rule. `placement.test.ts` strips comments for the same reason.
 */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[^]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const card = read('GrowthCard.tsx');
const hook = read('useGrowthPrompt.ts');
const arrived = read('arrived.ts');
const cardCode = withoutComments(card);
const hookCode = withoutComments(hook);
const flat = card.replace(/\s+/g, ' ');
const hookFlat = hookCode.replace(/\s+/g, ' ');

const NOW = Date.UTC(2026, 8, 17, 12, 0);

describe('the log the caps are read from', () => {
  it('appends and never rewrites: a dismissal is a row', async () => {
    const store = memoryStore();
    await recordGrowthEvent(store, growthRecord('REVIEW', 'IMPRESSION', NOW));
    await recordGrowthEvent(store, growthRecord('REVIEW', 'DISMISS', NOW + 1000));
    const rows = await loadGrowthEvents(store);
    expect(rows.map(r => r.event)).toEqual(['IMPRESSION', 'DISMISS']);
  });

  it('carries the campaign on a promo row, so "once per campaign" can be read back', async () => {
    const store = memoryStore();
    await recordGrowthEvent(store, growthRecord('PROMO', 'IMPRESSION', NOW, 'campaign-1'));
    expect((await loadGrowthEvents(store))[0]?.campaignId).toBe('campaign-1');
  });

  /**
   * A corrupt log reads as NO history, which restarts every cap. That is the safe direction to
   * fail in: the worst case is an extra fortnight of silence, never an extra ask.
   */
  it('reads a corrupt log as no history, which delays a prompt rather than releasing one', async () => {
    const store = memoryStore({ [GROWTH_KEY]: '{not json' });
    expect(await loadGrowthEvents(store)).toEqual([]);
  });
});

describe('the platform review module, on a build that does not have it', () => {
  it('reports unavailable instead of throwing, which is the crash this guard exists for', async () => {
    resetReviewModuleForTests();
    // node has no native side for `expo-store-review`, so the lookup fails — exactly the shape of
    // a build without it, which is what an over-the-air bundle on an older binary would meet
    expect(await reviewAvailable()).toBe(false);
    expect(await requestReview()).toBe('unavailable');
  });

  it('never resolves to anything about what a person did with the prompt', async () => {
    const outcome = await requestReview();
    expect(['requested', 'unavailable', 'failed']).toContain(outcome);
    expect(withoutComments(read('storeReview.ts'))).not.toMatch(/\brated\b|\bstars?\b|didRate/i);
  });
});

/**
 * THE RATING ASK IS THE PLATFORM'S PROMPT, AND NO CARD COMES BEFORE IT (§2.3, 2026-09-28). Google's
 * in-app review guidelines: "Your app shouldn't ask the user any questions before or while
 * presenting the rating button or card, including questions about their opinion (such as 'Do you
 * like the app?')", and "you should not have a call-to-action option (such as a button) to trigger
 * the API". Apple says the same of a button. The app's old card did both.
 */
describe('the rating ask: the platform’s prompt, and nothing of the app’s own before it', () => {
  it('draws no card: the card has no review branch, and the hook never hands it REVIEW', () => {
    expect(cardCode).not.toContain('REVIEW');
    expect(cardCode).not.toContain('requestReview');
    expect(cardCode).not.toContain('growth.review');
    expect(hookFlat).toContain("setShown(decision.show === 'REVIEW' ? null : decision.show);");
  });

  it('calls the platform only from the moment, never from a button', () => {
    expect(hookCode).toContain('reviewMomentMayAsk({');
    expect(hookCode.match(/requestReview\(\)/g)).toHaveLength(1);
    // no pressable anywhere near it: the ask is an effect, not a control
    for (const control of ['onPress', 'Button', 'Pressable']) {
      expect(hookCode, control).not.toContain(control);
    }
  });

  it('writes the ask down before making it, so a kill can lose one but never double one', () => {
    const wrote = hookCode.indexOf("growthRecord('REVIEW', 'IMPRESSION', now)");
    const asked = hookCode.indexOf('await requestReview()');
    expect(wrote).toBeGreaterThan(0);
    expect(wrote).toBeLessThan(asked);
  });

  it('records what the platform did with the request, and never counts it as a rating', () => {
    expect(hookFlat).toContain("outcome === 'requested' ? 'PLATFORM_SHOWN' : 'PLATFORM_SKIPPED'");
    for (const claim of ['ACCEPT', 'rated', 'didRate']) {
      expect(hookCode.slice(hookCode.indexOf('reviewMomentMayAsk({')), claim).not.toContain(
        `'REVIEW', '${claim}'`,
      );
    }
  });

  it('never asks "do you like the app?" anywhere — both stores read that as manipulation', () => {
    const all = `${JSON.stringify(GROWTH_COPY)} ${cardCode} ${hookCode}`.toLowerCase();
    for (const pre of ['do you like', 'enjoying', 'are you happy', 'glad it', 'thumbs']) {
      expect(all, pre).not.toContain(pre);
    }
  });

  it('counts anything else going on as busy: a sheet, the tour, a timer, Today not in front', () => {
    expect(hookFlat).toContain('!awake || openKind !== null || timers.length > 0 ||');
    expect(hookFlat).toContain("(tour !== null && (tour.phase !== 'off' || tour.guide !== null))");
  });
});

/**
 * CuddleCue's More ends on *Rate us* and *Tell a friend*; NibbleCue's More does not draw them yet
 * (its footer is the version line only), so the checks of those two links are not here. The
 * words they would say are still held, for the day they come back.
 */
describe('the Rate us and Tell a friend words', () => {
  it('never draws a star, never mentions five, never says please', () => {
    const words = [
      GROWTH_COPY.rate.link,
      GROWTH_COPY.rate.whereAndroid,
      GROWTH_COPY.rate.whereIos,
      GROWTH_COPY.rate.failed,
      GROWTH_COPY.share.link,
      GROWTH_COPY.share.message('An app', 'A quiet line.', 'https://example.test/get/'),
    ].join(' ');
    for (const banned of ['star', 'five', '5-star', 'please']) {
      expect(words.toLowerCase(), banned).not.toContain(banned);
    }
  });
});

/**
 * THE MOMENT MUST HAVE BEEN A GOOD ONE, and since 2026-09-28 every closed card is one: the weekly
 * summary's numbers are free on every plan (the owner: "the numbers free, with 'compared with last
 * week' as Plus"), so no household closes a card of dashes any more, and the plan is not asked.
 */
describe('which closed card earns the ask', () => {
  it('counts a card once it was answered, whatever its kind and whatever the plan', () => {
    expect(celebrationEarned({ open: false, answered: true })).toBe(true);
  });

  it('waits while a card is still up, and says no before one was answered', () => {
    expect(celebrationEarned({ open: true, answered: true })).toBe(false);
    expect(celebrationEarned({ open: false, answered: false })).toBe(false);
  });
  // (CuddleCue's Today hands the slot its moment; NibbleCue mounts no growth card)
});

describe('the card’s own rules', () => {
  it('is a card in the banner slot, dismissible in one tap, never a modal', () => {
    expect(card).toContain('<Card testID="growth.promo">');
    expect(card).toContain('testID="growth.promo.dismiss"');
    for (const modal of ['Modal', 'BottomSheet', 'Alert.alert']) {
      expect(cardCode, modal).not.toContain(modal);
    }
  });

  it('cannot render cross-promotion without a campaign', () => {
    expect(flat).toContain('if (campaign === null) return null;');
    expect(hook).toContain('export const NO_CAMPAIGN: PromoCampaign | null = null;');
  });

  it('opens the other app OUTSIDE this one, and installs nothing from in here', () => {
    expect(card).toContain('Linking.openURL(url)');
    for (const inApp of ['WebView', 'InAppBrowser', 'purchase']) {
      expect(cardCode, inApp).not.toContain(inApp);
    }
  });

  it('labels the promo as the maker’s, so it never reads as an advertisement', () => {
    expect(GROWTH_COPY.promo.from('A Studio')).toBe('From A Studio');
  });
});

describe('what the hook refuses to assume', () => {
  /**
   * THE RATING ASK IS LIT, AND ONLY IT (the owner, 2026-09-28: "Do we want the occasional rate on
   * playstore or app store until user actually rates us? If so, add this"). The promo has no
   * campaign and the extra upgrade card no design, so both stay dark; every rule the ask must earn
   * is `decide`'s, unchanged, and tested in core.
   */
  it('lights the rating ask alone, from one constant', () => {
    expect(GROWTH_SWITCHES).toEqual({ review: true, promo: false, upgrade: false });
    expect(hook).toContain('flags: { ...GROWTH_SWITCHES },');
  });

  it('says nothing at all until the history and the account have loaded', () => {
    expect(hook).toContain("return { show: null as GrowthKind | null, because: 'not ready' };");
  });

  it('treats a running timer as busy, and night mode as night', () => {
    expect(hook).toContain('busy: timers.length > 0');
    expect(hook).toContain("night: resolved.theme === 'night'");
  });

  /**
   * NEVER WITHIN A DAY OF AN ERROR THE PARENT SAW (§1). The sync banner is that error; the moment it
   * rises is written down, so the day holds across a restart too.
   */
  it('keeps quiet for a day after the sync banner, even across a restart', async () => {
    expect(hookFlat).toContain('const bannerUp = useSyncBanner() !== null;');
    expect(hookFlat).toContain('void recordErrorSeen(prefsStore, now);');
    expect(hookFlat).toContain('lastErrorMs,');
    const store = memoryStore();
    expect(await loadErrorSeen(store)).toBeNull();
    await recordErrorSeen(store, NOW);
    expect(await loadErrorSeen(store)).toBe(NOW);
    expect(await loadErrorSeen(memoryStore({ [GROWTH_ERROR_KEY]: 'nonsense' }))).toBeNull();
  });

  it('answers the caregiver signal no rather than guessing it', () => {
    expect(hook).toContain('hasSecondCaregiver: false');
  });

  it('spends a card’s budget on the OUTCOME, not on the render', () => {
    // a card the parent never saw must not cost them a fortnight of silence
    expect(hook).toContain("growthRecord(kind, 'IMPRESSION', now, campaignId)");
    expect(hook.indexOf('const resolve')).toBeLessThan(
      hook.indexOf("growthRecord(kind, 'IMPRESSION', now, campaignId)"),
    );
  });

  /**
   * THE DAY THE PARENT ARRIVED, NEVER THE BABY'S BIRTHDAY. Until 2026-09-28 the account's age was
   * the oldest child's birth date, which made a day-old account as old as the baby: no rule that
   * waits for the account to age could hold for a baby born before the sign-up.
   */
  it('measures the account from the day the parent joined, then the day the household began', () => {
    const at = (joined: string | null, began: string | null) =>
      arrivedMs({
        serverNow: NOW,
        memberships: [
          {
            household_id: 'h',
            household_name: 'Home',
            role: 'OWNER',
            welcome_expires_at: null,
            heard_from: null,
            home_time_zone: null,
            household_created_at: began,
            joined_at: joined,
            welcome_waits_for_birth: false,
          },
        ],
      });
    expect(at('2026-09-10T08:00:00Z', '2026-09-01T08:00:00Z')).toBe(
      Date.parse('2026-09-10T08:00:00Z'),
    );
    expect(at(null, '2026-09-01T08:00:00Z')).toBe(Date.parse('2026-09-01T08:00:00Z'));
    // with neither, the account is new this minute, which shows nothing
    expect(at(null, null)).toBe(NOW);
    expect(arrivedMs({ serverNow: NOW, memberships: [] })).toBe(NOW);
    expect(withoutComments(arrived)).not.toContain('birth_date');
    expect(hookCode).toContain('accountCreatedMs: arrivedMs(account),');
  });
});
