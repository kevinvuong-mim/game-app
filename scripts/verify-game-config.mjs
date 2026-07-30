import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

function loadEnvFile() {
  const envPath = resolve(process.cwd(), '.env');
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

const API_URLS_BY_ENV = {
  dev: 'http://localhost:3000/api',
  production: 'https://game-api-s5kn.onrender.com/api',
};

function readGameIdFromEnv() {
  const gameId = process.env.VITE_GAME_ID?.trim();
  if (!gameId) {
    throw new Error('VITE_GAME_ID is required. Set it in .env before building.');
  }

  return gameId;
}

function resolveApiUrl() {
  const appEnv = process.env.VITE_APP_ENV ?? 'dev';
  if (appEnv === 'production') {
    return API_URLS_BY_ENV.production;
  }

  return API_URLS_BY_ENV.dev;
}

async function verifyApiGame(apiUrl, gameId) {
  const url = new URL('leaderboards', apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`);
  url.searchParams.set('gameId', gameId);
  url.searchParams.set('page', '1');
  url.searchParams.set('limit', '1');

  const response = await fetch(url);
  if (response.status === 404) {
    throw new Error(`Backend does not support gameId "${gameId}".`);
  }

  if (!response.ok) {
    throw new Error(`Backend config check failed: ${response.status} ${response.statusText}`);
  }
}

async function main() {
  loadEnvFile();
  const gameId = readGameIdFromEnv();
  const replaySecret = process.env.VITE_REPLAY_SECRET ?? '';
  const apiUrl = resolveApiUrl();
  const appEnv = process.env.VITE_APP_ENV ?? 'dev';
  const isProductionBuild = process.env.NODE_ENV === 'production' || appEnv === 'production';

  console.log('Client game config:');
  console.log(JSON.stringify({ id: gameId, replaySecret: '<redacted>' }, null, 2));

  if (!replaySecret) {
    throw new Error('VITE_REPLAY_SECRET is required. Set it in .env before building.');
  }

  if (!SHA256_HEX_PATTERN.test(replaySecret)) {
    throw new Error(
      'VITE_REPLAY_SECRET must be a 64-character lowercase SHA256 hex string (^[a-f0-9]{64}$).'
    );
  }

  if (isProductionBuild && !replaySecret) {
    throw new Error('VITE_REPLAY_SECRET must not be empty for production builds.');
  }

  if (process.env.SKIP_API_CHECK === 'true') {
    console.log('Skipped backend check because SKIP_API_CHECK=true.');
    return;
  }

  await verifyApiGame(apiUrl, gameId);
  console.log(`Backend accepts gameId "${gameId}" at ${apiUrl}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
