/** Held against node's own `Buffer`, so a typo in the table cannot round-trip consistently wrong. */
import { describe, expect, it } from 'vitest';
import { base64Of, bytesOfBase64 } from './base64';

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

describe('base64Of', () => {
  it('agrees with Buffer at every padding length', () => {
    for (let n = 0; n <= 32; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256);
      expect(base64Of(bytes), `${n} bytes`).toBe(b64(bytes));
    }
  });

  it('handles the whole byte range, including the two characters that differ between alphabets', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    const encoded = base64Of(all);
    expect(encoded).toBe(b64(all));
    // `+` and `/` — standard base64, not the URL-safe variant Storage would reject
    expect(encoded).toMatch(/[+/]/);
  });
});

describe('bytesOfBase64', () => {
  it('round-trips whatever was encoded', () => {
    for (let n = 0; n <= 32; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 91 + 3) % 256);
      expect([...bytesOfBase64(base64Of(bytes))], `${n} bytes`).toEqual([...bytes]);
    }
  });

  it('tolerates a data URI prefix, padding and whitespace', () => {
    const bytes = Uint8Array.from([1, 2, 3, 250, 251, 252]);
    const raw = b64(bytes);
    expect([...bytesOfBase64(`data:image/jpeg;base64,${raw}`)]).toEqual([...bytes]);
    expect([...bytesOfBase64(`${raw}\n`)]).toEqual([...bytes]);
    expect([...bytesOfBase64(raw.replace(/=/g, ''))]).toEqual([...bytes]);
  });

  it('is empty for an empty string rather than throwing', () => {
    expect(bytesOfBase64('')).toHaveLength(0);
    expect(bytesOfBase64('data:image/jpeg;base64,')).toHaveLength(0);
  });
});
