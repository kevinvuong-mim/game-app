/**
 * Shared AdMob sample / test ids for native apply + release verify scripts.
 * Keep in sync with Google's documented test publisher:
 * https://developers.google.com/admob/android/test-ads
 */

export const GOOGLE_TEST_PUBLISHER = 'ca-app-pub-3940256099942544';

export const GOOGLE_SAMPLE_IOS_APP_ID = `${GOOGLE_TEST_PUBLISHER}~1458002511`;
export const GOOGLE_SAMPLE_ANDROID_APP_ID = `${GOOGLE_TEST_PUBLISHER}~3347511713`;

export function isProductionAppEnv(env = process.env) {
  return (env.VITE_APP_ENV ?? 'development') === 'production';
}

export function isAdMobProvider(env = process.env) {
  return (env.VITE_ADS_PROVIDER ?? 'mock') === 'admob';
}

export function isGoogleTestAdId(value) {
  return typeof value === 'string' && value.includes(GOOGLE_TEST_PUBLISHER);
}
