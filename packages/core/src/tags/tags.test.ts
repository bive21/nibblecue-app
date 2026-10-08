import { describe, expect, it } from 'vitest';
import { BANNED } from '../schedule/foresight.banned';
import { MODULE_BY_ID } from '../modules/module-registry';
import {
  COIN_DESIGNS,
  COIN_TARGETS,
  COINS,
  COINS_ON_SALE,
  OFFERED_COINS,
  OFFERED_PACKS,
  PACK_COPY,
  PACKS_OFFERED,
  RESTOCK,
  TAG_COPY,
  TAG_ID_KEY,
  TAG_ID_LENGTH,
  TAG_SEGMENT,
  coinAction,
  coinFor,
  coinsInPack,
  isCoinTarget,
  isTagId,
  packName,
  parseTagPath,
  STRAIGHT_TO_TIMER,
  TIMER_COINS,
  tagId,
  tagUrl,
} from './tags';

const HOST = 'example.test';

describe('the catalog', () => {
  it('is the twelve coins of the spec, in two packs', () => {
    expect(COINS).toHaveLength(12);
    expect(COINS.map(c => c.sku)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(coinsInPack('core')).toHaveLength(7);
    expect(coinsInPack('extras')).toHaveLength(5);
  });

  /**
   * EACH PACK IS A PRODUCT, and a person reads it by the owner's name (2026-09-26: "only 2 products
   * are being sold: CueCoins Core Pack, and CueCoins Extra Pack" — the second not yet, below): the
   * accessory's name, passed in from brand.json, then the pack's. "Extras pack" is gone from every
   * line a person reads; the id `extras` stays, because only code reads it.
   */
  it('names each pack as the product the shop sells it as', () => {
    expect(PACK_COPY.core.title).toBe('Core Pack');
    expect(PACK_COPY.extras.title).toBe('Extra Pack');
    expect(packName('Coins', 'core')).toBe('Coins Core Pack');
    expect(packName('Coins', 'extras')).toBe('Coins Extra Pack');
    for (const copy of Object.values(PACK_COPY)) {
      expect(`${copy.title} ${copy.lede}`.toLowerCase()).not.toContain('extras');
    }
  });

  /**
   * THE SPEC'S OWN INSTRUCTION: "Confirm every module value above maps to an existing module in
   * the app." Two of the ten do not, and both are deliberate — `restock` is the shopping list,
   * which is not a module at all, and `stash` is a module with a SCREEN rather than a quick-log
   * sheet. Everything else must be a real, quick-loggable module or the coin is unbuildable.
   */
  it('names a real module for every target but the two that are not modules', () => {
    for (const coin of COINS) {
      if (coin.target === RESTOCK) continue;
      const def = MODULE_BY_ID[coin.target];
      expect(def, `coin ${coin.sku} ${coin.name}`).toBeDefined();
      if (coin.target === 'stash') {
        expect(def.quickLog, 'the stash has a screen, not a sheet').toBe(false);
        expect(coinAction(coin.target)).toBe('milk');
      } else {
        expect(def.quickLog, `${coin.target} must be quick-loggable`).toBe(true);
      }
    }
  });

  it('encodes a duplicate identically to its original — the app cannot tell them apart', () => {
    const dupes = COINS.filter(c => c.duplicateOf !== undefined);
    expect(dupes.map(c => c.sku)).toEqual([11, 12]);
    for (const dupe of dupes) {
      const original = COINS.find(c => c.sku === dupe.duplicateOf);
      expect(original, `coin ${dupe.sku}`).toBeDefined();
      expect(dupe.target).toBe(original?.target);
      expect(tagUrl(HOST, dupe.target)).toBe(tagUrl(HOST, original!.target));
    }
    // ten distinct encodings for twelve coins: that is what a production run writes
    expect(COIN_DESIGNS).toHaveLength(10);
    expect(new Set(COIN_DESIGNS.map(c => tagUrl(HOST, c.target))).size).toBe(10);
  });

  it('gives every coin a placement, because a coin that lives nowhere beats nothing', () => {
    for (const coin of COINS) expect(coin.placement.length, coin.name).toBeGreaterThan(3);
  });

  it('sells fewer targets than it answers, so a parent can write their own', () => {
    for (const coin of COINS) expect(isCoinTarget(coin.target), coin.name).toBe(true);
    // bath and medicine are answerable and not in any pack
    expect(isCoinTarget('bath')).toBe(true);
    expect(coinFor('bath')).toBeNull();
    expect(coinFor('diaper')?.sku).toBe(4);
  });

  /**
   * NOT ON SALE, AND NOT SHOWN TO THE PUBLIC, UNTIL THE OWNER SAYS OTHERWISE (2026-09-24: "i just
   * dont want the public to know about this yet"). Selling them is a business decision, not a
   * build setting, so turning this on means editing this line on purpose — with the Terms'
   * section 10 and the sale terms read first (docs/NFC_TAGS.md §8).
   */
  it('is not on sale yet — shown only to a phone that has read a coin', () => {
    expect(COINS_ON_SALE).toBe(false);
  });

  /**
   * THE CORE PACK ONLY, FOR NOW (the owner, 2026-09-26: "I don't want to introduce extra pack yet.
   * Just for. This is maybe for next year."). Offering the Extra Pack is an owner decision, so
   * turning it on means editing this line on purpose — and then its Payment Link, price label and
   * photo slot (docs/NFC_TAGS.md §6).
   */
  it('offers the Core Pack only: the Extra Pack is maybe for next year', () => {
    expect(PACKS_OFFERED).toEqual({ core: true, extras: false });
    expect(OFFERED_PACKS).toEqual(['core']);
    expect(OFFERED_COINS.map(c => c.sku)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  /**
   * WITHHELD FROM SALE AND FROM VIEW, NEVER FROM USE. The five extra coins are the owner's own
   * test tags today (docs/NFC_TAGS.md §0), and a coin is a physical object that outlives a
   * decision about what is sold: each still answers, with its own words.
   */
  it('keeps every coin of a pack that is not offered working', () => {
    for (const coin of COINS.filter(c => !PACKS_OFFERED[c.pack])) {
      expect(isCoinTarget(coin.target), coin.name).toBe(true);
      expect(TAG_COPY[coin.target], coin.name).toBeDefined();
      expect(parseTagPath([TAG_SEGMENT, coin.target], {}), coin.name).toEqual({
        target: coin.target,
        tagId: null,
      });
    }
    expect(COIN_DESIGNS).toHaveLength(10);
  });
});

describe('what a tap does', () => {
  it('routes each target to one of the four shapes', () => {
    expect(coinAction('diaper')).toBe('sheet');
    expect(coinAction('sleep')).toBe('timer');
    expect(coinAction('stash')).toBe('milk');
    expect(coinAction(RESTOCK)).toBe('restock');
  });

  it('makes the four session coins timers, and only those', () => {
    expect([...TIMER_COINS].sort()).toEqual(['breastfeed', 'pump', 'sleep', 'tummy']);
    for (const t of TIMER_COINS) expect(coinAction(t), t).toBe('timer');
  });

  it('starts sleep and tummy time without asking, and opens the sheet for the other two', () => {
    expect([...STRAIGHT_TO_TIMER].sort()).toEqual(['sleep', 'tummy']);
    for (const t of STRAIGHT_TO_TIMER) expect(TIMER_COINS.has(t), t).toBe(true);
    // the two that open their sheet still have to say so, or a parent expects a timer and gets a
    // sheet — and say what the sheet asks now: Start, or Already finished (2026-09-26)
    for (const t of ['breastfeed', 'pump'] as const) {
      expect(STRAIGHT_TO_TIMER.has(t)).toBe(false);
      expect(TAG_COPY[t]?.opens, t).toMatch(/^Opens .*start.*already finished/i);
    }
    // only the feed asks a side; the pump's sides are amounts, entered on the way out
    expect(TAG_COPY.breastfeed?.opens).toMatch(/side/i);
    expect(TAG_COPY.pump?.opens).not.toMatch(/side/i);
  });

  it('tells a parent what a second tap does, for every coin where it does something', () => {
    for (const t of TIMER_COINS) expect(TAG_COPY[t]?.again, t).toBeTruthy();
    expect(TAG_COPY.diaper?.again).toBeUndefined();
  });
});

describe('what goes on a coin', () => {
  it('carries a target and nothing about a family', () => {
    const url = tagUrl(HOST, 'diaper');
    expect(url).toBe('https://example.test/t/diaper');
    // a coin on a wall is readable by ANY phone that comes near it
    for (const leak of ['household', 'child', 'user', 'token', 'key', 'account']) {
      expect(url, leak).not.toContain(leak);
    }
  });

  it('fits a tag many times over', () => {
    const longest = [...COIN_TARGETS].sort((a, b) => b.length - a.length)[0]!;
    expect(tagUrl(HOST, longest).length).toBeLessThan(80);
  });

  it('is https, because a custom scheme is a dead coin on a phone without the app', () => {
    expect(tagUrl(HOST, 'bottle').startsWith('https://')).toBe(true);
  });

  it('reads the host from the caller, never a typed one (CLAUDE.md §1)', () => {
    expect(tagUrl('other.example', 'bottle')).toContain('other.example');
  });

  it('still writes and reads a serial for a run that asks for one', () => {
    expect(tagUrl(HOST, 'bottle', 'b3k9mq')).toBe(
      `https://example.test/t/bottle?${TAG_ID_KEY}=b3k9mq`,
    );
    expect(isTagId('b3k9mq')).toBe(true);
    expect(isTagId('b3k9m')).toBe(false);
    // no vowels and no i/l/o/u, so it cannot spell anything or be misread off a sheet
    const id = tagId(seeded());
    expect(id).toHaveLength(TAG_ID_LENGTH);
    expect(id).not.toMatch(/[aeiou ilou]/);
  });
});

describe('parsing a scanned coin', () => {
  it('reads a target, with or without a serial', () => {
    expect(parseTagPath([TAG_SEGMENT, 'diaper'], {})).toEqual({ target: 'diaper', tagId: null });
    expect(parseTagPath([TAG_SEGMENT, 'diaper'], { i: 'b3k9mq' })).toEqual({
      target: 'diaper',
      tagId: 'b3k9mq',
    });
    expect(parseTagPath([TAG_SEGMENT, 'diaper'], { i: 'NOPE' })).toEqual({
      target: 'diaper',
      tagId: null,
    });
  });

  it('says UNKNOWN rather than guessing, for a coin this build does not answer', () => {
    // a coin outlives a build: a retired target, or a URL read half-way off a damaged coin
    for (const bad of ['vaccine', 'nonsense', '']) {
      expect(parseTagPath([TAG_SEGMENT, bad], {}), bad).toBe('unknown');
    }
    expect(parseTagPath([TAG_SEGMENT], {})).toBe('unknown');
  });

  it('is not a coin at all when the path belongs to something else', () => {
    expect(parseTagPath(['app', 'today'], {})).toBeNull();
    expect(parseTagPath([], {})).toBeNull();
  });
});

describe('the copy', () => {
  it('covers every coin we sell', () => {
    for (const coin of COINS) expect(TAG_COPY[coin.target], coin.name).toBeDefined();
  });

  /**
   * The lines describe the APP and a piece of plastic. None of them may describe the baby, and
   * the list they are held to is the repository's own rather than a second one written here.
   */
  it('claims nothing about a baby (CLAUDE.md §2)', () => {
    for (const copy of Object.values(TAG_COPY)) {
      for (const line of [copy.opens, copy.again ?? '']) {
        for (const phrase of BANNED) expect(line.toLowerCase(), line).not.toContain(phrase);
      }
    }
  });
});

/** A deterministic stand-in for `Math.random`, so the serial test is not a coin flip. */
function seeded(): () => number {
  let n = 1;
  return () => {
    n = (n * 1103515245 + 12345) % 2147483648;
    return n / 2147483648;
  };
}
