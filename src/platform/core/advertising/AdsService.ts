import type {
  AdFormat,
  AdShowResult,
  IAdsProvider,
  AdsRemoteConfig,
  AdsProviderConfig,
} from './types';
import { logger } from '../error';
import { getConfig } from '../config';
import { createAdsProvider } from './providers';
import { AdFormatManager, BannerStateMachine } from './AdStateMachine';
import { AD_ANALYTICS_EVENTS, BANNER_ALLOWED_PLACEMENTS, DEFAULT_REMOTE_CONFIG } from './types';

type AnalyticsHandler = (event: string, metadata?: Record<string, unknown>) => void;

class AdsService {
  private readonly formats = {
    app_open: new AdFormatManager('app_open'),
    rewarded: new AdFormatManager('rewarded'),
    interstitial: new AdFormatManager('interstitial'),
  };
  private readonly bannerState = new BannerStateMachine();

  private enabled = true;
  private adsRemoved = false;
  private lastRewardedAt = 0;
  private lastInterstitialAt = 0;
  private appOpenShownThisSession = false;
  private provider: IAdsProvider | null = null;
  private configCacheKey = 'ads_remote_config_v1';
  private activeBannerPlacement: string | null = null;
  private fallbackProvider: IAdsProvider | null = null;
  private analyticsHandler: AnalyticsHandler | null = null;
  private remoteConfig: AdsRemoteConfig = { ...DEFAULT_REMOTE_CONFIG };
  private online = typeof navigator === 'undefined' ? true : navigator.onLine;

  setProvider(provider: IAdsProvider): void {
    this.provider = provider;
  }

  setAnalyticsHandler(handler: AnalyticsHandler): void {
    this.analyticsHandler = handler;
  }

  setRemoteConfig(config: AdsRemoteConfig): void {
    this.remoteConfig = config;
  }

  getRemoteConfig(): AdsRemoteConfig {
    return this.remoteConfig;
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

    try {
      await this.provider.init(providerConfig);
      this.track(AD_ANALYTICS_EVENTS.LOADED, { provider: this.provider.name });
    } catch (error) {
      logger.warn('[Ads] Primary provider failed, falling back to mock', error);
      this.fallbackProvider = createAdsProvider('mock');
      await this.fallbackProvider.init(providerConfig);
      this.provider = this.fallbackProvider;
      this.track(AD_ANALYTICS_EVENTS.FAILED, { provider: providerName, fallback: 'mock' });
    }

    if (this.enabled) {
      void this.preloadCommonAds();
    }
  }

  async init(): Promise<void> {
    await this.initialize();
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

  canShow(format: AdFormat, placement?: string): boolean {
    if (this.adsRemoved && format !== 'rewarded') return false;

    switch (format) {
      case 'rewarded':
        return placement ? this.canShowRewarded(placement) : false;
      case 'interstitial':
        return placement ? this.canShowInterstitial(placement) : false;
      case 'banner':
        return placement ? this.canShowBanner(placement) : false;
      case 'app_open':
        return (
          !this.adsRemoved && this.remoteConfig.appOpenEnabled && !this.appOpenShownThisSession
        );
      default:
        return false;
    }
  }

  isOnline(): boolean {
    return this.online;
  }

  resolveFormat(placement: string): AdFormat | null {
    return this.remoteConfig.placements[placement] ?? null;
  }

  async loadRewarded(): Promise<void> {
    await this.loadFormat('rewarded', () => this.getProvider().loadRewarded());
  }

  async showRewarded(placement: string): Promise<AdShowResult> {
    if (!this.canShowRewarded(placement)) {
      return { shown: false, error: 'Rewarded ads unavailable' };
    }

    const manager = this.formats.rewarded;
    if (!manager.state.canShow() && this.getProvider().isReady('rewarded')) {
      manager.state.markReady();
    }
    if (!manager.state.startShowing()) {
      return { shown: false, error: 'Rewarded ad busy' };
    }

    const result = await this.getProvider().showRewarded(placement);
    manager.state.markCompleted();
    if (result.shown) {
      this.lastRewardedAt = Date.now();
    }

    if (result.shown && result.rewarded) {
      this.track(AD_ANALYTICS_EVENTS.REWARD_EARNED, {
        placement,
        provider: this.getProvider().name,
      });
    }

    void this.loadRewarded();
    return result;
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
      this.track(AD_ANALYTICS_EVENTS.OFFLINE_ATTEMPT, { placement, format: 'interstitial' });
      this.track(AD_ANALYTICS_EVENTS.CACHE_MISS, { placement, format: 'interstitial' });
      return { shown: false, error: 'Offline without cached interstitial' };
    }

    if (cacheHit) {
      this.track(AD_ANALYTICS_EVENTS.CACHE_HIT, { placement, format: 'interstitial' });
    }

    if (!manager.state.canShow() && provider.isReady('interstitial')) {
      manager.state.markReady();
    }
    if (!manager.state.startShowing()) {
      return { shown: false, error: 'Interstitial busy' };
    }

    const result = await provider.showInterstitial(placement);
    manager.state.markCompleted();
    if (result.shown) {
      this.lastInterstitialAt = Date.now();
      this.track(AD_ANALYTICS_EVENTS.IMPRESSION, { placement, format: 'interstitial' });
    }

    void this.loadInterstitial();
    return result;
  }

  async loadBanner(): Promise<void> {
    if (!this.remoteConfig.bannerEnabled || !this.online) return;
    if (!this.bannerState.startLoading()) return;

    try {
      await this.getProvider().loadBanner();
      this.bannerState.markVisible();
      this.track(AD_ANALYTICS_EVENTS.BANNER_LOADED, {});
    } catch (error) {
      logger.warn('[Ads] Banner load failed', error);
      this.bannerState.reset();
      this.track(AD_ANALYTICS_EVENTS.FAILED, { format: 'banner' });
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
    this.track(AD_ANALYTICS_EVENTS.BANNER_HIDDEN, {});
  }

  destroyBanner(): void {
    if (!this.provider) return;
    this.provider.destroyBanner();
    this.bannerState.markDestroyed();
    this.activeBannerPlacement = null;
  }

  async loadAppOpen(): Promise<void> {
    await this.loadFormat('app_open', () => this.getProvider().loadAppOpen());
  }

  async showAppOpen(placement: string): Promise<AdShowResult> {
    if (this.adsRemoved || !this.remoteConfig.appOpenEnabled || this.appOpenShownThisSession) {
      return { shown: false, error: 'App open skipped' };
    }

    const manager = this.formats.app_open;
    if (!manager.state.canShow() && this.getProvider().isReady('app_open')) {
      manager.state.markReady();
    }
    if (!manager.state.startShowing()) {
      return { shown: false, error: 'App open busy' };
    }

    const result = await this.getProvider().showAppOpen(placement);
    manager.state.markCompleted();
    if (result.shown) {
      this.appOpenShownThisSession = true;
    }
    return result;
  }

  canShowRewarded(placement: string): boolean {
    if (!this.enabled || !this.online) return false;
    if (!this.remoteConfig.rewardEnabled) return false;
    if (this.resolveFormat(placement) !== 'rewarded') return false;

    const cooldownMs = this.remoteConfig.cooldowns.rewarded * 1000;
    return Date.now() - this.lastRewardedAt >= cooldownMs;
  }

  canShowInterstitial(placement: string): boolean {
    if (this.adsRemoved) return false;
    if (!this.enabled) return false;
    if (!this.remoteConfig.interstitialEnabled) return false;
    if (this.resolveFormat(placement) !== 'interstitial') return false;

    const cooldownMs = this.remoteConfig.cooldowns.interstitial * 1000;
    return Date.now() - this.lastInterstitialAt >= cooldownMs;
  }

  canShowBanner(placement: string): boolean {
    if (this.adsRemoved) return false;
    if (!this.enabled || !this.remoteConfig.bannerEnabled) return false;
    if (!BANNER_ALLOWED_PLACEMENTS.has(placement)) return false;
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
      case 'app_open':
        await this.loadAppOpen();
        break;
    }
  }

  destroy(): void {
    this.provider?.destroy();
    this.fallbackProvider?.destroy();
    this.unbindNetworkListeners();
  }

  getProviderName(): string {
    return this.getProvider().name;
  }

  getConfigCacheKey(): string {
    return this.configCacheKey;
  }

  private getProvider(): IAdsProvider {
    if (!this.provider) {
      throw new Error('Ads provider not initialized');
    }
    return this.provider;
  }

  private async preloadCommonAds(): Promise<void> {
    await Promise.allSettled([
      this.loadRewarded(),
      this.loadInterstitial(),
      this.remoteConfig.appOpenEnabled ? this.loadAppOpen() : Promise.resolve(),
    ]);
  }

  private async loadFormat(format: AdFormat, loader: () => Promise<void>): Promise<void> {
    const manager = this.formats[format as keyof typeof this.formats];
    if (!manager || !manager.state.startLoading()) return;

    try {
      await loader();
      manager.state.markReady();
      this.track(AD_ANALYTICS_EVENTS.LOADED, { format });
    } catch (error) {
      manager.state.markError();
      this.track(AD_ANALYTICS_EVENTS.FAILED, { format });
      logger.warn(`[Ads] Failed to preload ${format}`, error);
    }
  }

  private track(event: string, metadata?: Record<string, unknown>): void {
    this.analyticsHandler?.(event, metadata);
  }

  private onOnline = (): void => {
    this.online = true;
    this.track(AD_ANALYTICS_EVENTS.ONLINE_RESTORE, {});
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
