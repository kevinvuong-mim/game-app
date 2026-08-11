import { Capacitor } from '@capacitor/core';

export interface StoreListingConfig {
  iosAppStoreId: string;
  androidPackageId: string;
}

export function resolveStoreListingConfig(): StoreListingConfig {
  return {
    iosAppStoreId: import.meta.env.VITE_IOS_APP_STORE_ID ?? '',
    androidPackageId: import.meta.env.VITE_ANDROID_PACKAGE_ID ?? 'com.vraxion.memora',
  };
}

export function getStoreListingUrl(config: StoreListingConfig): string | null {
  const platform = Capacitor.getPlatform();

  if (platform === 'ios' && config.iosAppStoreId) {
    return `https://apps.apple.com/app/id${config.iosAppStoreId}`;
  }

  if (platform === 'android' && config.androidPackageId) {
    return `https://play.google.com/store/apps/details?id=${config.androidPackageId}`;
  }

  if (config.androidPackageId) {
    return `https://play.google.com/store/apps/details?id=${config.androidPackageId}`;
  }

  if (config.iosAppStoreId) {
    return `https://apps.apple.com/app/id${config.iosAppStoreId}`;
  }

  return null;
}
