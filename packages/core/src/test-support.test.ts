/**
 * TEST SUPPORT IS REACHED BY ITS OWN PATH, NEVER THROUGH THE PACKAGE'S BARREL (2026-09-26).
 *
 * Metro bundles every module a barrel names, whether or not the app reads it — it does not
 * tree-shake — so an `export *` of a file only tests use ships that file to every phone. Two did:
 * the §9 scenario table (`sync/scenarios.ts`, 17 KB of the minified bundle) and the rows of the
 * vaccine export (`vaccines/export.ts`, for a PDF that is not built yet). The table's two suites
 * import it as `@nibblecue/core/sync/scenarios`; the export's own test imports it by path. A third
 * followed on 2026-09-26: `deriveOpId`'s frozen vectors, which lived in `sync/ids.ts` and shipped
 * with it, are `sync/ids.vectors.ts` now (`@nibblecue/core/sync/ids.vectors`).
 *
 * AND THE BANNED-PHRASE LISTS (2026-09-27). `schedule/foresight.banned.ts` rode the schedule barrel
 * and four copy modules' re-exports into the app, and `reports/glance.banned.ts` rode in with
 * `glance.copy.ts`, whose `glanceVerdictHits` only the suites call. Both are the suites' own
 * instruments, reached as `@nibblecue/core/schedule/foresight.banned` and
 * `@nibblecue/core/reports/glance.banned`; the check lives beside its lists now.
 */
import { describe, expect, it } from 'vitest';
import pkg from '../package.json';
import * as core from './index';
import { GLANCE_VERDICTS } from './reports/glance.banned';
import { BANNED } from './schedule/foresight.banned';
import { DERIVE_OP_VECTORS } from './sync/ids.vectors';
import { SYNC_SCENARIOS } from './sync/scenarios';

describe('the package barrel', () => {
  it('does not carry the §9 scenario table, the frozen id vectors or the unbuilt vaccine export', () => {
    const testOnly = [
      'SYNC_SCENARIOS',
      'SCENARIO_TAGS',
      'assertOk',
      'assertEq',
      'DERIVE_OP_VECTORS',
      'exportRows',
      'exportFooter',
      'BANNED',
      'GLANCE_VERDICTS',
      'glanceVerdictHits',
    ];
    for (const name of testOnly) expect(name in core, name).toBe(false);
  });

  it('hands the scenario table and the id vectors to their suites under their own subpaths', () => {
    expect(pkg.exports['./sync/scenarios']).toBe('./src/sync/scenarios.ts');
    expect(SYNC_SCENARIOS.length).toBeGreaterThan(0);
    expect(pkg.exports['./sync/ids.vectors']).toBe('./src/sync/ids.vectors.ts');
    expect(DERIVE_OP_VECTORS).toHaveLength(8);
  });

  it('hands the two banned-phrase lists to their suites under their own subpaths', () => {
    expect(pkg.exports['./schedule/foresight.banned']).toBe('./src/schedule/foresight.banned.ts');
    expect(BANNED).toContain('overtired');
    expect(pkg.exports['./reports/glance.banned']).toBe('./src/reports/glance.banned.ts');
    expect(GLANCE_VERDICTS).toContain('better');
  });
});
