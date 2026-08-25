/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV: 'development' | 'production';

  readonly VITE_API_KEY: string;
  readonly VITE_GAME_ID: string;

  readonly VITE_IAP_PROVIDER: 'mock' | 'revenuecat';
  readonly VITE_REVENUECAT_IOS_API_KEY?: string;
  readonly VITE_REVENUECAT_ANDROID_API_KEY?: string;

  readonly VITE_ADS_PROVIDER: 'mock' | 'admob';
  readonly VITE_ADMOB_IOS_APP_ID?: string;
  readonly VITE_ADMOB_IOS_BANNER_ID?: string;
  readonly VITE_ADMOB_IOS_REWARDED_ID?: string;
  readonly VITE_ADMOB_IOS_INTERSTITIAL_ID?: string;
  readonly VITE_ADMOB_ANDROID_APP_ID?: string;
  readonly VITE_ADMOB_ANDROID_BANNER_ID?: string;
  readonly VITE_ADMOB_ANDROID_REWARDED_ID?: string;
  readonly VITE_ADMOB_ANDROID_INTERSTITIAL_ID?: string;

  readonly VITE_IOS_APP_STORE_ID: string;
  readonly VITE_ANDROID_PACKAGE_ID: string;

  readonly VITE_ANALYTICS_PROVIDER: 'console' | 'firebase';
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
