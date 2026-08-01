import { logger } from '../../error';
import type { AdFormat, AdShowResult, IAdsProvider, AdsProviderConfig } from '../types';

export class MockAdsProvider implements IAdsProvider {
  readonly name = 'mock';

  private ready = new Set<AdFormat>();
  private cached = new Set<AdFormat>();

  async init(_config: AdsProviderConfig): Promise<void> {
    logger.info('[Ads] Mock provider initialized');
    this.ready.add('rewarded');
    this.ready.add('interstitial');
    this.ready.add('banner');
    this.cached.add('rewarded');
    this.cached.add('interstitial');
  }

  isReady(format: AdFormat): boolean {
    return this.ready.has(format);
  }

  isCached(format: AdFormat): boolean {
    return this.cached.has(format);
  }

  async loadRewarded(): Promise<void> {
    this.ready.add('rewarded');
    this.cached.add('rewarded');
  }

  async showRewarded(placement = 'default'): Promise<AdShowResult> {
    logger.info(`[Ads] Mock rewarded shown: ${placement}`);
    await new Promise((r) => setTimeout(r, 300));
    const transactionId = `mock-reward-${Date.now()}`;
    return {
      shown: true,
      rewarded: true,
      transactionId,
      providerPayload: { shown: true, rewarded: true, transactionId },
    };
  }

  async loadInterstitial(): Promise<void> {
    this.ready.add('interstitial');
    this.cached.add('interstitial');
  }

  async showInterstitial(placement = 'default'): Promise<AdShowResult> {
    logger.info(`[Ads] Mock interstitial shown: ${placement}`);
    await new Promise((r) => setTimeout(r, 200));
    return { shown: true, providerPayload: { shown: true } };
  }

  async loadBanner(): Promise<void> {
    this.ready.add('banner');
  }

  async showBanner(placement = 'default'): Promise<void> {
    logger.info(`[Ads] Mock banner shown: ${placement}`);
  }

  hideBanner(): void {
    logger.info('[Ads] Mock banner hidden');
  }

  destroyBanner(): void {}

  destroy(): void {
    this.ready.clear();
    this.cached.clear();
  }
}
