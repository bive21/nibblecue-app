/**
 * The one contract in WP4 that can never change after release.
 *
 * A derived op id is how a process that stored nothing rebuilds the same operation on retry. If
 * this file's expectations are ever "updated", every queued retry in the field becomes a new
 * operation and "never lose a log" turns into "log it twice". A failure here is a bug in the
 * change, never in the vectors.
 */
import { describe, expect, it, vi } from 'vitest';
import { OP_NAMESPACE, deriveOpId, isUuid, sha1, uuidv5 } from './ids';
import { DERIVE_OP_VECTORS } from './ids.vectors';

const hex = (bytes: Uint8Array) => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');

/** RFC 4122 Appendix A's namespace for fully-qualified domain names. */
const NAMESPACE_DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe('sha1', () => {
  it('matches the FIPS 180-4 sample digests', () => {
    expect(hex(sha1(Uint8Array.from([])))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(hex(sha1(Uint8Array.from([0x61, 0x62, 0x63])))).toBe(
      'a9993e364706816aba3e25717850c26c9cd0d89d',
    );
  });

  it('handles a message that spans two blocks (the padding case a one-block test misses)', () => {
    const msg = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
    const bytes = Uint8Array.from([...msg].map(c => c.charCodeAt(0)));
    expect(bytes.length).toBe(56); // 56 bytes: the length field no longer fits in the first block
    expect(hex(sha1(bytes))).toBe('84983e441c3bd26ebaae4aa1f95129e5e54670f1');
  });

  it('handles a million bytes: the block counter and the 64-bit length field', () => {
    expect(hex(sha1(new Uint8Array(1_000_000).fill(0x61)))).toBe(
      '34aa973cd4c4daa4f61eeb2bdbad27316534016f',
    );
  });
});

describe('uuidv5', () => {
  it('reproduces the published RFC 4122 name-based vectors', () => {
    expect(uuidv5(NAMESPACE_DNS, 'www.example.org')).toBe('74738ff5-5367-5958-9aee-98fffdcd1876');
    // A second, independently published vector: one matching value could be a coincidence of a
    // wrong namespace and a wrong hash; two cannot.
    expect(uuidv5(NAMESPACE_DNS, 'python.org')).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d');
  });

  it('stamps version 5 and the RFC 4122 variant', () => {
    const id = uuidv5(NAMESPACE_DNS, 'anything at all');
    expect(id[14]).toBe('5');
    expect('89ab').toContain(id[19]);
    expect(isUuid(id)).toBe(true);
  });

  it('encodes the name as UTF-8, not as UTF-16 code units', () => {
    // If the encoder dropped the high byte these would collide with their ASCII neighbours.
    expect(uuidv5(NAMESPACE_DNS, 'café')).not.toBe(uuidv5(NAMESPACE_DNS, 'cafe'));
    expect(uuidv5(NAMESPACE_DNS, '🍼')).toBe(uuidv5(NAMESPACE_DNS, '\u{1F37C}'));
  });

  it('refuses a namespace that is not a uuid', () => {
    expect(() => uuidv5('not-a-uuid', 'x')).toThrow(TypeError);
  });
});

describe('deriveOpId', () => {
  it('returns the eight frozen vectors', () => {
    for (const v of DERIVE_OP_VECTORS) {
      expect(deriveOpId(v.intent, v.tag), `${v.intent}:${v.tag}`).toBe(v.id);
    }
    expect(DERIVE_OP_VECTORS).toHaveLength(8);
  });

  it('keeps the namespace frozen', () => {
    expect(OP_NAMESPACE).toBe('9c5f2b1e-6a34-4d8f-b7e0-1a2c3d4e5f60');
  });

  it('is stable across a fresh module instance: nothing is memoised or seeded', async () => {
    const before = DERIVE_OP_VECTORS.map(v => deriveOpId(v.intent, v.tag));
    vi.resetModules();
    const fresh = await import('./ids');
    const after = DERIVE_OP_VECTORS.map(v => fresh.deriveOpId(v.intent, v.tag));
    expect(after).toEqual(before);
    expect(fresh.OP_NAMESPACE).toBe(OP_NAMESPACE);
  });

  it('never lets two tags of one intent collide', () => {
    const intent = '5f9a1c3e-8b24-4d7a-9e06-1c2b3a4d5e6f';
    const tags = [
      'use',
      'rem',
      'adj',
      'undo',
      'add',
      'container',
      'stop',
      'thaw',
      'a',
      'b',
      'cccccccc-0000-0000-0000-0000000000e1',
      'cccccccc-0000-0000-0000-0000000000e2',
    ];
    const ids = tags.map(t => deriveOpId(intent, t));
    expect(new Set(ids).size).toBe(tags.length);
    // …and the intent is part of the name, so the same tag under a different intent differs.
    const other = '0f8d3b1a-6c45-4e29-8a7b-2d9e5c410f63';
    expect(deriveOpId(other, 'use')).not.toBe(deriveOpId(intent, 'use'));
  });

  it('is case-insensitive in the intent, because SQL renders a uuid lowercase', () => {
    const intent = '5F9A1C3E-8B24-4D7A-9E06-1C2B3A4D5E6F';
    expect(deriveOpId(intent, 'use')).toBe(
      deriveOpId('5f9a1c3e-8b24-4d7a-9e06-1c2b3a4d5e6f', 'use'),
    );
  });

  it('refuses an intent that is not a uuid, and an empty tag', () => {
    expect(() => deriveOpId('intent-1', 'use')).toThrow(TypeError);
    expect(() => deriveOpId('5f9a1c3e-8b24-4d7a-9e06-1c2b3a4d5e6f', '')).toThrow(TypeError);
  });
});
