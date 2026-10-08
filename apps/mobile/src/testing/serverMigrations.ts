/**
 * WHERE THE SERVER'S MIGRATIONS ARE, for the tests that hold the app to them.
 *
 * NibbleCue shares CuddleCue's Supabase project, and the migrations (NibbleCue's own 0161 and
 * 0162 among them) live in the cuddlecue-app repository, never copied here: two copies would
 * drift. The tests that parse them (`db/mirror-parity.test.ts`, `sync/sqlstate.test.ts`) read
 * that checkout, by default a sibling of this repository (`../cuddlecue-app/supabase/migrations`
 * from the repo root), or wherever `CUDDLECUE_MIGRATIONS_DIR` points (absolute, or relative to
 * this repository's root).
 *
 * WITHOUT THAT CHECKOUT THE TESTS ARE SKIPPED, not failed and not faked: a machine that has only
 * this repository cannot see the server's schema, and a pass there would claim a parity nobody
 * checked. Run them on a machine with both repositories before any change to the local schema,
 * the sync tables or the error mapping lands.
 */
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

/** This repository's root (apps/mobile/src/testing → four up). */
const REPO = resolve(__dirname, '..', '..', '..', '..');

const configured = process.env.CUDDLECUE_MIGRATIONS_DIR?.trim();

/** The server's migrations directory, as configured or by default. */
export const SERVER_MIGRATIONS: string =
  configured !== undefined && configured !== ''
    ? isAbsolute(configured)
      ? configured
      : resolve(REPO, configured)
    : join(REPO, '..', 'cuddlecue-app', 'supabase', 'migrations');

/** Whether the migrations can be read here; the parity tests `describe.skipIf` on the opposite. */
export const HAS_SERVER_MIGRATIONS: boolean = existsSync(SERVER_MIGRATIONS);
