import { Capacitor } from '@capacitor/core';

import { logger } from '@platform/core/error';
import { getConfig } from '@platform/core/config';
import { saveService } from '@platform/modules/save';
import { usePlatformStore } from '@platform/core/state';
import { getStoreListingUrl } from '@platform/modules/share/share.config';

/** TEMP: always show rate modal on GameOver for QA — set false before ship. */
const FORCE_RATE_PROMPT = false;

/** True when `n` is a positive Fibonacci number (1, 1, 2, 3, 5, 8, …). */
function isFibonacci(n: number): boolean {
  if (!Number.isInteger(n) || n < 1) {
    return false;
  }

  let a = 1;
  let b = 1;
  while (b < n) {
    const next = a + b;
    a = b;
    b = next;
  }

  return a === n || b === n;
}

/**
 * Prompt milestones: Fibonacci × 10 → 10, 20, 30, 50, 80, 130, …
 * (game count after `game:start` increments `totalGamesPlayed`).
 */
function isRatePromptGamesPlayed(gamesPlayed: number): boolean {
  return gamesPlayed > 0 && gamesPlayed % 10 === 0 && isFibonacci(gamesPlayed / 10);
}

class RateService {
  shouldPrompt(): boolean {
    if (FORCE_RATE_PROMPT) {
      return true;
    }

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
   * Mark the app as rated, then try native review.
   * Falls back to the Play Store / App Store listing when native review is unavailable.
   */
  async submitRating(): Promise<'reviewed' | 'store' | 'saved'> {
    const gamesPlayed = usePlatformStore.getState().progress.totalGamesPlayed;

    usePlatformStore.getState().setRatePromptProgress({
      hasRatedApp: true,
      lastRatePromptGamesPlayed: gamesPlayed,
    });
    await saveService.saveLocal();

    if (Capacitor.isNativePlatform()) {
      try {
        const { InAppReview } = await import('@capacitor-community/in-app-review');
        await InAppReview.requestReview();
        logger.info('[Rate] Native in-app review requested');
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
