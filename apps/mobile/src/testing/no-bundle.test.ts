/**
 * `src/testing/` must never reach a release bundle.
 *
 * It imports `node:sqlite`, which Metro cannot resolve; the failure would be a red build at
 * best and a missing module at runtime at worst. More to the point, a fake clock or an
 * in-memory database inside the shipped app is a way for a test seam to become a product
 * behavior. One import from one screen is all it takes, so the rule is checked rather than
 * remembered.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(SRC).filter(f => /\.tsx?$/.test(f));
const isTest = (f: string) => /\.test\.tsx?$/.test(f);
const rel = (f: string) => f.slice(SRC.length + 1);

/**
 * Test-only modules that do NOT live under `src/testing/`.
 *
 * `sync/harness.ts` is the §9 matrix's fixture (WP4.10): it opens a `node:sqlite` database
 * through `testing/local-db.ts`, so it is exactly as unshippable as the directory it imports,
 * and it sits beside the suite it serves because that is where a reader looks for it. Being
 * outside `testing/` it needs naming here, and the two rules below then hold it to the same
 * standard: it may import the seam, and nothing a screen can reach may import IT.
 */
const TEST_ONLY_MODULES = [join('sync', 'harness.ts')];
const isTestOnly = (f: string) => TEST_ONLY_MODULES.includes(rel(f));

describe('the test-only seam stays out of the app', () => {
  it('finds the source tree it is meant to be scanning', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some(isTest)).toBe(true);
    expect(files.map(rel)).toContain(join('testing', 'local-db.ts'));
  });

  it('nothing outside a test imports src/testing', () => {
    const imports = (f: string) => /from\s+'[^']*testing\/[a-z-]+'/.test(readFileSync(f, 'utf8'));
    // non-vacuous: the detector has to see the imports the tests really do make
    expect(files.filter(isTest).filter(imports).map(rel)).toContain(join('db', 'driver.test.ts'));
    expect(
      files
        .filter(f => !isTest(f) && !isTestOnly(f))
        .filter(imports)
        .map(rel),
    ).toEqual([]);
  });

  it('nothing outside a test imports a test-only module that is not under src/testing', () => {
    // The other half of the exemption above, and the half that makes it safe: `harness.ts` may
    // reach the seam only because nothing a screen can reach may import `harness.ts`.
    const importsHarness = (f: string) =>
      /from\s+'[^']*\/harness'|from\s+'\.\/harness'/.test(readFileSync(f, 'utf8'));
    expect(files.filter(isTest).filter(importsHarness).map(rel)).toContain(
      join('sync', 'scenarios.test.ts'),
    );
    expect(
      files
        .filter(f => !isTest(f))
        .filter(importsHarness)
        .map(rel),
    ).toEqual([]);
  });

  /**
   * THE §9 MATRIX'S SUPPORT, TOO (2026-09-26). The scenario table (`@nibblecue/core/sync/scenarios`)
   * and the fake server's probe (`sync/providers/mock-probe.ts`) are read by the two scenario
   * suites and the harness, nothing else. Both used to ride a barrel into every build (17 KB of
   * the minified bundle); they are imported by path now, and this keeps a screen from pulling them
   * back. A TYPE import is fine: it is erased before Metro sees the file.
   */
  it('nothing outside a test takes the scenario table or the mock probe', () => {
    const src = (f: string) => readFileSync(f, 'utf8');
    const takesTable = (f: string) =>
      /^import(?!\s+type\b)[^;]*from\s+'@nibblecue\/core\/sync\/scenarios'/m.test(src(f));
    const takesProbe = (f: string) => /from\s+'[^']*\/mock-probe'/.test(src(f));
    // non-vacuous: the suites that run the matrix really do import both
    expect(files.filter(isTest).filter(takesTable).map(rel)).toContain(
      join('sync', 'scenarios.test.ts'),
    );
    expect(files.filter(isTest).filter(takesProbe).map(rel)).toContain(
      join('sync', 'mock-scenarios.test.ts'),
    );
    const app = files.filter(f => !isTest(f) && !isTestOnly(f));
    expect(app.filter(takesTable).map(rel)).toEqual([]);
    expect(app.filter(takesProbe).map(rel)).toEqual([]);
    // and `deriveOpId`'s frozen vectors, test data that left `sync/ids.ts` the same way (2026-09-26)
    const takesVectors = (f: string) =>
      /^import(?!\s+type\b)[^;]*from\s+'@nibblecue\/core\/sync\/ids\.vectors'/m.test(src(f));
    expect(app.filter(takesVectors).map(rel)).toEqual([]);
  });

  /**
   * AND THE BANNED-PHRASE LISTS (2026-09-27): the words no sentence may say, and the check that
   * holds a Reports comparison to them, are the suites' instruments. They left core's barrel for
   * their own subpaths so they stop shipping; this keeps a screen from pulling them back.
   */
  it('nothing outside a test takes the banned-phrase lists', () => {
    const src = (f: string) => readFileSync(f, 'utf8');
    const takesLists = (f: string) =>
      /^import(?!\s+type\b)[^;]*from\s+'@nibblecue\/core\/(schedule\/foresight|reports\/glance)\.banned'/m.test(
        src(f),
      );
    // non-vacuous: the suites that scan the app's words really do import them
    // non-vacuous: CuddleCue proves it on its Reports summary and duty suites, which import the
    // lists; neither is in NibbleCue and no suite here imports them, so the pattern is proved on
    // the import line itself, and the two subpaths are still core's own
    expect(
      /^import(?!\s+type\b)[^;]*from\s+'@nibblecue\/core\/(schedule\/foresight|reports\/glance)\.banned'/m.test(
        "import { FORESIGHT_BANNED } from '@nibblecue/core/schedule/foresight.banned';",
      ),
    ).toBe(true);
    const core = JSON.parse(
      readFileSync(
        join(__dirname, '..', '..', '..', '..', 'packages', 'core', 'package.json'),
        'utf8',
      ),
    ) as { exports: Record<string, string> };
    expect(Object.keys(core.exports)).toEqual(
      expect.arrayContaining(['./schedule/foresight.banned', './reports/glance.banned']),
    );
    expect(
      files
        .filter(f => !isTest(f) && !isTestOnly(f))
        .filter(takesLists)
        .map(rel),
    ).toEqual([]);
  });

  it('nothing outside src/testing imports node:sqlite, and the app code does not either', () => {
    const offenders = files
      .filter(f => !rel(f).startsWith('testing'))
      .filter(f => !isTest(f) && !isTestOnly(f))
      .filter(f => /['"]node:sqlite['"]/.test(readFileSync(f, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
    // the device driver is the counterpart: it holds expo-sqlite and no node built-in
    const driver = readFileSync(join(SRC, 'db', 'driver.ts'), 'utf8');
    expect(driver).not.toMatch(/from '[^']*node:/);
    expect(driver).toMatch(/from 'expo-sqlite'/);
  });

  it('the test-only modules take their app imports as types only, so node never loads expo', () => {
    const localDb = readFileSync(join(SRC, 'testing', 'local-db.ts'), 'utf8');
    // `import type` is erased at transform time; a value import of ../db/driver would drag
    // expo-sqlite into every node test that opens a database.
    expect(localDb).toMatch(/import \{ createTxQueue, type Db, type SqlValue, type Tx \}/);
    expect(localDb).not.toMatch(/from 'expo-/);
  });
});
