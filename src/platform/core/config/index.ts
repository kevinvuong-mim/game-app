import { Capacitor } from '@capacitor/core';

import {
  type StoreListingConfig,
  resolveStoreListingConfig,
} from '@platform/modules/share/share.config';
import {
  type DeepLinkConfig,
  resolveDeepLinkConfig,
} from '@platform/modules/deep-link/deep-link.config';
import notificationEnvConfigs from './notification-env.json';

type IapProvider = 'mock' | 'revenuecat';
type AnalyticsProvider = 'console' | 'firebase';
export type Environment = 'development' | 'production';

interface FirebaseConfig {
  appId: string;
  apiKey: string;
  projectId: string;
  authDomain: string;
  measurementId: string;
}

export interface RuntimeConfig {
  ads: AdsConfig;
  iap: IapConfig;
  apiUrl: string;
  debug: boolean;
  gameId: string;
  adsEnabled: boolean;
  iapEnabled: boolean;
  deepLink: DeepLinkConfig;
  firebase: FirebaseConfig;
  analyticsEnabled: boolean;
  storeListing: StoreListingConfig;
  pushNotificationsEnabled: boolean;
  localNotificationsEnabled: boolean;
  analyticsProvider: AnalyticsProvider;
}

interface IapConfig {
  revenueCat: {
    apiKey: string;
  };
  provider: IapProvider;
}

interface AdsConfig {
  appId: string;
  testing: boolean;
  adUnits: {
    banner: string;
    rewarded: string;
    interstitial: string;
  };
  provider: 'mock' | 'admob';
}

const ENV_CONFIGS: Record<Environment, Partial<RuntimeConfig>> = {
  development: {
    debug: true,
    adsEnabled: true,
    iapEnabled: true,
    analyticsEnabled: true,
    ...notificationEnvConfigs.development,
    apiUrl: 'https://game-api-s5kn.onrender.com/api',
  },
  production: {
    debug: false,
    adsEnabled: true,
    iapEnabled: true,
    analyticsEnabled: true,
    ...notificationEnvConfigs.production,
    apiUrl: 'https://game-api-s5kn.onrender.com/api',
  },
};

function resolveEnvironment(): Environment {
  const env = import.meta.env.VITE_APP_ENV as Environment | undefined;
  if (env && env in ENV_CONFIGS) return env;
  return import.meta.env.PROD ? 'production' : 'development';
}

function resolveAnalyticsProvider(): AnalyticsProvider {
  const provider = import.meta.env.VITE_ANALYTICS_PROVIDER as AnalyticsProvider | undefined;
  if (provider === 'console' || provider === 'firebase') {
    return provider;
  }
  return 'console';
}

function resolveIapProvider(): IapProvider {
  const provider = import.meta.env.VITE_IAP_PROVIDER as IapProvider | undefined;
  if (provider === 'mock' || provider === 'revenuecat') {
    return provider;
  }
  return 'mock';
}

function resolveFirebaseConfig(): FirebaseConfig {
  return {
    appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? '',
  };
}

function isFirebaseConfigured(firebase: FirebaseConfig): boolean {
  return Boolean(
    firebase.appId &&
    firebase.apiKey &&
    firebase.projectId &&
    firebase.authDomain &&
    firebase.measurementId
  );
}

function resolvePushNotificationsEnabled(baseEnabled: boolean, firebase: FirebaseConfig): boolean {
  if (!baseEnabled) return false;
  if (!Capacitor.isNativePlatform()) return false;
  return isFirebaseConfigured(firebase);
}

function resolveLocalNotificationsEnabled(baseEnabled: boolean): boolean {
  if (!baseEnabled) return false;
  return Capacitor.isNativePlatform();
}

function resolveGameId(): string {
  return import.meta.env.VITE_GAME_ID ?? '';
}

function resolveAdMobAppId(): string {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios') return import.meta.env.VITE_ADMOB_IOS_APP_ID ?? '';
  if (platform === 'android') return import.meta.env.VITE_ADMOB_ANDROID_APP_ID ?? '';
  return import.meta.env.VITE_ADMOB_ANDROID_APP_ID || import.meta.env.VITE_ADMOB_IOS_APP_ID || '';
}

/** Returns the iOS value on iOS, Android value on Android, else first non-empty (web/dev). */
function pickPlatformEnv(androidValue?: string, iosValue?: string): string {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios') return iosValue ?? '';
  if (platform === 'android') return androidValue ?? '';
  return androidValue || iosValue || '';
}

/**
 * Google's official sample ad unit IDs. They always return a test ad regardless
 * of account state, so dev builds can verify the ad flow without serving (and
 * accidentally clicking) real ads. See https://developers.google.com/admob/android/test-ads
 */
const GOOGLE_TEST_AD_UNITS = {
  android: {
    banner: 'ca-app-pub-3940256099942544/6300978111',
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
  },
  ios: {
    banner: 'ca-app-pub-3940256099942544/2934735716',
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
  },
} as const;

function resolveAdsConfig(): AdsConfig {
  const testing = resolveAdMobAppId().length === 0;

  // In testing mode use Google's sample ad units so ads reliably show in dev,
  // even before the real AdMob account/ad units are active.
  const adUnits = testing
    ? {
        banner: pickPlatformEnv(
          GOOGLE_TEST_AD_UNITS.android.banner,
          GOOGLE_TEST_AD_UNITS.ios.banner
        ),
        rewarded: pickPlatformEnv(
          GOOGLE_TEST_AD_UNITS.android.rewarded,
          GOOGLE_TEST_AD_UNITS.ios.rewarded
        ),
        interstitial: pickPlatformEnv(
          GOOGLE_TEST_AD_UNITS.android.interstitial,
          GOOGLE_TEST_AD_UNITS.ios.interstitial
        ),
      }
    : {
        banner: pickPlatformEnv(
          import.meta.env.VITE_ADMOB_ANDROID_BANNER_ID,
          import.meta.env.VITE_ADMOB_IOS_BANNER_ID
        ),
        rewarded: pickPlatformEnv(
          import.meta.env.VITE_ADMOB_ANDROID_REWARDED_ID,
          import.meta.env.VITE_ADMOB_IOS_REWARDED_ID
        ),
        interstitial: pickPlatformEnv(
          import.meta.env.VITE_ADMOB_ANDROID_INTERSTITIAL_ID,
          import.meta.env.VITE_ADMOB_IOS_INTERSTITIAL_ID
        ),
      };

  return {
    appId: resolveAdMobAppId(),
    testing,
    adUnits,
    provider: import.meta.env.VITE_ADS_PROVIDER === 'admob' ? 'admob' : 'mock',
  };
}

function resolveIapConfig(): IapConfig {
  const provider = resolveIapProvider();
  const apiKey = pickPlatformEnv(
    import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY,
    import.meta.env.VITE_REVENUECAT_IOS_API_KEY
  );

  return {
    provider,
    revenueCat: { apiKey },
  };
}

export function createConfig(overrides?: Partial<RuntimeConfig>): RuntimeConfig {
  const env = resolveEnvironment();
  const base = ENV_CONFIGS[env];
  const analyticsProvider = resolveAnalyticsProvider();
  const iap = resolveIapConfig();
  const ads = resolveAdsConfig();
  const firebase = resolveFirebaseConfig();

  return {
    ads,
    iap,
    firebase,
    analyticsProvider,
    gameId: resolveGameId(),
    apiUrl: base.apiUrl ?? '',
    debug: base.debug ?? false,
    deepLink: resolveDeepLinkConfig(),
    storeListing: resolveStoreListingConfig(),
    adsEnabled: base.adsEnabled ?? false,
    iapEnabled: base.iapEnabled ?? false,
    analyticsEnabled: base.analyticsEnabled ?? false,
    pushNotificationsEnabled: resolvePushNotificationsEnabled(
      base.pushNotificationsEnabled ?? false,
      firebase
    ),
    localNotificationsEnabled: resolveLocalNotificationsEnabled(
      base.localNotificationsEnabled ?? false
    ),
    ...overrides,
  };
}

let _config: RuntimeConfig | null = null;

export function getConfig(): RuntimeConfig {
  if (!_config) {
    _config = createConfig();
  }
  return _config;
}

export function setConfig(config: RuntimeConfig): void {
  _config = config;
}

export function getEnvironment(): Environment {
  return resolveEnvironment();
}
