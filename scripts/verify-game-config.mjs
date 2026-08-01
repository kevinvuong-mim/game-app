import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnvFile } from './env-file.mjs';
import { isGoogleTestAdId } from './admob-constants.mjs';

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

function env(name) {
  return process.env[name]?.trim() ?? '';
}

function requireNonEmpty(name) {
  const value = env(name);
  if (!value) {
    throw new Error(`Release build requires ${name}.`);
  }
  return value;
}

function assertNotGoogleTestAdId(name, value) {
  if (isGoogleTestAdId(value)) {
    throw new Error(
      `Release build refuses Google sample/test AdMob id in ${name}. Use your real AdMob ids.`
    );
  }
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

function assertReleaseIapSafe(iapProvider) {
  if (iapProvider === 'mock') {
    throw new Error(
      'Release build refuses VITE_IAP_PROVIDER=mock. Set revenuecat (+ API keys) for store builds.'
    );
  }

  if (iapProvider !== 'revenuecat') {
    throw new Error(
      `Release build requires VITE_IAP_PROVIDER=revenuecat (got "${iapProvider}").`
    );
  }

  requireNonEmpty('VITE_REVENUECAT_IOS_API_KEY');
  requireNonEmpty('VITE_REVENUECAT_ANDROID_API_KEY');
}

function assertReleaseAdsSafe(adsProvider) {
  if (adsProvider === 'mock') {
    throw new Error(
      'Release build refuses VITE_ADS_PROVIDER=mock. Set admob (+ app/unit ids) for store builds.'
    );
  }

  if (adsProvider !== 'admob') {
    throw new Error(`Release build requires VITE_ADS_PROVIDER=admob (got "${adsProvider}").`);
  }

  const admobVars = [
    'VITE_ADMOB_IOS_APP_ID',
    'VITE_ADMOB_ANDROID_APP_ID',
    'VITE_ADMOB_IOS_BANNER_ID',
    'VITE_ADMOB_ANDROID_BANNER_ID',
    'VITE_ADMOB_IOS_REWARDED_ID',
    'VITE_ADMOB_ANDROID_REWARDED_ID',
    'VITE_ADMOB_IOS_INTERSTITIAL_ID',
    'VITE_ADMOB_ANDROID_INTERSTITIAL_ID',
  ];

  for (const name of admobVars) {
    const value = requireNonEmpty(name);
    assertNotGoogleTestAdId(name, value);
  }
}

function assertReleaseMonetizationSafe() {
  const appEnv = process.env.VITE_APP_ENV ?? 'dev';
  const enforce =
    appEnv === 'production' || process.env.ENFORCE_RELEASE_MONETIZATION === 'true';

  if (!enforce) {
    return;
  }

  if (appEnv !== 'production') {
    throw new Error(
      'ENFORCE_RELEASE_MONETIZATION=true requires VITE_APP_ENV=production (got "' + appEnv + '").'
    );
  }

  const iapProvider = process.env.VITE_IAP_PROVIDER ?? 'mock';
  const adsProvider = process.env.VITE_ADS_PROVIDER ?? 'mock';

  assertReleaseIapSafe(iapProvider);
  assertReleaseAdsSafe(adsProvider);

  console.log('Release monetization providers OK:', { iapProvider, adsProvider, appEnv });
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

  assertReleaseMonetizationSafe();

  if (process.env.SKIP_API_CHECK === 'true') {
    console.log('Skipped backend check because SKIP_API_CHECK=true.');
    return;
  }

  // Local packaging with mock providers should not require network.
  if ((process.env.VITE_APP_ENV ?? 'dev') !== 'production') {
    console.log('Skipped backend check (VITE_APP_ENV is not production).');
    return;
  }

  await verifyApiGame(API_URL, gameId);
  console.log(`Backend accepts gameId "${gameId}" at ${API_URL}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
