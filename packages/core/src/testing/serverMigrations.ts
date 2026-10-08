/**
 * WHERE THE SERVER'S MIGRATIONS ARE, for core's tests that hold a constant to the SQL that enforces
 * it (the household limit, the invite code, the vaccine profile). The migrations live in the
 * cuddlecue-app repository, never copied here; by default a sibling checkout
 * (`../cuddlecue-app/supabase/migrations` from the repo root), or `CUDDLECUE_MIGRATIONS_DIR`
 * (absolute, or relative to this repository's root). The same rule as the app's
 * `apps/mobile/src/testing/serverMigrations.ts`: without the checkout these checks are SKIPPED,
 * never faked.
 */
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', '..');
const configured = process.env.CUDDLECUE_MIGRATIONS_DIR?.trim();

export const SERVER_MIGRATIONS: string =
  configured !== undefined && configured !== ''
    ? isAbsolute(configured)
      ? configured
      : resolve(REPO, configured)
    : join(REPO, '..', 'cuddlecue-app', 'supabase', 'migrations');

export const HAS_SERVER_MIGRATIONS: boolean = existsSync(SERVER_MIGRATIONS);

export const serverMigration = (name: string): string =>
  readFileSync(join(SERVER_MIGRATIONS, name), 'utf8');
