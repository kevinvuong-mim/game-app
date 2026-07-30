import { t } from '@platform/modules/i18n/i18n.service';
import { ads, type AdsRemoteConfig, DEFAULT_REMOTE_CONFIG } from '@platform/core/advertising';

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

  async showPlacement(placement: string): Promise<{ shown: boolean; error?: string }> {
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
      case 'app_open': {
        const result = await ads.showAppOpen(placement);
        return { shown: result.shown, error: result.error };
      }
      default:
        return { shown: false, error: t('ads.useRequestReward') };
    }
  }

  async applyBannerForContext(context: string): Promise<void> {
    if (context === 'GAMEPLAY' || context === 'CUTSCENE' || context === 'COMBAT') {
      await ads.hideBanner();
      return;
    }

    const contextToPlacement: Record<string, string> = {
      HOME: 'HOME',
      SHOP: 'SHOP',
      LEADERBOARD: 'LEADERBOARD',
      GAME_OVER: 'GAME_OVER',
    };

    const placement = contextToPlacement[context];
    if (placement && ads.resolveFormat(placement) === 'banner') {
      await ads.showBanner(placement);
    }
  }

  async requestReward(placement: string): Promise<RewardRequestResult> {
    if (!ads.isOnline()) {
      return {
        success: false,
        message: t('ads.rewardOffline'),
      };
    }

    if (!ads.canShowRewarded(placement)) {
      return { success: false, message: t('ads.rewardUnavailable') };
    }

    const reward = this.runtimeConfig.rewards[placement];
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
