import { Capacitor } from '@capacitor/core';

import { logger } from '../../error';
import type { AdFormat, AdShowResult, IAdsProvider, AdsProviderConfig } from '../types';

type AdMobRewardItem = {
  type?: string;
  amount?: number;
};

type AdMobErrorEvent = {
  code?: number;
  message?: string;
};

type AdMobConsentInfo = {
  status: string;
  isConsentFormAvailable: boolean;
};

type AdMobModule = {
  BannerAdSize: { BANNER: string };
  AdmobConsentStatus: { REQUIRED: string };
  BannerAdPosition: { BOTTOM_CENTER: string };
  BannerAdPluginEvents: { Loaded: string; FailedToLoad: string };
  AdMob: {
    showBanner: (opts: {
      adId: string;
      adSize: string;
      margin?: number;
      position: string;
    }) => Promise<void>;
    hideBanner: () => Promise<void>;
    removeBanner: () => Promise<void>;
    showInterstitial: () => Promise<void>;
    showConsentForm: () => Promise<AdMobConsentInfo>;
    showRewardVideoAd: () => Promise<AdMobRewardItem>;
    requestTrackingAuthorization: () => Promise<void>;
    requestConsentInfo: () => Promise<AdMobConsentInfo>;
    addListener: (
      event: string,
      handler: (event: AdMobRewardItem | AdMobErrorEvent) => void
    ) => Promise<{ remove: () => void }>;
    prepareInterstitial: (opts: { adId: string }) => Promise<void>;
    trackingAuthorizationStatus: () => Promise<{ status: string }>;
    prepareRewardVideoAd: (opts: { adId: string }) => Promise<void>;
    initialize: (opts: { initializeForTesting?: boolean }) => Promise<void>;
  };
  RewardAdPluginEvents: {
    Rewarded: string;
    Dismissed: string;
    FailedToLoad: string;
    FailedToShow: string;
  };
  InterstitialAdPluginEvents: { Loaded: string; Dismissed: string; FailedToLoad: string };
};

export class AdMobAdsProvider implements IAdsProvider {
  readonly name = 'admob';

  private bannerVisible = false;
  private ready = new Set<AdFormat>();
  private cached = new Set<AdFormat>();
  private loading = new Set<AdFormat>();
  private admob: AdMobModule | null = null;
  private config: AdsProviderConfig | null = null;

  async init(config: AdsProviderConfig): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('AdMob provider requires native platform');
    }

    this.config = config;
    this.admob = (await import('@capacitor-community/admob')) as unknown as AdMobModule;

    // Order: initialize → ATT + UMP → then caller may preload ads.
    await this.admob.AdMob.initialize({
      initializeForTesting: config.testing ?? false,
    });

    await this.requestPrivacyConsent();

    logger.info('[Ads] AdMob provider initialized');
  }

  /**
   * ATT (iOS) + Google UMP consent before any ad load.
   * Declining still allows ads (typically non-personalized); failures are non-fatal.
   */
  private async requestPrivacyConsent(): Promise<void> {
    if (!this.admob) return;

    try {
      if (Capacitor.getPlatform() === 'ios') {
        const tracking = await this.admob.AdMob.trackingAuthorizationStatus();
        if (tracking.status === 'notDetermined') {
          await this.admob.AdMob.requestTrackingAuthorization();
        }
      }
    } catch (error) {
      logger.warn('[Ads] ATT request failed — continuing', error);
    }

    try {
      const consentInfo = await this.admob.AdMob.requestConsentInfo();
      if (
        consentInfo.isConsentFormAvailable &&
        consentInfo.status === this.admob.AdmobConsentStatus.REQUIRED
      ) {
        await this.admob.AdMob.showConsentForm();
      }
    } catch (error) {
      logger.warn('[Ads] UMP consent request failed — continuing', error);
    }
  }

  isReady(format: AdFormat): boolean {
    return this.ready.has(format);
  }

  isCached(format: AdFormat): boolean {
    return this.cached.has(format);
  }

  async loadRewarded(): Promise<void> {
    await this.prepare('rewarded', async () => {
      const adId = this.requireAdUnit('rewarded');
      await this.admob!.AdMob.prepareRewardVideoAd({ adId });
      this.cached.add('rewarded');
    });
  }

  async showRewarded(placement = 'default'): Promise<AdShowResult> {
    if (!this.ready.has('rewarded')) {
      return { shown: false, error: 'Rewarded ad not ready' };
    }

    const transactionId = `admob-${Date.now()}-${placement}`;
    // Object box avoids TS narrowing `let` mutated only inside async listeners to `never`.
    const session: {
      failed: boolean;
      dismissed: boolean;
      reward: AdMobRewardItem | null;
    } = { reward: null, dismissed: false, failed: false };

    // Capacitor AdMob only resolves showRewardVideoAd() on earn-reward.
    // Closing early fires Dismissed but leaves that promise pending forever —
    // so we must race listeners, not await show alone.
    let settleSession!: () => void;
    const sessionEnded = new Promise<void>((resolve) => {
      settleSession = resolve;
    });
    const trySettle = (): void => {
      if (session.reward != null || session.dismissed || session.failed) settleSession();
    };

    const rewardHandle = await this.admob!.AdMob.addListener(
      this.admob!.RewardAdPluginEvents.Rewarded,
      (reward) => {
        if (isRewardItem(reward as AdMobRewardItem)) {
          session.reward = reward as AdMobRewardItem;
        }
        trySettle();
      }
    );
    const dismissHandle = await this.admob!.AdMob.addListener(
      this.admob!.RewardAdPluginEvents.Dismissed,
      () => {
        session.dismissed = true;
        trySettle();
      }
    );
    const failShowHandle = await this.admob!.AdMob.addListener(
      this.admob!.RewardAdPluginEvents.FailedToShow,
      () => {
        session.failed = true;
        trySettle();
      }
    );

    try {
      void this.admob!.AdMob.showRewardVideoAd()
        .then((showResult) => {
          // `type` is the reward *name* (e.g. "coins"), not the string "rewarded".
          if (!session.reward && isRewardItem(showResult)) {
            session.reward = showResult;
          }
          trySettle();
        })
        .catch((error) => {
          session.failed = true;
          logger.warn('[Ads] AdMob rewarded show rejected', error);
          trySettle();
        });

      const timedOut = await Promise.race([
        sessionEnded.then(() => false),
        new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(true), 5 * 60_000);
        }),
      ]);

      if (timedOut) {
        session.failed = true;
        logger.warn('[Ads] AdMob rewarded session timed out');
      }

      if (session.failed && !session.reward && !session.dismissed) {
        return { shown: false, error: 'Rewarded ad failed' };
      }

      const reward = session.reward;
      const rewarded = reward != null;
      // Dismiss without reward still counts as shown (UI opened).
      const shown = rewarded || session.dismissed;
      return {
        shown,
        rewarded,
        transactionId,
        providerPayload: {
          shown,
          rewarded,
          transactionId,
          placement,
          rewardType: reward?.type,
          rewardAmount: reward?.amount,
        },
      };
    } catch (error) {
      logger.warn('[Ads] AdMob rewarded show failed', error);
      return { shown: false, error: 'Rewarded ad failed' };
    } finally {
      // Ad instance is consumed after show/dismiss — clear so preload can run again.
      this.ready.delete('rewarded');
      this.cached.delete('rewarded');
      await Promise.allSettled([
        rewardHandle.remove(),
        dismissHandle.remove(),
        failShowHandle.remove(),
      ]);
    }
  }

  async loadInterstitial(): Promise<void> {
    await this.prepare('interstitial', async () => {
      const adId = this.requireAdUnit('interstitial');
      await this.admob!.AdMob.prepareInterstitial({ adId });
      this.cached.add('interstitial');
    });
  }

  async showInterstitial(placement = 'default'): Promise<AdShowResult> {
    if (!this.ready.has('interstitial')) {
      return { shown: false, error: 'Interstitial not ready' };
    }

    try {
      await this.admob!.AdMob.showInterstitial();
      this.ready.delete('interstitial');
      this.cached.delete('interstitial');
      return { shown: true, providerPayload: { shown: true, placement } };
    } catch (error) {
      logger.warn('[Ads] AdMob interstitial show failed', error);
      return { shown: false, error: 'Interstitial failed' };
    }
  }

  async loadBanner(): Promise<void> {
    await this.prepare('banner', async () => {
      const adId = this.requireAdUnit('banner');
      await this.admob!.AdMob.showBanner({
        adId,
        adSize: 'BANNER',
        position: 'BOTTOM_CENTER',
        // iOS pins to safeAreaLayoutGuide; negative margin cancels the
        // home-indicator inset so the banner sits flush to the screen bottom.
        margin: this.getBannerBottomMargin(),
      });
      this.bannerVisible = true;
    });
  }

  /** Bottom margin for AdMob banner. Negative on iOS to clear safe-area gap. */
  private getBannerBottomMargin(): number {
    if (Capacitor.getPlatform() !== 'ios') return 0;

    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    const inset = Math.round(probe.getBoundingClientRect().height);
    probe.remove();
    return inset > 0 ? -inset : 0;
  }

  async showBanner(_placement = 'default'): Promise<void> {
    if (!this.ready.has('banner')) {
      await this.loadBanner();
    }
    this.bannerVisible = true;
  }

  hideBanner(): void {
    if (!this.admob || !this.bannerVisible) return;
    void this.admob.AdMob.hideBanner().catch((error) => {
      logger.warn('[Ads] AdMob hide banner failed', error);
    });
    this.bannerVisible = false;
  }

  destroyBanner(): void {
    if (!this.admob) return;
    void this.admob.AdMob.removeBanner().catch((error) => {
      logger.warn('[Ads] AdMob destroy banner failed', error);
    });
    this.bannerVisible = false;
    this.ready.delete('banner');
  }

  destroy(): void {
    this.destroyBanner();
    this.ready.clear();
    this.cached.clear();
    this.loading.clear();
  }

  private async prepare(format: AdFormat, loader: () => Promise<void>): Promise<void> {
    if (this.loading.has(format) || this.ready.has(format)) return;
    this.loading.add(format);

    try {
      await loader();
      this.ready.add(format);
    } catch (error) {
      logger.warn(`[Ads] Failed to load ${format}`, error);
      this.ready.delete(format);
      throw error;
    } finally {
      this.loading.delete(format);
    }
  }

  private requireAdUnit(key: keyof AdsProviderConfig['adUnits']): string {
    const adId = this.config?.adUnits[key];
    if (!adId) {
      throw new Error(`Missing AdMob ad unit for ${key}`);
    }
    return adId;
  }
}

/** True when the payload looks like a real AdMob reward item (name + amount). */
function isRewardItem(value: AdMobRewardItem | null | undefined): value is AdMobRewardItem {
  if (!value || typeof value !== 'object') return false;
  if (typeof value.amount === 'number' && value.amount > 0) return true;
  return typeof value.type === 'string' && value.type.length > 0;
}
