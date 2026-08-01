import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnvFile } from './env-file.mjs';

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Must match `apiUrl` presets in `src/platform/core/config/index.ts`. */
const API_URL = 'https://game-api-s5kn.onrender.com/api';

function readGameIdFromEnv() {
  const gameId = process.env.VITE_GAME_ID?.trim();
  if (!gameId) {
    throw new Error('VITE_GAME_ID is required. Set it in .env before building.');
  }

  return gameId;
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
  loadEnvFile(root);
  const gameId = readGameIdFromEnv();
  const replaySecret = process.env.VITE_REPLAY_SECRET ?? '';

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

  if (process.env.SKIP_API_CHECK === 'true') {
    console.log('Skipped backend check because SKIP_API_CHECK=true.');
    return;
  }

  await verifyApiGame(API_URL, gameId);
  console.log(`Backend accepts gameId "${gameId}" at ${API_URL}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
