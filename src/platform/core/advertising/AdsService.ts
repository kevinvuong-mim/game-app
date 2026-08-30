import type { AdFormat, AdPlacement, AdShowResult, IAdsProvider, AdsProviderConfig } from './types';
import { logger } from '../error';
import { Capacitor } from '@capacitor/core';
import { createAdsProvider } from './providers';
import { getConfig, getEnvironment } from '../config';
import { AdStateMachine, BannerStateMachine } from './AdStateMachine';
import { BANNER_ALLOWED_PLACEMENTS, DEFAULT_REMOTE_CONFIG } from './types';

class AdsService {
  private readonly formats = {
    rewarded: new AdStateMachine(),
    interstitial: new AdStateMachine(),
  };
  private readonly bannerState = new BannerStateMachine();

  private enabled = true;
  private adsRemoved = false;
  private lastRewardedAt = 0;
  private lastInterstitialAt = 0;
  private provider: IAdsProvider | null = null;
  private activeBannerPlacement: string | null = null;
  private online = typeof navigator === 'undefined' ? true : navigator.onLine;

  setProvider(provider: IAdsProvider): void {
    this.provider = provider;
  }

  async initialize(): Promise<void> {
    this.bindNetworkListeners();

    const runtime = getConfig();
    const providerName = runtime.ads.provider;
    const providerConfig: AdsProviderConfig = {
      appId: runtime.ads.appId,
      testing: runtime.ads.testing,
      adUnits: runtime.ads.adUnits,
    };

    if (!this.provider) {
      this.provider = createAdsProvider(providerName);
    }

    const primaryName = this.provider.name;

    try {
      // AdMob init shows ATT on iOS. UMP + preload run via requestUmpConsentAndPreload()
      // so bootstrap can insert the notification permission prompt in between.
      await this.provider.init(providerConfig);
    } catch (error) {
      if (this.shouldFailClosedOnProviderError(primaryName)) {
        logger.error('[Ads] Primary provider failed — ads disabled (no mock fallback)', error);
        this.provider = null;
        this.enabled = false;
        return;
      }

      logger.warn('[Ads] Primary provider failed, falling back to mock (non-production)', error);
      this.provider = createAdsProvider('mock');
      await this.provider.init(providerConfig);
    }
  }

  /**
   * Show Google UMP (when required), then preload ads.
   * Call after ATT (`init`) and the notification permission prompt.
   */
  async requestUmpConsentAndPreload(): Promise<void> {
    if (this.provider?.requestUmpConsent) {
      await this.provider.requestUmpConsent();
    }

    if (this.enabled && this.provider) {
      void this.preloadCommonAds();
    }
  }

  /** Production + AdMob must never silently grant rewards via mock. */
  private shouldFailClosedOnProviderError(providerName: string): boolean {
    if (providerName !== 'admob') return false;
    if (!Capacitor.isNativePlatform()) return false;
    return getEnvironment() === 'production';
  }

  async init(): Promise<void> {
    await this.initialize();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    // Provider may not be initialized yet (setEnabled runs at bootstrap before init).
    if (!enabled && this.provider) {
      void this.hideBanner();
      this.destroyBanner();
      return;
    }

    if (enabled) {
      this.bannerState.forceReset();
      this.activeBannerPlacement = null;
    }
  }

  /** Set by IAP module when remove_ads entitlement is active. */
  setAdsRemoved(removed: boolean): void {
    this.adsRemoved = removed;
    if (removed && this.provider) {
      void this.hideBanner();
      this.destroyBanner();
      return;
    }

    // Re-enable: leave DESTROYED so the next context can load a banner again.
    if (!removed) {
      this.bannerState.forceReset();
      this.activeBannerPlacement = null;
    }
  }

  isAdsRemoved(): boolean {
    return this.adsRemoved;
  }

  isOnline(): boolean {
    return this.online;
  }

  resolveFormat(placement: string): AdFormat | null {
    return DEFAULT_REMOTE_CONFIG.placements[placement as AdPlacement] ?? null;
  }

  async loadRewarded(): Promise<void> {
    await this.loadFormat('rewarded', () => this.getProvider().loadRewarded());
  }

  async showRewarded(placement: string): Promise<AdShowResult> {
    if (!this.canShowRewarded(placement)) {
      return { shown: false, error: 'Rewarded ads unavailable' };
    }

    const manager = this.formats.rewarded;
    if (!manager.canShow() && this.getProvider().isReady('rewarded')) {
      manager.markReady();
    }
    if (!manager.startShowing()) {
      return { shown: false, error: 'Rewarded ad busy' };
    }

    try {
      const result = await this.getProvider().showRewarded(placement);
      // Only cooldown after a completed reward — early close must allow retry.
      if (result.shown && result.rewarded) {
        this.lastRewardedAt = Date.now();
      }
      return result;
    } catch (error) {
      manager.markError();
      logger.warn('[Ads] Rewarded show failed', error);
      return { shown: false, error: 'Rewarded ad failed' };
    } finally {
      if (manager.getState() === 'SHOWING') {
        manager.markCompleted();
      }
      void this.loadRewarded();
    }
  }

  async loadInterstitial(): Promise<void> {
    await this.loadFormat('interstitial', () => this.getProvider().loadInterstitial());
  }

  async showInterstitial(placement: string): Promise<AdShowResult> {
    if (!this.canShowInterstitial(placement)) {
      return { shown: false, error: 'Interstitial skipped' };
    }

    const manager = this.formats.interstitial;
    const provider = this.getProvider();
    const cacheHit = provider.isCached('interstitial');

    if (!this.online && !cacheHit) {
      return { shown: false, error: 'Offline without cached interstitial' };
    }

    if (!manager.canShow() && provider.isReady('interstitial')) {
      manager.markReady();
    }
    if (!manager.startShowing()) {
      return { shown: false, error: 'Interstitial busy' };
    }

    try {
      const result = await provider.showInterstitial(placement);
      if (result.shown) {
        this.lastInterstitialAt = Date.now();
      }
      return result;
    } catch (error) {
      manager.markError();
      logger.warn('[Ads] Interstitial show failed', error);
      return { shown: false, error: 'Interstitial failed' };
    } finally {
      if (manager.getState() === 'SHOWING') {
        manager.markCompleted();
      }
      void this.loadInterstitial();
    }
  }

  async loadBanner(): Promise<void> {
    if (!DEFAULT_REMOTE_CONFIG.bannerEnabled || !this.online) return;
    if (!this.bannerState.startLoading()) return;

    try {
      await this.getProvider().loadBanner();
      this.bannerState.markVisible();
    } catch (error) {
      logger.warn('[Ads] Banner load failed', error);
      this.bannerState.reset();
    }
  }

  async showBanner(placement: string): Promise<void> {
    if (!this.canShowBanner(placement)) {
      await this.hideBanner();
      return;
    }

    if (!this.online) {
      await this.hideBanner();
      return;
    }

    if (this.activeBannerPlacement === placement && this.bannerState.getState() === 'VISIBLE') {
      return;
    }

    this.activeBannerPlacement = placement;
    await this.loadBanner();
    await this.getProvider().showBanner(placement);
    this.bannerState.markVisible();
  }

  async hideBanner(): Promise<void> {
    if (!this.provider || this.bannerState.getState() === 'DESTROYED') return;
    this.provider.hideBanner();
    this.bannerState.markHidden();
    this.activeBannerPlacement = null;
  }

  destroyBanner(): void {
    if (!this.provider) return;
    this.provider.destroyBanner();
    this.bannerState.markDestroyed();
    this.activeBannerPlacement = null;
  }

  canShowRewarded(placement: string): boolean {
    if (!this.enabled || !this.provider || !this.online) return false;
    if (!DEFAULT_REMOTE_CONFIG.rewardEnabled) return false;
    if (this.resolveFormat(placement) !== 'rewarded') return false;

    const cooldownMs = DEFAULT_REMOTE_CONFIG.cooldowns.rewarded * 1000;
    return Date.now() - this.lastRewardedAt >= cooldownMs;
  }

  canShowInterstitial(placement: string): boolean {
    if (this.adsRemoved) return false;
    if (!this.enabled || !this.provider) return false;
    if (!DEFAULT_REMOTE_CONFIG.interstitialEnabled) return false;
    if (this.resolveFormat(placement) !== 'interstitial') return false;

    const cooldownMs = DEFAULT_REMOTE_CONFIG.cooldowns.interstitial * 1000;
    return Date.now() - this.lastInterstitialAt >= cooldownMs;
  }

  canShowBanner(placement: string): boolean {
    if (this.adsRemoved) return false;
    if (!this.enabled || !this.provider || !DEFAULT_REMOTE_CONFIG.bannerEnabled) return false;
    if (!BANNER_ALLOWED_PLACEMENTS.has(placement as AdPlacement)) return false;
    return this.resolveFormat(placement) === 'banner';
  }

  isReady(type: AdFormat): boolean {
    return this.provider?.isReady(type) ?? false;
  }

  async preload(type: AdFormat): Promise<void> {
    switch (type) {
      case 'rewarded':
        await this.loadRewarded();
        break;
      case 'interstitial':
        await this.loadInterstitial();
        break;
      case 'banner':
        await this.loadBanner();
        break;
    }
  }

  destroy(): void {
    this.provider?.destroy();
    this.unbindNetworkListeners();
  }

  private getProvider(): IAdsProvider {
    if (!this.provider || !this.enabled) {
      throw new Error('Ads provider not initialized');
    }
    return this.provider;
  }

  private async preloadCommonAds(): Promise<void> {
    await Promise.allSettled([this.loadRewarded(), this.loadInterstitial()]);
  }

  private async loadFormat(format: AdFormat, loader: () => Promise<void>): Promise<void> {
    const manager = this.formats[format as keyof typeof this.formats];
    if (!manager || !manager.startLoading()) return;

    try {
      await loader();
      manager.markReady();
    } catch (error) {
      manager.markError();
      logger.warn(`[Ads] Failed to preload ${format}`, error);
    }
  }

  private onOnline = (): void => {
    this.online = true;
    void this.preloadCommonAds();
  };

  private onOffline = (): void => {
    this.online = false;
    void this.hideBanner();
  };

  private bindNetworkListeners(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
  }

  private unbindNetworkListeners(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
  }
}

export const ads = new AdsService();

export function isAdsEnabled(): boolean {
  return ads.isEnabled();
}
