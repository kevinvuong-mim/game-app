import { Capacitor } from '@capacitor/core';

import { logger } from '../../error';
import type { AdFormat, AdShowResult, IAdsProvider, AdsProviderConfig } from '../types';

type AdMobModule = {
  BannerAdSize: { BANNER: string };
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
    showAppOpenAd: () => Promise<void>;
    showInterstitial: () => Promise<void>;
    addListener: (
      event: string,
      handler: (event: { type?: string }) => void
    ) => Promise<{ remove: () => void }>;
    showRewardVideoAd: () => Promise<{ type?: string }>;
    prepareAppOpenAd: (opts: { adId: string }) => Promise<void>;
    prepareInterstitial: (opts: { adId: string }) => Promise<void>;
    prepareRewardVideoAd: (opts: { adId: string }) => Promise<void>;
    initialize: (opts: { initializeForTesting?: boolean }) => Promise<void>;
  };
  RewardAdPluginEvents: { Rewarded: string; Dismissed: string; FailedToLoad: string };
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

    await this.admob.AdMob.initialize({
      initializeForTesting: config.testing ?? false,
    });

    logger.info('[Ads] AdMob provider initialized');
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

    let rewarded = false;
    const transactionId = `admob-${Date.now()}-${placement}`;

    try {
      const result = await this.admob!.AdMob.showRewardVideoAd();
      rewarded = result?.type === 'rewarded' || result?.type === 'Rewarded';
      this.ready.delete('rewarded');
      this.cached.delete('rewarded');

      return {
        shown: true,
        rewarded,
        transactionId,
        providerPayload: {
          shown: true,
          rewarded,
          transactionId,
          placement,
        },
      };
    } catch (error) {
      logger.warn('[Ads] AdMob rewarded show failed', error);
      return { shown: false, error: 'Rewarded ad failed' };
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

  async loadAppOpen(): Promise<void> {
    await this.prepare('app_open', async () => {
      const adId = this.requireAdUnit('appOpen');
      await this.admob!.AdMob.prepareAppOpenAd({ adId });
      this.cached.add('app_open');
    });
  }

  async showAppOpen(placement = 'default'): Promise<AdShowResult> {
    if (!this.ready.has('app_open')) {
      return { shown: false, error: 'App open ad not ready' };
    }

    try {
      await this.admob!.AdMob.showAppOpenAd();
      this.ready.delete('app_open');
      this.cached.delete('app_open');
      return { shown: true, providerPayload: { shown: true, placement } };
    } catch (error) {
      logger.warn('[Ads] AdMob app open show failed', error);
      return { shown: false, error: 'App open ad failed' };
    }
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
