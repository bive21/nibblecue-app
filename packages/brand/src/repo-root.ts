import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The repository root: the nearest ancestor holding pnpm-workspace.yaml. Found by walking
 * up rather than by a fixed `../../`, so the same test file runs unchanged from
 * packages/brand and from its handoff copy in assets/.
 */
export function repoRoot(from: string = fileURLToPath(import.meta.url)): string {
  let dir = dirname(from);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error('repository root (pnpm-workspace.yaml) not found');
    dir = up;
  }
}
