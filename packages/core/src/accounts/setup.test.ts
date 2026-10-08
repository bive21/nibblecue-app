import { describe, expect, it } from 'vitest';
import { MODULES, type ModuleId } from '../modules/module-registry';
import {
  enabledModuleIds,
  suggestedExtras,
  EXTRA_GROUPS,
  extraGroups,
  FEEDING_CARDS,
  feedingFromModules,
  modulesForFeeding,
  pumpingWithout,
  quickRow,
  stashAskedWithFeeding,
  whatYouTrackRows,
} from './setup';

const ids = (list: readonly { id: ModuleId }[]) => list.map(m => m.id);

describe('step 3 — how is your baby fed (SETUP.md §2)', () => {
  it('maps the four cards to exactly the documented modules', () => {
    expect(FEEDING_CARDS.map(c => [c.id, c.modules])).toEqual([
      ['breast', ['breastfeed']],
      ['pumping', ['pump']],
      ['bottles', ['bottle']],
      ['solids', ['solids']],
    ]);
    // THE STASH IS NOT A WAY OF FEEDING (the owner, 2026-09-21: "at onboarding 'stored milk'
    // should be separated to the 4 module ask"). It was a fifth card for one day; it is a module
    // switch now, and this step asks only how the baby is fed — the Pumping card stopped carrying
    // it on 2026-09-22 too, so no card in this list turns a module on that it does not name.
    expect(FEEDING_CARDS.map(c => c.id)).not.toContain('stored');
    for (const card of FEEDING_CARDS) expect(card.modules).not.toContain('stash');
    expect(FEEDING_CARDS.find(c => c.id === 'pumping')?.hint).not.toMatch(/stash/i);
    expect(FEEDING_CARDS.find(c => c.id === 'solids')?.hint).not.toMatch(/month|week|age/i);
  });

  it('turns on nothing when nothing is selected — the answer is not assumed', () => {
    expect(modulesForFeeding([])).toEqual({ modules: [], bottleSuggested: false });
  });

  it('suggests bottles once for pumping without bottles, then leaves the choice alone', () => {
    const first = modulesForFeeding(['pumping']);
    expect(first.modules).toEqual(['bottle', 'pump']);
    expect(first.bottleSuggested).toBe(true);
    const again = modulesForFeeding(['pumping'], true);
    expect(again.modules).toEqual(['pump']);
    expect(again.bottleSuggested).toBe(false);
    // choosing bottles yourself is not a suggestion
    expect(modulesForFeeding(['pumping', 'bottles']).bottleSuggested).toBe(false);
  });

  it('derives the cards from the flags on read — there is no feeding_method', () => {
    expect(feedingFromModules(['pump', 'stash', 'bottle'])).toEqual(['pumping', 'bottles']);
    // a stash without a pump is NOT a feeding answer any more: donor milk reads back as bottles
    // alone, and the stash it keeps is the step 4 switch
    expect(feedingFromModules(['stash', 'bottle'])).toEqual(['bottles']);
    expect(feedingFromModules(['diaper'])).toEqual([]);
    expect(feedingFromModules(MODULES.map(m => m.id))).toEqual([
      'breast',
      'pumping',
      'bottles',
      'solids',
    ]);
    // round trip: what a selection turns on always reads back as at least that selection
    for (const card of FEEDING_CARDS) {
      expect(feedingFromModules(modulesForFeeding([card.id], true).modules), card.id).toContain(
        card.id,
      );
    }
  });
});

/**
 * THE PUMPING QUESTION (the owner, 2026-09-25: *"if the pumping module is on, but bottles or milk
 * stash is [off], create a confirmation warning as user click 'continue'"*). The rule is a table:
 * pumping on and either partner off asks, naming exactly what is off; everything else is silent.
 */
describe('pumping without bottles or the milk stash', () => {
  const cases: [string, ModuleId[], ReturnType<typeof pumpingWithout>][] = [
    ['pumping with both on', ['bottle', 'pump', 'stash'], null],
    ['bottles off', ['pump', 'stash'], ['bottles']],
    ['the milk stash off', ['bottle', 'pump'], ['stash']],
    ['both off', ['pump'], ['bottles', 'stash']],
    [
      'both off, among everything else',
      ['breastfeed', 'pump', 'diaper', 'sleep'],
      ['bottles', 'stash'],
    ],
    ['no pumping, bottles and stash on', ['bottle', 'stash'], null],
    ['no pumping, both off', ['breastfeed', 'diaper'], null],
    ['nothing on at all', [], null],
  ];
  it.each(cases)('%s', (_name, enabled, want) => {
    expect(pumpingWithout(enabled)).toEqual(want);
  });

  it('names bottles before the stash, the order the page draws them, whatever the input order', () => {
    expect(pumpingWithout(['stash', 'pump'])).toEqual(['bottles']);
    expect(pumpingWithout(['pump', 'diaper'])).toEqual(['bottles', 'stash']);
  });

  it('never asks on the ordinary path: Pumping brings Bottles, and the stash starts on', () => {
    // the suggestion turns bottles on with pumping, and the stash is on for every household
    expect(pumpingWithout(enabledModuleIds(['pumping'], {}))).toBeNull();
    // and only a switch the parent turned off themselves makes it ask
    expect(pumpingWithout(enabledModuleIds(['pumping', 'bottles'], { stash: false }))).toEqual([
      'stash',
    ]);
    expect(pumpingWithout(enabledModuleIds(['breast'], { stash: false }))).toBeNull();
  });
});

describe('step 4 — anything else', () => {
  it('lists the documented groups with the documented suggested defaults', () => {
    // "For mom" went with hydration and self-care on 2026-09-22 (module-registry.ts)
    expect(EXTRA_GROUPS.map(g => g.id)).toEqual(['every_day', 'health', 'when_you_want']);
    const byId = Object.fromEntries(EXTRA_GROUPS.map(g => [g.id, g]));
    // everything for the BABY is on by default (the owner, 2026-09-16): a household that never
    // opened this step still has somewhere to record a fever, a vitamin and a bath
    for (const id of ['every_day', 'health'] as const) {
      expect(byId[id]?.suggested, id).toEqual(byId[id]?.modules);
    }
    // the milk stash is NOT in this step any more: it moved to the feeding page on 2026-09-22,
    // because a stash is milk that was expressed and kept rather than a thing a household might
    // fancy doing this week (`stashAskedWithFeeding`)
    expect(byId.when_you_want?.modules).not.toContain('stash');
    expect(byId.when_you_want?.suggested).toEqual(byId.when_you_want?.modules);
    // and every group is now suggested in full: "For mom" was the one that was not, and it is
    // gone from the product (the owner, 2026-09-22)
    for (const g of EXTRA_GROUPS) expect(g.suggested, g.id).toEqual(g.modules);
  });

  it('drops ids the registry does not carry (supplies is WP6b) and keeps everything else', () => {
    const groups = extraGroups();
    const when = groups.find(g => g.id === 'when_you_want');
    expect(when?.modules).toEqual(['bath', 'tummy']);
    expect(when?.suggested).toEqual(['bath', 'tummy']);
    const listed = new Set(groups.flatMap(g => g.modules));
    for (const m of listed) expect(MODULES.some(r => r.id === m)).toBe(true);
    // every non-feeding registry module is offered somewhere in setup — step 4 for all of them
    // but the milk stash, which is asked on the feeding step instead
    const feeding = new Set(FEEDING_CARDS.flatMap(c => c.modules));
    for (const m of MODULES)
      if (!feeding.has(m.id) && m.id !== 'stash') expect(listed.has(m.id)).toBe(true);
  });

  /**
   * THE MILK STASH IS A SUB-QUESTION OF THE MILK (the owner, 2026-09-22: it *"should not be on
   * 'when you want it', it makes more sense to put it on the how is chiara fed, as a sub-question
   * ... (only shown if pumping is not enable)"*).
   *
   * It has been in three places in three days, so what is pinned here is the RULE rather than the
   * page: whoever asks, the pumping answer moves the DEFAULT and never the availability, and a
   * household can always end up with the answer they gave. `enabledModuleIds` resolving it
   * outside the group loop is the part that would silently break — the switch would write a draft
   * value nothing read, and the household would get an app without the stash they asked for.
   */
  it('asks a non-pumping household and assumes a pumping one, and honors either answer', () => {
    // it is no longer in step 4 at all
    expect(extraGroups().flatMap(g => g.modules)).not.toContain('stash');
    // nor is it a feeding card: `Pumping` is `pump`, and that is the whole card
    expect(FEEDING_CARDS.flatMap(c => c.modules)).not.toContain('stash');
    // ASKED OF EVERYONE, since 2026-09-22: hiding the row from a pumper meant the step had to
    // explain the stash it had turned on unasked, which was a paragraph on the page the owner
    // asked to shorten. A switch that is simply there needs no sentence.
    expect(stashAskedWithFeeding(['breast'])).toBe(true);
    expect(stashAskedWithFeeding(['bottles', 'solids'])).toBe(true);
    expect(stashAskedWithFeeding(['pumping'])).toBe(true);
    expect(stashAskedWithFeeding(['breast', 'pumping'])).toBe(true);
    // on by default for everyone…
    expect(suggestedExtras(['pumping'])).toContain('stash');
    expect(suggestedExtras(['breast'])).toContain('stash');
    expect(enabledModuleIds(['pumping'], {})).toContain('stash');
    expect(enabledModuleIds(['breast'], {})).toContain('stash');
    // …and OFF once they say so, whichever way they feed
    expect(enabledModuleIds(['pumping'], { stash: false })).not.toContain('stash');
    expect(enabledModuleIds(['breast'], { stash: false })).not.toContain('stash');
  });

  /**
   * EVERYTHING THE STEP OFFERS IS ON (the owner, 2026-09-22: "in onboarding all modules needs to
   * automatically be turned on, i see temperature was not initially selected"). Growth and
   * temperature used to be held back by `QUICK_ROW_PADDING` and added only when the feeding
   * answer left the Log row short of six — so how many ways a household feeds decided whether it
   * could record a fever. The only things off now are the feeding cards nobody chose.
   */
  it('applies the suggested defaults unless the parent chose otherwise', () => {
    const defaults = enabledModuleIds(['breast'], {});
    expect(defaults).toEqual([
      'breastfeed',
      'diaper',
      'sleep',
      'med',
      'growth',
      'temp',
      'tummy',
      'bath',
      'vaccine',
      // the Health note, on with the health record (2026-10-08)
      'wellbeing',
      'stash',
    ]);
    expect(defaults).not.toContain('solids');
    expect(defaults).not.toContain('bottle');
    const changed = enabledModuleIds(['breast'], { diaper: false, med: false });
    expect(changed).not.toContain('diaper');
    expect(changed).not.toContain('med');
    expect(changed).toContain('sleep');
  });

  /**
   * SIX LOG TILES, OR THREE (the owner, 2026-09-21). The Log row is the feeding answer plus
   * diaper and sleep; it is padded to six with growth, then temperature; one way of feeding
   * stays at three, one row, unpadded.
   */
  /**
   * THE ROW IS NO LONGER WHAT DECIDES WHAT IS ENABLED (2026-09-22) — growth and temperature are
   * on for everyone, so they are in the row for everyone and the filter below is what isolates
   * the FEEDING answer's own shape, which is the thing this test is about.
   */
  it('puts the feeding answer plus diaper and sleep in the Log row', () => {
    const row = (feeding: Parameters<typeof enabledModuleIds>[0]) =>
      quickRow(enabledModuleIds(feeding, {})).filter(
        m => !['med', 'tummy', 'bath', 'growth', 'temp'].includes(m),
      );
    // four ways of feeding: already six, nothing added
    expect(row(['breast', 'bottles', 'pumping', 'solids'])).toEqual([
      'bottle',
      'breastfeed',
      'pump',
      'diaper',
      'sleep',
      'solids',
    ]);
    expect(row(['breast', 'bottles', 'solids'])).toEqual([
      'bottle',
      'breastfeed',
      'diaper',
      'sleep',
      'solids',
    ]);
    expect(row(['breast', 'bottles'])).toEqual(['bottle', 'breastfeed', 'diaper', 'sleep']);
    // pumping alone suggests bottles too
    expect(row(['pumping'])).toEqual(['bottle', 'pump', 'diaper', 'sleep']);
    // one way of feeding: three
    expect(row(['breast'])).toEqual(['breastfeed', 'diaper', 'sleep']);
    expect(row(['bottles'])).toEqual(['bottle', 'diaper', 'sleep']);
    expect(row(['solids'])).toEqual(['diaper', 'sleep', 'solids']);
    // and the two are suggested for every household now, whatever the feeding answer, with the
    // parent's own switch always winning over the suggestion
    expect(suggestedExtras(['breast']).has('growth')).toBe(true);
    expect(suggestedExtras(['breast']).has('temp')).toBe(true);
    expect(suggestedExtras(['breast', 'bottles']).has('temp')).toBe(true);
    expect(enabledModuleIds(['breast'], { growth: false })).not.toContain('growth');
    expect(enabledModuleIds(['breast', 'bottles'], { temp: false })).not.toContain('temp');
  });

  it('returns modules in registry order, never in selection order', () => {
    const out = enabledModuleIds(['solids', 'bottles', 'breast'], {
      water: true,
      diaper: true,
    });
    const order = ids(MODULES);
    expect(out).toEqual(order.filter(id => out.includes(id)));
  });
});

/*
  The step that showed "that is your app" — what is on, what is off, the Quick row as it would
  appear — left setup on 2026-09-22 (cb6ad81), and its summary builder went on 2026-09-27. What it
  read is still what setup builds, so the two facts it showed are held on the live functions.
*/
describe('what setup builds', () => {
  it('a Quick row of enabled quick-log modules only', () => {
    const quick = quickRow(ids(MODULES));
    expect(quick.every(id => MODULES.find(m => m.id === id)?.quickLog)).toBe(true);
    // the row lists what is quick-loggable; the two with screens of their own never appear
    expect(quick).not.toContain('vaccine');
    expect(quick).not.toContain('stash');
  });

  it('the feeding read back from the modules, with the stash a module and not a card', () => {
    const enabled = enabledModuleIds(['pumping'], {});
    // the bottle suggestion shows up as a selected card; the stash pumping brings is a module
    // rather than a card, so it is on and not in the feeding
    expect(feedingFromModules(enabled)).toEqual(['pumping', 'bottles']);
    expect(enabled).toContain('stash');
    expect(enabled).not.toContain('breastfeed');
  });
});

describe('what a toggle actually does (SETUP.md §4)', () => {
  it('tells the returning parent what is kept, on every row', () => {
    const rows = whatYouTrackRows(['breastfeed', 'diaper'], {
      breastfeed: 111,
      pump: 14,
      diaper: 1,
    });
    const by = Object.fromEntries(rows.map(r => [r.module, r]));
    expect(rows).toHaveLength(MODULES.length);
    expect(by.breastfeed?.detail).toBe('111 entries kept · quick log');
    expect(by.diaper?.detail).toBe('1 entry kept · quick log');
    expect(by.pump).toMatchObject({
      enabled: false,
      entries: 14,
      detail: '14 entries kept, back if you turn this on',
    });
    expect(by.sleep).toMatchObject({ enabled: false, entries: 0, detail: 'Nothing logged yet' });
    expect(by.growth?.label).toBe('Growth');
  });
});
