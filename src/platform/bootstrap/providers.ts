import { Capacitor } from '@capacitor/core';

import { logger } from '@platform/core/error';
import { services } from '@platform/core/services';
import { iap, createIapProvider } from '@platform/modules/iap';
import { createAdsProvider } from '@platform/core/advertising';
import { getConfig, getEnvironment } from '@platform/core/config';
import { ConsoleAnalyticsProvider, FirebaseAnalyticsProvider } from '@platform/core/analytics';

const { ads, config, analytics } = services;

/**
 * Native shell + Vite production bundle. Block mock monetization even when
 * `VITE_APP_ENV=development` was left in the release env by mistake.
 */
function isNativeProductionBundle(): boolean {
  return Capacitor.isNativePlatform() && import.meta.env.PROD;
}

function mustBlockMockMonetization(): boolean {
  return isNativeProductionBundle() || getEnvironment() === 'production';
}

/** Registers the ads provider based on runtime config and platform. */
export function registerAdsProvider(): void {
  const runtime = config();
  if (!runtime.adsEnabled) return;

  const isNative = Capacitor.isNativePlatform();
  const wantAdmob = runtime.ads.provider === 'admob';

  if (isNative && wantAdmob) {
    ads.setProvider(createAdsProvider('admob'));
    logger.info('[Ads] AdMob provider registered');
    return;
  }

  // Never ship mock ads on production native — rewarded would grant without real ads.
  if (isNative && mustBlockMockMonetization()) {
    logger.error('[Ads] Mock ads blocked in production native — disabling ads');
    ads.setEnabled(false);
    return;
  }

  ads.setProvider(createAdsProvider('mock'));
  logger.info('[Ads] Mock provider registered');
}

/** Registers the analytics provider selected by runtime config. */
export function registerAnalyticsProviders(): void {
  const runtime = config();
  analytics.clearProviders();

  if (!runtime.analyticsEnabled) return;

  if (runtime.analyticsProvider === 'console') {
    analytics.registerProvider(new ConsoleAnalyticsProvider());
  } else if (runtime.analyticsProvider === 'firebase') {
    analytics.registerProvider(new FirebaseAnalyticsProvider());
  }
}

/** Registers the IAP provider based on runtime config and platform. */
export function registerIapProvider(appUserId?: string): void {
  const runtime = getConfig();
  if (!runtime.iapEnabled) return;

  const useRevenueCat =
    Capacitor.isNativePlatform() &&
    runtime.iap.provider === 'revenuecat' &&
    runtime.iap.revenueCat.apiKey.length > 0;

  if (useRevenueCat) {
    iap.setProvider(
      createIapProvider('revenuecat', {
        revenueCat: {
          apiKey: runtime.iap.revenueCat.apiKey,
          appUserId,
          debug: runtime.debug,
        },
      })
    );
    logger.info('[IAP] RevenueCat provider registered');
    return;
  }

  // Never ship mock IAP on production native — or fall back to mock when RevenueCat
  // was selected but the API key is missing.
  if (Capacitor.isNativePlatform()) {
    if (mustBlockMockMonetization() || runtime.iap.provider === 'revenuecat') {
      if (runtime.iap.provider === 'revenuecat') {
        logger.error(
          '[IAP] RevenueCat selected but API key missing — disabling IAP (refusing mock fallback)'
        );
      } else {
        logger.error('[IAP] Mock IAP blocked in production native — disabling IAP');
      }
      iap.setEnabled(false);
      return;
    }
  }

  iap.setProvider(createIapProvider('mock'));
  logger.info('[IAP] Mock provider registered');
}
