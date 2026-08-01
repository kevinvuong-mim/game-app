import { t } from '@platform/modules/i18n/i18n.service';
import {
  ads,
  type AdContext,
  type AdPlacement,
  type AdsRemoteConfig,
  BANNER_HIDDEN_CONTEXTS,
  CONTEXT_TO_BANNER_PLACEMENT,
  DEFAULT_REMOTE_CONFIG,
} from '@platform/core/advertising';

interface RewardRequestResult {
  message?: string;
  success: boolean;
  reward?: { type: string; amount: number };
}

class AdsModuleService {
  private runtimeConfig: AdsRemoteConfig = { ...DEFAULT_REMOTE_CONFIG };

  async init(): Promise<void> {
    ads.setRemoteConfig(this.runtimeConfig);
  }

  async showPlacement(placement: AdPlacement | string): Promise<{ shown: boolean; error?: string }> {
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

    const reward = this.runtimeConfig.rewards[placement as AdPlacement];
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
}

export const adsModule = new AdsModuleService();
