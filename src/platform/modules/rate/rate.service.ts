import { Capacitor } from '@capacitor/core';

import { logger } from '@platform/core/error';
import { getConfig } from '@platform/core/config';
import { usePlatformStore } from '@platform/core/state';
import { saveService } from '@platform/modules/save';
import { getStoreListingUrl } from '@platform/modules/share/share.config';

import { isRatePromptGamesPlayed } from './rate.fibonacci';

/** Stars at or above this threshold open the store / native review prompt. */
const STORE_REVIEW_MIN_STARS = 4;

class RateService {
  shouldPrompt(): boolean {
    const { progress } = usePlatformStore.getState();

    if (progress.hasRatedApp) {
      return false;
    }

    const gamesPlayed = progress.totalGamesPlayed;
    if (!isRatePromptGamesPlayed(gamesPlayed)) {
      return false;
    }

    // Already shown (or deferred) for this milestone.
    if ((progress.lastRatePromptGamesPlayed ?? 0) >= gamesPlayed) {
      return false;
    }

    return true;
  }

  async dismissLater(): Promise<void> {
    const gamesPlayed = usePlatformStore.getState().progress.totalGamesPlayed;
    usePlatformStore.getState().setRatePromptProgress({
      lastRatePromptGamesPlayed: gamesPlayed,
    });
    await saveService.saveLocal();
  }

  /**
   * Persist the in-app star rating, then try native review (4–5★).
   * Falls back to the Play Store / App Store listing when native review is unavailable.
   */
  async submitRating(stars: number): Promise<'reviewed' | 'store' | 'saved'> {
    const clamped = Math.min(5, Math.max(1, Math.round(stars)));
    const gamesPlayed = usePlatformStore.getState().progress.totalGamesPlayed;

    usePlatformStore.getState().setRatePromptProgress({
      hasRatedApp: true,
      lastAppRating: clamped,
      lastRatePromptGamesPlayed: gamesPlayed,
    });
    await saveService.saveLocal();

    if (clamped < STORE_REVIEW_MIN_STARS) {
      logger.info('[Rate] Low rating saved in-app', { stars: clamped });
      return 'saved';
    }

    if (Capacitor.isNativePlatform()) {
      try {
        const { InAppReview } = await import('@capacitor-community/in-app-review');
        await InAppReview.requestReview();
        logger.info('[Rate] Native in-app review requested', { stars: clamped });
        return 'reviewed';
      } catch (error) {
        logger.warn('[Rate] Native review failed, opening store listing', error);
      }
    }

    const opened = await this.openStoreListing();
    return opened ? 'store' : 'saved';
  }

  async openStoreListing(): Promise<boolean> {
    const url = getStoreListingUrl(getConfig().storeListing);
    if (!url) {
      logger.warn('[Rate] No store listing URL configured');
      return false;
    }

    try {
      window.open(url, '_blank');
      return true;
    } catch (error) {
      logger.warn('[Rate] Failed to open store listing', error);
      return false;
    }
  }
}

export const rateService = new RateService();
