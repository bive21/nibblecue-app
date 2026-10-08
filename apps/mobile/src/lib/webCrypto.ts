/**
 * `crypto.subtle.digest` on the phone (`subtleDigest.ts` says why), installed as this module is
 * evaluated: `index.ts` imports it straight after the random-values polyfill, before anything that
 * could start a sign-in, on expo-crypto's native digest.
 */
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { installSubtleDigest, type DigestName } from './subtleDigest';

const ALGORITHM: Readonly<Record<DigestName, CryptoDigestAlgorithm>> = {
  'SHA-1': CryptoDigestAlgorithm.SHA1,
  'SHA-256': CryptoDigestAlgorithm.SHA256,
  'SHA-384': CryptoDigestAlgorithm.SHA384,
  'SHA-512': CryptoDigestAlgorithm.SHA512,
};

installSubtleDigest(globalThis as { crypto?: unknown }, (name, data) =>
  digest(ALGORITHM[name], data),
);
