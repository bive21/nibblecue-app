import { DEFAULT_APPEARANCE, DEFAULT_AUTO_DARK } from '@nibblecue/ui/appearance';
import { describe, expect, it } from 'vitest';
import { memoryStore, survivesSignOut } from '../prefs';
import { APPEARANCE_KEY, loadAppearance, saveAppearance } from './prefs';

describe('the appearance choice on the device (R-5)', () => {
  it('round-trips, survives a sign-out, and parses whatever an old client left behind', async () => {
    const store = memoryStore();
    expect(await loadAppearance(store)).toEqual(DEFAULT_APPEARANCE);
    const chosen = {
      theme: 'night',
      scheme: 'ocean',
      skin: 'glass',
      tabs: 'rounded',
      shape: 'bubble',
      logSlider: true,
      // the evening dim follows the household's own bed time, which is the answer that has to
      // survive a sign-out as much as the color does: it is a device preference, not a fact
      // about the baby
      autoDark: { mode: 'bedtime', from: '20:00', to: '07:00', theme: 'night' },
      // and how still this phone keeps (2026-09-28): this phone's, so it survives a sign-out too
      calmMotion: 'always',
      calmMotionChosen: true,
    } as const;
    await saveAppearance(store, chosen);
    expect(await loadAppearance(store)).toEqual(chosen);
    expect(survivesSignOut(APPEARANCE_KEY)).toBe(true);
    // a blob from an older client: `lavender` is a scheme that no longer exists and falls back
    // per field. `soft` is NOT a skin any more (removed 2026-09-18), so it falls back like
    // any other unrecognised stored value — which is the path this test exists to prove.
    // It also predates `logSlider`, and a household that was never asked gets the wrapping grid,
    // which is the whole of the owner's decision (2026-09-18) and not only a new-install default.
    await store.set(APPEARANCE_KEY, '{"theme":"dark","scheme":"lavender","skin":"soft"}');
    expect(await loadAppearance(store)).toEqual({
      ...DEFAULT_APPEARANCE,
      theme: 'dark',
      skin: DEFAULT_APPEARANCE.skin,
    });
    expect((await loadAppearance(store)).logSlider).toBe(false);
    // ...and it predates the evening dim too, so nothing dims itself until a parent says so
    expect((await loadAppearance(store)).autoDark).toEqual(DEFAULT_AUTO_DARK);
    // ...and Calm motion: a phone that was never asked moves as designed, like a new one
    expect((await loadAppearance(store)).calmMotion).toBe('off');
    // AND A STORED TAB POLICY IS OVERRULED, not merely defaulted. The setting was removed on
    // 2026-09-18 ("all labels 0 tab labels"); a household that had chosen "Icons only" would
    // otherwise come back to an unlabeled bar with no control left to change it.
    await store.set(APPEARANCE_KEY, '{"tabs":"icons"}');
    expect((await loadAppearance(store)).tabs).toBe('rounded');
    await store.set(APPEARANCE_KEY, '{not json');
    expect(await loadAppearance(store)).toEqual(DEFAULT_APPEARANCE);
  });

  /**
   * THE 2026-09-27 CHANGE, AS A PHONE MEETS IT (the owner: *"i dont think i want to enable match
   * phone, let users decide it for themselves"*, and the default color moving from Reef to Ocean,
   * with Sage and Clay retired). The first frame paints whatever this read returns, so this is
   * where "a new install starts on Light" and "an old install never crashes" are true or not.
   */
  it('opens a new install on Light and Sunny (NibbleCue’s default), and an old one on everything it chose that still exists', async () => {
    const fresh = await loadAppearance(memoryStore());
    expect(fresh.theme).toBe('light');
    expect(fresh.theme).not.toBe('system'); // the Match phone switch reads `theme === 'system'`
    expect(fresh.scheme).toBe('sunny');

    const store = memoryStore();
    for (const retired of ['sage', 'clay', 'twilight']) {
      await store.set(
        APPEARANCE_KEY,
        JSON.stringify({ theme: 'system', scheme: retired, skin: 'glass', shape: 'bubble' }),
      );
      // the retired color falls back to the default; the rest is the household's, untouched —
      // Match phone included, because a parent who turned it on chose it
      expect(await loadAppearance(store), retired).toEqual({
        ...DEFAULT_APPEARANCE,
        theme: 'system',
        // the default, which is NibbleCue's Sunny (CuddleCue's falls back to Ocean)
        scheme: 'sunny',
        skin: 'glass',
        shape: 'bubble',
      });
    }
    // Reef was the default and is still a scheme: a phone that stored it keeps it
    await store.set(APPEARANCE_KEY, '{"scheme":"reef"}');
    expect((await loadAppearance(store)).scheme).toBe('reef');
  });
});
