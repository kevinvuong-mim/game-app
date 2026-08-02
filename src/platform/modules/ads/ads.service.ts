import {
  ads,
  type AdContext,
  type AdPlacement,
  type AdsRemoteConfig,
  DEFAULT_REMOTE_CONFIG,
  BANNER_HIDDEN_CONTEXTS,
  CONTEXT_TO_BANNER_PLACEMENT,
} from '@platform/core/advertising';
import type { IEventBus } from '@platform/core/events';
import { t } from '@platform/modules/i18n/i18n.service';

interface RewardRequestResult {
  message?: string;
  success: boolean;
  reward?: { type: string; amount: number };
}

class AdsModuleService {
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
      events.on('ad:reward:request', async ({ placement }) => {
        const result = await this.requestReward(placement);
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
