/**
 * REVENUECAT'S BROWSER SDK STAYS OFF THE PHONE (`metro.config.js` says why).
 *
 * Two halves, because the resolution is only safe while the SDK keeps a shape it does not
 * promise. The first calls the real config's `resolveRequest`: the mapping is an empty module on
 * Android and iOS, and every other request, and the web's, goes to the resolver it would have
 * reached anyway. The second re-reads the INSTALLED `react-native-purchases` with TypeScript's
 * parser and fails if any file touches the mapping outside a function, which is what an empty
 * module could not survive: that file would throw the moment the app first asks for the SDK.
 * A `react-native-purchases` upgrade that fails here needs the Metro rule re-thought, not this
 * test loosened.
 *
 * EXPO'S DEV TOOLS CLIENT STAYS OUT OF A RELEASE BUNDLE the same way (2026-09-27), and is held the
 * same two ways: the resolution (empty only when Metro says the bundle is not a dev one), and the
 * installed `expo-sqlite`, which may ask for the client only inside a function that has already
 * returned when `__DEV__` is false.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

type Resolution = { type: string; filePath?: string };
interface Context {
  /** Metro's own flag: whether this is a development bundle. */
  dev?: boolean;
  /** The file the request comes from. */
  originModulePath?: string;
  resolveRequest: (context: Context, moduleName: string, platform: string | null) => Resolution;
}
const config = require('../metro.config.js') as {
  resolver: {
    resolveRequest: ((ctx: Context, name: string, platform: string | null) => Resolution) | null;
  };
};

const MAPPING = '@revenuecat/purchases-js-hybrid-mappings';
const BROWSER_MODE = './browser/nativeModule';
const PURCHASES_JS = '/repo/node_modules/react-native-purchases/dist/purchases.js';
const DEVTOOLS = 'expo/devtools';

describe('the Metro config', () => {
  const resolve = config.resolver.resolveRequest;
  /** Metro's own resolver, as the config receives it: it records what reached it. */
  const reached: string[] = [];
  const context: Context = {
    resolveRequest: (_ctx, moduleName, platform) => {
      reached.push(`${String(platform)} ${moduleName}`);
      return { type: 'sourceFile', filePath: `/resolved/${moduleName}` };
    },
  };

  it('resolves RevenueCat’s browser SDK to an empty module on Android and iOS', () => {
    expect(resolve).toBeTypeOf('function');
    reached.length = 0;
    for (const platform of ['android', 'ios']) {
      expect(resolve?.(context, MAPPING, platform), platform).toEqual({ type: 'empty' });
    }
    expect(reached).toEqual([]);
  });

  it('hands every other module, and the browser SDK on the web, to the resolver underneath', () => {
    reached.length = 0;
    const requests: [string, string][] = [
      ['react-native-purchases', 'android'],
      ['@revenuecat/purchases-typescript-internal', 'ios'],
      // a name that merely starts with the mapping's is not the mapping
      [`${MAPPING}-extra`, 'android'],
      ['./billing/revenuecatSdk', 'ios'],
      [MAPPING, 'web'],
    ];
    for (const [name, platform] of requests) {
      expect(resolve?.(context, name, platform), `${platform} ${name}`).toEqual({
        type: 'sourceFile',
        filePath: `/resolved/${name}`,
      });
    }
    expect(reached).toEqual(requests.map(([name, platform]) => `${platform} ${name}`));
  });

  it('resolves the SDK’s browser mode to an empty module on Android and iOS, from purchases.js alone', () => {
    reached.length = 0;
    for (const platform of ['android', 'ios']) {
      expect(
        resolve?.({ ...context, originModulePath: PURCHASES_JS }, BROWSER_MODE, platform),
        platform,
      ).toEqual({ type: 'empty' });
    }
    expect(reached).toEqual([]);
    // the web keeps it, and so does the same name asked for by any other file
    const kept: [string, string][] = [
      [PURCHASES_JS, 'web'],
      ['/repo/node_modules/react-native-purchases/dist/browser/utils.js', 'android'],
      ['/repo/apps/mobile/src/billing/purchases.js', 'ios'],
    ];
    for (const [origin, platform] of kept) {
      expect(resolve?.({ ...context, originModulePath: origin }, BROWSER_MODE, platform)).toEqual({
        type: 'sourceFile',
        filePath: `/resolved/${BROWSER_MODE}`,
      });
    }
    expect(reached).toEqual(kept.map(([, platform]) => `${platform} ${BROWSER_MODE}`));
  });

  it('resolves Expo’s dev tools client to an empty module in a release bundle, and only there', () => {
    reached.length = 0;
    for (const platform of ['android', 'ios']) {
      expect(resolve?.({ ...context, dev: false }, DEVTOOLS, platform), platform).toEqual({
        type: 'empty',
      });
    }
    expect(reached).toEqual([]);
    // a development bundle keeps it (the SQLite inspector), and so does a context that does not say
    expect(resolve?.({ ...context, dev: true }, DEVTOOLS, 'android')).toEqual({
      type: 'sourceFile',
      filePath: `/resolved/${DEVTOOLS}`,
    });
    expect(resolve?.(context, DEVTOOLS, 'ios')).toEqual({
      type: 'sourceFile',
      filePath: `/resolved/${DEVTOOLS}`,
    });
    // and a release bundle's other modules still reach the resolver underneath
    expect(resolve?.({ ...context, dev: false }, 'expo-sqlite', 'android')).toEqual({
      type: 'sourceFile',
      filePath: '/resolved/expo-sqlite',
    });
    expect(reached).toEqual([`android ${DEVTOOLS}`, `ios ${DEVTOOLS}`, 'android expo-sqlite']);
  });
});

/** Every `.js` file under a folder. */
function jsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory()
      ? jsFiles(join(dir, e.name))
      : e.name.endsWith('.js')
        ? [join(dir, e.name)]
        : [],
  );
}

/** `require('<the mapping>')`, in either quote. */
function requiresMapping(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return false;
  const [arg] = node.arguments;
  return (
    node.expression.text === 'require' &&
    node.arguments.length === 1 &&
    arg !== undefined &&
    ts.isStringLiteralLike(arg) &&
    arg.text === MAPPING
  );
}

function insideFunction(node: ts.Node): boolean {
  for (let p = node.parent; p !== undefined; p = p.parent) if (ts.isFunctionLike(p)) return true;
  return false;
}

/** Every name a declaration binds: `x`, or each name in `{ a, b: c }` / `[d]`. */
function namesIn(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap(e => (ts.isOmittedExpression(e) ? [] : namesIn(e.name)));
}

/**
 * The names a file binds the mapping to, and every place it uses the mapping outside a function.
 * The binding itself — `var x = require(…)` at the top of the file, bare or through one interop
 * helper (`__importDefault(require(…))`) — is the one module-level mention allowed: it is what
 * loading the file does, and an empty module satisfies it. Anything else at module level reads
 * the SDK's contents at load time, which an empty module does not have.
 */
function mappingUses(file: string): { bound: string[]; outside: string[] } {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const at = (node: ts.Node): string =>
    `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  const bound = new Set<string>();
  const outside: string[] = [];
  const binding = (call: ts.CallExpression): ts.VariableDeclaration | null => {
    const up = call.parent;
    if (ts.isVariableDeclaration(up) && up.initializer === call) return up;
    // one interop wrapper, and nothing else: `var x = __importDefault(require(…))`
    if (ts.isCallExpression(up) && ts.isVariableDeclaration(up.parent)) return up.parent;
    return null;
  };
  const visit = (node: ts.Node): void => {
    if (requiresMapping(node) && !insideFunction(node)) {
      const decl = binding(node);
      if (decl === null) outside.push(`${at(node)} uses require('${MAPPING}') at load time`);
      else for (const n of namesIn(decl.name)) bound.add(n);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const reads = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && bound.has(node.text) && !insideFunction(node)) {
      // the declaration's own name is the binding, not a read
      const up = node.parent;
      if (!ts.isBindingElement(up) && !ts.isVariableDeclaration(up)) {
        outside.push(`${at(node)} reads ${node.text} at load time`);
      }
    }
    ts.forEachChild(node, reads);
  };
  reads(source);
  return { bound: [...bound], outside };
}

describe('react-native-purchases, as installed', () => {
  const sdk = dirname(require.resolve('react-native-purchases/package.json'));
  // its own dependency, which the native path runs too: resolved from the SDK, as Metro does
  const internal = dirname(
    createRequire(join(sdk, 'package.json')).resolve(
      '@revenuecat/purchases-typescript-internal/package.json',
    ),
  );
  const files = [...jsFiles(join(sdk, 'dist')), ...jsFiles(join(internal, 'dist'))];

  it('touches the browser SDK only inside functions', () => {
    // a comment may name it too (purchases-typescript-internal's errorNormalizer does), so every
    // file that mentions it is parsed, and only a real `require` counts
    const uses = files
      .filter(f => readFileSync(f, 'utf8').includes(MAPPING))
      .map(f => ({ file: relative(sdk, f), ...mappingUses(f) }));
    const requirers = uses.filter(u => u.bound.length > 0).map(u => u.file);
    // 10.10.2: browser/nativeModule.js, browser/utils.js and the two simulated-store helpers. If a
    // version stops requiring it at all, the Metro rule is dead config: remove it with this test.
    expect(requirers.length).toBeGreaterThan(0);
    expect(uses.flatMap(u => u.outside)).toEqual([]);
  });

  it('reads its browser mode only on the browser-mode branch, and from purchases.js alone', () => {
    const file = join(sdk, 'dist', 'purchases.js');
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    const isRequireOf = (node: ts.Node, name: string): boolean => {
      if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return false;
      const [arg] = node.arguments;
      return (
        node.expression.text === 'require' &&
        arg !== undefined &&
        ts.isStringLiteralLike(arg) &&
        arg.text === name
      );
    };
    // `var usingBrowserMode = (0, environment_1.shouldUseBrowserMode)();` and the binding
    const bound: string[] = [];
    let flag: string | null = null;
    for (const st of source.statements) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || d.initializer === undefined) continue;
        if (isRequireOf(d.initializer, BROWSER_MODE)) bound.push(d.name.text);
        if (/\bshouldUseBrowserMode\)?\(\)$/.test(d.initializer.getText(source)))
          flag = d.name.text;
      }
    }
    expect(bound, 'purchases.js binds the browser mode once, at the top').toHaveLength(1);
    expect(flag, 'purchases.js decides browser mode once, at the top').not.toBe(null);
    // every other mention is the TRUE branch of `<flag> ? … : …` — what an empty module survives
    const outside: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isIdentifier(node) &&
        node.text === bound[0] &&
        !ts.isVariableDeclaration(node.parent)
      ) {
        let ok = false;
        for (let n: ts.Node = node; n.parent !== undefined; n = n.parent) {
          const p = n.parent;
          if (
            ts.isConditionalExpression(p) &&
            p.whenTrue === n &&
            ts.isIdentifier(p.condition) &&
            p.condition.text === flag
          ) {
            ok = true;
            break;
          }
        }
        if (!ok)
          outside.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(outside, 'a read of the browser mode outside browser mode').toEqual([]);
    // and no other file of the SDK outside its browser folder asks for the browser folder
    const others = files
      .filter(f => f.startsWith(join(sdk, 'dist')) && !f.startsWith(join(sdk, 'dist', 'browser')))
      .filter(
        f => f !== file && /require\("\.{1,2}\/(?:\.\.\/)*browser\//.test(readFileSync(f, 'utf8')),
      )
      .map(f => relative(sdk, f));
    expect(others).toEqual([]);
  });

  it('is asked for in one place, and only in the app’s own binary', () => {
    const src = readFileSync(join(__dirname, 'billing', 'revenuecatSdk.ts'), 'utf8');
    const own = src.indexOf('if (!ownBinary())');
    const ask = src.indexOf("require('react-native-purchases')");
    expect(own).toBeGreaterThan(-1);
    expect(ask).toBeGreaterThan(own);
  });
});

/**
 * Every `require('expo/devtools')` in a file, and whether a release bundle can reach it: only
 * inside a function whose body has already returned on `!__DEV__` before the call. Anything else
 * — at load time, or in a function with no such return — would find the empty module.
 */
function devtoolsRequires(file: string): { at: string; guarded: boolean }[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const returnsFirstOutsideDev = (fn: ts.FunctionLikeDeclaration, before: number): boolean =>
    fn.body !== undefined &&
    ts.isBlock(fn.body) &&
    fn.body.statements.some(
      s =>
        s.getEnd() <= before &&
        ts.isIfStatement(s) &&
        /!__DEV__/.test(s.expression.getText(source)) &&
        (ts.isReturnStatement(s.thenStatement) ||
          (ts.isBlock(s.thenStatement) && s.thenStatement.statements.some(ts.isReturnStatement))),
    );
  const out: { at: string; guarded: boolean }[] = [];
  const visit = (node: ts.Node): void => {
    const [arg] = ts.isCallExpression(node) ? node.arguments : [];
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      arg !== undefined &&
      ts.isStringLiteralLike(arg) &&
      arg.text === DEVTOOLS
    ) {
      let fn: ts.Node | undefined = node.parent;
      while (fn !== undefined && !ts.isFunctionLike(fn)) fn = fn.parent;
      out.push({
        at: `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`,
        guarded:
          fn !== undefined &&
          returnsFirstOutsideDev(fn as ts.FunctionLikeDeclaration, node.getStart()),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

describe('expo-sqlite, as installed', () => {
  const sqlite = dirname(require.resolve('expo-sqlite/package.json'));

  it('asks for Expo’s dev tools client only where a release bundle has already returned', () => {
    const calls = jsFiles(join(sqlite, 'build'))
      .filter(f => readFileSync(f, 'utf8').includes(DEVTOOLS))
      .flatMap(devtoolsRequires);
    // 57.0.3: once, in `SQLiteDevToolsClient.js`. If a version stops asking for it at all, the
    // Metro rule is dead config: remove it with this test
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.filter(c => !c.guarded).map(c => c.at)).toEqual([]);
  });
});

/**
 * THE TEST BACKEND STAYS OUT OF A RELEASE BUNDLE THAT CANNOT RUN ON IT (2026-09-28;
 * `metro.config.js` says why that is safe). Held four ways: the resolution; the rule it reads,
 * which is the phone's own; the files that may import the test backend, so a new one is read
 * before it ships; and the cache key, without which the phone could inline other settings than
 * the ones the rule was read with.
 */
describe('the test backend in a release bundle', () => {
  const APP = join(__dirname, '..');
  const BACKEND = [
    'src/auth/providers/mock.ts',
    'src/sync/providers/mock.ts',
    'src/sync/providers/mockSeed.ts',
    'src/billing/mock.ts',
    'src/dev/reset.ts',
  ].map(f => join(APP, f));
  const SERVER = {
    EXPO_PUBLIC_AUTH_PROVIDER: 'supabase',
    EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_x',
  };
  const NAMES = Object.keys(SERVER);
  /** The resolver underneath, as Metro hands it over: a request for a file resolves to that file. */
  const echo: Context = {
    resolveRequest: (_ctx, moduleName) => ({ type: 'sourceFile', filePath: moduleName }),
  };
  /** Runs with exactly these server settings in the environment, and puts the old ones back. */
  const withEnv = <T>(env: Record<string, string>, run: () => T): T => {
    const saved = NAMES.map(n => [n, process.env[n]] as const);
    for (const n of NAMES) delete process.env[n];
    Object.assign(process.env, env);
    try {
      return run();
    } finally {
      for (const [n, v] of saved) {
        if (v === undefined) delete process.env[n];
        else process.env[n] = v;
      }
    }
  };
  const resolve = config.resolver.resolveRequest;
  const kept = (filePath: string) => ({ type: 'sourceFile', filePath });

  it('is an empty module in a release bundle whose settings pick the server, and only there', () => {
    withEnv(SERVER, () => {
      for (const file of BACKEND) {
        for (const platform of ['android', 'ios']) {
          expect(resolve?.({ ...echo, dev: false }, file, platform), file).toEqual({
            type: 'empty',
          });
        }
        // a development bundle keeps it, and so does a context that does not say
        expect(resolve?.({ ...echo, dev: true }, file, 'ios')).toEqual(kept(file));
        expect(resolve?.(echo, file, 'android')).toEqual(kept(file));
      }
      // the rest of the app, the server's own providers among it, is untouched
      for (const file of ['src/auth/providers/supabase.ts', 'src/sync/providers/index.ts']) {
        const path = join(APP, file);
        expect(resolve?.({ ...echo, dev: false }, path, 'android')).toEqual(kept(path));
      }
    });
    // a release bundle with no server settings, or one short of them, can only run on the mock
    const short: Record<string, string>[] = [
      {},
      { ...SERVER, EXPO_PUBLIC_SUPABASE_ANON_KEY: ' ' },
      { ...SERVER, EXPO_PUBLIC_AUTH_PROVIDER: 'mock' },
    ];
    for (const env of short) {
      withEnv(env, () => {
        for (const file of BACKEND) {
          expect(resolve?.({ ...echo, dev: false }, file, 'android'), JSON.stringify(env)).toEqual(
            kept(file),
          );
        }
      });
    }
  });

  it('reads the rule the phone reads', async () => {
    const { backendOf } = require('../backend.cjs') as {
      backendOf: (raw: Record<string, string | undefined>) => string;
    };
    const { readEnv } = await import('./env');
    const cases: Record<string, string | undefined>[] = [
      {},
      SERVER,
      { ...SERVER, EXPO_PUBLIC_AUTH_PROVIDER: ' Supabase ' },
      { ...SERVER, EXPO_PUBLIC_AUTH_PROVIDER: 'mock' },
      { ...SERVER, EXPO_PUBLIC_SUPABASE_URL: '' },
      { ...SERVER, EXPO_PUBLIC_SUPABASE_URL: '   ' },
      { ...SERVER, EXPO_PUBLIC_SUPABASE_ANON_KEY: undefined },
      { EXPO_PUBLIC_SUPABASE_URL: SERVER.EXPO_PUBLIC_SUPABASE_URL },
    ];
    for (const raw of cases) {
      expect(readEnv(raw).authProvider, JSON.stringify(raw)).toBe(backendOf(raw));
    }
    expect(backendOf(SERVER)).toBe('supabase');
    // and nothing the runtime fingerprint hashes loads it (`backend.cjs` says why)
    // (NibbleCue has no widgets.config.cjs or work-manager.config.cjs: no widgets, no WorkManager)
    const hashed = [
      'app.config.ts',
      'env.guard.cjs',
      'permissions.config.cjs',
      'privacy.config.cjs',
    ];
    for (const file of hashed) {
      expect(readFileSync(join(APP, file), 'utf8'), file).not.toMatch(/backend(\.cjs)?['"]/);
    }
  });

  it('is imported only by the files the config names, each on the mock’s own path', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap(e =>
        e.isDirectory()
          ? walk(join(dir, e.name))
          : /\.tsx?$/.test(e.name)
            ? [join(dir, e.name)]
            : [],
      );
    // the suites and the §9 matrix's own support may take it (`testing/no-bundle.test.ts`)
    const testOnly =
      /\.test\.tsx?$|[\\/]src[\\/]testing[\\/]|[\\/]sync[\\/](harness|providers[\\/]mock-probe)\.ts$/;
    const shipped = walk(__dirname).filter(f => !testOnly.test(f));
    const target = (from: string, spec: string): string | null => {
      if (!spec.startsWith('.')) return null;
      const base = join(dirname(from), spec);
      const found = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')].find(c =>
        BACKEND.includes(c),
      );
      return found ?? null;
    };
    // value imports and re-exports: `import type` is erased before Metro sees the file
    const VALUE = /^(?:import|export)(?!\s+type\b)[^;]*?from\s+'([^']+)'/gm;
    const importers = shipped
      .filter(f =>
        [...readFileSync(f, 'utf8').matchAll(VALUE)].some(m => target(f, m[1] ?? '') !== null),
      )
      .map(f => relative(APP, f))
      .sort();
    // a new name here is a new use of the test backend: check it is on the mock's own path (a
    // branch the server arm has returned before, or `mock !== null`), then add it
    expect(importers).toEqual([
      'src/auth/providers/index.ts',
      'src/billing/BillingContext.tsx',
      'src/screens/more/MoreScreen.tsx',
      'src/sync/providers/index.ts',
    ]);
    // the sync barrel passes four names on; one is taken, by the provider, behind `mock !== null`
    const PASSED = /\b(MockSyncApi|MockSyncServer|ensureMockChildren|ensureMockMembership)\b/;
    const FROM_BARREL = /^import(?!\s+type\b)([^;]*?)from\s+'(?:[^']*\/)?providers'/gm;
    const takers = shipped
      .filter(f =>
        [...readFileSync(f, 'utf8').matchAll(FROM_BARREL)].some(m => PASSED.test(m[1] ?? '')),
      )
      .map(f => relative(APP, f));
    expect(takers).toEqual(['src/sync/SyncProvider.tsx']);
  });

  it('keys the transform cache on the settings a release bundle inlines', () => {
    // this process's environment with exactly the given public settings, each run in its own
    // process because the config reads them once, as it loads
    const clean = { ...process.env };
    for (const name of Object.keys(clean)) if (name.startsWith('EXPO_PUBLIC_')) delete clean[name];
    const version = (env: Record<string, string>): string => {
      const out = spawnSync(
        process.execPath,
        ['-e', "process.stdout.write(require('./metro.config.js').cacheVersion)"],
        { cwd: APP, env: { ...clean, ...env }, encoding: 'utf8', timeout: 60_000 },
      );
      expect(out.status, out.stderr).toBe(0);
      return out.stdout;
    };
    const server = version(SERVER);
    expect(server).not.toBe(version({}));
    expect(version({ ...SERVER, EXPO_PUBLIC_SUPABASE_URL: 'https://y.supabase.co' })).not.toBe(
      server,
    );
    expect(version(SERVER)).toBe(server);
    // Metro's own version stays at the front, so a Metro upgrade still clears the cache
    const { getDefaultConfig } = require('expo/metro-config') as {
      getDefaultConfig: (root: string) => { cacheVersion: string };
    };
    expect(server).toBe(`${getDefaultConfig(APP).cacheVersion}:${server.split(':').pop() ?? ''}`);
    expect(server.split(':').pop()).toMatch(/^[0-9a-f]{16}$/);
  });
});
