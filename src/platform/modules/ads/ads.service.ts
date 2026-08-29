import {
  ads,
  type AdContext,
  type AdPlacement,
  type AdsRemoteConfig,
  DEFAULT_REMOTE_CONFIG,
  BANNER_HIDDEN_CONTEXTS,
  CONTEXT_TO_BANNER_PLACEMENT,
} from '@platform/core/advertising';
import { saveService } from '@platform/modules/save';
import type { IEventBus } from '@platform/core/events';
import { usePlatformStore } from '@platform/core/state';
import { t } from '@platform/modules/i18n/i18n.service';

const DOUBLE_COINS_PLACEMENT = 'DOUBLE_COINS';

interface RewardRequestResult {
  message?: string;
  success: boolean;
  reward?: { type: string; amount: number };
}

class AdsModuleService {
  private pendingDoubleCoins = 0;
  private runtimeConfig: AdsRemoteConfig = { ...DEFAULT_REMOTE_CONFIG };

  async showPlacement(
    placement: AdPlacement | string
  ): Promise<{ shown: boolean; error?: string }> {
    const format = ads.resolveFormat(placement);
    if (!format) {
      return { shown: false, error: 'Unknown placement' };
    }

    switch (format) {
      case 'interstitial': {
        const result = await ads.showInterstitial(placement);
        return { shown: result.shown, error: result.error };
      }
      case 'banner':
        await ads.showBanner(placement);
        return { shown: true };
      default:
        return { shown: false, error: t('ads.useRequestReward') };
    }
  }

  /** Grant Game Over x2 coins even if GameOverScene already tore down. */
  private async fulfillDoubleCoins(success: boolean): Promise<void> {
    const coins = this.pendingDoubleCoins;
    this.pendingDoubleCoins = 0;
    if (!success || coins <= 0) return;

    usePlatformStore.getState().addCoins(coins);
    await saveService.saveLocal();
  }

  async applyBannerForContext(context: AdContext | string): Promise<void> {
    const typedContext = context as AdContext;
    if (BANNER_HIDDEN_CONTEXTS.has(typedContext)) {
      await ads.hideBanner();
      return;
    }

    const placement = CONTEXT_TO_BANNER_PLACEMENT[typedContext];
    if (placement && ads.resolveFormat(placement) === 'banner') {
      await ads.showBanner(placement);
    }
  }

  async requestReward(placement: AdPlacement | string): Promise<RewardRequestResult> {
    if (!ads.isOnline()) {
      return {
        success: false,
        message: t('ads.rewardOffline'),
      };
    }

    if (!ads.canShowRewarded(placement)) {
      return { success: false, message: t('ads.rewardUnavailable') };
    }

    const reward =
      this.runtimeConfig.rewards[placement as AdPlacement] ??
      DEFAULT_REMOTE_CONFIG.rewards[placement as AdPlacement];
    if (!reward) {
      return {
        success: false,
        message: t('ads.rewardNotConfigured', { placement }),
      };
    }

    const adResult = await ads.showRewarded(placement);
    if (!adResult.shown || !adResult.rewarded) {
      return {
        success: false,
        message: adResult.error ?? t('ads.rewardIncomplete'),
      };
    }

    return {
      success: true,
      reward,
    };
  }

  bind(events: IEventBus): () => void {
    const unsubs = [
      events.on('ad:reward:request', async ({ placement, amount }) => {
        if (placement === DOUBLE_COINS_PLACEMENT) {
          this.pendingDoubleCoins =
            typeof amount === 'number' && amount > 0 ? Math.floor(amount) : 0;
        }

        const result = await this.requestReward(placement);

        if (placement === DOUBLE_COINS_PLACEMENT) {
          await this.fulfillDoubleCoins(result.success);
        }

        events.emit('ad:reward:result', {
          placement,
          reward: result.reward,
          success: result.success,
          message: result.message,
        });

        if (result.success && result.reward) {
          events.emit('ad:reward', { placement, reward: result.reward });
        }
      }),

      events.on('ad:show:request', async ({ placement }) => {
        await this.showPlacement(placement);
      }),

      events.on('ad:context:change', ({ context }) => {
        void this.applyBannerForContext(context);
      }),
    ];

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }
}

export const adsModule = new AdsModuleService();
