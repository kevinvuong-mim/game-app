/**
 * Shared env helpers for Node scripts under `scripts/`.
 * File cascade matches Vite: later files override earlier files;
 * keys already set in the process environment are never overwritten.
 * https://vite.dev/guide/env-and-mode.html
 */
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

function parseEnvFile(envPath) {
  const parsed = {};
  if (!existsSync(envPath)) return parsed;

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
    parsed[key] = value;
  }

  return parsed;
}

/**
 * Vite mode for native packaging scripts. Matches `vite build` unless `VITE_MODE` is set.
 */
export function resolveViteMode(env = process.env) {
  if (env.VITE_MODE === 'development' || env.VITE_MODE === 'production') {
    return env.VITE_MODE;
  }
  return 'production';
}

/**
 * Same fallback as `src/platform/core/config/index.ts`:
 * valid `VITE_APP_ENV`, else production (these scripts run with `vite build`).
 */
export function resolveAppEnv(env = process.env) {
  const appEnv = env.VITE_APP_ENV?.trim();
  if (appEnv === 'development' || appEnv === 'production') return appEnv;
  return resolveViteMode(env) === 'production' ? 'production' : 'development';
}

/**
 * Load `.env` → `.env.local` → `.env.[mode]` → `.env.[mode].local`.
 */
export function loadEnvFile(root, mode = resolveViteMode()) {
  const predefined = new Set(Object.keys(process.env));
  const merged = {};

  for (const name of ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]) {
    Object.assign(merged, parseEnvFile(join(root, name)));
  }

  for (const [key, value] of Object.entries(merged)) {
    if (!predefined.has(key)) {
      process.env[key] = value;
    }
  }
}
