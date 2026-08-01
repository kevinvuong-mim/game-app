/**
 * Shared helpers for Node scripts under `scripts/`.
 */
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Load `.env`-style KEY=VALUE lines into `process.env` without overriding
 * values already set in the environment.
 */
export function loadEnvFile(root, name = '.env') {
  const envPath = join(root, name);
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
