import { Capacitor } from '@capacitor/core';

import { logger } from '@platform/core/error';
import { getConfig } from '@platform/core/config';
import { getStoreListingUrl } from './app-review.config';

type AppReviewResult = 'in_app' | 'store' | 'unavailable';

/** Time to wait for Play In-App Review UI after requestReview() resolves. */
const ANDROID_REVIEW_UI_WAIT_MS = 100;

class AppReviewService {
  /** Request the native in-app review dialog (SKStoreReviewController / Play In-App Review). */
  async requestReview(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }

    try {
      const { InAppReview } = await import('@capacitor-community/in-app-review');
      await InAppReview.requestReview();
      return true;
    } catch (error) {
      logger.warn('[AppReview] requestReview failed', error);
      return false;
    }
  }

  /** Open the App Store / Play Store listing for this app. */
  async openStoreListing(): Promise<boolean> {
    const url = getStoreListingUrl(getConfig().appReview);
    if (!url) {
      logger.warn('[AppReview] No store listing URL configured');
      return false;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }

  /**
   * requestReview() → in-app dialog when the OS shows it.
   * When the dialog is not shown, openStoreListing() as fallback.
   */
  async submitReview(): Promise<AppReviewResult> {
    if (!Capacitor.isNativePlatform()) {
      const openedStore = await this.openStoreListing();
      return openedStore ? 'store' : 'unavailable';
    }

    if (Capacitor.getPlatform() === 'android') {
      return this.submitReviewOnAndroid();
    }

    return this.submitReviewOnIos();
  }

  private async submitReviewOnIos(): Promise<AppReviewResult> {
    const inAppRequested = await this.requestReview();
    if (inAppRequested) {
      return 'in_app';
    }

    const openedStore = await this.openStoreListing();
    return openedStore ? 'store' : 'unavailable';
  }

  private async submitReviewOnAndroid(): Promise<AppReviewResult> {
    let reviewUiEngaged = false;
    const { App } = await import('@capacitor/app');
    const listener = await App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        reviewUiEngaged = true;
      }
    });

    try {
      const inAppRequested = await this.requestReview();
      if (!inAppRequested) {
        const openedStore = await this.openStoreListing();
        return openedStore ? 'store' : 'unavailable';
      }

      // Play In-App Review resolves even when the 5-star UI is suppressed (debug
      // sideload, quota, etc.). Pause detection is the best signal we have that
      // the native review flow actually appeared.
      await new Promise((resolve) => setTimeout(resolve, ANDROID_REVIEW_UI_WAIT_MS));

      if (reviewUiEngaged) {
        return 'in_app';
      }

      logger.info('[AppReview] In-app review UI not detected, opening Play Store');
      const openedStore = await this.openStoreListing();
      return openedStore ? 'store' : 'unavailable';
    } finally {
      await listener.remove();
    }
  }
}

export const appReview = new AppReviewService();
