/**
 * What the boot smoke test needs before the app's first module evaluates (`vitest.smoke.config.mts`
 * says what is substituted and why).
 */
import Module, { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

/*
  A CommonJS `require` inside a package is node's, not vite's, so the config's aliases do not reach
  it. Two things arrive that way: `react-native` (pointed at react-native-web, as the aliases do),
  and Metro's asset requires (`require('./bath.png')`), which become a picture of the right shape:
  the app hands them to <Image> and never reads the file.
*/
type Resolve = (r: string, p: { filename?: string } | undefined, ...a: unknown[]) => string;
type Loader = (m: { exports: unknown }, filename: string) => void;
const M = Module as unknown as { _resolveFilename: Resolve; _extensions: Record<string, Loader> };
const ASSETS = ['.png', '.jpg', '.jpeg', '.ttf', '.otf'];
const isAsset = (request: string): boolean =>
  ASSETS.some(ext => request.toLowerCase().endsWith(ext));
const reactNativeWeb = createRequire(import.meta.url).resolve('react-native-web');
const original = M._resolveFilename;
M._resolveFilename = function (request, parent, ...rest) {
  if (request === 'react-native') return reactNativeWeb;
  if (isAsset(request) && parent?.filename) return resolve(dirname(parent.filename), request);
  return original.call(this, request, parent, ...rest);
};
for (const ext of ASSETS) {
  M._extensions[ext] = (m, filename) => {
    m.exports = { uri: `file://${filename}`, width: 24, height: 24 };
  };
}

// no network: the phone is offline for the whole test, which is a launch the app must survive
globalThis.fetch = (() =>
  Promise.reject(
    new TypeError('Network request failed (the smoke test has no network)'),
  )) as typeof fetch;

// React's own test switch: `act` flushes effects and warns about updates made outside it
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
