/**
 * Deterministic operation ids: a dependency-free SHA-1, RFC 4122 uuidv5, and `deriveOpId`.
 *
 * WHY THIS IS HAND-WRITTEN. The outbox's primary key is `client_op_id`, so the three ops of one
 * stash bottle cannot share one id — but `docs/MILK_STASH.md` §7c and `docs/MULTIPLES.md` §2 both
 * need ids that survive a retry from a process that stored nothing. A pure derivation from the
 * intent id is the only thing that gives both. The same derivation exists a second time in SQL
 * (`app.derive_op` in `0009`), and `DERIVE_OP_VECTORS` (`ids.vectors.ts`, test data reached by its
 * own path) is what pins the two together.
 *
 * WHY IT CANNOT CHANGE. Once a build ships, a changed derivation makes every queued retry look
 * like a new operation, and "never lose a log" becomes "log it twice". `OP_NAMESPACE`, the name
 * format and the vectors are frozen for the life of the product.
 *
 * No dependency: `node:crypto` is not available in Hermes and a uuid package would be a runtime
 * dependency WP4 does not add. The RFC 4122 test vector in `ids.test.ts` is what makes a
 * hand-written SHA-1 safe to trust.
 */

/* ---------- SHA-1 ---------- */

/** UTF-8 by hand: `TextEncoder` is a host global, and this file must run anywhere TS runs. */
function utf8Bytes(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const lo = s.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00);
        i++;
        out.push(
          0xf0 | (c >> 18),
          0x80 | ((c >> 12) & 0x3f),
          0x80 | ((c >> 6) & 0x3f),
          0x80 | (c & 0x3f),
        );
      } else {
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return Uint8Array.from(out);
}

/** FIPS 180-4 SHA-1. Word arithmetic stays in int32; every read is `as number` because
 *  `noUncheckedIndexedAccess` types a typed-array index as `number | undefined`. */
export function sha1(message: Uint8Array): Uint8Array {
  const ml = message.length;
  const block = new Uint8Array(((ml + 8) >>> 6) * 64 + 64);
  block.set(message);
  block[ml] = 0x80;
  const view = new DataView(block.buffer);
  const bits = ml * 8;
  view.setUint32(block.length - 8, Math.floor(bits / 0x1_0000_0000));
  view.setUint32(block.length - 4, bits >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let i = 0; i < block.length; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = view.getUint32(i + j * 4);
    for (let j = 16; j < 80; j++) {
      const n =
        (w[j - 3] as number) ^ (w[j - 8] as number) ^ (w[j - 14] as number) ^ (w[j - 16] as number);
      w[j] = (n << 1) | (n >>> 31);
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let j = 0; j < 80; j++) {
      let f: number;
      let k: number;
      if (j < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (j < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + (w[j] as number)) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = t;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0);
  outView.setUint32(4, h1);
  outView.setUint32(8, h2);
  outView.setUint32(12, h3);
  outView.setUint32(16, h4);
  return out;
}

/* ---------- uuid ---------- */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function uuidBytes(uuid: string): Uint8Array {
  if (!UUID_RE.test(uuid)) throw new TypeError(`not a uuid: ${JSON.stringify(uuid)}`);
  const hex = uuid.replace(/-/g, '');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function formatUuid(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < 16; i++) hex += (bytes[i] as number).toString(16).padStart(2, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** RFC 4122 §4.3 name-based uuid, SHA-1 flavour. Lowercase, always. */
export function uuidv5(namespace: string, name: string): string {
  const ns = uuidBytes(namespace);
  const nameBytes = utf8Bytes(name);
  const input = new Uint8Array(ns.length + nameBytes.length);
  input.set(ns);
  input.set(nameBytes, ns.length);
  const hash = sha1(input).slice(0, 16);
  hash[6] = ((hash[6] as number) & 0x0f) | 0x50; // version 5
  hash[8] = ((hash[8] as number) & 0x3f) | 0x80; // RFC 4122 variant
  return formatUuid(hash);
}

/* ---------- derived operation ids ---------- */

/**
 * The namespace every derived op id hangs from. An arbitrary uuid minted once for this purpose:
 * arbitrary is the point — it must not be derived from the domain, the bundle id or anything else
 * that could be renamed. Changing this value re-keys every derived op in the field.
 */
export const OP_NAMESPACE = '9c5f2b1e-6a34-4d8f-b7e0-1a2c3d4e5f60';

/**
 * The id of the op that hangs off `intentId` under `tag`.
 *
 * One `intent_id` is minted per user intent. The activity op uses it unchanged; every other op of
 * the same intent derives its key from it: the ledger USE is `'use'`, the sub-7 ml remainder is
 * `'rem'`, an overdraw's compensating row is `'adj'`, an undo is `'undo'`, a stash deposit is
 * `'add'`, and a twin's entry uses the other child's id as the tag (D7).
 *
 * `intentId` is lowercased because `app.derive_op(p_op uuid, p_tag text)` renders a uuid
 * lowercase before concatenating; `tag` is used verbatim, exactly as `p_tag` is.
 */
export function deriveOpId(intentId: string, tag: string): string {
  if (!UUID_RE.test(intentId)) throw new TypeError(`intentId is not a uuid: ${intentId}`);
  if (tag.length === 0) throw new TypeError('deriveOpId needs a non-empty tag');
  return uuidv5(OP_NAMESPACE, `${intentId.toLowerCase()}:${tag}`);
}
