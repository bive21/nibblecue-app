/**
 * EVERY SENTENCE ON NIBBLECUE'S OWN SCREENS, held to the studio's voice (bpnc-studio
 * product-and-design.md): no banned phrase (core's `NIBBLE_BANNED`: no diagnosis, no "normal", no
 * "not enough", no doses), no dash in a sentence, US English, a capital letter first. The words are
 * read from `copy.ts` (functions called with sample values), from setup's and Help's copy files,
 * and from any literal label or title left in a screen file, so a sentence typed straight into a
 * screen is held to the same rules.
 */
import { bannedIn } from '@nibblecue/core/nibble';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HELP } from '../../sheets/helpCopy';
import { ONBOARD_YOU } from '../onboarding/copy';
import * as copy from './copy';

const UK =
  /\b(colour|favourite|flavour|fibre|yoghurt|diarrhoea|mum|centre|organise|realise|programme)/i;
const DASH = /\s[-–—]\s|—|–/;
const SAMPLE = ['Egg', 'Tuesday', 'Sam'];

function strings(v: unknown, out: string[]): void {
  if (typeof v === 'string') out.push(v);
  else if (typeof v === 'function') {
    const fn = v as (...a: unknown[]) => unknown;
    // a sentence with a number in it, and with a name in it
    for (const args of [[2, 3], [1, 1], SAMPLE]) {
      try {
        strings(fn(...args), out);
      } catch {
        /* a function that does not take these is read with the next sample */
      }
    }
  } else if (Array.isArray(v)) v.forEach(x => strings(x, out));
  else if (v !== null && typeof v === 'object') Object.values(v).forEach(x => strings(x, out));
}

const HERE = new URL('.', import.meta.url).pathname;
/** `label="…"`, `title="…"`, `body="…"`, `detail="…"`, `summary="…"` typed into a screen file. */
function literalsInScreens(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  for (const f of readdirSync(HERE).filter(n => n.endsWith('.tsx'))) {
    const src = readFileSync(join(HERE, f), 'utf8');
    for (const m of src.matchAll(/\b(label|title|body|detail|summary)="([^"]+)"/g))
      out.push({ file: f, text: m[2] ?? '' });
  }
  return out;
}

const all = (): string[] => {
  const out: string[] = [];
  strings(copy, out);
  strings(ONBOARD_YOU, out);
  strings(HELP, out);
  return out.filter(s => s.trim() !== '');
};

describe('NibbleCue’s screen words', () => {
  it('never use a banned phrase, a sentence dash or UK spelling', () => {
    const list = all();
    expect(list.length).toBeGreaterThan(200);
    for (const s of list) {
      expect(bannedIn(s), s).toEqual([]);
      expect(DASH.test(s), s).toBe(false);
      expect(UK.test(s), s).toBe(false);
    }
  });

  it('start with a capital letter or a number', () => {
    for (const s of all()) expect(/^[A-Z0-9·"“‘]/.test(s), s).toBe(true);
  });

  it('are in copy.ts, not typed into a screen', () => {
    expect(literalsInScreens()).toEqual([]);
  });

  it('never name a condition for something a parent noticed', () => {
    const noticed: string[] = [];
    strings(copy.NOTICED, noticed);
    for (const s of noticed) expect(/\ballerg(y|ic)\b|anaphyla|intoleran/i.test(s), s).toBe(false);
  });
});
